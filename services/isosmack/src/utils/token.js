import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, { expiresIn: env.ACCESS_TTL });

export const signRefreshToken = (user) =>
  jwt.sign({ sub: String(user._id), type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TTL_DAYS}d`,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_SECRET);
export const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

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
