const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const { instance: razorpay, isConfigured: rzpConfigured } = require('../config/razorpay');

// Attach the order to a user: the logged-in user if present, otherwise
// find-or-create a "guest" account from the checkout email so their orders
// are stored against them and reachable once they set a password.
async function resolveOrderUser(req) {
  if (req.user) return req.user;
  const email = (req.body?.shipping?.email || '').toLowerCase().trim();
  if (!email) return null;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: req.body?.shipping?.name || 'Guest',
      email,
      password: crypto.randomBytes(12).toString('hex'), // placeholder until they reset
      phone: req.body?.shipping?.phone || '',
      isGuest: true,
    });
  }
  return user;
}

// Rebuild items/totals from the DB so prices/discounts are always trusted.
async function computeOrder(body) {
  const { items = [], couponCode, shippingFee = 0 } = body;
  const dbItems = [];
  let itemsTotal = 0;
  for (const it of items) {
    const p = await Product.findOne({ code: it.code });
    if (!p) continue;
    const qty = Math.max(1, Number(it.qty) || 1);
    itemsTotal += p.price * qty;
    dbItems.push({ product: p._id, code: p.code, title: p.title, image: p.images?.[0]?.url || '', price: p.price, qty });
  }
  let couponData = { code: '', discount: 0 };
  let couponDoc = null;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
    if (coupon && coupon.isValidNow(itemsTotal).ok) {
      couponData = { code: coupon.code, discount: coupon.computeDiscount(itemsTotal) };
      couponDoc = coupon;
    }
  }
  const grandTotal = Math.max(0, itemsTotal - couponData.discount) + Number(shippingFee);
  return { dbItems, itemsTotal, couponData, couponDoc, grandTotal, shippingFee: Number(shippingFee) };
}

// Persist the order + side effects (stock/sales, coupon usage).
async function persistOrder(body, user, { paymentMethod = 'COD', isPaid = false, payment = {} } = {}) {
  const c = await computeOrder(body);
  if (!c.dbItems.length) { const e = new Error('No items in order'); e.status = 400; throw e; }
  for (const it of c.dbItems) { await Product.updateOne({ _id: it.product }, { $inc: { sales: it.qty } }); }
  if (c.couponDoc) { c.couponDoc.usedCount += 1; await c.couponDoc.save(); }
  return Order.create({
    user: user?._id,
    items: c.dbItems,
    shipping: body.shipping || {},
    itemsTotal: c.itemsTotal,
    coupon: c.couponData,
    shippingFee: c.shippingFee,
    grandTotal: c.grandTotal,
    paymentMethod,
    isPaid,
    payment,
  });
}

// @route POST /api/orders — Cash on Delivery / direct
const createOrder = asyncHandler(async (req, res) => {
  const user = await resolveOrderUser(req);
  const order = await persistOrder(req.body, user, {
    paymentMethod: req.body.paymentMethod || 'COD',
    isPaid: false,
  });
  res.status(201).json(order);
});

// @route POST /api/orders/razorpay — create a Razorpay order (returns id + key)
// Falls back to { disabled:true } if keys aren't configured, so the client uses COD.
const createRazorpayOrder = asyncHandler(async (req, res) => {
  if (!rzpConfigured()) return res.json({ disabled: true });
  const c = await computeOrder(req.body);
  if (!c.dbItems.length) { res.status(400); throw new Error('No items in order'); }
  const amount = Math.round(c.grandTotal * 100); // paise
  if (amount < 100) { res.status(400); throw new Error('Order amount too low'); }
  const rzpOrder = await razorpay.orders.create({
    amount, currency: 'INR', receipt: 'rcpt_' + Date.now(),
  });
  res.json({ orderId: rzpOrder.id, amount, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID });
});

// @route POST /api/orders/verify — verify Razorpay signature, then create the order
const verifyPayment = asyncHandler(async (req, res) => {
  if (!rzpConfigured()) { res.status(400); throw new Error('Payments not configured'); }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400); throw new Error('Missing payment fields');
  }
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature) { res.status(400); throw new Error('Payment verification failed'); }

  const user = await resolveOrderUser(req);
  const order = await persistOrder(req.body, user, {
    paymentMethod: 'Razorpay',
    isPaid: true,
    payment: { provider: 'razorpay', orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature },
  });
  res.status(201).json(order);
});

// @route GET /api/orders (admin)
const getOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
  res.json(orders);
});

// @route GET /api/orders/mine (user)
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

// @route PUT /api/orders/:id/status (admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, ...(req.body.isPaid !== undefined ? { isPaid: req.body.isPaid } : {}) },
    { new: true }
  );
  if (!order) { res.status(404); throw new Error('Order not found'); }
  res.json(order);
});

module.exports = {
  createOrder, createRazorpayOrder, verifyPayment,
  getOrders, getMyOrders, updateOrderStatus,
};
