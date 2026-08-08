const router = require('express').Router();
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { sendOTP } = require('../utils/mailer');
const { sign } = require('../config/jwt');
const {
  loginLimiter, registerLimiter, otpVerifyLimiter, otpResendLimiter,
} = require('../middleware/rateLimit');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Stamped iss/aud = crunz, so this token is meaningless to any sibling service.
const signToken = (id) => sign({ id: String(id) });

const userPayload = (u) => ({ id: u._id, name: u.name, email: u.email, isAdmin: u.isAdmin, addresses: u.addresses });

// A verified OTP hands out a 30-day session, so the code is worth only a
// handful of guesses before it is burned and has to be re-requested — which is
// itself rate limited. Without this cap six digits is a few minutes of scripted
// requests away from any account, admin included.
const MAX_OTP_ATTEMPTS = 10;

// Constant-time comparison so response latency can't leak how much of a guess
// was correct.
const otpMatches = (stored, guess) => {
  const a = Buffer.from(String(stored || ''), 'utf8');
  const b = Buffer.from(String(guess || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Register — sends OTP
router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  let user = await User.findOne({ email });
  if (user && user.isVerified) return res.status(400).json({ message: 'Email already registered. Please sign in.' });

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  if (!user) {
    user = new User({ name, email, password, otp, otpExpiry, otpAttempts: 0 });
  } else {
    user.name = name;
    user.password = password;
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    user.otpAttempts = 0;
  }
  await user.save();
  await sendOTP(email, otp, name);
  res.json({ message: 'OTP sent to your email', userId: user._id });
});

// Verify OTP
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  const { userId, otp } = req.body;

  // One vague message for every failure. Distinguishing "user not found" from
  // "invalid OTP" turns this endpoint into an oracle for which ids exist.
  const invalid = () => res.status(400).json({ message: 'Invalid or expired code' });

  if (!userId || !/^[a-f\d]{24}$/i.test(String(userId))) return invalid();

  const user = await User.findById(userId).select('+otp +otpExpiry +otpAttempts');
  if (!user || !user.otp || !user.otpExpiry) return invalid();

  const burn = async () => {
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    await user.save();
  };

  if (new Date() > new Date(user.otpExpiry)) {
    await burn();
    return res.status(400).json({ message: 'Code expired. Please resend.' });
  }
  if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    await burn();
    return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
  }
  if (!otpMatches(user.otp, otp)) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();
    return invalid();
  }

  user.isVerified = true;
  await burn();

  res.json({ token: signToken(user._id), user: userPayload(user) });
});

// Resend OTP
router.post('/resend-otp', otpResendLimiter, async (req, res) => {
  const { userId } = req.body;
  // Same reply whether or not the id exists, and no mail is sent for one that
  // doesn't — otherwise this both confirms ids and works as a mail relay.
  const ok = { message: 'If that account is awaiting verification, a new code has been sent.' };
  if (!userId || !/^[a-f\d]{24}$/i.test(String(userId))) return res.json(ok);

  const user = await User.findById(userId);
  if (!user || user.isVerified) return res.json(ok);

  const otp = crypto.randomInt(100000, 1000000).toString();
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  user.otpAttempts = 0;
  await user.save();
  await sendOTP(user.email, otp, user.name);
  res.json(ok);
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !user.password) return res.status(400).json({ message: 'Invalid email or password' });
  if (!user.isVerified) {
    return res.status(400).json({ message: 'Please verify your email first', userId: user._id, needsVerification: true });
  }
  const match = await user.comparePassword(password);
  if (!match) return res.status(400).json({ message: 'Invalid email or password' });
  res.json({ token: signToken(user._id), user: userPayload(user) });
});

// Google OAuth
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ message: 'Google credential required' });

  const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
  const { sub, name, email } = ticket.getPayload();

  let user = await User.findOne({ $or: [{ googleId: sub }, { email }] });
  if (!user) {
    user = await User.create({ name, email, googleId: sub, isVerified: true });
  } else if (!user.googleId) {
    user.googleId = sub;
    user.isVerified = true;
    await user.save();
  }

  res.json({ token: signToken(user._id), user: userPayload(user) });
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: userPayload(req.user) });
});

// Add address
router.post('/address', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);
  const addr = req.body;
  if (addr.isDefault) user.addresses.forEach(a => (a.isDefault = false));
  user.addresses.push(addr);
  await user.save();
  res.json({ addresses: user.addresses });
});

// Delete address
router.delete('/address/:index', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);
  user.addresses.splice(Number(req.params.index), 1);
  await user.save();
  res.json({ addresses: user.addresses });
});

module.exports = router;
