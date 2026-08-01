#!/usr/bin/env node
/**
 * Razorpay credential check —  npm run check:razorpay
 *
 * Tells you WHICH half of the pair is wrong, which the checkout page can't:
 * Razorpay answers "Authentication failed" for a bad key id and a bad secret
 * alike, so a failing checkout never says whether to re-copy the id, the
 * secret, or both.
 *
 *   1. key id alone   -> /v1/preferences accepts a key id with no secret,
 *                        so a failure here means the ID doesn't exist.
 *   2. id + secret    -> creates and then voids nothing; it only opens an
 *                        order (harmless, unpaid orders expire on their own).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const id = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;
const webhook = process.env.RAZORPAY_WEBHOOK_SECRET;

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

(async () => {
  console.log('\nRazorpay credentials in services/aligaah/.env\n');

  if (!id || !secret) {
    console.log(red('✗ RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not both set.'));
    console.log(dim('  Online payment stays disabled until they are.\n'));
    process.exit(1);
  }

  // Whitespace is invisible in a terminal but fatal to HTTP basic auth.
  if (id !== id.trim() || secret !== secret.trim()) {
    console.log(red('✗ There is leading/trailing whitespace around a value. Remove it.'));
  }
  console.log(`  key id      ${id}   ${dim(`(${id.length} chars, ${id.startsWith('rzp_live_') ? 'LIVE' : 'test'} mode)`)}`);
  console.log(`  key secret  ${'•'.repeat(secret.length)}   ${dim(`(${secret.length} chars)`)}`);
  console.log(`  webhook     ${webhook ? green('set') : dim('not set — captured-but-browser-closed payments will not self-heal')}\n`);

  // --- 1. is the key id itself real? (no secret involved) ---
  const pref = await fetch(`https://api.razorpay.com/v1/preferences?key_id=${encodeURIComponent(id.trim())}`)
    .then((r) => r.status)
    .catch(() => 0);

  if (pref === 0) {
    console.log(red('✗ Could not reach api.razorpay.com — check this machine\'s connection.\n'));
    process.exit(1);
  }
  if (pref !== 200) {
    console.log(red('✗ KEY ID is not recognised by Razorpay.'));
    console.log('  The secret is not even the problem yet — fix the id first.');
    console.log(dim('  Dashboard > Account & Settings > API Keys > Regenerate, then COPY (never retype) the Key Id.\n'));
    process.exit(1);
  }
  console.log(green('✓ Key id is a real, active key.'));

  // --- 2. does the secret belong to that id? ---
  let Razorpay;
  try { Razorpay = require('razorpay'); } catch (_) {
    console.log(red('\n✗ The `razorpay` package is not installed here. Run: npm install\n'));
    process.exit(1);
  }

  try {
    const rzp = new Razorpay({ key_id: id.trim(), key_secret: secret.trim() });
    const order = await rzp.orders.create({ amount: 100, currency: 'INR', receipt: 'credcheck' });
    console.log(green('✓ Secret matches the key id — online payment will work.'));
    console.log(dim(`  (opened throwaway order ${order.id}; it is unpaid and simply expires)\n`));
  } catch (err) {
    const why = err?.error?.description || err?.message || 'unknown';
    console.log(red(`✗ SECRET does not belong to this key id — Razorpay said: ${why}`));
    console.log('  The id is valid, so re-copy the SECRET.');
    console.log(dim('  Razorpay shows a secret exactly once, when the key is generated. If that dialog'));
    console.log(dim('  was closed, the secret cannot be looked up again — regenerate and copy both together.\n'));
    process.exit(1);
  }
})();
