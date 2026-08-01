/**
 * Cloudinary garbage collection.
 *
 * Every image this app shows lives on Cloudinary and is paid for by storage +
 * bandwidth. When an admin swaps a product photo, clears a banner or deletes a
 * category, the old asset used to stay on Cloudinary forever with nothing
 * pointing at it. This module removes those orphans automatically.
 *
 * It hooks the data layer rather than the controllers, so *every* write path —
 * REST handlers, seeds, scripts, future routes — is covered without anyone
 * having to remember to call a delete helper.
 *
 * Two rules keep it safe:
 *   1. An asset is only destroyed when it disappears from a document. We diff
 *      the before/after state of the write, never guess from the request body.
 *   2. Before destroying, we re-check that no other document (same collection
 *      or a declared `protectedBy` one, e.g. Orders holding a purchase-time
 *      image snapshot) still points at it.
 *
 * Deletion happens after the response is sent — a request never waits on a
 * Cloudinary round-trip.
 */

const { v2: cloudinary } = require('cloudinary');

const isConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY &&
     process.env.CLOUDINARY_API_SECRET);

// The upload route configures the SDK too, but models load first in some entry
// points. Configuring here as well is harmless — it is one global singleton.
if (isConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/* ------------------------------------------------------------------ parsing */

// https://res.cloudinary.com/<cloud>/<image|video|raw>/upload/<transforms?>/<v123?>/<public id>.<ext>
// `fetch`, `private` and `authenticated` delivery types are deliberately not
// matched: those are not assets we own and uploaded.
const CLOUDINARY_URL_RE =
  /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\//i;

const VERSION_SEGMENT_RE = /^v\d+$/;

// The full set of Cloudinary transformation keys. Matching against a known list
// (rather than the shape `xx_yy`) means a real folder called `my_photos` is
// never mistaken for a transformation and silently stripped off the public id.
const TRANSFORM_KEYS = new Set([
  'a', 'ac', 'ar', 'b', 'bo', 'br', 'c', 'co', 'cs', 'd', 'dl', 'dn', 'dpr',
  'du', 'e', 'eo', 'f', 'fl', 'fn', 'fps', 'g', 'h', 'if', 'ki', 'l', 'o', 'p',
  'pg', 'q', 'r', 'so', 'sp', 't', 'u', 'vc', 'vs', 'w', 'x', 'y', 'z',
]);

function isTransformSegment(segment) {
  if (!segment.includes('_')) return false;
  return segment.split(',').every((part) => {
    const i = part.indexOf('_');
    return i > 0 && TRANSFORM_KEYS.has(part.slice(0, i).toLowerCase());
  });
}

/**
 * Turns a delivery URL back into the public id Cloudinary's destroy API wants.
 * Returns null for anything that isn't a Cloudinary asset of ours.
 */
function parseCloudinaryUrl(url) {
  if (typeof url !== 'string' || url.length < 30) return null;
  const match = url.match(CLOUDINARY_URL_RE);
  if (!match) return null;

  const resourceType = match[1].toLowerCase();
  const parts = url
    .slice(match[0].length)
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean);

  // Peel transformations and the version prefix off the front.
  while (parts.length > 1 && (isTransformSegment(parts[0]) || VERSION_SEGMENT_RE.test(parts[0]))) {
    parts.shift();
  }
  if (!parts.length) return null;

  let publicId = parts.join('/').replace(/\.[a-z0-9]{1,5}$/i, '');
  try {
    publicId = decodeURIComponent(publicId);
  } catch {
    /* a malformed escape sequence just means we keep the raw form */
  }
  return publicId ? { publicId, resourceType } : null;
}

/* --------------------------------------------------------------- collecting */

// Field names that carry a stored public id, e.g. `publicId`, `public_id`,
// `imagePublicId`, `logoTransparentPublicId`.
const PUBLIC_ID_KEY_RE = /public_?id$/i;

// Field names that can hold a media URL. Used both when walking documents and
// when building the "is this still referenced?" query.
const MEDIA_KEY_RE =
  /(image|images|photo|logo|banner|thumb|avatar|icon|picture|cover|favicon|media|url|public_?id|src|poster|video)/i;

const assetKey = (asset) => `${asset.resourceType}:${asset.publicId}`;

function addAsset(out, publicId, resourceType, url) {
  if (!publicId) return;
  const asset = { publicId, resourceType };
  const key = assetKey(asset);
  const existing = out.get(key);
  if (existing) {
    if (url) existing.urls.add(url);
    return;
  }
  out.set(key, { publicId, resourceType, urls: new Set(url ? [url] : []) });
}

function isScalarish(value) {
  return (
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    typeof value._bsontype === 'string' ||
    typeof value.getTime === 'function'
  );
}

/**
 * Walks any document / plain object / array and returns
 * Map<"type:publicId", { publicId, resourceType, urls:Set }>.
 *
 * Picks up assets two ways: Cloudinary URLs found in any string, and raw public
 * ids stored in `*publicId` fields (some models keep both side by side).
 */
function collectAssets(value, out = new Map(), depth = 0) {
  if (value == null || depth > 12) return out;

  if (typeof value === 'string') {
    const parsed = parseCloudinaryUrl(value);
    if (parsed) addAsset(out, parsed.publicId, parsed.resourceType, value);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, out, depth + 1);
    return out;
  }
  if (isScalarish(value)) return out;

  const source = typeof value.toObject === 'function' ? value.toObject({ depopulate: true }) : value;

  for (const [key, val] of Object.entries(source)) {
    if (key === '_id' || key === '__v') continue;
    if (typeof val === 'string' && PUBLIC_ID_KEY_RE.test(key)) {
      const id = val.trim();
      // `local:` ids belong to the on-disk dev fallback, not Cloudinary.
      if (id && !id.startsWith('local:') && !/^https?:/i.test(id)) {
        addAsset(out, id, /video/i.test(key) ? 'video' : 'image', null);
      }
      continue;
    }
    collectAssets(val, out, depth + 1);
  }
  return out;
}

/* ------------------------------------------------------- schema path lookup */

const mediaPathCache = new WeakMap();

/**
 * Every String path in a schema that could hold a media URL or public id,
 * including paths inside sub-documents (`images.url`, `hero.image`).
 * Used to keep the reference-check queries and projections narrow.
 */
function mediaPaths(schema) {
  if (mediaPathCache.has(schema)) return mediaPathCache.get(schema);

  // Fields whose names give nothing away — `hero.desktop`, `hero.mobile` — are
  // declared explicitly by the model via the plugin's `mediaPaths` option.
  const paths = [...(schema.$cloudinaryMediaPaths || [])];
  const visit = (sch, prefix, depth) => {
    if (depth > 6) return;
    sch.eachPath((path, type) => {
      if (path === '_id' || path === '__v') return;
      const full = prefix ? `${prefix}.${path}` : path;
      if (type.schema) {
        visit(type.schema, full, depth + 1);
        return;
      }
      const instance = type.instance || (type.caster && type.caster.instance);
      if (instance !== 'String') return;
      if (MEDIA_KEY_RE.test(path) && !paths.includes(full)) paths.push(full);
    });
  };
  visit(schema, '', 0);

  mediaPathCache.set(schema, paths);
  return paths;
}

/**
 * Narrows a read to just the media fields. Returns null when the schema keeps
 * media in a Mixed field — there is nothing to narrow to, so the caller reads
 * the full document instead of silently projecting the images away.
 */
function projectionFor(schema) {
  const paths = mediaPaths(schema);
  return paths.length ? ['_id', ...paths].join(' ') : null;
}

/** `.select(null)` is not a no-op in Mongoose, so only call it when we mean it. */
function selectMedia(query, schema) {
  const projection = projectionFor(schema);
  return projection ? query.select(projection) : query;
}

/* ------------------------------------------------------------- destroy queue */

// Cloudinary calls are pushed here and drained in the background so no HTTP
// request ever blocks on them.
const pending = [];
let draining = false;
const CONCURRENCY = 5;

async function drain() {
  draining = true;
  try {
    while (pending.length) {
      const batch = pending.splice(0, CONCURRENCY);
      await Promise.all(batch.map((task) => task()));
    }
  } finally {
    draining = false;
  }
}

function enqueue(task) {
  pending.push(task);
  if (!draining) setImmediate(() => drain().catch(() => {}));
}

// A single delete can legitimately reach us twice — `doc.deleteOne()` triggers
// both the document and the query hook — and a cascade can name the same asset
// from two documents. Remembering recent ids collapses those into one API call.
const recentlyDestroyed = new Map();
const RECENT_TTL_MS = 60_000;

function seenRecently(key) {
  const now = Date.now();
  if (recentlyDestroyed.size > 500) {
    for (const [k, at] of recentlyDestroyed) {
      if (now - at > RECENT_TTL_MS) recentlyDestroyed.delete(k);
    }
  }
  const at = recentlyDestroyed.get(key);
  if (at && now - at < RECENT_TTL_MS) return true;
  recentlyDestroyed.set(key, now);
  return false;
}

/** Fire-and-forget destroy. Never throws — a failed cleanup must not break a write. */
function destroyAssets(assets, context = '') {
  if (!assets.length || !isConfigured()) return;

  for (const asset of assets) {
    if (seenRecently(assetKey(asset))) continue;
    enqueue(async () => {
      try {
        const result = await cloudinary.uploader.destroy(asset.publicId, {
          resource_type: asset.resourceType,
          invalidate: true,
        });
        if (result.result !== 'ok' && result.result !== 'not found') {
          console.warn(`[cloudinary-gc] ${context} ${asset.publicId} → ${result.result}`);
        }
      } catch (err) {
        console.warn(`[cloudinary-gc] ${context} ${asset.publicId} failed: ${err.message}`);
      }
    });
  }
}

/* ---------------------------------------------------------- reference checks */

/**
 * Drops any asset that another document still points at, so a shared image is
 * never pulled out from under a document that is still using it.
 *
 * `protectedBy` lists other models to consult — Orders, for instance, snapshot
 * the product image at purchase time and those thumbnails must survive the
 * product being edited or deleted.
 */
// Ceiling for the whole-collection fallback below. Collections that hold media
// in a Mixed field (site content, settings blobs) are tiny; this is a backstop
// so an unexpected large one can never turn a cleanup into a full scan.
const SCAN_ALL_LIMIT = 1000;

async function filterUnreferenced(Model, assets, excludeIds, protectedBy) {
  if (!assets.length) return assets;

  const values = [];
  for (const asset of assets) {
    values.push(asset.publicId);
    for (const url of asset.urls) values.push(url);
  }
  if (!values.length) return assets;

  const referenced = new Set();
  const targets = [{ model: Model, exclude: excludeIds }];
  for (const entry of protectedBy) {
    try {
      const model = typeof entry.model === 'function' ? entry.model() : entry.model;
      if (model) targets.push({ model, exclude: [], scanAll: entry.scanAll });
    } catch {
      /* a model that failed to resolve just means one fewer safety net */
    }
  }

  for (const target of targets) {
    const paths = mediaPaths(target.model.schema);

    // A schema that keeps its media inside a Mixed / free-form field has no
    // typed paths to query, so we read the whole (small) collection instead.
    // Callers opt into the same treatment with `scanAll` for content blobs.
    const scanAll = target.scanAll || !paths.length;

    const filter = scanAll ? {} : { $or: paths.map((path) => ({ [path]: { $in: values } })) };
    if (target.exclude && target.exclude.length) filter._id = { $nin: target.exclude };

    let read = target.model.find(filter).limit(scanAll ? SCAN_ALL_LIMIT : 200);
    if (!scanAll) read = selectMedia(read, target.model.schema);
    const docs = await read.lean();

    for (const doc of docs) {
      for (const key of collectAssets(doc).keys()) referenced.add(key);
    }
  }

  return assets.filter((asset) => !referenced.has(assetKey(asset)));
}

/**
 * The single entry point: "these assets left document(s) `ids` of `Model` —
 * delete the ones nothing else needs."
 */
function sweep(Model, assets, ids, protectedBy, context) {
  if (!assets.length || !isConfigured()) return;
  setImmediate(() => {
    filterUnreferenced(Model, assets, ids, protectedBy)
      .then((orphans) => destroyAssets(orphans, context || Model.modelName))
      .catch((err) => console.warn(`[cloudinary-gc] reference check failed: ${err.message}`));
  });
}

/* -------------------------------------------------------------------- plugin */

const SNAPSHOT = '__cloudinarySnapshot';
const BEFORE = '__cloudinaryBefore';

// deleteMany/updateMany can match a lot of documents; cap what we snapshot so a
// bulk write never turns into an unbounded scan.
const BULK_LIMIT = 500;

/**
 * True when an update could plausibly change a media field.
 *
 * Most updates never touch an image — a view counter, a stock decrement, an
 * order status. Checking first means those updates cost nothing extra instead
 * of paying two round-trips to snapshot and re-read a document whose images
 * were never going to change.
 */
function updateTouchesMedia(query) {
  const update = query.getUpdate();
  if (!update) return false;
  // Aggregation-pipeline updates can rewrite anything; don't try to reason.
  if (Array.isArray(update)) return true;

  const paths = mediaPaths(query.model.schema);
  // No typed media paths means media lives in a Mixed field — assume the worst.
  if (!paths.length) return true;

  const fields = [];
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('$')) {
      // Operators we can see through; anything else is treated as opaque.
      if (!['$set', '$unset', '$setOnInsert', '$inc', '$push', '$pull',
            '$addToSet', '$pop', '$pullAll', '$min', '$max', '$mul',
            '$currentDate', '$rename'].includes(key)) {
        return true;
      }
      if (value && typeof value === 'object') fields.push(...Object.keys(value));
    } else {
      // A replacement document rewrites every field.
      fields.push(key);
    }
  }
  if (!fields.length) return false;

  return fields.some((field) =>
    paths.some((path) => path === field || path.startsWith(`${field}.`) || field.startsWith(`${path}.`))
  );
}

async function snapshotQuery(query, limit) {
  const Model = query.model;
  try {
    const docs = await selectMedia(Model.find(query.getFilter()).limit(limit), Model.schema).lean();

    const assets = new Map();
    for (const doc of docs) collectAssets(doc, assets);
    return { assets, ids: docs.map((d) => d._id) };
  } catch (err) {
    console.warn(`[cloudinary-gc] snapshot failed on ${Model.modelName}: ${err.message}`);
    return null;
  }
}

function diffAssets(before, after) {
  const removed = [];
  for (const [key, asset] of before) {
    if (!after.has(key)) removed.push(asset);
  }
  return removed;
}

/**
 * Mongoose plugin. Apply to any model that stores Cloudinary media:
 *
 *   schema.plugin(cloudinaryCleanupPlugin, {
 *     protectedBy: [{ model: () => require('./Order') }],
 *     mediaPaths: ['hero.desktop'],   // fields the name heuristic can't spot
 *   });
 */
function cloudinaryCleanupPlugin(schema, options = {}) {
  const protectedBy = options.protectedBy || [];

  // Registered before anything reads the schema's media paths, so the explicit
  // entries are part of every projection and reference check from the start.
  if (options.mediaPaths && options.mediaPaths.length) {
    schema.$cloudinaryMediaPaths = options.mediaPaths;
    mediaPathCache.delete(schema);
  }

  /* ---- document flow: doc.save() / doc.deleteOne() ---- */

  schema.post('init', function snapshotOnLoad() {
    this.$locals[SNAPSHOT] = collectAssets(this.toObject({ depopulate: true }));
  });

  schema.post('save', function sweepAfterSave() {
    const before = this.$locals[SNAPSHOT];
    const after = collectAssets(this.toObject({ depopulate: true }));
    this.$locals[SNAPSHOT] = after;
    // No snapshot means this document was just created — nothing to replace.
    if (!before) return;
    sweep(this.constructor, diffAssets(before, after), [this._id], protectedBy, `${this.constructor.modelName}.save`);
  });

  schema.post('deleteOne', { document: true, query: false }, function sweepAfterDocDelete() {
    const assets = [...collectAssets(this.toObject({ depopulate: true })).values()];
    sweep(this.constructor, assets, [this._id], protectedBy, `${this.constructor.modelName}.delete`);
  });

  /* ---- query flow: findOneAndUpdate / updateOne / updateMany / replaceOne ---- */

  const updateOps = [
    ['findOneAndUpdate', 1],
    ['findOneAndReplace', 1],
    ['updateOne', 1],
    ['replaceOne', 1],
    ['updateMany', BULK_LIMIT],
  ];

  for (const [op, limit] of updateOps) {
    schema.pre(op, { query: true, document: false }, async function captureBeforeUpdate() {
      // Skip the snapshot entirely for updates that cannot affect an image.
      if (!updateTouchesMedia(this)) return;
      this[BEFORE] = await snapshotQuery(this, limit);
    });

    schema.post(op, { query: true, document: false }, async function sweepAfterUpdate() {
      const before = this[BEFORE];
      if (!before || !before.assets.size) return;

      const Model = this.model;
      try {
        const docs = await selectMedia(Model.find({ _id: { $in: before.ids } }), Model.schema).lean();

        // The documents should still exist after an update. If none come back
        // something went wrong (or they were deleted concurrently) — bail out
        // rather than risk destroying assets that are still in use.
        if (before.ids.length && !docs.length) return;

        const after = new Map();
        for (const doc of docs) collectAssets(doc, after);
        sweep(Model, diffAssets(before.assets, after), before.ids, protectedBy, `${Model.modelName}.${op}`);
      } catch (err) {
        console.warn(`[cloudinary-gc] post-${op} failed on ${Model.modelName}: ${err.message}`);
      }
    });
  }

  /* ---- query flow: deletes ---- */

  const deleteOps = [
    ['findOneAndDelete', 1],
    ['deleteOne', 1],
    ['deleteMany', BULK_LIMIT],
  ];

  for (const [op, limit] of deleteOps) {
    schema.pre(op, { query: true, document: false }, async function captureBeforeDelete() {
      this[BEFORE] = await snapshotQuery(this, limit);
    });

    schema.post(op, { query: true, document: false }, function sweepAfterDelete() {
      const before = this[BEFORE];
      if (!before || !before.assets.size) return;
      sweep(this.model, [...before.assets.values()], before.ids, protectedBy, `${this.model.modelName}.${op}`);
    });
  }
}

module.exports = {
  cloudinaryCleanupPlugin,
  parseCloudinaryUrl,
  collectAssets,
  destroyAssets,
  mediaPaths,
  sweep,
};
