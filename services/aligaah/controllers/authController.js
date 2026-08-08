const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { generateToken } = require('../utils/token');
const { sendMail, otpEmail } = require('../utils/email');

const publicUser = (u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone });
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

// crypto.randomInt, not Math.random. Math.random is a fast PRNG seeded from
// process state and is not meant to be unguessable — for a code that resets a
// password (including the admin's) it has to come from the CSPRNG.
const genOtp = () => String(crypto.randomInt(100000, 1000000)); // 6 digits

// Compares in constant time so response latency can't be used to learn how many
// leading characters of a guessed code were right.
const otpMatches = (stored, guess) => {
  const a = Buffer.from(String(stored || ''), 'utf8');
  const b = Buffer.from(hashOtp(guess), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// A reset code is only ever worth a handful of guesses. Ten wrong answers burns
// the code, so an attacker has to request a new one and hit the send-side rate
// limit — that's what makes a 6-digit space safe.
const MAX_OTP_ATTEMPTS = 10;

const clearOtp = (user) => {
  user.resetOtp = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
};

/**
 * Shared gate for verify-otp and reset-password. Returns the user on success;
 * on failure it has already thrown with a deliberately vague message, so the
 * caller can't be used to probe which emails have a reset in flight.
 */
const consumeOtpCheck = async (res, email, otp) => {
  const user = await User.findOne({ email: (email || '').toLowerCase() })
    .select('+resetOtp +resetOtpExpires +resetOtpAttempts +password');

  const reject = (msg) => { res.status(400); throw new Error(msg); };

  if (!user || !user.resetOtp || !user.resetOtpExpires) reject('Invalid or expired code');
  if (user.resetOtpExpires < new Date()) {
    clearOtp(user);
    await user.save();
    reject('Code expired — please request a new one');
  }
  if ((user.resetOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    clearOtp(user);
    await user.save();
    reject('Too many attempts — please request a new code');
  }
  if (!otpMatches(user.resetOtp, otp)) {
    user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
    await user.save();
    reject('Invalid or expired code');
  }
  return user;
};

// @route POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) { res.status(400); throw new Error('All fields are required'); }
  if (password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }

  let user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (user && !user.isGuest) { res.status(400); throw new Error('Email already registered — please log in'); }

  if (user && user.isGuest) {
    // Convert an auto-created guest (from a previous order) into a full account.
    user.name = name;
    user.password = password;
    user.isGuest = false;
    await user.save();
  } else {
    user = await User.create({ name, email: email.toLowerCase(), password });
  }
  res.status(201).json({ ...publicUser(user), token: generateToken(user._id) });
});

// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+password');
  if (!user || user.isGuest || !(await user.matchPassword(password))) {
    res.status(401); throw new Error('Invalid email or password');
  }
  res.json({ ...publicUser(user), token: generateToken(user._id) });
});

// @route POST /api/auth/admin/login
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+password');
  if (user && user.role === 'admin' && (await user.matchPassword(password))) {
    res.json({ ...publicUser(user), token: generateToken(user._id) });
  } else {
    res.status(401); throw new Error('Invalid admin credentials');
  }
});

// @route GET /api/auth/me
const getMe = asyncHandler(async (req, res) => { res.json(req.user); });

// @route POST /api/auth/forgot-password  { email }
const forgotPassword = asyncHandler(async (req, res) => {
  const email = (req.body.email || '').toLowerCase();
  const user = await User.findOne({ email });
  // Always respond ok to avoid leaking which emails exist.
  const resp = { ok: true, message: 'If that email exists, a code has been sent.' };
  if (!user) return res.json(resp);

  const otp = genOtp();
  user.resetOtp = hashOtp(otp);
  user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.resetOtpAttempts = 0;
  await user.save();

  const mail = otpEmail(otp, user.name);
  const { sent } = await sendMail({ to: user.email, ...mail });

  // The reset code is NEVER put in the response. It used to be echoed back
  // whenever SMTP was down and NODE_ENV wasn't exactly 'production' — and this
  // service's own .env carries NODE_ENV=development. One `node server.js`
  // started outside PM2 (which is what supplies NODE_ENV=production) turned
  // "forgot password for admin@aligaah.com" into a handed-over admin account.
  // Local testing reads the code from the server log instead, behind an opt-in
  // flag that has to be set deliberately and is never set on the server.
  if (!sent) {
    if (process.env.ALLOW_DEV_OTP === 'true') {
      console.log(`[aligaah][dev] reset code for ${user.email}: ${otp}`);
    } else {
      console.warn(`[aligaah] could not email a reset code to ${user.email} — check SMTP settings`);
    }
  }
  res.json(resp);
});

// @route POST /api/auth/verify-otp  { email, otp }
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  await consumeOtpCheck(res, email, otp);
  res.json({ ok: true });
});

// @route POST /api/auth/reset-password  { email, otp, password }
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!password || password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }
  const user = await consumeOtpCheck(res, email, otp);

  user.password = password;
  user.isGuest = false;
  clearOtp(user);
  await user.save();
  res.json({ ...publicUser(user), token: generateToken(user._id) });
});

module.exports = { register, login, adminLogin, getMe, forgotPassword, verifyOtp, resetPassword };
