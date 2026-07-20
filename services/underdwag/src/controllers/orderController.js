import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import { sendOrderConfirmation, sendAdminOrderNotification } from '../services/email.js';

export const createOrder = asyncHandler(async (req, res) => {
  const {
    items, shippingAddress,
    paymentMethod = 'cod', notes = '',
    couponCode, paymentIntentId,
  } = req.body;

  // Require authentication — pull email from DB, not from request body
  if (!req.userId) {
    res.status(401); throw new Error('You must be logged in to place an order');
  }
  const userDoc = await User.findById(req.userId);
  if (!userDoc) { res.status(401); throw new Error('User not found'); }
  const email = userDoc.email;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400); throw new Error('Order must contain at least one item');
  }

  // Rebuild items server-side from DB to prevent price tampering
  const enriched = [];
  let subtotal = 0;
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) { res.status(400); throw new Error(`Product not found: ${it.product}`); }
    const qty = Math.max(1, Number(it.quantity) || 1);
    subtotal += product.price * qty;
    enriched.push({
      product: product._id,
      title: product.title,
      image: product.images?.[0] || '',
      price: product.price,
      quantity: qty,
      size: it.size || '',
    });
  }

  const shippingFee = subtotal >= 2500 ? 0 : 99;

  // ── Coupon validation ────────────────────────────────────────────────────
  let couponDoc = null;
  let couponDiscount = 0;
  let validCouponCode = '';
  if (couponCode) {
    couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase() });
    if (couponDoc) {
      const identifier = req.userId || email;
      const { ok } = couponDoc.isValid(subtotal, identifier);
      if (ok) {
        couponDiscount = couponDoc.calculateDiscount(subtotal);
        validCouponCode = couponDoc.code;
      }
    }
  }

  const total = Math.max(0, subtotal + shippingFee - couponDiscount);

  const order = await Order.create({
    user: req.userId || null,
    email,
    items: enriched,
    shippingAddress,
    subtotal,
    shippingFee,
    couponCode: validCouponCode,
    couponDiscount,
    total,
    paymentMethod,
    paymentIntentId: paymentIntentId || '',
    paymentStatus: paymentIntentId ? 'paid' : 'pending',
    notes,
    trackingEvents: [{ status: 'pending', message: 'Order placed', timestamp: new Date() }],
  });

  // Record coupon usage
  if (couponDoc && validCouponCode) {
    couponDoc.usedCount += 1;
    couponDoc.usedBy.push({ user: req.userId || null, email, order: order._id });
    await couponDoc.save();
  }

  // Respond immediately, then fire emails asynchronously
  res.status(201).json(order);

  Promise.all([
    sendOrderConfirmation(order).catch((e) => console.error('order confirm email failed', e)),
    sendAdminOrderNotification(order).catch((e) => console.error('admin notify email failed', e)),
  ]);
});

export const listOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'name email').sort('-createdAt').skip(skip).limit(Number(limit)),
    Order.countDocuments(filter),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email deviceInfo');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  res.json(order);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, paymentStatus, trackingMessage, trackingLocation } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) { res.status(404); throw new Error('Order not found'); }

  if (status && status !== order.status) {
    order.status = status;
    order.trackingEvents.push({
      status,
      message: trackingMessage || `Order ${status}`,
      location: trackingLocation || '',
      timestamp: new Date(),
    });
  }
  if (paymentStatus) order.paymentStatus = paymentStatus;
  await order.save();
  res.json(order);
});

// User's own orders
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.userId }).sort('-createdAt').select('-trackingEvents');
  res.json(orders);
});

export const myOrderDetail = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.userId });
  if (!order) { res.status(404); throw new Error('Order not found'); }
  res.json(order);
});
