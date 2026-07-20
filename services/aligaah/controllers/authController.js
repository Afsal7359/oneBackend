const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { generateToken } = require('../utils/token');
const { sendMail, otpEmail } = require('../utils/email');

const publicUser = (u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone });
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digits

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
  await user.save();

  const mail = otpEmail(otp, user.name);
  const { sent } = await sendMail({ to: user.email, ...mail });
  // In dev (no SMTP configured), surface the OTP so the flow is testable.
  if (!sent && process.env.NODE_ENV !== 'production') resp.devOtp = otp;
  res.json(resp);
});

// @route POST /api/auth/verify-otp  { email, otp }
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+resetOtp +resetOtpExpires');
  if (!user || !user.resetOtp || !user.resetOtpExpires) { res.status(400); throw new Error('No reset request found'); }
  if (user.resetOtpExpires < new Date()) { res.status(400); throw new Error('Code expired — please request a new one'); }
  if (user.resetOtp !== hashOtp(otp)) { res.status(400); throw new Error('Invalid code'); }
  res.json({ ok: true });
});

// @route POST /api/auth/reset-password  { email, otp, password }
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!password || password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }
  const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+resetOtp +resetOtpExpires +password');
  if (!user || !user.resetOtp || !user.resetOtpExpires) { res.status(400); throw new Error('No reset request found'); }
  if (user.resetOtpExpires < new Date()) { res.status(400); throw new Error('Code expired — please request a new one'); }
  if (user.resetOtp !== hashOtp(otp)) { res.status(400); throw new Error('Invalid code'); }

  user.password = password;
  user.isGuest = false;
  user.resetOtp = undefined;
  user.resetOtpExpires = undefined;
  await user.save();
  res.json({ ...publicUser(user), token: generateToken(user._id) });
});

module.exports = { register, login, adminLogin, getMe, forgotPassword, verifyOtp, resetPassword };
