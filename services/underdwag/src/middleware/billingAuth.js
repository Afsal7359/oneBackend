import jwt from 'jsonwebtoken';
import { BillingUser } from '../models/billing.js';

/**
 * Billing-app JWT guard.
 * Tokens are stamped with `scope: 'billing'` so a website admin/customer token
 * can never be replayed against the billing API (and vice-versa), even though
 * both are signed with the same JWT_SECRET.
 */
export function signBillingToken(user) {
  return jwt.sign(
    { id: user._id.toString(), scope: 'billing', role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.BILLING_JWT_EXPIRES_IN || '30d' }
  );
}

export async function billingProtect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authorized — please sign in' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== 'billing') {
      return res.status(401).json({ error: 'Not a billing token' });
    }

    const user = await BillingUser.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if (!user.isActive) return res.status(403).json({ error: 'This account has been disabled' });

    req.billingUser = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}
