require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const { serverTiming } = require('./utils/responseCache');

const app = express();

// JSON product/content payloads gzip to a fraction of their size, so there is
// less to put on the wire. `Server-Timing` then reports how long the handler
// itself took, which separates a slow endpoint from a slow network.
app.use(compression());
app.use(serverTiming());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// DB
connectDB();

// Middleware
// The localhost entries are development-only. They used to be in the list
// unconditionally, which meant a page served from a laptop on the same network
// could make credentialed calls against production.
const devOrigins = process.env.NODE_ENV === 'production'
  ? []
  : ['http://localhost:3000', 'http://localhost:3001'];

const allowedOrigins = [
  ...(process.env.CLIENT_URL || '').split(','),
  ...devOrigins,
  'https://getcrunz.com',
  'https://www.getcrunz.com',
].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server requests (no origin) and listed origins
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    const err = new Error(`CORS: origin ${origin} not allowed`);
    err.status = 403; // a refusal, not a server fault
    cb(err);
  },
  credentials: true
}));
// Stripe webhook needs raw body BEFORE express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files (images + videos)
app.use('/uploads', express.static(uploadsDir));
// Ensure videos sub-directory exists
const videosDir = path.join(uploadsDir, 'videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

// Public content endpoint (no auth required)
const SiteContent = require('./models/SiteContent');
app.get('/api/content', async (req, res) => {
  const content = await SiteContent.find();
  const obj = {};
  content.forEach(c => (obj[c.key] = c.value));
  res.json(obj);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payment',   require('./routes/payment'));
app.use('/api/upload',    require('./routes/upload'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/coupons',   require('./routes/coupons'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Auto-expire stale pending payments every 30 minutes ──────────────
const Order = require('./models/Order');
const mongoose = require('mongoose');
const EXPIRE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

async function expireStalePendingOrders() {
  try {
    const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS);
    const result = await Order.updateMany(
      { paymentStatus: 'pending', createdAt: { $lt: cutoff } },
      { paymentStatus: 'failed', status: 'cancelled' }
    );
    if (result.modifiedCount > 0) {
      console.log(`[Auto-expire] Cancelled ${result.modifiedCount} stale pending order(s)`);
    }
  } catch (err) {
    console.error('[Auto-expire] Error:', err.message);
  }
}

// Wait for DB connection before running the first expire check
mongoose.connection.once('connected', () => {
  expireStalePendingOrders();
  setInterval(expireStalePendingOrders, 30 * 60 * 1000);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🍌 Crunz Backend running on http://localhost:${PORT}`);
  // Host and database only — the full URI carries the Atlas password, and this
  // line was putting it into the PM2 log file on every restart.
  const dbHost = (process.env.MONGODB_URI || '').replace(/^mongodb(\+srv)?:\/\/[^@]*@/, '');
  console.log(`   MongoDB: ${dbHost || '(not configured)'}`);
  console.log(`   Client:  ${allowedOrigins.join(', ') || '(none allowed)'}\n`);
});
