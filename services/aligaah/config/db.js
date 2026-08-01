const mongoose = require('mongoose');
const { cacheBustingPlugin } = require('../utils/responseCache');

// Applied to every schema, and registered here because this module is loaded
// before any model is compiled. It is what lets cached endpoints hold data for
// a full minute without ever going stale: an admin edit clears the affected
// entries immediately. View and sales tallies are excluded — they change on
// every page view and re-reading them is not why anyone reloads a page.
mongoose.plugin(cacheBustingPlugin, { ignoreFields: ['views', 'sales', 'sold', 'numReviews'] });

// Reads outnumber writes hugely here and none of them need a transaction, so we
// skip Mongoose's change-tracking overhead where we can and keep the connection
// pool warm — the database is ~80ms away, and opening a fresh TLS connection
// mid-request costs far more than the query itself.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,

      // Keep sockets open and authenticated so a burst of traffic never pays
      // the ~2.5s TLS + handshake cost on the request path.
      minPoolSize: 5,
      maxPoolSize: 50,
      maxIdleTimeMS: 0,

      // Fail a request quickly rather than queueing behind an exhausted pool.
      waitQueueTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
