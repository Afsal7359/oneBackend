/**
 * underdwag JWT configuration — the single place this service signs or verifies
 * a token.
 *
 * Two problems are addressed here.
 *
 * 1. Cross-service replay. Every oneBackend service minted the same `{ id }`
 *    token behind the same gateway, with nothing naming the site it belonged
 *    to; replay was blocked only by the JWT_SECRETs happening to differ.
 *    Tokens now carry iss/aud = underdwag and verification rejects anything
 *    else.
 *
 * 2. Cross-audience replay *inside* this service. underdwag issues three kinds
 *    of session — site admin, storefront customer, and billing PWA — all signed
 *    with one secret. Only billing was stamped with a `scope`, so an admin
 *    token satisfied `userAuth` (which trusted `decoded.id` without looking at
 *    what kind of subject it named). Every token now carries a scope and each
 *    guard demands its own.
 *
 * The algorithm is pinned; left open, `jwt.verify` honours whatever `alg` the
 * token's own header declares.
 */
import jwt from 'jsonwebtoken';

const ISSUER = 'underdwag';
const AUDIENCE = 'underdwag';
const ALGORITHM = 'HS256';

/** The three distinct kinds of session this service issues. */
export const SCOPES = Object.freeze({
  ADMIN: 'admin',
  USER: 'user',
  BILLING: 'billing',
});

// Placeholders committed to .env.example files in this repo — public strings.
const KNOWN_PLACEHOLDERS = [
  'change_this_to_a_long_random_string',
  'change_this_to_a_long_random_secret',
  'change_me_to_a_long_random_string',
  'change-this-to-a-long-random-string-in-production',
  'secret',
  'jwtsecret',
  'nv_secret',
];

function loadSecret() {
  const secret = process.env.JWT_SECRET;

  // This replaces `process.env.JWT_SECRET || 'nv_secret'` in authController.
  // That fallback meant a service whose .env failed to load kept happily
  // issuing and accepting tokens signed with a five-character string sitting
  // in the source — anyone could forge any session. Downtime is the safer
  // failure mode.
  if (!secret) {
    throw new Error('[underdwag] JWT_SECRET is not set. Refusing to start.');
  }
  if (secret.length < 32) {
    throw new Error(
      `[underdwag] JWT_SECRET is only ${secret.length} characters. Use at least 32 ` +
      '(generate one with: openssl rand -hex 32). Refusing to start.'
    );
  }
  if (KNOWN_PLACEHOLDERS.includes(secret.toLowerCase())) {
    throw new Error('[underdwag] JWT_SECRET is a known placeholder value. Refusing to start.');
  }
  return secret;
}

const SECRET = loadSecret();

/**
 * Signs a session token bound to this service and to one scope.
 * @param {object} payload  must not set `scope` itself
 * @param {string} scope    one of SCOPES
 */
export const sign = (payload, scope, options = {}) => {
  if (!Object.values(SCOPES).includes(scope)) {
    throw new Error(`[underdwag] refusing to sign a token with unknown scope "${scope}"`);
  }
  return jwt.sign({ ...payload, scope }, SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    ...options,
  });
};

/**
 * Verifies a token, confirms this service issued it, and confirms it was issued
 * for the scope the caller expects. Throws on anything else.
 */
export const verify = (token, expectedScope) => {
  const decoded = jwt.verify(token, SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!expectedScope || decoded.scope !== expectedScope) {
    throw new jwt.JsonWebTokenError(
      `token scope "${decoded.scope}" is not valid here (expected "${expectedScope}")`
    );
  }
  return decoded;
};

export default { sign, verify, SCOPES, ISSUER, AUDIENCE, ALGORITHM };
