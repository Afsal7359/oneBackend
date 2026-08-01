const mongoose = require('mongoose');
const { cacheBustingPlugin } = require('../utils/responseCache');

// Applied to every schema, registered here because this module loads before any
// model is compiled. Cached endpoints can then hold data for a minute without
// going stale — an admin edit clears the affected entries immediately.
mongoose.plugin(cacheBustingPlugin, { ignoreFields: ['views', 'sales', 'sold'] });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,

      // The database is ~80ms away; opening a fresh TLS connection mid-request
      // costs far more than the query itself. Keep a warm pool so no request
      // ever pays that handshake.
      minPoolSize: 5,
      maxPoolSize: 50,
      maxIdleTimeMS: 0,
      waitQueueTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
