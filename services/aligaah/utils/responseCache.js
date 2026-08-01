/**
 * In-process response cache for public GET endpoints.
 *
 * Why this exists: the database is MongoDB Atlas, roughly 70–90ms away over the
 * network. That round-trip — not indexes, not CPU — is what every storefront
 * request was paying, several times over on pages that query sequentially. An
 * index can make a query take 1ms instead of 40ms server-side and the caller
 * still waits ~80ms for the packet to come back.
 *
 * A cache hit skips the network entirely and answers in well under a
 * millisecond. Correctness comes from invalidation, not from short TTLs: every
 * model tagged with `cacheBustingPlugin` drops the cached entries that depend on
 * it the moment it is written, so an admin edit shows up on the very next
 * request. The TTL is only a backstop for writes that bypass Mongoose.
 *
 * Only anonymous GETs are cached. Anything carrying an Authorization header or
 * a cookie is served straight from the database, so one user can never be handed
 * another user's response.
 *
 * SCALING NOTE: this cache lives in one process's memory, which is correct only
 * while a single process both serves reads and handles writes (PM2 is set to
 * `instances: 1, exec_mode: 'fork'` for exactly this reason). Before running
 * these services in cluster mode or behind more than one node, invalidation has
 * to become cross-process — publish the tag from `invalidateTags` over Redis
 * pub/sub and have every process drop its matching entries on receipt.
 */

const mongoose = require('mongoose');

/** key -> { expiresAt, payload, etag, status } */
const store = new Map();
/** tag -> Set(keys), so a write to one collection drops only what it affects */
const tagIndex = new Map();

const MAX_ENTRIES = 500;

let hits = 0;
let misses = 0;

function dropKey(key) {
  const entry = store.get(key);
  if (!entry) return;
  store.delete(key);
  for (const tag of entry.tags) {
    const keys = tagIndex.get(tag);
    if (keys) {
      keys.delete(key);
      if (!keys.size) tagIndex.delete(tag);
    }
  }
}

/** Drops every cached response that depends on any of `tags`. */
function invalidateTags(tags) {
  for (const tag of tags) {
    const keys = tagIndex.get(tag);
    if (!keys) continue;
    for (const key of [...keys]) dropKey(key);
  }
}

function put(key, tags, payload, status, ttlMs) {
  // Cheapest possible eviction: when full, drop the oldest insertion. Map
  // iterates in insertion order, so the first key is the oldest.
  if (store.size >= MAX_ENTRIES) dropKey(store.keys().next().value);

  const etag = `W/"${payload.length.toString(36)}-${hash(payload).toString(36)}"`;
  store.set(key, { expiresAt: Date.now() + ttlMs, payload, etag, status, tags });
  for (const tag of tags) {
    if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
    tagIndex.get(tag).add(key);
  }
  return etag;
}

// FNV-1a — we only need a stable short fingerprint for the ETag, not security.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const warned = new Set();

/**
 * Confirms every tag maps to a model that will actually clear this entry when
 * written. Guards against the two ways caching goes wrong silently: a tag that
 * doesn't match any model name, and a model that never got the busting plugin
 * (which happens when a service's entry point imports its routes before its
 * database config, so models compile first).
 */
function tagsAreInvalidated(tags) {
  let ok = true;
  for (const tag of tags) {
    const model = mongoose.models[tag];
    if (!model) {
      ok = false;
      if (!warned.has(tag)) {
        warned.add(tag);
        console.warn(`[cache] no model named "${tag}" — caching disabled for routes tagged with it`);
      }
      continue;
    }
    if (!model.schema.$cacheBusting) {
      ok = false;
      if (!warned.has(tag)) {
        warned.add(tag);
        console.warn(
          `[cache] model "${tag}" has no cache-busting plugin — caching disabled for it. ` +
          'Make sure config/db.js is imported before any model.'
        );
      }
    }
  }
  return ok;
}

/**
 * Express middleware.
 *
 *   router.get('/', cache(['Product', 'Category'], 60_000), getProducts);
 *
 * `tags` are model names; writing any of those models clears this entry.
 */
function cache(tags, ttlMs = 60_000) {
  // Resolved on the first request, once every model is certainly registered.
  let safe = null;

  return function cacheMiddleware(req, res, next) {
    // Caching data that nothing invalidates would serve an admin's old content
    // forever, so verify the wiring once and fall back to reading through if
    // any tag is unprotected. Correctness first, speed second.
    if (safe === null) safe = tagsAreInvalidated(tags);
    if (!safe) return next();

    // Never serve a shared cache to an identified caller.
    if (req.method !== 'GET' || req.headers.authorization || req.headers.cookie) {
      return next();
    }

    const key = req.originalUrl || req.url;
    const entry = store.get(key);

    if (entry && entry.expiresAt > Date.now()) {
      hits++;
      res.set('X-Cache', 'HIT');
      res.set('ETag', entry.etag);
      res.set('Cache-Control', 'public, max-age=0, must-revalidate');
      // The client already has this exact body — send 304 and no payload at all.
      if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
      res.status(entry.status);
      res.type('application/json');
      return res.send(entry.payload);
    }
    if (entry) dropKey(key); // expired

    misses++;
    res.set('X-Cache', 'MISS');

    // Capture whatever the handler sends so the next caller can skip the DB.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        // A handler that marked its own response private or uncacheable knows
        // something we don't — an admin-only variant of a public listing, say.
        // Respect it rather than overwriting the header it just set.
        const declared = res.get('Cache-Control') || '';
        const uncacheable = /no-store|private/i.test(declared);

        if (!uncacheable && res.statusCode >= 200 && res.statusCode < 300) {
          const payload = JSON.stringify(body);
          const etag = put(key, tags, payload, res.statusCode, ttlMs);
          res.set('ETag', etag);
          res.set('Cache-Control', 'public, max-age=0, must-revalidate');
          if (req.headers['if-none-match'] === etag) return res.status(304).end();
          res.type('application/json');
          return res.send(payload);
        }
      } catch {
        /* an uncacheable body (circular, too large) just goes out uncached */
      }
      return originalJson(body);
    };

    return next();
  };
}

/**
 * Mongoose plugin: any write to this model clears the cached responses tagged
 * with its name. Apply it to every model whose data is served from a cached
 * endpoint — that is what keeps the cache honest.
 *
 * `ignoreFields` lists counters that change constantly but that nobody is
 * refreshing the page for — view and sales tallies. Without it a single product
 * view would flush the whole product cache and the next shopper would pay the
 * full round-trip again, which is exactly the cost the cache exists to remove.
 */
function cacheBustingPlugin(schema, { ignoreFields = [] } = {}) {
  // `updatedAt` is always in the mix because Mongoose stamps it onto every
  // update when a schema has timestamps. Counting it as a real change would
  // make the ignore list useless — every counter bump would flush the cache.
  const ignored = new Set([...ignoreFields, 'updatedAt', 'createdAt']);

  // Lets `cache()` verify at request time that this model really does clear
  // what it should, instead of trusting module load order.
  schema.$cacheBusting = true;

  /** True when an update changes nothing a cached response would show. */
  function onlyIgnoredFields(update) {
    if (!update || !ignored.size || Array.isArray(update)) return false;
    const fields = [];
    for (const [key, value] of Object.entries(update)) {
      if (key.startsWith('$')) {
        if (value && typeof value === 'object') fields.push(...Object.keys(value));
      } else {
        fields.push(key);
      }
    }
    return fields.length > 0 && fields.every((f) => ignored.has(f));
  }

  schema.post('save', function bustAfterSave() {
    const name = this.constructor?.modelName;
    if (name) invalidateTags([name]);
  });
  schema.post('deleteOne', { document: true, query: false }, function bustAfterDocDelete() {
    const name = this.constructor?.modelName;
    if (name) invalidateTags([name]);
  });

  const ops = ['findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
               'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'];
  for (const op of ops) {
    schema.post(op, { query: true, document: false }, function bustFromQuery() {
      if (!this.model?.modelName) return;
      if (op.includes('update') || op.includes('Update') || op.includes('replace') || op.includes('Replace')) {
        if (onlyIgnoredFields(this.getUpdate())) return;
      }
      invalidateTags([this.model.modelName]);
    });
  }
  schema.post('insertMany', function bustFromInsertMany() {
    if (this.modelName) invalidateTags([this.modelName]);
  });
}

/**
 * Adds `Server-Timing: app;dur=<ms>` to every response.
 *
 * Makes "the API is slow" measurable: the browser's network panel shows this
 * next to the total, so time spent in the handler is visible separately from
 * time spent on the network. Paired with `X-Cache`, a hit should read well
 * under a millisecond and a miss should read roughly one database round-trip.
 */
function serverTiming() {
  return function serverTimingMiddleware(req, res, next) {
    const started = process.hrtime.bigint();
    const send = res.send.bind(res);
    res.send = (body) => {
      if (!res.headersSent) {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        res.set('Server-Timing', `app;dur=${ms.toFixed(1)}`);
      }
      return send(body);
    };
    next();
  };
}

const stats = () => ({ entries: store.size, hits, misses });

function clearAll() {
  store.clear();
  tagIndex.clear();
}

module.exports = { cache, invalidateTags, cacheBustingPlugin, serverTiming, stats, clearAll };
