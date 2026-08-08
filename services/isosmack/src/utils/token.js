import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';

// All five oneBackend services sit behind one gateway and used to mint
// interchangeable-looking tokens with nothing naming the site they belong to —
// cross-service replay was blocked only by the JWT_SECRETs happening to differ.
// Tokens now carry iss/aud = isosmack and verification rejects anything else.
// The algorithm is pinned as well: left open, `jwt.verify` honours whatever
// `alg` the token's own header declares.
const ISSUER = 'isosmack';
const AUDIENCE = 'isosmack';
const ALGORITHM = 'HS256';

const signOpts = (expiresIn) => ({
  algorithm: ALGORITHM,
  issuer: ISSUER,
  audience: AUDIENCE,
  expiresIn,
});

const verifyOpts = { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE };

export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, signOpts(env.ACCESS_TTL));

export const signRefreshToken = (user) =>
  jwt.sign(
    { sub: String(user._id), type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    signOpts(`${env.REFRESH_TTL_DAYS}d`)
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_SECRET, verifyOpts);

// Refresh tokens are additionally required to say so. They are signed with a
// different key, but checking `type` keeps the two apart even if the keys are
// ever unified by mistake.
export const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, verifyOpts);
  if (decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('not a refresh token');
  }
  return decoded;
};

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const baseCookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
  domain: env.COOKIE_DOMAIN,
  path: '/',
};

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('iso_at', accessToken, { ...baseCookie, maxAge: 1000 * 60 * 60 });
  res.cookie('iso_rt', refreshToken, {
    ...baseCookie,
    maxAge: 1000 * 60 * 60 * 24 * env.REFRESH_TTL_DAYS,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie('iso_at', baseCookie);
  res.clearCookie('iso_rt', baseCookie);
}

/** Reads a bearer token from the Authorization header, falling back to the cookie. */
export function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.iso_at || null;
}
