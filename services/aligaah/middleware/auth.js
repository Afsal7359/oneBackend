const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { verify } = require('../config/jwt');

// Pulls the bearer token out of the header. `startsWith('Bearer')` without the
// space used to match "Bearertoken" too; the split then produced undefined and
// the request fell through to a confusing 500 instead of a clean 401.
const bearer = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

// `verify` checks the signature *and* that the token was issued by aligaah, so
// a valid Crunz/ezone/underdwag session token is rejected here rather than
// being looked up (and coincidentally matching) in this service's database.
const loadUser = async (token) => {
  const decoded = verify(token);
  if (!decoded || !decoded.id) return null;
  return User.findById(decoded.id).select('-password');
};

const protect = asyncHandler(async (req, res, next) => {
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
    throw new Error('Not authorized, token failed');
  }

  if (!user) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }

  req.user = user;
  next();
});

// Attaches req.user when a valid token is present; never blocks the request.
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      req.user = (await loadUser(token)) || undefined;
    } catch (_) { /* ignore invalid token for optional auth */ }
  }
  next();
});

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403);
  throw new Error('Admin access only');
};

module.exports = { protect, optionalAuth, admin };
