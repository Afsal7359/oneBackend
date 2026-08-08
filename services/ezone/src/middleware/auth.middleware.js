import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import { verify } from '../config/jwt.js';

const bearer = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

// `verify` checks the signature *and* that the token carries iss/aud = ezone,
// so a session token from a sibling oneBackend service is rejected here rather
// than being looked up against this service's database.
const loadUser = async (token) => {
  const decoded = verify(token);
  if (!decoded?.id) return null;
  return User.findById(decoded.id).select('-password');
};

export const protect = asyncHandler(async (req, res, next) => {
  const token = bearer(req);
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  let user;
  try {
    user = await loadUser(token);
  } catch (err) {
    res.status(401);
    throw new Error('Not authorized, token invalid');
  }

  // One message for "bad token", "deleted account" and "deactivated account" —
  // the differences would otherwise confirm which ids and accounts exist.
  if (!user || !user.isActive) {
    res.status(401);
    throw new Error('Not authorized, token invalid');
  }

  req.user = user;
  next();
});

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403);
  throw new Error('Admin access required');
};

// Optional auth - attaches user if token present but doesn't fail
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      const user = await loadUser(token);
      if (user?.isActive) req.user = user;
    } catch (_) { /* ignore invalid token for optional auth */ }
  }
  next();
});
