import Admin from '../models/Admin.js';
import { verify, SCOPES } from '../config/jwt.js';

const bearer = (raw) => {
  const header = raw || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  return String(token).trim() || null;
};

// Site-admin guard. The token must be stamped scope=admin *and* still resolve
// to a live Admin document, so a deleted admin's 30-day token stops working the
// moment the record goes.
export async function protect(req, res, next) {
  try {
    const token = bearer(req.headers.authorization);
    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    const decoded = verify(token, SCOPES.ADMIN);
    const admin = await Admin.findById(decoded.id);
    // Same message either way — "Admin not found" confirmed which ids are real.
    if (!admin) return res.status(401).json({ message: 'Not authorized, token invalid' });

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Not authorized, token invalid' });
  }
}

// Storefront-customer guard.
//
// This used to accept any token this service could verify and trust
// `decoded.id` as a user id — so an admin token (same secret, no scope) sailed
// through it. Demanding scope=user is what keeps the two audiences apart.
export async function userAuth(req, res, next) {
  try {
    const token = bearer(req.headers['x-user-token'] || req.headers.authorization);
    if (!token) return res.status(401).json({ message: 'Not authorized' });

    req.userId = verify(token, SCOPES.USER).id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Not authorized, token invalid' });
  }
}

// Soft user auth — attaches userId if a valid user token is present, but does
// not block.
export function softUserAuth(req, _res, next) {
  try {
    const token = bearer(req.headers['x-user-token']);
    if (token) req.userId = verify(token, SCOPES.USER).id;
  } catch (_) { /* ignore */ }
  next();
}
