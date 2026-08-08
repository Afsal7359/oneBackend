const { sign } = require('../config/jwt');

// Only the user id travels in the token. Role is deliberately left out and read
// from the database on every request, so demoting an admin takes effect at once
// instead of when their 30-day token happens to expire.
const generateToken = (id) => sign({ id: String(id) });

module.exports = { generateToken };
