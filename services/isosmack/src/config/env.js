import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 5000),

  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isosmack',

  JWT_SECRET: process.env.JWT_SECRET || 'isosmack_dev_access_secret_change_me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'isosmack_dev_refresh_secret_change_me',
  ACCESS_TTL: process.env.ACCESS_TTL || '30m',
  REFRESH_TTL_DAYS: int(process.env.REFRESH_TTL_DAYS, 30),

  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, false),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,

  // ---- Cloudinary (falls back to local disk storage when unset) ----
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || 'isosmack',

  // ---- Razorpay (falls back to a simulated gateway when unset) ----
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // ---- Store rules ----
  CURRENCY: process.env.CURRENCY || 'INR',
  FREE_SHIPPING_ABOVE: int(process.env.FREE_SHIPPING_ABOVE, 999),
  SHIPPING_FEE: int(process.env.SHIPPING_FEE, 69),
  PREPAID_BONUS_PCT: Number(process.env.PREPAID_BONUS_PCT ?? 3),
  COD_ENABLED: bool(process.env.COD_ENABLED, true),
  COD_FEE: int(process.env.COD_FEE, 49),
  COD_MAX_ORDER: int(process.env.COD_MAX_ORDER, 5000),
  TAX_INCLUSIVE: bool(process.env.TAX_INCLUSIVE, true),
};

export const cloudinaryEnabled = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
);

export const razorpayEnabled = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export default env;
