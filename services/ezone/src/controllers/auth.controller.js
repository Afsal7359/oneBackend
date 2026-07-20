import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { sendOtpEmail, sendForgotPasswordOtp } from '../utils/mailer.js';
import { setOtp, verifyOtp } from '../utils/otpStore.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ── helpers ─────────────────────────────────────────────────────── */
const sanitize = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  avatar: u.avatar,
  role: u.role,
  addresses: u.addresses,
  wishlist: u.wishlist,
  isGoogleUser: !!u.googleId,
});

function generateOtp() {
  return String(Math.floor(100000 + crypto.randomInt(900000)));
}

/* ── legacy register (kept for compatibility) ────────────────────── */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) { res.status(400); throw new Error('Name, email and password are required'); }
  const exists = await User.findOne({ email });
  if (exists) { res.status(400); throw new Error('Email already registered'); }
  const user = await User.create({ name, email, password, phone });
  res.status(201).json({ success: true, user: sanitize(user), token: generateToken(user._id) });
});

/* ── legacy login (kept for compatibility) ───────────────────────── */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) { res.status(401); throw new Error('Invalid credentials'); }
  if (!user.isActive) { res.status(403); throw new Error('Account deactivated'); }
  user.lastLogin = new Date();
  await user.save();
  res.json({ success: true, user: sanitize(user), token: generateToken(user._id) });
});

/* ── @route POST /api/auth/send-otp ─────────────────────────────── */
// Sends a 6-digit OTP to the given email via SMTP
export const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) { res.status(400); throw new Error('Email is required'); }

  const otp = generateOtp();
  setOtp(email, otp);

  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.error('[sendOtp] SMTP error:', err.message);
    res.status(500);
    throw new Error('Failed to send OTP email. Check SMTP settings.');
  }

  res.json({ success: true, message: 'OTP sent' });
});

/* ── @route POST /api/auth/verify-otp ───────────────────────────── */
// Verifies OTP, finds-or-creates user, returns JWT
export const verifyOtpLogin = asyncHandler(async (req, res) => {
  const { email, otp, name } = req.body;
  if (!email || !otp) { res.status(400); throw new Error('Email and OTP are required'); }

  try {
    verifyOtp(email, otp);
  } catch (err) {
    res.status(400);
    throw new Error(err.message);
  }

  let user = await User.findOne({ email });
  if (!user) {
    // New user — create account (name required for signup)
    if (!name) { res.status(400); throw new Error('Name is required for new accounts'); }
    user = await User.create({
      name,
      email,
      password: crypto.randomBytes(32).toString('hex'), // unusable random password
    });
  }

  if (!user.isActive) { res.status(403); throw new Error('Account deactivated'); }
  user.lastLogin = new Date();
  await user.save();

  res.json({
    success: true,
    isNewUser: !user.createdAt || (Date.now() - user.createdAt.getTime() < 5000),
    user: sanitize(user),
    token: generateToken(user._id),
  });
});

/* ── @route POST /api/auth/google ───────────────────────────────── */
// Accepts a Google access_token from the frontend (implicit / token flow),
// fetches user info from Google, finds-or-creates DB user, returns JWT
export const googleAuth = asyncHandler(async (req, res) => {
  // Accept either access_token (implicit flow) or idToken (one-tap)
  const { idToken, access_token } = req.body;

  let googleId, email, name, picture;

  if (idToken) {
    // Verify Google ID token
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('[googleAuth] ID token verify error:', err.message);
      res.status(401);
      throw new Error('Invalid Google token');
    }
    googleId = payload.sub;
    email    = payload.email;
    name     = payload.name;
    picture  = payload.picture;
  } else if (access_token) {
    // Verify access token via Google userinfo
    try {
      const r = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!r.ok) throw new Error('Failed to fetch Google user info');
      const json = await r.json();
      googleId = json.sub;
      email    = json.email;
      name     = json.name;
      picture  = json.picture;
    } catch (err) {
      console.error('[googleAuth] Access token verify error:', err.message);
      res.status(401);
      throw new Error('Invalid Google access token');
    }
  } else {
    res.status(400);
    throw new Error('Google token is required');
  }

  if (!email) { res.status(400); throw new Error('No email in Google account'); }

  if (!email) { res.status(400); throw new Error('No email in Google account'); }

  // Find by googleId or email (link existing accounts)
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    user = await User.create({
      googleId,
      name: name || email.split('@')[0],
      email,
      avatar: picture || '',
      password: crypto.randomBytes(32).toString('hex'),
    });
  } else {
    let changed = false;
    if (!user.googleId) { user.googleId = googleId; changed = true; }
    if (!user.avatar && picture) { user.avatar = picture; changed = true; }
    user.lastLogin = new Date();
    if (changed || true) await user.save();
  }

  if (!user.isActive) { res.status(403); throw new Error('Account deactivated'); }

  res.json({ success: true, user: sanitize(user), token: generateToken(user._id) });
});

/* ── @route GET /api/auth/me ────────────────────────────────────── */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('wishlist');
  res.json({ success: true, user: sanitize(user) });
});

/* ── @route PUT /api/auth/profile ───────────────────────────────── */
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) { res.status(404); throw new Error('User not found'); }
  const { name, phone, avatar, password } = req.body;
  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (avatar !== undefined) user.avatar = avatar;
  if (password) user.password = password;
  await user.save();
  res.json({ success: true, user: sanitize(user) });
});

/* ── Addresses ───────────────────────────────────────────────────── */
export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (req.body.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push(req.body);
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const addr = user.addresses.id(req.params.id);
  if (!addr) { res.status(404); throw new Error('Address not found'); }
  if (req.body.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  Object.assign(addr, req.body);
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.addresses.pull({ _id: req.params.id });
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});

/* ── @route POST /api/auth/forgot-password ──────────────────────── */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) { res.status(400); throw new Error('Email is required'); }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) { res.status(404); throw new Error('No account found with this email'); }

  const otp = generateOtp();
  setOtp('fp_' + email.toLowerCase(), otp);

  try {
    await sendForgotPasswordOtp(email, otp);
  } catch (err) {
    console.error('[forgotPassword] SMTP error:', err.message);
    res.status(500);
    throw new Error('Failed to send OTP. Check SMTP settings.');
  }

  res.json({ success: true, message: 'OTP sent to your email' });
});

/* ── @route POST /api/auth/reset-password ───────────────────────── */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) { res.status(400); throw new Error('Email, OTP and new password are required'); }
  if (password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }

  try {
    verifyOtp('fp_' + email.toLowerCase(), otp);
  } catch (err) {
    res.status(400);
    throw new Error(err.message);
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) { res.status(404); throw new Error('User not found'); }

  user.password = password;
  await user.save();

  res.json({ success: true, message: 'Password reset successfully', token: generateToken(user._id), user: sanitize(user) });
});

/* ── Wishlist ────────────────────────────────────────────────────── */
export const toggleWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const id   = req.params.productId;
  const i    = user.wishlist.findIndex((p) => p.toString() === id);
  if (i > -1) user.wishlist.splice(i, 1);
  else user.wishlist.push(id);
  await user.save();
  res.json({ success: true, wishlist: user.wishlist });
});
