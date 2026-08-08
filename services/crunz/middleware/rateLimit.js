/**
 * Dependency-free fixed-window rate limiter.
 *
 * Crunz's auth routes had no throttle: `/api/auth/login` took unlimited
 * password guesses, `/api/auth/verify-otp` took unlimited guesses at a 6-digit
 * code and returns a 30-day session on success, and `/api/auth/resend-otp`
 * would send mail as fast as it was asked to.
 *
 * In-memory counters are correct here because ecosystem.config.cjs pins this
 * service to `instances: 1, exec_mode: 'fork'` — one process sees all traffic.
 * Under cluster mode the counters would split per worker; that migration
 * belongs with the same Redis work utils/responseCache.js already needs.
 */

// nginx sets X-Real-IP from $remote_addr as a replacement, so it can't be
// spoofed by the caller the way X-Forwarded-For can. The gateway passes it
// through untouched. Falls back to the socket address with no nginx in front.
const clientKey = (req) =>
  req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';

function rateLimit({ windowMs, max, message, keyOn }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const hits = new Map();

  // Otherwise the map keeps one entry per unique IP forever.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  timer.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyOn ? `${clientKey(req)}|${keyOn(req)}` : clientKey(req);

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
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

const bodyKey = (field) => (req) => String(req.body?.[field] || '').toLowerCase();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please try again in 15 minutes.',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

// Keyed on the target account as well as the IP, so rotating IPs still can't
// grind through the code space for one user.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOn: bodyKey('userId'),
  message: 'Too many attempts. Please request a new code.',
});

const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyOn: bodyKey('userId'),
  message: 'Too many code requests. Please try again in 15 minutes.',
});

module.exports = {
  rateLimit,
  clientKey,
  loginLimiter,
  registerLimiter,
  otpVerifyLimiter,
  otpResendLimiter,
};
