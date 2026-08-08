/**
 * Identifies the calling client for rate limiting.
 *
 * `req.ip` is useless behind the oneBackend chain (nginx -> gateway -> service):
 * every request arrives from 127.0.0.1, so an IP-keyed limiter collapses into a
 * single global counter and one script locks out every real customer.
 *
 * X-Real-IP is the header to trust. nginx sets it with `proxy_set_header
 * X-Real-IP $remote_addr`, which *replaces* whatever the caller sent, whereas
 * X-Forwarded-For is built with `$proxy_add_x_forwarded_for`, which *appends*
 * to it — the leftmost XFF entry is attacker-controlled and unusable as a key.
 * The gateway forwards X-Real-IP untouched.
 *
 * Falls back to the socket address in local dev, where a shared counter is
 * harmless.
 */
export const clientKey = (req) =>
  req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || 'unknown';

export default clientKey;
