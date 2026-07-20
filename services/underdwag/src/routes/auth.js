import express from 'express';
import { signup, verifyOtp, resendOtp, login, googleAuth, getMe, updateProfile, forgotPassword, resetPassword } from '../controllers/authController.js';
import { userAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup',          signup);
router.post('/verify-otp',      verifyOtp);
router.post('/resend-otp',      resendOtp);
router.post('/login',           login);
router.post('/google',          googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);

router.get('/me',               userAuth, getMe);
router.put('/me',               userAuth, updateProfile);

export default router;
