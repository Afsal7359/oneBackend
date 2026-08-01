import crypto from 'crypto';
import Razorpay from 'razorpay';
import env, { razorpayEnabled } from '../config/env.js';
import ApiError from '../utils/ApiError.js';

let client = null;
if (razorpayEnabled) {
  client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  console.log('[razorpay] live gateway enabled');
} else {
  console.warn(
    '[razorpay] RAZORPAY_KEY_ID / SECRET not set — running the SIMULATED gateway.\n' +
      '           Checkout works end-to-end for testing but no real money moves.\n' +
      '           Add real keys to .env to switch over; no code changes needed.'
  );
}

export { razorpayEnabled };

export const publicKey = () => (razorpayEnabled ? env.RAZORPAY_KEY_ID : '');

/**
 * Creates a gateway order. Amount must be in the smallest currency unit (paise).
 */
export async function createGatewayOrder({ amountPaise, receipt, notes = {} }) {
  if (amountPaise < 100) throw ApiError.badRequest('Order amount must be at least ₹1');

  if (!razorpayEnabled) {
    return {
      id: `order_sim_${crypto.randomBytes(10).toString('hex')}`,
      amount: amountPaise,
      currency: env.CURRENCY,
      receipt,
      notes,
      simulated: true,
    };
  }

  try {
    const order = await client.orders.create({
      amount: amountPaise,
      currency: env.CURRENCY,
      receipt,
      notes,
      payment_capture: 1,
    });
    return { ...order, simulated: false };
  } catch (err) {
    const msg = err?.error?.description || err.message || 'Gateway rejected the order';
    throw new ApiError(502, `Razorpay: ${msg}`);
  }
}

/** Verifies the checkout handler signature: HMAC_SHA256(order_id|payment_id, secret). */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!razorpayEnabled) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** Verifies an inbound webhook body against the webhook secret. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

export async function fetchPayment(paymentId) {
  if (!razorpayEnabled) return null;
  return client.payments.fetch(paymentId);
}

export async function refundPayment(paymentId, amountPaise, notes = {}) {
  if (!razorpayEnabled) {
    return { id: `rfnd_sim_${crypto.randomBytes(8).toString('hex')}`, amount: amountPaise, simulated: true };
  }
  try {
    return await client.payments.refund(paymentId, { amount: amountPaise, notes, speed: 'normal' });
  } catch (err) {
    const msg = err?.error?.description || err.message || 'Refund failed';
    throw new ApiError(502, `Razorpay refund: ${msg}`);
  }
}
