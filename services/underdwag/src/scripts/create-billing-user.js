/**
 * Create (or reset) a billing app login from the command line.
 * Normally staff logins are managed in the website admin panel — this exists to
 * create the FIRST one, or to reset a forgotten password.
 *
 *   npm run billing:user -- --email staff@underdawg.com --password secret123 --name "Front Desk"
 *   npm run billing:user -- --email staff@underdawg.com --password newpass --role manager
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { BillingUser } from '../models/billing.js';

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const email = (arg('email') || '').toLowerCase().trim();
const password = arg('password');
const name = arg('name', 'Billing User');
const role = arg('role', 'cashier') === 'manager' ? 'manager' : 'cashier';

async function run() {
  if (!email || !password) {
    console.error('\nUsage: npm run billing:user -- --email <email> --password <password> [--name "Name"] [--role cashier|manager]\n');
    process.exitCode = 1;
    return;
  }
  if (String(password).length < 6) {
    console.error('\nPassword must be at least 6 characters.\n');
    process.exitCode = 1;
    return;
  }

  await connectDB();

  let user = await BillingUser.findOne({ email });
  if (user) {
    user.password = password;   // re-hashed by the pre-save hook
    user.name = name;
    user.role = role;
    user.isActive = true;
    await user.save();
    console.log(`\nUpdated existing billing user: ${email} (role: ${role})\n`);
  } else {
    user = await BillingUser.create({ name, email, password, role });
    console.log(`\nCreated billing user: ${email} (role: ${role})\n`);
  }
}

run()
  .catch((err) => {
    console.error('\nFailed:', err.message, '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
