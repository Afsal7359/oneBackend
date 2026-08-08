import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UAParser } from 'ua-parser-js';
import User from '../models/User.js';
import { sendOtp } from '../services/email.js';
import { sign, SCOPES } from '../config/jwt.js';

const JWT_EXPIRES = '30d';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// The secret used to be read here as `process.env.JWT_SECRET || 'nv_secret'`:
// if the .env failed to load, this service carried on issuing sessions signed
// with a string published in its own source. config/jwt.js refuses to start
// instead, and stamps scope=user so these tokens can't reach the admin or
// billing guards.
const makeToken = (id) => sign({ id: String(id) }, SCOPES.USER, { expiresIn: JWT_EXPIRES });

// A verified code hands out a 30-day session, so it is worth only a handful of
// guesses before it is burned and has to be re-requested — which is itself rate
// limited. Without a cap, six digits falls to a script in minutes.
const MAX_OTP_ATTEMPTS = 10;

// crypto.randomInt, not Math.random: these codes reset passwords, so they have
// to come from the CSPRNG rather than a PRNG seeded from process state.
const genOtp = () => String(crypto.randomInt(100000, 1000000));

// Constant-time compare so latency can't reveal how much of a guess was right.
const otpMatches = (stored, guess) => {
  const a = Buffer.from(String(stored || ''), 'utf8');
  const b = Buffer.from(String(guess || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const burnOtp = (user) => {
  user.otp = undefined;
  user.otpExpiry = undefined;
  user.otpAttempts = 0;
};

// ── Helper: capture device info from request ─────────────────────────────────
const extractDevice = (req) => {
  const parser = new UAParser(req.headers['user-agent'] || '');
  const ua = parser.getResult();
  return {
    browser: ua.browser?.name || '',
    os: ua.os?.name || '',
    device: ua.device?.type || 'desktop',
    ip: req.ip || req.socket?.remoteAddress || '',
    city: '',
    country: '',
    lastSeen: new Date(),
  };
};

// ── SIGNUP ───────────────────────────────────────────────────────────────────
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const existing = await User.findOne({ email });
    if (existing && existing.isVerified) return res.status(409).json({ message: 'Email already registered' });

    const otp = genOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    if (existing) {
      existing.name = name || existing.name;
      existing.password = password;
      existing.otp = otp;
      existing.otpExpiry = otpExpiry;
      existing.otpAttempts = 0;
      await existing.save();
    } else {
      await User.create({ name, email, password, otp, otpExpiry, otpAttempts: 0 });
    }

    await sendOtp(email, otp);
    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── VERIFY OTP ───────────────────────────────────────────────────────────────
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email }).select('+otp +otpExpiry +otpAttempts');

    // One vague message for every failure. "User not found" vs "Invalid OTP"
    // told a caller exactly which email addresses have accounts here.
    const invalid = () => res.status(400).json({ message: 'Invalid or expired code' });
    if (!user || !user.otp || !user.otpExpiry) return invalid();

    if (user.otpExpiry < new Date()) {
      burnOtp(user);
      await user.save();
      return res.status(400).json({ message: 'Code expired' });
    }
    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      burnOtp(user);
      await user.save();
      return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
    }
    if (!otpMatches(user.otp, otp)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return invalid();
    }

    user.isVerified = true;
    burnOtp(user);
    user.lastLoginAt = new Date();
    user.deviceInfo.push(extractDevice(req));
    await user.save();

    const token = makeToken(user._id);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (err) {
    console.error('verifyOtp error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── RESEND OTP ───────────────────────────────────────────────────────────────
export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Already verified' });

    const otp = genOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();
    await sendOtp(email, otp);
    res.json({ message: 'OTP resent' });
  } catch (err) {
    console.error('resendOtp error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── LOGIN ────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isVerified) return res.status(403).json({ message: 'Email not verified', needsVerification: true });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    user.lastLoginAt = new Date();
    user.deviceInfo.push(extractDevice(req));
    await user.save();

    const token = makeToken(user._id);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GOOGLE OAUTH ─────────────────────────────────────────────────────────────
export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'No credential' });

    const client = new OAuth2Client(CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    if (user) {
      if (!user.googleId) user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
    } else {
      user = new User({ googleId, email, name, avatar: picture, isVerified: true });
    }
    user.lastLoginAt = new Date();
    user.deviceInfo.push(extractDevice(req));
    await user.save();

    const token = makeToken(user._id);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (err) {
    console.error('googleAuth error', err);
    res.status(401).json({ message: 'Google authentication failed' });
  }
};

// ── GET ME ───────────────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── UPDATE PROFILE ───────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    await user.save();
    res.json({ user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── FORGOT PASSWORD — sends OTP to email ─────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    // Always the same answer. A 404 here confirmed which email addresses have
    // verified accounts, which is a ready-made target list for the login and
    // reset-code endpoints.
    const resp = { message: 'If that email has an account, a reset code has been sent.' };

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.json(resp);

    const otp = genOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    await sendOtp(email, otp, 'Reset your underdawg password');
    res.json(resp);
  } catch (err) {
    console.error('forgotPassword error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── RESET PASSWORD — verify OTP + set new password ───────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) return res.status(400).json({ message: 'Email, OTP, and new password required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.findOne({ email }).select('+otp +otpExpiry +otpAttempts');

    // Same vague failure as verify-otp, and the same attempt cap — this
    // endpoint sets a password, so it was the more valuable of the two to
    // brute-force and it had no counter at all.
    const invalid = () => res.status(400).json({ message: 'Invalid or expired code' });
    if (!user || !user.otp || !user.otpExpiry) return invalid();

    if (user.otpExpiry < new Date()) {
      burnOtp(user);
      await user.save();
      return res.status(400).json({ message: 'Code expired' });
    }
    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      burnOtp(user);
      await user.save();
      return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
    }
    if (!otpMatches(user.otp, otp)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return invalid();
    }

    user.password = password; // pre-save hook will hash it
    burnOtp(user);
    await user.save();

    const token = makeToken(user._id);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar }, message: 'Password updated' });
  } catch (err) {
    console.error('resetPassword error', err);
    res.status(500).json({ message: 'Server error' });
  }
};
