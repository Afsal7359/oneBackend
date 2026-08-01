import mongoose from 'mongoose';
import { cacheBustingPlugin } from '../utils/responseCache.js';

// Applied to every schema, registered here because this module loads before any
// model is compiled. Cached endpoints can then hold data for a minute without
// going stale — an admin edit clears the affected entries immediately.
mongoose.plugin(cacheBustingPlugin, { ignoreFields: ['views', 'sold', 'numReviews', 'rating'] });

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,

    // The database is ~80ms away; opening a fresh TLS connection mid-request
    // costs far more than the query itself. Keep a warm pool so no request ever
    // pays that handshake.
    minPoolSize: 2,
    maxPoolSize: 50,
    maxIdleTimeMS: 0,

    // No waitQueueTimeoutMS on purpose. Capping how long a request may wait
    // for a pooled connection sounds like sensible fail-fast behaviour, but
    // the Atlas TLS handshake alone takes ~2.5s from here, so a 5s ceiling
    // made every service fail to boot. The driver's default is to wait.
  });
  console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);
}
