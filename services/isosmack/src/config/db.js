import mongoose from 'mongoose';
import env from './env.js';
import { cacheBustingPlugin } from '../utils/responseCache.js';

mongoose.set('strictQuery', true);

// Applied to every schema, registered here because this module loads before any
// model is compiled. Cached endpoints can then hold data for a minute without
// going stale — an admin edit clears the affected entries immediately.
mongoose.plugin(cacheBustingPlugin, { ignoreFields: ['views', 'sold', 'ratingAvg', 'ratingCount'] });

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,

      // Index definitions live in the models, so let Mongoose reconcile them on
      // boot in production too. Creating an index that already exists is a
      // no-op; skipping it meant new indexes silently never got built.
      autoIndex: true,

      // The database is ~80ms away; opening a fresh TLS connection mid-request
      // costs far more than the query itself. Keep a warm pool so no request
      // ever pays that handshake.
      minPoolSize: 2,
      maxPoolSize: 50,
      maxIdleTimeMS: 0,

      // No waitQueueTimeoutMS on purpose. Capping how long a request may wait
      // for a pooled connection sounds like sensible fail-fast behaviour, but
      // the Atlas TLS handshake alone takes ~2.5s from here, so a 5s ceiling
      // made every service fail to boot. The driver's default is to wait.
    });
    console.log(`[db] MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  }
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

export default connectDB;
