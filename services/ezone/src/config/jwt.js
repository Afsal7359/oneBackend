/**
 * ezone JWT configuration — the single place this service signs or verifies
 * a token.
 *
 * Every oneBackend service used to mint the same `{ id }` token behind the same
 * gateway, with nothing in the payload naming the site it belonged to. Replay
 * across services was blocked only by the JWT_SECRETs happening to differ,
 * which is a configuration accident rather than a control. Tokens now carry
 * iss/aud = ezone and verification rejects anything else.
 *
 * The algorithm is pinned: an unpinned `jwt.verify` honours whatever `alg` the
 * token's own header asks for, which is the opening for confusion attacks.
 */
import jwt from 'jsonwebtoken';

const ISSUER = 'ezone';
const AUDIENCE = 'ezone';
const ALGORITHM = 'HS256';

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

  // Refuse to boot rather than fall back to a default — a service still serving
  // requests with a guessable signing key is worse than one that is down.
  if (!secret) {
    throw new Error('[ezone] JWT_SECRET is not set. Refusing to start.');
  }
  if (secret.length < 32) {
    throw new Error(
      `[ezone] JWT_SECRET is only ${secret.length} characters. Use at least 32 ` +
      '(generate one with: openssl rand -hex 32). Refusing to start.'
    );
  }
  if (KNOWN_PLACEHOLDERS.includes(secret.toLowerCase())) {
    throw new Error('[ezone] JWT_SECRET is a known placeholder value. Refusing to start.');
  }
  return secret;
}

const SECRET = loadSecret();

/** Signs a session token bound to this service. */
export const sign = (payload, options = {}) =>
  jwt.sign(payload, SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    ...options,
  });

/**
 * Verifies a token and confirms this service issued it. Throws on a bad
 * signature, expiry, or a token minted for another oneBackend service.
 */
export const verify = (token) =>
  jwt.verify(token, SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

export default { sign, verify, ISSUER, AUDIENCE, ALGORITHM };
