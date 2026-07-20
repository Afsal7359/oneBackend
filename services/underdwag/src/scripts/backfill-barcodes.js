/**
 * Backfill EAN-13 barcodes onto every existing product that doesn't have one.
 *
 *   npm run barcodes:backfill          # assign codes to products missing one
 *   npm run barcodes:backfill -- --dry # report only, change nothing
 *   npm run barcodes:backfill -- --force-invalid  # also replace malformed codes
 *
 * Safe to run repeatedly: products that already hold a valid EAN-13 are left
 * untouched, so re-running only fills genuine gaps.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Product from '../models/Product.js';
import { generateEan13, isValidEan13 } from '../utils/barcode.js';

const DRY = process.argv.includes('--dry');
const FORCE_INVALID = process.argv.includes('--force-invalid');

async function run() {
  await connectDB();

  const products = await Product.find({}, { _id: 1, title: 1, barcode: 1 }).lean();
  console.log(`\nScanned ${products.length} product(s).`);

  // Pre-load every barcode already in use so generated codes can't collide,
  // without issuing a database round-trip per product.
  const taken = new Set(
    products.map((p) => p.barcode).filter(Boolean).map(String)
  );

  const needing = products.filter((p) => {
    if (!p.barcode) return true;
    if (!isValidEan13(p.barcode)) return FORCE_INVALID;
    return false;
  });

  const alreadyValid = products.filter((p) => p.barcode && isValidEan13(p.barcode)).length;
  const malformed = products.filter((p) => p.barcode && !isValidEan13(p.barcode)).length;

  console.log(`  already have a valid EAN-13 : ${alreadyValid}`);
  console.log(`  malformed / non-EAN codes   : ${malformed}${malformed && !FORCE_INVALID ? '  (kept — pass --force-invalid to replace)' : ''}`);
  console.log(`  need a barcode              : ${needing.length}\n`);

  if (!needing.length) {
    console.log('Nothing to do — every product already has a barcode.\n');
    return;
  }

  const ops = [];
  for (const p of needing) {
    let code = generateEan13();
    // Guard against both in-run duplicates and codes already in the DB.
    while (taken.has(code)) code = generateEan13();
    taken.add(code);
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { barcode: code } } } });
    console.log(`  ${code}  ${p.title}`);
  }

  if (DRY) {
    console.log(`\n[dry run] Would assign ${ops.length} barcode(s). No changes written.\n`);
    return;
  }

  const res = await Product.bulkWrite(ops, { ordered: false });
  console.log(`\nDone — assigned ${res.modifiedCount ?? ops.length} barcode(s).\n`);
}

run()
  .catch((err) => {
    console.error('\nBackfill failed:', err.message, '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
