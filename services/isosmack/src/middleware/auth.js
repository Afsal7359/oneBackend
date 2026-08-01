import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { extractToken, verifyAccessToken } from '../utils/token.js';

/** Requires a valid session. Populates req.user. */
export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Please sign in to continue');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Your session expired, please sign in again' : 'Invalid session'
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  req.user = user;
  next();
});

/** Attaches req.user when a session exists, but never blocks the request. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive) req.user = user;
  } catch {
    /* anonymous request — ignore */
  }
  next();
});

/** Route guard: restrictTo('admin') */
export const restrictTo =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

export const adminOnly = [protect, restrictTo('admin')];
