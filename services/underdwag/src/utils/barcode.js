/**
 * EAN-13 barcode utilities.
 * ---------------------------------------------------------------------------
 * Codes are generated in the "200" prefix range. GS1 reserves prefixes
 * 200-299 (and 020-029) for *restricted circulation within a geographic
 * region* — i.e. barcodes a retailer prints for its own in-store use. Using
 * this range guarantees our codes can never collide with a real manufacturer's
 * GTIN, which is the correct, standards-compliant choice for own-brand stock.
 *
 * An EAN-13 is 13 digits: 12 data digits + 1 check digit.
 * Check digit = (10 - (sum mod 10)) mod 10, where sum weights the 12 data
 * digits alternately 1,3,1,3,... from the left.
 */

export const BARCODE_PREFIX = '200';

/** Compute the EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12) {
  const s = String(first12).replace(/\D/g, '');
  if (s.length !== 12) throw new Error('ean13CheckDigit expects exactly 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    // Position 1 (index 0) has weight 1, position 2 weight 3, alternating.
    sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** True if `code` is a structurally valid EAN-13 (13 digits + correct check digit). */
export function isValidEan13(code) {
  const s = String(code || '').replace(/\D/g, '');
  if (s.length !== 13) return false;
  return ean13CheckDigit(s.slice(0, 12)) === s[12];
}

/**
 * Build one candidate EAN-13: prefix + random filler + check digit.
 * Default prefix "200" leaves 9 random digits => 1e9 possible codes.
 */
export function generateEan13(prefix = BARCODE_PREFIX) {
  const p = String(prefix).replace(/\D/g, '');
  const fillLen = 12 - p.length;
  if (fillLen < 1) throw new Error('Barcode prefix too long');
  let body = p;
  for (let i = 0; i < fillLen; i++) body += Math.floor(Math.random() * 10);
  return body + ean13CheckDigit(body);
}

/**
 * Generate a barcode guaranteed not to already exist on `Model`.
 * Retries on collision; the unique index on the field is the final backstop
 * against a race between two concurrent creates.
 *
 * @param {import('mongoose').Model} Model  model to check against
 * @param {object} [opts]
 * @param {string} [opts.field='barcode']   field name holding the barcode
 * @param {string} [opts.prefix='200']      EAN-13 prefix to use
 * @param {number} [opts.attempts=12]       collision retries before giving up
 */
export async function generateUniqueBarcode(Model, opts = {}) {
  const { field = 'barcode', prefix = BARCODE_PREFIX, attempts = 12 } = opts;
  for (let i = 0; i < attempts; i++) {
    const code = generateEan13(prefix);
    const clash = await Model.exists({ [field]: code });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique barcode after several attempts');
}
