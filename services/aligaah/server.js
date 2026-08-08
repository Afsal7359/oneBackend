const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const connectDB = require('./config/db');
const { serverTiming } = require('./utils/responseCache');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
connectDB();

// `X-Powered-By: Express` tells a scanner exactly which CVE list to work
// through. Nothing needs it.
app.disable('x-powered-by');

// Baseline response headers. This is a JSON API — no HTML is ever served from
// here — so the policy is simply "this is not a document, do not render it,
// do not sniff it, do not frame it". Written by hand rather than pulling in
// helmet, which would mean a new dependency to install on every deploy.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Product listings are mostly repeated JSON keys and gzip to a fraction of
// their size. Less to transfer is less time on the wire for the shopper.
app.use(compression());

// Reports how long the handler actually took, so a slow endpoint can be told
// apart from a slow network in the browser's dev tools. Cached responses also
// carry `X-Cache: HIT`.
app.use(serverTiming());

// CORS allowlist. `CLIENT_URL` is comma separated; entries are trimmed and
// stripped of a trailing slash because "https://site.com/" never matches the
// browser's Origin header and the resulting failure looks like a server outage.
//
// There is no wildcard fallback. It used to read `process.env.CLIENT_URL || '*'`
// — with `credentials: true` that combination is the one CORS setup that lets
// any site on the internet make authenticated calls with a visitor's cookies.
// Missing config now means no cross-origin access, which fails loudly and safely.
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (!allowedOrigins.length) {
  console.warn('[aligaah] CLIENT_URL is not set — all cross-origin browser requests will be blocked.');
}

app.use(cors({
  origin(origin, cb) {
    // No Origin header = same-origin, curl, or a server-to-server call. Those
    // are not what CORS defends against, so they pass.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    const err = new Error(`CORS: origin ${origin} is not allowed`);
    err.status = 403; // a refusal, not a server fault — see middleware/error.js
    cb(err);
  },
  credentials: true,
}));
// Keep the untouched bytes around: the Razorpay webhook signature is an HMAC
// over the exact raw body, so re-serialising the parsed JSON would break it.
app.use(express.json({
  limit: '25mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/banners', require('./routes/bannerRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/enquiries', require('./routes/enquiryRoutes'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on port ${PORT} [${process.env.NODE_ENV}]`));
