import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import Setting from '../models/Setting.js';
import User from '../models/User.js';
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from '../utils/mailer.js';

async function firOrderEmails(order, userEmail, siteName) {
  await Promise.allSettled([
    sendOrderConfirmationEmail(userEmail, order, siteName),
    sendAdminNewOrderEmail(order, userEmail, siteName),
  ]);
}

async function getSiteName() {
  try {
    const s = await Setting.findOne({ key: 'main' });
    return s?.siteName || 'ezoneshoppi';
  } catch { return 'ezoneshoppi'; }
}

// Confirm Razorpay keys are present at startup
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn('[Razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set!');
}

const getRzp = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

/**
 * Recalculates prices from server-side product data (never trust client prices).
 */
const buildOrderTotals = async ({ items, couponCode }) => {
  const settings = (await Setting.findOne({ key: 'main' })) || (await Setting.create({ key: 'main' }));

  const dbItems = [];
  let itemsPrice = 0;

  for (const ci of items) {
    const p = await Product.findById(ci.product);
    if (!p || !p.isActive) throw new Error(`Product unavailable: ${ci.product}`);
    if (p.trackInventory && p.stock < ci.quantity) throw new Error(`Insufficient stock for ${p.name}`);
    const line = p.price * ci.quantity;
    itemsPrice += line;
    dbItems.push({
      product: p._id,
      name: p.name,
      slug: p.slug,
      image: p.images?.[0] || '',
      price: p.price,
      quantity: ci.quantity,
      variant: ci.variant || null,
    });
  }

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (!coupon) throw new Error('Invalid coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error('Coupon expired');
    if (coupon.startsAt && coupon.startsAt > new Date()) throw new Error('Coupon not yet active');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Coupon usage limit reached');
    if (coupon.minOrderAmount && itemsPrice < coupon.minOrderAmount)
      throw new Error(`Minimum order ${coupon.minOrderAmount} required`);
    discount =
      coupon.type === 'percent'
        ? Math.min((itemsPrice * coupon.value) / 100, coupon.maxDiscount || Infinity)
        : coupon.value;
    discount = Math.min(discount, itemsPrice);
  }

  const subtotalAfterDiscount = itemsPrice - discount;
  const taxEnabled = settings?.tax?.enabled ?? false;
  const taxPercent = settings?.tax?.percent ?? 0;
  const taxPrice = taxEnabled ? +(subtotalAfterDiscount * (taxPercent / 100)).toFixed(2) : 0;
  const freeThreshold = settings?.shipping?.freeShippingThreshold ?? 0;
  const flatRate = settings?.shipping?.flatRate ?? 0;
  const shippingPrice = subtotalAfterDiscount >= freeThreshold ? 0 : flatRate;
  const totalPrice = +(subtotalAfterDiscount + taxPrice + shippingPrice).toFixed(2);

  return { dbItems, itemsPrice, discount, taxPrice, shippingPrice, totalPrice, coupon };
};

// @route POST /api/orders
export const createOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, paymentMethod = 'razorpay', couponCode } = req.body;
  if (!items?.length) {
    res.status(400);
    throw new Error('No items');
  }
  if (!shippingAddress) {
    res.status(400);
    throw new Error('Shipping address required');
  }

  const totals = await buildOrderTotals({ items, couponCode });

  const order = await Order.create({
    user: req.user._id,
    items: totals.dbItems,
    shippingAddress,
    itemsPrice: totals.itemsPrice,
    discount: totals.discount,
    couponCode: totals.coupon?.code,
    taxPrice: totals.taxPrice,
    shippingPrice: totals.shippingPrice,
    totalPrice: totals.totalPrice,
    paymentMethod,
    status: 'pending',
    timeline: [{ status: 'pending', note: 'Order placed' }],
  });

  if (paymentMethod === 'razorpay') {
    const rzp = getRzp();
    const rzpOrder = await rzp.orders.create({
      amount: Math.round(totals.totalPrice * 100),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: String(order._id) },
    });
    order.paymentResult = { razorpay_order_id: rzpOrder.id };
    await order.save();
    return res.status(201).json({
      success: true,
      order,
      razorpay: { key: process.env.RAZORPAY_KEY_ID, ...rzpOrder },
    });
  }

  // COD - reserve stock
  for (const it of totals.dbItems) {
    await Product.findByIdAndUpdate(it.product, {
      $inc: { stock: -it.quantity, sold: it.quantity },
    });
  }
  if (totals.coupon) {
    totals.coupon.usedCount += 1;
    await totals.coupon.save();
  }
  order.status = 'processing';
  order.timeline.push({ status: 'processing', note: 'COD confirmed' });
  await order.save();
  getSiteName().then((sn) => firOrderEmails(order, req.user.email, sn));
  res.status(201).json({ success: true, order });
});

// @route POST /api/orders/verify-payment
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    res.status(400);
    throw new Error('Invalid signature');
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  order.paymentStatus = 'paid';
  order.paymentResult = {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    paidAt: new Date(),
  };
  order.status = 'processing';
  order.timeline.push({ status: 'processing', note: 'Payment verified' });
  await order.save();

  for (const it of order.items) {
    await Product.findByIdAndUpdate(it.product, {
      $inc: { stock: -it.quantity, sold: it.quantity },
    });
  }
  if (order.couponCode) {
    await Coupon.findOneAndUpdate({ code: order.couponCode }, { $inc: { usedCount: 1 } });
  }

  getSiteName().then((sn) => firOrderEmails(order, req.user.email, sn));
  res.json({ success: true, order });
});

// @route GET /api/orders/my
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, items: orders });
});

// @route GET /api/orders/:id
export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (req.user.role !== 'admin' && String(order.user._id) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Forbidden');
  }
  res.json({ success: true, order });
});

// @route PUT /api/orders/:id/status  (admin)
export const updateStatus = asyncHandler(async (req, res) => {
  const { status, note, trackingNumber } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (status) {
    order.status = status;
    order.timeline.push({ status, note: note || `Status changed to ${status}` });
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();
  }
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  await order.save();
  res.json({ success: true, order });
});

// @route POST /api/payments/webhook  (Razorpay webhook — no auth, raw body)
export const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping verification');
    } else {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = req.body; // Buffer when express.raw() is used
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
      if (expectedSig !== signature) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const payload = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;

    const event = payload.event;
    console.log('[Webhook] Event:', event);

    if (event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      if (!payment) return res.json({ ok: true });

      const rzpOrderId = payment.order_id;
      const order = await Order.findOne({ 'paymentResult.razorpay_order_id': rzpOrderId });
      if (!order) {
        console.warn('[Webhook] Order not found for razorpay_order_id:', rzpOrderId);
        return res.json({ ok: true }); // still 200 so Razorpay doesn't retry
      }

      if (order.paymentStatus === 'paid') return res.json({ ok: true }); // already handled

      order.paymentStatus = 'paid';
      order.paymentResult = {
        ...order.paymentResult,
        razorpay_payment_id: payment.id,
        paidAt: new Date(payment.created_at * 1000),
      };
      order.status = 'processing';
      order.timeline.push({ status: 'processing', note: 'Payment captured via webhook' });
      await order.save();

      // Deduct stock
      for (const it of order.items) {
        await Product.findByIdAndUpdate(it.product, {
          $inc: { stock: -it.quantity, sold: it.quantity },
        });
      }
      if (order.couponCode) {
        await Coupon.findOneAndUpdate({ code: order.couponCode }, { $inc: { usedCount: 1 } });
      }

      console.log('[Webhook] Order', order.orderNumber, 'marked paid');
      User.findById(order.user, 'email name').then((u) => {
        if (u) getSiteName().then((sn) => firOrderEmails(order, u.email, sn));
      });
    }

    if (event === 'payment.failed') {
      const payment = payload.payload?.payment?.entity;
      if (!payment) return res.json({ ok: true });
      const order = await Order.findOne({ 'paymentResult.razorpay_order_id': payment.order_id });
      if (order && order.paymentStatus === 'pending') {
        order.paymentStatus = 'failed';
        order.timeline.push({ status: 'pending', note: 'Payment failed via webhook' });
        await order.save();
        console.log('[Webhook] Order', order.orderNumber, 'payment failed');
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// @route GET /api/orders  (admin)
export const listAllOrders = asyncHandler(async (req, res) => {
  const { status, paymentStatus, q, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (q) filter.orderNumber = new RegExp(q, 'i');
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});
