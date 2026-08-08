/**
 * Aligaah JWT configuration — the single place this service signs or verifies
 * a token.
 *
 * Every oneBackend service sits behind the same gateway and the same Atlas
 * cluster, so "which site is this token for?" has to be answered by the token
 * itself. Until now nothing in the payload said `aligaah`: a token was just
 * `{ id }`, and the only thing stopping a Crunz token from opening an Aligaah
 * session was that the two services happened to hold different JWT_SECRETs and
 * happened to point at different databases. Both of those are accidents of
 * configuration — one copied .env on the server and cross-site access becomes
 * real. So the tokens are now bound to this service with `iss`/`aud`, and
 * verification rejects anything that isn't stamped `aligaah`.
 *
 * The algorithm is pinned too. Left open, `jwt.verify` will honour whatever
 * `alg` the *attacker's* header asks for, which is how HS/RS confusion attacks
 * get their foothold.
 */
const jwt = require('jsonwebtoken');

const ISSUER = 'aligaah';
const AUDIENCE = 'aligaah';
const ALGORITHM = 'HS256';

// Placeholders that have been committed to .env.example files in this repo, so
// they are public knowledge and must never be able to sign a real session.
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

  // Refuse to boot rather than fall back to a default. A hardcoded fallback
  // means a service whose .env failed to load keeps answering requests while
  // signing tokens anyone can forge — an outage would be the safer failure.
  if (!secret) {
    throw new Error('[aligaah] JWT_SECRET is not set. Refusing to start.');
  }
  if (secret.length < 32) {
    throw new Error(
      `[aligaah] JWT_SECRET is only ${secret.length} characters. Use at least 32 ` +
      '(generate one with: openssl rand -hex 32). Refusing to start.'
    );
  }
  if (KNOWN_PLACEHOLDERS.includes(secret.toLowerCase())) {
    throw new Error('[aligaah] JWT_SECRET is a known placeholder value. Refusing to start.');
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
 * Verifies a token and confirms it was issued by *this* service.
 * Throws (as jsonwebtoken does) on a bad signature, expiry, or a token minted
 * for Crunz / ezone / underdwag / isosmack.
 */
const verify = (token) =>
  jwt.verify(token, SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

module.exports = { sign, verify, ISSUER, AUDIENCE, ALGORITHM };
