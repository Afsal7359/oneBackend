import express from 'express';
import {
  register,
  login,
  sendOtp,
  verifyOtpLogin,
  googleAuth,
  me,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  toggleWishlist,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.middleware.js';
import { clientKey } from '../utils/clientKey.js';

const router = express.Router();

// The app-wide 500-per-15-minutes limiter is a traffic ceiling, not a brute
// force control — it leaves room for hundreds of password or OTP guesses. Every
// route below either hands out a session or moves an account toward a new
// password, so each gets a limit sized for what it actually does.
const limit = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });

const signInLimiter = limit(15 * 60 * 1000, 10, 'Too many sign-in attempts. Please try again in 15 minutes.');
const otpSendLimiter = limit(15 * 60 * 1000, 5, 'Too many code requests. Please try again in 15 minutes.');
const otpVerifyLimiter = limit(15 * 60 * 1000, 10, 'Too many attempts. Please request a new code.');

// Legacy (password-based)
router.post('/register', limit(60 * 60 * 1000, 10, 'Too many accounts created from this network.'), register);
router.post('/login', signInLimiter, login);

// OTP email auth
router.post('/send-otp', otpSendLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtpLogin);

// Forgot / Reset password
router.post('/forgot-password', otpSendLimiter, forgotPassword);
router.post('/reset-password', otpVerifyLimiter, resetPassword);

// Google OAuth
router.post('/google', signInLimiter, googleAuth);

// Protected
router.get('/me', protect, me);
router.put('/profile', protect, updateProfile);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:id', protect, updateAddress);
router.delete('/addresses/:id', protect, deleteAddress);
router.post('/wishlist/:productId', protect, toggleWishlist);

export default router;
