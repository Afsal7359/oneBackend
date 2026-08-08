/**
 * Crunz JWT configuration — the single place this service signs or verifies
 * a token.
 *
 * All five oneBackend services sit behind one gateway and one Atlas cluster,
 * and every one of them used to mint the same shape of token: `{ id }`, signed
 * with whatever `JWT_SECRET` happened to be in its own .env. Nothing in the
 * token said which site it belonged to, so cross-site replay was blocked only
 * by the secrets happening to differ. Tokens are now stamped `iss`/`aud` =
 * crunz and verification rejects anything else, so a Crunz session can never be
 * presented to Aligaah (or the reverse) regardless of how the secrets are set.
 *
 * The algorithm is pinned as well: an unpinned `jwt.verify` accepts whatever
 * `alg` the token's own header declares, which is the opening for HS/RS
 * confusion attacks.
 */
const jwt = require('jsonwebtoken');

const ISSUER = 'crunz';
const AUDIENCE = 'crunz';
const ALGORITHM = 'HS256';

// Placeholders committed to .env.example files in this repo — public strings,
// so they must never be capable of signing a real session.
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

  // Fail to boot rather than fall back to a default. A service that keeps
  // serving with a guessable signing key is worse than one that is down.
  if (!secret) {
    throw new Error('[crunz] JWT_SECRET is not set. Refusing to start.');
  }
  if (secret.length < 32) {
    throw new Error(
      `[crunz] JWT_SECRET is only ${secret.length} characters. Use at least 32 ` +
      '(generate one with: openssl rand -hex 32). Refusing to start.'
    );
  }
  if (KNOWN_PLACEHOLDERS.includes(secret.toLowerCase())) {
    throw new Error('[crunz] JWT_SECRET is a known placeholder value. Refusing to start.');
  }
  return secret;
}

const SECRET = loadSecret();

/** Signs a session token bound to this service. */
const sign = (payload, options = {}) =>
  jwt.sign(payload, SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: process.env.JWT_EXPIRE || '30d',
    ...options,
  });

/**
 * Verifies a token and confirms this service issued it. Throws on a bad
 * signature, expiry, or a token minted for another oneBackend service.
 */
const verify = (token) =>
  jwt.verify(token, SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

module.exports = { sign, verify, ISSUER, AUDIENCE, ALGORITHM };
