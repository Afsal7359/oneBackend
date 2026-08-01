import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import env from './config/env.js';
import connectDB from './config/db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { razorpayWebhook } from './controllers/payment.controller.js';
import { LOCAL_UPLOAD_DIR, cloudinaryEnabled } from './services/upload.js';

const app = express();

app.set('trust proxy', 1);

/* ------------------------------------------------------------------ security */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // serve /uploads to the Next.js origin
    contentSecurityPolicy: false,
  })
);

// In development the storefront's port moves around (3000, 3010, …) depending on
// what else is running, so any localhost origin is accepted. Production stays on
// the strict CORS_ORIGINS allowlist.
const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / server-to-server
      if (env.CORS_ORIGINS.includes(origin)) return cb(null, true);
      if (env.NODE_ENV !== 'production' && isLocalhost(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

/* ------------------------------------------------------------------- parsers */
// Razorpay signs the exact bytes, so the webhook needs the raw body.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(compression());
app.use(mongoSanitize());

if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ------------------------------------------------------------- static assets */
if (!cloudinaryEnabled) {
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d' }));
}

/* -------------------------------------------------------------------- routes */
app.get('/api/health', (_req, res) =>
  res.json({
    success: true,
    service: 'isosmack-api',
    env: env.NODE_ENV,
    storage: cloudinaryEnabled ? 'cloudinary' : 'local-disk',
    time: new Date().toISOString(),
  })
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------ bootstrap */
const start = async () => {
  await connectDB();
  const server = app.listen(env.PORT, () => {
    console.log(`\n  ISOSMACK API ready → http://localhost:${env.PORT}/api`);
    console.log(`  Storefront origin  → ${env.CLIENT_URL}\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    console.error('[server] unhandled rejection:', err);
  });
};

start();

export default app;
