import crypto from 'crypto';
import { z } from 'zod';
import User from '../models/User.js';
import Cart from '../models/Cart.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';
import env from '../config/env.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/token.js';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Please enter your password'),
});

async function issueSession(user, res, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokens = [
    ...(user.refreshTokens || []).slice(-4),
    { token: hashToken(refreshToken), createdAt: new Date(), ua: req.headers['user-agent'] || '' },
  ];
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, { accessToken, refreshToken });
  return { accessToken, refreshToken };
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({ name, email, phone: phone || '', password });
  const { accessToken } = await issueSession(user, res, req);

  return ok(res, { user: user.toSafeJSON(), accessToken }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Email or password is incorrect');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  const { accessToken } = await issueSession(user, res, req);
  return ok(res, { user: user.toSafeJSON(), accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  const rt = req.cookies?.iso_rt;
  if (rt) {
    const hashed = hashToken(rt);
    await User.updateOne({ 'refreshTokens.token': hashed }, { $pull: { refreshTokens: { token: hashed } } });
  }
  clearAuthCookies(res);
  return ok(res, { message: 'Signed out' });
});

export const refresh = asyncHandler(async (req, res) => {
  const rt = req.cookies?.iso_rt || req.body?.refreshToken;
  if (!rt) throw ApiError.unauthorized('No session to refresh');

  let payload;
  try {
    payload = verifyRefreshToken(rt);
  } catch {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Your session expired, please sign in again');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  const hashed = hashToken(rt);
  if (!user || !user.refreshTokens?.some((t) => t.token === hashed)) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session is no longer valid');
  }

  // rotate
  user.refreshTokens = user.refreshTokens.filter((t) => t.token !== hashed);
  const { accessToken } = await issueSession(user, res, req);
  return ok(res, { user: user.toSafeJSON(), accessToken });
});

export const me = asyncHandler(async (req, res) => ok(res, { user: req.user.toSafeJSON() }));

export const changePassword = asyncHandler(async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  });
  const { currentPassword, newPassword } = schema.parse(req.body);

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect');
  }
  user.password = newPassword;
  user.refreshTokens = [];
  await user.save();
  clearAuthCookies(res);
  return ok(res, { message: 'Password updated — please sign in again' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always answer the same way so the endpoint cannot be used to enumerate accounts.
  const generic = { message: 'If an account exists for that email, a reset link is on its way' };
  if (!user) return ok(res, generic);

  const raw = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = hashToken(raw);
  user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${raw}&email=${encodeURIComponent(email)}`;
  // No mail transport is wired up yet — surface the link in dev so the flow is testable.
  if (env.NODE_ENV !== 'production') {
    console.log('[auth] password reset link:', resetUrl);
    return ok(res, { ...generic, devResetUrl: resetUrl });
  }
  return ok(res, generic);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = z
    .object({ token: z.string().min(10), password: z.string().min(8, 'Password must be at least 8 characters') })
    .parse(req.body);

  const user = await User.findOne({
    resetPasswordToken: hashToken(token),
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.refreshTokens = [];
  await user.save();

  return ok(res, { message: 'Password reset — you can sign in now' });
});

/** Merges a guest (localStorage) cart into the user's server cart after sign-in. */
export const mergeCart = asyncHandler(async (req, res) => {
  const schema = z.object({
    items: z
      .array(z.object({ productId: z.string(), qty: z.number().int().min(1).max(10) }))
      .default([]),
  });
  const { items } = schema.parse(req.body);

  const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
  for (const incoming of items) {
    const existing = cart.items.find((i) => String(i.product) === String(incoming.productId));
    if (existing) existing.qty = Math.min(10, Math.max(existing.qty, incoming.qty));
    else cart.items.push({ product: incoming.productId, qty: incoming.qty });
  }
  await cart.save();
  return ok(res, { items: cart.items });
});
