import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { serverTiming } from './utils/responseCache.js';
import { clientKey } from './utils/clientKey.js';

import productRoutes from './routes/products.js';
import collectionRoutes from './routes/collections.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import couponRoutes from './routes/coupon.js';
import stripeRoutes from './routes/stripe.js';
import eventRoutes from './routes/events.js';
import adminAnalyticsRoutes from './routes/adminAnalytics.js';
import billingRoutes from './routes/billing.js';
import adminBillingUserRoutes from './routes/adminBillingUsers.js';
import adminNotificationRoutes from './routes/adminNotifications.js';
import { startDailySummaryJob } from './services/dailySummary.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
// Reports handler time separately from network time in the browser's network
// panel; cached responses also carry `X-Cache: HIT`.
app.use(serverTiming());

// `X-Powered-By: Express` just tells a scanner which CVE list to work through.
app.disable('x-powered-by');

const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

if (!allowedOrigins.length) {
  console.warn('[underdwag] CLIENT_URL is not set — all cross-origin browser requests will be blocked.');
}

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server / curl (no Origin header) — CORS isn't what
    // protects those.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    const err = new Error(`CORS: origin ${origin} not allowed`);
    err.status = 403; // a refusal, not a server fault
    cb(err);
  },
  credentials: true,
}));
// An empty allowlist used to mean "allow every origin" — combined with
// credentials:true that is the single worst CORS configuration available, and
// it was one unset CLIENT_URL away at all times. Missing config now blocks
// instead, which fails loudly rather than silently opening the API up.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.use('/api/stripe', stripeRoutes);

// Rate limit mutating endpoints.
//
// Two things were wrong with the previous set. First, every limiter keyed on
// `req.ip`, which behind nginx -> gateway is always 127.0.0.1: the limits were
// global rather than per-client, so one script could lock every real customer
// out. `clientKey` reads nginx's X-Real-IP instead — nginx *replaces* that
// header (unlike X-Forwarded-For, which it appends to, and which a caller can
// therefore seed with anything). Second, the password-reset path was not
// covered at all, leaving unlimited guesses at a 6-digit code that resets any
// account, admin included.
const limit = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: message || 'Too many requests. Please wait and try again.' },
  });

app.use('/api/admin/login', limit(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.'));
app.use('/api/auth/login', limit(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.'));
app.use('/api/auth/signup', limit(15 * 60 * 1000, 5));
app.use('/api/auth/resend-otp', limit(5 * 60 * 1000, 3));
app.use('/api/auth/verify-otp', limit(15 * 60 * 1000, 10, 'Too many attempts. Please request a new code.'));
app.use('/api/auth/forgot-password', limit(15 * 60 * 1000, 5, 'Too many reset requests. Try again in 15 minutes.'));
app.use('/api/auth/reset-password', limit(15 * 60 * 1000, 10, 'Too many attempts. Please request a new code.'));
app.use('/api/billing/login', limit(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.'));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// API routes
app.use('/api/products',           productRoutes);
app.use('/api/collections',        collectionRoutes);
app.use('/api/orders',             orderRoutes);
// Mounted before '/api/admin' so the more specific path always wins, even if a
// '/:id' style route is later added to adminRoutes.
app.use('/api/admin/billing-users', adminBillingUserRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin',              adminRoutes);
app.use('/api/admin/analytics',    adminAnalyticsRoutes);
// Billing (NexBill) app — same port, same database, same product catalogue.
app.use('/api/billing',            billingRoutes);
app.use('/api/settings',           settingsRoutes);
app.use('/api/auth',               authRoutes);
app.use('/api/coupons',            couponRoutes);
app.use('/api/events',             limit(60 * 1000, 300), eventRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] running on :${PORT}`));
    // End-of-day sales summary push (checks the clock every 15 min).
    startDailySummaryJob();
  })
  .catch((err) => {
    console.error('[server] failed to start', err);
    process.exit(1);
  });
