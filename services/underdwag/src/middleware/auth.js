import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import User from '../models/User.js';

export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(401).json({ message: 'Admin not found' });

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Not authorized, token invalid' });
  }
}

// User JWT middleware (optional — sets req.userId if valid token present)
export async function userAuth(req, res, next) {
  try {
    const header = req.headers['x-user-token'] || req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header || null;
    if (!token) return res.status(401).json({ message: 'Not authorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Not authorized, token invalid' });
  }
}

// Soft user auth — attaches userId if token present, but does not block
export function softUserAuth(req, _res, next) {
  try {
    const header = req.headers['x-user-token'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header || null;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.id;
    }
  } catch (_) { /* ignore */ }
  next();
}
