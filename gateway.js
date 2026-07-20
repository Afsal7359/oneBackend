/**
 * oneBackend — API Gateway
 * -------------------------------------------------------------
 * A single PUBLIC port that fronts all 4 backends. Each backend
 * keeps running as its own service (own DB, own module system,
 * own internal port) and is reachable under a unique path prefix:
 *
 *   http://localhost:5000/aligaah/api/...    ->  aligaah   service (:5050)
 *   http://localhost:5000/crunz/api/...      ->  crunz     service (:5006)
 *   http://localhost:5000/ezone/api/...      ->  ezone     service (:5003)
 *   http://localhost:5000/underdwag/api/...  ->  underdwag service (:5008)
 *
 * The prefix is stripped before the request reaches the service,
 * so every service still receives the exact /api/... paths it was
 * written for. No service code needs to change.
 */

require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.GATEWAY_PORT || 5000;

// Public path prefix  ->  internal service target.
// Targets come from .env so ports can be changed in one place.
const services = [
  { name: 'aligaah',   prefix: '/aligaah',   target: process.env.ALIGAAH_TARGET   || 'http://localhost:5050' },
  { name: 'crunz',     prefix: '/crunz',     target: process.env.CRUNZ_TARGET     || 'http://localhost:5006' },
  { name: 'ezone',     prefix: '/ezone',     target: process.env.EZONE_TARGET     || 'http://localhost:5003' },
  { name: 'underdwag', prefix: '/underdwag', target: process.env.UNDERDWAG_TARGET || 'http://localhost:5008' },
];

// --- Gateway's own routes (must be declared BEFORE the proxies) ---
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'oneBackend gateway',
    port: Number(PORT),
    routes: services.map((s) => ({ name: s.name, base: `${s.prefix}/api`, target: s.target })),
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- One reverse proxy per service ---
// Mounting with app.use(prefix, ...) makes Express strip the prefix, so the
// service receives /api/... unchanged. No body parser runs here, which keeps
// Stripe / Razorpay webhook raw bodies intact.
for (const s of services) {
  app.use(
    s.prefix,
    createProxyMiddleware({
      target: s.target,
      changeOrigin: true,
      xfwd: true,          // forward client IP as X-Forwarded-* headers
      ws: true,
      proxyTimeout: 60000,
      // Strip the public prefix so the service receives the exact /api/... path
      // it was written for (e.g. /aligaah/api/products -> /api/products).
      pathRewrite: (path) => path.replace(new RegExp(`^${s.prefix}`), '') || '/',
      logLevel: 'warn',
      onError(err, _req, res) {
        console.error(`[gateway] ${s.name} error:`, err.message);
        if (res && !res.headersSent) {
          res.status(502).json({ error: 'bad_gateway', service: s.name, message: err.message });
        }
      },
    })
  );
}

app.listen(PORT, () => {
  console.log(`\n🚪  oneBackend gateway  ->  http://localhost:${PORT}`);
  for (const s of services) {
    console.log(`     ${s.prefix.padEnd(11)}/api   ->   ${s.target}`);
  }
  console.log('');
});
