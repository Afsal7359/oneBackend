const User = require('../models/User');
const { verify } = require('../config/jwt');

// `verify` checks the signature *and* that the token carries iss/aud = crunz,
// so a session token from any sibling oneBackend service is rejected here
// rather than being looked up against this service's database.
module.exports = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const token = header.slice(7).trim();
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = verify(token);
    if (!decoded?.id) return res.status(401).json({ message: 'Invalid or expired token' });

    const user = await User.findById(decoded.id).select('-otp -otpExpiry');
    // Same message whether the signature failed or the account is gone —
    // otherwise the difference tells a caller which user ids are real.
    if (!user) return res.status(401).json({ message: 'Invalid or expired token' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
