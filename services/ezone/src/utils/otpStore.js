// In-memory OTP store with auto-expiry (10 min)
// For production with multiple instances, replace with Redis.
const store = new Map(); // email → { otp, expiresAt, attempts }

const TTL   = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export function setOtp(email, otp) {
  store.set(email.toLowerCase(), {
    otp: String(otp),
    expiresAt: Date.now() + TTL,
    attempts: 0,
  });
}

// Returns true if valid, throws descriptive error otherwise
export function verifyOtp(email, code) {
  const key = email.toLowerCase();
  const entry = store.get(key);
  if (!entry) throw new Error('No OTP requested for this email');
  if (Date.now() > entry.expiresAt) { store.delete(key); throw new Error('OTP expired'); }
  if (entry.attempts >= MAX_ATTEMPTS) { store.delete(key); throw new Error('Too many attempts'); }
  entry.attempts += 1;
  if (entry.otp !== String(code).trim()) throw new Error('Invalid OTP');
  store.delete(key); // one-time use
  return true;
}

export function clearOtp(email) {
  store.delete(email.toLowerCase());
}
