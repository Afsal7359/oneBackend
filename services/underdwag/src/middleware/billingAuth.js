import { BillingUser } from '../models/billing.js';
import { sign, verify, SCOPES } from '../config/jwt.js';

/**
 * Billing-app JWT guard.
 * Tokens are stamped with `scope: 'billing'` so a website admin/customer token
 * can never be replayed against the billing API (and vice-versa), even though
 * both are signed with the same JWT_SECRET. Scoping is now enforced in
 * config/jwt.js for all three audiences rather than only this one, and the
 * iss/aud check there additionally blocks tokens from sibling services.
 */
export function signBillingToken(user) {
  return sign(
    { id: user._id.toString(), role: user.role },
    SCOPES.BILLING,
    { expiresIn: process.env.BILLING_JWT_EXPIRES_IN || '30d' }
  );
}

export async function billingProtect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'Not authorized — please sign in' });

    // Throws if the signature, issuer, audience or scope is wrong.
    const decoded = verify(token, SCOPES.BILLING);

    const user = await BillingUser.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if (!user.isActive) return res.status(403).json({ error: 'This account has been disabled' });

    req.billingUser = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}
