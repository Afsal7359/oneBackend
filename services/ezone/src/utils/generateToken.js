import { sign } from '../config/jwt.js';

// Only the user id travels in the token. Role is read from the database on
// every request, so revoking an admin takes effect immediately instead of
// whenever their 30-day token happens to expire.
export const generateToken = (id) => sign({ id: String(id) });
