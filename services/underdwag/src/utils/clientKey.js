/**
 * Identifies the calling client for rate limiting.
 *
 * `req.ip` is useless here: the chain is nginx -> gateway -> service, so every
 * request arrives from 127.0.0.1 and an IP-keyed limiter degrades into a single
 * global counter — one script then locks out every real customer.
 *
 * X-Real-IP is the header to trust. nginx sets it with `proxy_set_header
 * X-Real-IP $remote_addr`, which *replaces* whatever the caller sent;
 * X-Forwarded-For is built with `$proxy_add_x_forwarded_for`, which *appends*
 * to the caller's value, so its leftmost entry is attacker-controlled and
 * cannot be used as a limiter key. The gateway forwards X-Real-IP untouched.
 *
 * Falls back to the socket address when nothing is in front (local dev), where
 * the shared-counter behaviour is harmless.
 */
export const clientKey = (req) =>
  req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || 'unknown';

export default clientKey;
