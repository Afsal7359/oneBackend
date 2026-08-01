import mongoose from 'mongoose';
import { cacheBustingPlugin } from '../utils/responseCache.js';

// Applied to every schema, registered here because this module loads before any
// model is compiled. Cached endpoints can then hold data for a minute without
// going stale — an admin edit clears the affected entries immediately.
mongoose.plugin(cacheBustingPlugin, { ignoreFields: ['views', 'sold', 'numReviews', 'rating'] });

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI not set');
    const conn = await mongoose.connect(uri, {
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
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

export default connectDB;
