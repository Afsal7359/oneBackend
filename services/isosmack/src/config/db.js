import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: env.NODE_ENV !== 'production',
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
