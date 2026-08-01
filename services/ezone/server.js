import 'dotenv/config';
// Import order matters: config/db.js registers the schema plugins that keep the
// response cache correct, and a plugin only applies to schemas created after it
// is registered. Loading app.js first would compile every model before that
// happens. (The cache also verifies this at runtime and disables itself rather
// than serve stale data, but the right order is what we actually want.)
import connectDB from './src/config/db.js';
import app from './src/app.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 ezoneshoppi API running on http://localhost:${PORT}  (${process.env.NODE_ENV})\n`);
  });
};

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
