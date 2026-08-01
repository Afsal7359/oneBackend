import { z } from 'zod';
import Order from '../models/Order.js';
import { Setting } from '../models/Content.js';
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  publicKey,
  razorpayEnabled,
} from '../services/razorpay.js';
import { commitStock } from '../services/pricing.js';
import { afterOrderConfirmed, shapeOrder } from './order.controller.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

export const getPaymentConfig = asyncHandler(async (_req, res) => {
  const settings = await Setting.getGlobal();
  return ok(res, {
    razorpayKey: publicKey(),
    simulated: !razorpayEnabled,
    codEnabled: settings.shipping.codEnabled,
    codMaxOrder: settings.shipping.codMaxOrder,
    currency: 'INR',
  });
});

/** Marks an order paid exactly once, wherever confirmation arrives from. */
async function markPaid(order, { paymentId, signature = '', simulated = false }) {
  if (order.payment.status === 'paid') return order; // idempotent

  order.payment.status = 'paid';
  order.payment.razorpayPaymentId = paymentId;
  order.payment.razorpaySignature = signature;
  order.payment.simulated = simulated;
  order.payment.paidAt = new Date();

  if (order.status === 'pending') {
    order.status = 'confirmed';
    order.pushTimeline('confirmed', simulated ? 'Payment confirmed (simulated gateway)' : 'Payment received', 'system');
  }

  await commitStock(order);
  await order.save();
  await afterOrderConfirmed(order, { _id: order.user });
  return order;
}

/**
 * Called by the browser after the Razorpay checkout handler fires.
 * The signature is the proof — an attacker cannot forge it without the secret.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const schema = z.object({
    orderId: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  });
  const data = schema.parse(req.body);

  const order = await Order.findOne({ _id: data.orderId, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');

  if (order.payment.razorpayOrderId !== data.razorpay_order_id) {
    throw ApiError.badRequest('This payment does not belong to that order');
  }

  const valid = verifyPaymentSignature({
    orderId: data.razorpay_order_id,
    paymentId: data.razorpay_payment_id,
    signature: data.razorpay_signature,
  });

  if (!valid) {
    order.payment.status = 'failed';
    order.payment.failureReason = 'Signature verification failed';
    order.pushTimeline('pending', 'Payment verification failed', 'system');
    await order.save();
    throw ApiError.badRequest('We could not verify that payment. If money was debited it will be refunded.');
  }

  await markPaid(order, { paymentId: data.razorpay_payment_id, signature: data.razorpay_signature });
  return ok(res, { order: shapeOrder(order), message: 'Payment confirmed' });
});

/**
 * Development-only completion path used when no Razorpay keys are configured,
 * so the whole checkout flow stays testable. Disabled the moment real keys exist.
 */
export const simulatePayment = asyncHandler(async (req, res) => {
  if (razorpayEnabled) {
    throw ApiError.forbidden('The simulated gateway is disabled because live Razorpay keys are configured');
  }
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.body);

  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.method !== 'razorpay') throw ApiError.badRequest('This order is not a prepaid order');

  await markPaid(order, { paymentId: `pay_sim_${Date.now()}`, simulated: true });
  return ok(res, { order: shapeOrder(order), message: 'Payment confirmed (simulated)' });
});

/** Marks a prepaid attempt as failed when the customer dismisses the modal. */
export const markPaymentFailed = asyncHandler(async (req, res) => {
  const { orderId, reason } = z
    .object({ orderId: z.string(), reason: z.string().max(300).optional() })
    .parse(req.body);

  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.status === 'paid') return ok(res, { order: shapeOrder(order) });

  order.payment.status = 'failed';
  order.payment.failureReason = reason || 'Payment was not completed';
  order.pushTimeline('pending', order.payment.failureReason, 'customer');
  await order.save();

  return ok(res, { order: shapeOrder(order) });
});

/**
 * Server-to-server confirmation. This is the source of truth in production:
 * it still confirms the order even if the customer closed the tab mid-redirect.
 * Mounted with express.raw so the signature is checked against the exact bytes.
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);

  if (!verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  const event = JSON.parse(raw);
  const entity = event?.payload?.payment?.entity;

  if (entity?.order_id) {
    const order = await Order.findOne({ 'payment.razorpayOrderId': entity.order_id });
    if (order) {
      if (event.event === 'payment.captured') {
        await markPaid(order, { paymentId: entity.id });
      } else if (event.event === 'payment.failed' && order.payment.status !== 'paid') {
        order.payment.status = 'failed';
        order.payment.failureReason = entity.error_description || 'Payment failed at gateway';
        await order.save();
      }
    }
  }

  // Always 200 quickly so Razorpay stops retrying.
  return res.json({ success: true });
});
