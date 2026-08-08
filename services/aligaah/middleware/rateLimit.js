/**
 * Dependency-free fixed-window rate limiter.
 *
 * Aligaah's auth endpoints had no throttle at all: `/api/auth/login` accepted
 * unlimited password guesses and `/api/auth/verify-otp` accepted unlimited
 * guesses at a 6-digit reset code, which is a few minutes of scripted requests
 * away from an admin takeover. This closes that.
 *
 * In-memory state is the right fit *here specifically*: ecosystem.config.cjs
 * pins every service to `instances: 1, exec_mode: 'fork'`, so one process owns
 * all traffic. If this service is ever scaled to cluster mode the counters
 * split per worker and the effective limit multiplies — move to Redis at the
 * same time as utils/responseCache.js, which has the same constraint.
 */

// Client identity. nginx sets X-Real-IP from $remote_addr (a replacement, not
// an append), so unlike X-Forwarded-For it cannot be spoofed by the caller.
// The gateway proxies it through untouched. Falls back to the socket address
// when running without nginx in front.
const clientKey = (req) =>
  req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';

/**
 * @param {object}  opts
 * @param {number}  opts.windowMs  length of the window
 * @param {number}  opts.max       requests allowed per key per window
 * @param {string}  opts.message   body returned once the limit is hit
 * @param {function} [opts.keyOn]  extra key component, e.g. the target email —
 *                                 so rotating IPs cannot brute one account
 */
function rateLimit({ windowMs, max, message, keyOn }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const hits = new Map();

  // Without this the map grows once per unique IP forever, which on a public
  // endpoint is a slow memory leak rather than a cache.
  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  };
  const timer = setInterval(sweep, windowMs);
  timer.unref?.(); // never hold the process open

  return (req, res, next) => {
    const now = Date.now();
    const key = keyOn ? `${clientKey(req)}|${keyOn(req)}` : clientKey(req);

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil((entry.resetAt - now) / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        message: message || 'Too many requests. Please wait and try again.',
      });
    }
    next();
  };
}

const emailKey = (req) => String(req.body?.email || '').toLowerCase();

// Password guessing against one account, and account enumeration in bulk.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please try again in 15 minutes.',
});

// Deliberately tighter than the customer login: this endpoint is the front door
// to the whole catalogue, and no legitimate admin needs ten tries.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many sign-in attempts. Please try again in 15 minutes.',
});

// Caps both OTP brute force and using us as a free mail cannon.
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyOn: emailKey,
  message: 'Too many reset requests. Please try again in 15 minutes.',
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOn: emailKey,
  message: 'Too many attempts. Please request a new code.',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

module.exports = {
  rateLimit,
  clientKey,
  loginLimiter,
  adminLoginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  registerLimiter,
};
