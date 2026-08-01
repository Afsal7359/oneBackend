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
      minPoolSize: 2,
      maxPoolSize: 50,
      maxIdleTimeMS: 0,

      // No waitQueueTimeoutMS on purpose. Capping how long a request may wait
      // for a pooled connection sounds like sensible fail-fast behaviour, but
      // the Atlas TLS handshake alone takes ~2.5s from here, so a 5s ceiling
      // made every service fail to boot. The driver's default is to wait.
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
