import { z } from 'zod';
import mongoose from 'mongoose';
import Order, { ORDER_STATUSES } from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import Coupon from '../models/Coupon.js';
import { Contact, Subscriber } from '../models/Content.js';
import { releaseStock } from '../services/pricing.js';
import { refundPayment } from '../services/razorpay.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';
import { shapeOrder } from './order.controller.js';

const PAID = { 'payment.status': 'paid' };
const REVENUE_STATUSES = { status: { $nin: ['cancelled', 'returned'] } };

/* ------------------------------------------------------------------ dashboard */

export const getDashboard = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7 = new Date(startOfToday.getTime() - 6 * 864e5);
  const last30 = new Date(startOfToday.getTime() - 29 * 864e5);

  const sumRevenue = async (match) => {
    const [row] = await Order.aggregate([
      { $match: { ...PAID, ...REVENUE_STATUSES, ...match } },
      { $group: { _id: null, total: { $sum: '$pricing.grandTotal' }, count: { $sum: 1 } } },
    ]);
    return { total: row?.total || 0, count: row?.count || 0 };
  };

  const [allTime, today, week, month, orderCount, customerCount, productCount, pendingCount] =
    await Promise.all([
      sumRevenue({}),
      sumRevenue({ createdAt: { $gte: startOfToday } }),
      sumRevenue({ createdAt: { $gte: last7 } }),
      sumRevenue({ createdAt: { $gte: last30 } }),
      Order.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'processing'] } }),
    ]);

  const [salesSeries, statusBreakdown, topProducts, lowStock, recentOrders] = await Promise.all([
    Order.aggregate([
      { $match: { ...PAID, ...REVENUE_STATUSES, createdAt: { $gte: last30 } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$pricing.grandTotal' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...PAID, ...REVENUE_STATUSES } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          image: { $first: '$items.image' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]),
    Product.find({ isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
      .select('name slug stock lowStockThreshold images')
      .limit(8)
      .lean(),
    Order.find().sort({ createdAt: -1 }).limit(8).populate('user', 'name email').lean(),
  ]);

  // Fill gaps so the chart has one point per day.
  const series = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(last30.getTime() + i * 864e5);
    const key = d.toISOString().slice(0, 10);
    const hit = salesSeries.find((s) => s._id === key);
    series.push({ date: key, revenue: hit?.revenue || 0, orders: hit?.orders || 0 });
  }

  return ok(res, {
    stats: {
      revenue: { allTime: allTime.total, today: today.total, week: week.total, month: month.total },
      orders: { total: orderCount, paid: allTime.count, today: today.count, pending: pendingCount },
      customers: customerCount,
      products: productCount,
      avgOrderValue: allTime.count ? Math.round(allTime.total / allTime.count) : 0,
    },
    series,
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
    topProducts,
    lowStock,
    recentOrders: recentOrders.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      customer: o.user?.name || o.email,
      total: o.pricing.grandTotal,
      status: o.status,
      paymentStatus: o.payment.status,
      createdAt: o.createdAt,
    })),
  });
});

/* --------------------------------------------------------------------- orders */

export const listOrders = asyncHandler(async (req, res) => {
  const q = z
    .object({
      status: z.enum([...ORDER_STATUSES, 'all']).optional(),
      paymentStatus: z.string().optional(),
      search: z.string().trim().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);

  const filter = {};
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.paymentStatus && q.paymentStatus !== 'all') filter['payment.status'] = q.paymentStatus;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(`${q.to}T23:59:59.999Z`);
  }
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderNumber: rx }, { email: rx }, { phone: rx }, { 'shippingAddress.fullName': rx }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
  ]);

  return ok(res, {
    orders: orders.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      customer: o.user?.name || o.shippingAddress?.fullName || o.email,
      email: o.email,
      phone: o.phone,
      itemCount: o.items.reduce((s, i) => s + i.qty, 0),
      total: o.pricing.grandTotal,
      couponCode: o.pricing.couponCode,
      status: o.status,
      paymentMethod: o.payment.method,
      paymentStatus: o.payment.status,
      createdAt: o.createdAt,
    })),
    total,
    page: q.page,
    pages: Math.ceil(total / q.limit),
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone createdAt');
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, { order: { ...shapeOrder(order), user: order.user, adminNote: order.adminNote } });
});

const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = z
    .object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(300).optional() })
    .parse(req.body);

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  if (order.status === status) throw ApiError.badRequest(`This order is already ${status}`);
  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    throw ApiError.badRequest(
      `An order that is ${order.status} cannot move to ${status}. Allowed: ${
        ALLOWED_TRANSITIONS[order.status].join(', ') || 'none — this status is final'
      }`
    );
  }

  order.status = status;
  order.pushTimeline(status, note || '', `admin:${req.user.email}`);

  if (status === 'delivered') {
    order.deliveredAt = new Date();
    if (order.payment.method === 'cod' && order.payment.status === 'pending') {
      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      order.pushTimeline('delivered', 'Cash collected on delivery', `admin:${req.user.email}`);
    }
  }

  if (status === 'cancelled' || status === 'returned') {
    order.cancelledAt = status === 'cancelled' ? new Date() : order.cancelledAt;
    order.cancelReason = note || `Marked ${status} by admin`;
    await releaseStock(order);
  }

  await order.save();
  return ok(res, { order: shapeOrder(order) });
});

export const updateOrderTracking = asyncHandler(async (req, res) => {
  const data = z
    .object({
      carrier: z.string().trim().max(80).optional().or(z.literal('')),
      awb: z.string().trim().max(80).optional().or(z.literal('')),
      url: z.string().trim().url('Enter a valid tracking URL').optional().or(z.literal('')),
      adminNote: z.string().trim().max(1000).optional(),
    })
    .parse(req.body);

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  order.tracking = {
    carrier: data.carrier ?? order.tracking.carrier,
    awb: data.awb ?? order.tracking.awb,
    url: data.url ?? order.tracking.url,
  };
  if (data.adminNote !== undefined) order.adminNote = data.adminNote;
  if (data.awb) order.pushTimeline(order.status, `Tracking added: ${data.carrier} ${data.awb}`, `admin:${req.user.email}`);

  await order.save();
  return ok(res, { order: shapeOrder(order) });
});

export const refundOrder = asyncHandler(async (req, res) => {
  const { amount, reason } = z
    .object({
      amount: z.coerce.number().min(1).optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .parse(req.body);

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.status !== 'paid' && order.payment.status !== 'partially_refunded') {
    throw ApiError.badRequest('Only a paid order can be refunded');
  }
  if (order.payment.method === 'cod') {
    throw ApiError.badRequest('Cash on delivery orders are refunded offline');
  }

  const already = order.payment.refundedAmount || 0;
  const refundable = order.pricing.grandTotal - already;
  const value = amount ?? refundable;
  if (value <= 0 || value > refundable) {
    throw ApiError.badRequest(`Refundable amount is ₹${refundable}`);
  }

  const result = await refundPayment(order.payment.razorpayPaymentId, Math.round(value * 100), {
    orderNumber: order.orderNumber,
    reason: reason || 'Refund issued by admin',
  });

  order.payment.refundId = result.id;
  order.payment.refundedAmount = already + value;
  order.payment.refundedAt = new Date();
  order.payment.status =
    order.payment.refundedAmount >= order.pricing.grandTotal ? 'refunded' : 'partially_refunded';
  order.pushTimeline(order.status, `Refunded ₹${value} — ${reason || 'no reason given'}`, `admin:${req.user.email}`);

  await order.save();
  return ok(res, { order: shapeOrder(order), message: `₹${value} refunded` });
});

/* ---------------------------------------------------------------------- users */

export const listUsers = asyncHandler(async (req, res) => {
  const q = z
    .object({
      search: z.string().trim().optional(),
      role: z.enum(['customer', 'admin', 'all']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);

  const filter = {};
  if (q.role !== 'all') filter.role = q.role;
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ]);

  // Attach lifetime value in one aggregate rather than N queries.
  const spend = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, ...PAID, ...REVENUE_STATUSES } },
    { $group: { _id: '$user', total: { $sum: '$pricing.grandTotal' }, orders: { $sum: 1 } } },
  ]);

  return ok(res, {
    users: users.map((u) => {
      const s = spend.find((x) => String(x._id) === String(u._id));
      return {
        id: String(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        addressCount: u.addresses?.length || 0,
        orders: s?.orders || 0,
        lifetimeValue: s?.total || 0,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      };
    }),
    total,
    page: q.page,
    pages: Math.ceil(total / q.limit),
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('Customer not found');

  const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean();

  return ok(res, {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      addresses: user.addresses,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    orders: orders.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      total: o.pricing.grandTotal,
      status: o.status,
      paymentStatus: o.payment.status,
      createdAt: o.createdAt,
    })),
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const data = z
    .object({ isActive: z.boolean().optional(), role: z.enum(['customer', 'admin']).optional() })
    .parse(req.body);

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own role or status');
  }

  const user = await User.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!user) throw ApiError.notFound('Customer not found');
  return ok(res, { user: user.toSafeJSON() });
});

/* -------------------------------------------------------------------- reviews */

export const listReviewsAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const filter = {};
  if (req.query.approved === 'false') filter.isApproved = false;
  if (req.query.approved === 'true') filter.isApproved = true;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('product', 'name slug images')
      .populate('user', 'name email')
      .lean(),
    Review.countDocuments(filter),
  ]);

  return ok(res, { reviews, total, page, pages: Math.ceil(total / limit) });
});

export const updateReviewAdmin = asyncHandler(async (req, res) => {
  const { isApproved } = z.object({ isApproved: z.boolean() }).parse(req.body);
  const review = await Review.findByIdAndUpdate(req.params.id, { isApproved }, { new: true });
  if (!review) throw ApiError.notFound('Review not found');
  await Review.syncProductRating(review.product);
  return ok(res, { review });
});

export const deleteReviewAdmin = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  await Review.syncProductRating(review.product);
  return ok(res, { message: 'Review deleted' });
});

/* ------------------------------------------------------- contacts & marketing */

export const listContacts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};

  const [messages, total, unread] = await Promise.all([
    Contact.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Contact.countDocuments(filter),
    Contact.countDocuments({ status: 'new' }),
  ]);

  return ok(res, { messages, total, unread, page, pages: Math.ceil(total / limit) });
});

export const updateContact = asyncHandler(async (req, res) => {
  const data = z
    .object({
      status: z.enum(['new', 'read', 'resolved']).optional(),
      adminReply: z.string().trim().max(3000).optional(),
    })
    .parse(req.body);

  const message = await Contact.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!message) throw ApiError.notFound('Message not found');
  return ok(res, { message });
});

export const listSubscribers = asyncHandler(async (_req, res) => {
  const subscribers = await Subscriber.find({ isActive: true }).sort({ createdAt: -1 }).lean();
  return ok(res, { subscribers, total: subscribers.length });
});

/* ------------------------------------------------------------- coupon reports */

export const couponUsage = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id).lean();
  if (!coupon) throw ApiError.notFound('Coupon not found');

  const [stats] = await Order.aggregate([
    { $match: { 'pricing.couponCode': coupon.code, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        discountGiven: { $sum: '$pricing.couponDiscount' },
        revenue: { $sum: '$pricing.grandTotal' },
      },
    },
  ]);

  const recent = await Order.find({ 'pricing.couponCode': coupon.code })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber pricing.grandTotal pricing.couponDiscount createdAt status')
    .lean();

  return ok(res, {
    coupon,
    stats: stats || { orders: 0, discountGiven: 0, revenue: 0 },
    recent,
  });
});

export { mongoose };
