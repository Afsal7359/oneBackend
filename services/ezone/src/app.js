import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import productRoutes from './routes/product.routes.js';
import categoryRoutes from './routes/category.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import reviewRoutes from './routes/review.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import settingRoutes from './routes/setting.routes.js';
import blogRoutes from './routes/blog.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { serverTiming } from './utils/responseCache.js';
import { clientKey } from './utils/clientKey.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* --------------------------- Security & Parsers --------------------------- */
app.use(compression());
// Reports handler time separately from network time in the browser's network
// panel; cached responses also carry `X-Cache: HIT`.
app.use(serverTiming());
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// No wildcard fallback. `process.env.CLIENT_URL?.split(',') || '*'` meant an
// unset CLIENT_URL served `Access-Control-Allow-Origin: *` from an API that
// also sets `credentials: true` — the one CORS combination that hands the whole
// surface to any page on the internet. Missing config now blocks cross-origin
// browser calls, which fails visibly instead of silently opening up.
// Entries are trimmed and stripped of a trailing slash, because
// "https://site.com/" never matches the browser's Origin header and the
// resulting failure reads like the API being down.
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (!allowedOrigins.length) {
  console.warn('[ezone] CLIENT_URL is not set — all cross-origin browser requests will be blocked.');
}

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin, curl, or server-to-server. Not what
      // CORS defends against.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
      const err = new Error(`CORS: origin ${origin} is not allowed`);
      err.status = 403; // a refusal, not a server fault
      cb(err);
    },
    credentials: true,
  })
);

// Razorpay webhook needs raw body for HMAC signature verification.
// Must be registered BEFORE express.json() so the body isn't parsed yet.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ------------------------------ Rate limiter ------------------------------ */
// Keyed on the real client, not `req.ip`. Behind nginx -> gateway every request
// looks like 127.0.0.1, so this was a single shared 500-request budget for the
// whole internet: it throttled genuine shoppers without slowing an attacker who
// only needs a fraction of it. See utils/clientKey.js for why X-Real-IP rather
// than X-Forwarded-For.
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ------------------------------ Static files ------------------------------ */
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

/* --------------------------------- Routes --------------------------------- */
app.get('/', (_req, res) =>
  res.json({ ok: true, service: 'ezoneshoppi API', version: '1.0.0' })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/admin', adminRoutes);

/* --------------------------- Errors (last) -------------------------------- */
app.use(notFound);
app.use(errorHandler);

export default app;
