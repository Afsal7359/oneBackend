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
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Legacy (password-based)
router.post('/register', register);
router.post('/login', login);

// OTP email auth
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtpLogin);

// Forgot / Reset password
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google OAuth
router.post('/google', googleAuth);

// Protected
router.get('/me', protect, me);
router.put('/profile', protect, updateProfile);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:id', protect, updateAddress);
router.delete('/addresses/:id', protect, deleteAddress);
router.post('/wishlist/:productId', protect, toggleWishlist);

export default router;
