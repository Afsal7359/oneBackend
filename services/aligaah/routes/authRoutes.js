const router = require('express').Router();
const {
  register, login, adminLogin, getMe,
  forgotPassword, verifyOtp, resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
  loginLimiter, adminLoginLimiter, otpRequestLimiter,
  otpVerifyLimiter, registerLimiter,
} = require('../middleware/rateLimit');

// Every endpoint here either hands out a session or moves an account towards a
// new password, so each one is throttled. Unthrottled, `/reset-password` alone
// is a six-digit guess away from any account, including the admin.
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/admin/login', adminLoginLimiter, adminLogin);
router.post('/forgot-password', otpRequestLimiter, forgotPassword);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/reset-password', otpVerifyLimiter, resetPassword);
router.get('/me', protect, getMe);

module.exports = router;
