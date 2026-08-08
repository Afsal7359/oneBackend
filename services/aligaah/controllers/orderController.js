const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { instance: razorpay, isConfigured: rzpConfigured } = require('../config/razorpay');
const { notifyNewOrder } = require('../utils/email');

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

// Shipping details are re-checked here, not just in the browser — a bad phone or
// pincode means an undeliverable order, and the client can be bypassed.
const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_RE = /^[1-9]\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateShipping(shipping = {}) {
  const errors = {};
  const name = String(shipping.name || '').trim();
  const phone = String(shipping.phone || '').replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
  const email = String(shipping.email || '').trim();
  const line1 = String(shipping.line1 || '').trim();
  const city = String(shipping.city || '').trim();
  const state = String(shipping.state || '').trim();
  const pincode = String(shipping.pincode || '').trim();

  if (name.length < 2) errors.name = 'Please enter your full name';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (line1.length < 6) errors.line1 = 'Please enter a complete address';
  if (city.length < 2) errors.city = 'Please enter your city';
  if (state.length < 2) errors.state = 'Please enter your state';
  if (!PIN_RE.test(pincode)) errors.pincode = 'Enter a valid 6-digit pincode';

  return {
    errors,
    ok: Object.keys(errors).length === 0,
    // normalised copy — this is what gets stored
    clean: { ...shipping, name, phone, email: email.toLowerCase(), line1, city, state, pincode },
  };
}

// Throws a 400 carrying per-field messages the checkout form renders inline.
function assertShipping(req, res) {
  const { ok, errors, clean } = validateShipping(req.body?.shipping);
  if (!ok) {
    res.status(400);
    const e = new Error(Object.values(errors)[0]);
    e.fields = errors;
    throw e;
  }
  req.body.shipping = clean;
  return clean;
}

// Rebuild items/totals from the DB so prices/discounts are always trusted.
async function computeOrder(body, res) {
  const { items = [], couponCode, shippingFee = 0 } = body;
  const dbItems = [];
  let itemsTotal = 0;
  for (const it of items) {
    const p = await Product.findOne({ code: it.code });
    if (!p) continue;
    const qty = Math.max(1, Number(it.qty) || 1);

    // The variant is validated the same way the price is: against the product,
    // never against what the client sent. A size the product does not offer is
    // dropped rather than trusted, and a product that *does* offer sizes will
    // not accept a line without one.
    const sizes = p.sizes || [];
    const colors = (p.colors || []).map((c) => c.name);
    const size = sizes.includes(it.size) ? it.size : '';
    const color = colors.includes(it.color) ? it.color : '';
    if (sizes.length && !size) { res.status(400); throw new Error(`Please choose a size for ${p.title}`); }
    if (colors.length && !color) { res.status(400); throw new Error(`Please choose a colour for ${p.title}`); }

    itemsTotal += p.price * qty;
    dbItems.push({
      product: p._id, code: p.code, title: p.title,
      image: p.images?.[0]?.url || '', price: p.price, qty, size, color,
    });
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

// Stock/sales counters and coupon usage — applied once, when an order becomes
// real (COD placed, or an online payment actually confirmed). Never at the
// moment a gateway order is opened, because most of those are abandoned.
async function applySideEffects(order, couponCode) {
  for (const it of order.items) {
    await Product.updateOne({ _id: it.product }, { $inc: { sales: it.qty } });
  }
  const code = couponCode || order.coupon?.code;
  if (code) await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } });
}

function orderDocFrom(c, body, user, extra = {}) {
  return {
    user: user?._id,
    items: c.dbItems,
    shipping: body.shipping || {},
    itemsTotal: c.itemsTotal,
    coupon: c.couponData,
    shippingFee: c.shippingFee,
    grandTotal: c.grandTotal,
    ...extra,
  };
}

// @route POST /api/orders — Cash on Delivery / direct
const createOrder = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  if (settings.codEnabled === false) {
    res.status(400);
    throw new Error('Cash on Delivery is currently unavailable');
  }
  assertShipping(req, res);
  const user = await resolveOrderUser(req);
  const c = await computeOrder(req.body, res);
  if (!c.dbItems.length) { res.status(400); throw new Error('No items in order'); }

  const order = await Order.create(orderDocFrom(c, req.body, user, {
    paymentMethod: 'COD',
    isPaid: false,
  }));
  await applySideEffects(order, c.couponDoc?.code);
  notifyNewOrder(order); // deliberately not awaited — mail must never delay checkout
  res.status(201).json(order);
});

// @route POST /api/orders/razorpay — open a Razorpay order and park a pending
// local order against it. Totals are frozen here and never recomputed from the
// client again, so the cart can't be swapped between paying and verifying.
const createRazorpayOrder = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  if (settings.onlinePaymentEnabled === false) {
    res.status(400);
    throw new Error('Online payment is currently unavailable');
  }
  if (!rzpConfigured()) {
    res.status(503);
    throw new Error('Online payment is not configured on the server');
  }

  assertShipping(req, res);
  const c = await computeOrder(req.body, res);
  if (!c.dbItems.length) { res.status(400); throw new Error('No items in order'); }
  const amount = Math.round(c.grandTotal * 100); // paise
  if (amount < 100) { res.status(400); throw new Error('Order amount must be at least ₹1'); }

  const user = await resolveOrderUser(req);
  let rzpOrder;
  try {
    rzpOrder = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: 'rcpt_' + Date.now(),
      notes: {
        customer: req.body?.shipping?.name || '',
        phone: req.body?.shipping?.phone || '',
      },
    });
  } catch (err) {
    // Razorpay rejects with { statusCode, error:{ code, description } } and no
    // .message, so log the real reason here and hand the customer a plain one.
    const detail = err?.error?.description || err?.message || 'unknown error';
    console.error(`[razorpay] orders.create failed (${err?.statusCode || '?'}): ${detail}`);
    res.status(502);
    throw new Error(
      err?.statusCode === 401
        ? 'Online payment is temporarily unavailable. Please use Cash on Delivery or try again later.'
        : `Payment gateway error: ${detail}`
    );
  }

  const order = await Order.create(orderDocFrom(c, req.body, user, {
    paymentMethod: 'Razorpay',
    isPaid: false,
    status: 'pending',
    payment: { provider: 'razorpay', orderId: rzpOrder.id, status: 'created', amount },
  }));

  res.json({
    orderId: rzpOrder.id,
    orderRef: order._id,
    amount,
    currency: 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
  });
});

// Flip a parked order to paid exactly once. Returns the order, or null if the
// gateway order id is unknown to us.
async function markPaid(rzpOrderId, { paymentId, signature = '', method = '' }) {
  const order = await Order.findOne({ 'payment.orderId': rzpOrderId });
  if (!order) return null;
  if (order.isPaid) return order; // idempotent: verify + webhook can both land

  order.isPaid = true;
  order.paidAt = new Date();
  order.status = 'confirmed';
  order.payment.status = 'paid';
  order.payment.paymentId = paymentId || order.payment.paymentId;
  if (signature) order.payment.signature = signature;
  if (method) order.payment.method = method;
  order.payment.error = '';
  await order.save();
  await applySideEffects(order);
  // markPaid returns early when already paid, so verify + webhook both landing
  // cannot send this twice.
  notifyNewOrder(order);
  return order;
}

// @route POST /api/orders/verify — browser-side confirmation after checkout
const verifyPayment = asyncHandler(async (req, res) => {
  if (!rzpConfigured()) { res.status(503); throw new Error('Online payment is not configured on the server'); }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400); throw new Error('Missing payment fields');
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(razorpay_signature), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(400); throw new Error('Payment verification failed');
  }

  const order = await markPaid(razorpay_order_id, {
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!order) { res.status(404); throw new Error('Order not found for this payment'); }
  res.status(201).json(order);
});

// @route POST /api/orders/razorpay/failed — checkout reported a failed attempt.
// Only records the reason; the order stays pending so a retry can still pay it.
const markPaymentFailed = asyncHandler(async (req, res) => {
  const { razorpay_order_id, reason = '' } = req.body;
  if (!razorpay_order_id) { res.status(400); throw new Error('Missing order id'); }
  const order = await Order.findOne({ 'payment.orderId': razorpay_order_id });
  if (!order || order.isPaid) return res.json({ ok: true });
  order.payment.status = 'failed';
  order.payment.error = String(reason).slice(0, 300);
  await order.save();
  res.json({ ok: true });
});

// @route POST /api/orders/razorpay/webhook — server-to-server safety net.
// If the customer's browser dies after paying, this still completes the order.
// Requires RAZORPAY_WEBHOOK_SECRET and the raw body captured in server.js.
const razorpayWebhook = asyncHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) { res.status(503); throw new Error('Webhook not configured'); }

  const signature = req.headers['x-razorpay-signature'] || '';
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(400); throw new Error('Invalid webhook signature');
  }

  const event = req.body?.event;
  const payment = req.body?.payload?.payment?.entity;
  if (payment?.order_id) {
    if (event === 'payment.captured') {
      await markPaid(payment.order_id, { paymentId: payment.id, method: payment.method });
    } else if (event === 'payment.failed') {
      const order = await Order.findOne({ 'payment.orderId': payment.order_id });
      if (order && !order.isPaid) {
        order.payment.status = 'failed';
        order.payment.error = payment.error_description || 'Payment failed';
        await order.save();
      }
    }
  }
  res.json({ ok: true }); // always 200 so Razorpay stops retrying
});

// @route GET /api/orders (admin)
// Abandoned gateway orders are hidden by default — pass ?includeUnpaid=1 to see them.
const getOrders = asyncHandler(async (req, res) => {
  const filter = req.query.includeUnpaid
    ? {}
    : { $or: [{ paymentMethod: { $ne: 'Razorpay' } }, { isPaid: true }] };
  const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 });
  res.json(orders);
});

// @route GET /api/orders/mine (user) — never show unpaid online attempts
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    user: req.user._id,
    $or: [{ paymentMethod: { $ne: 'Razorpay' } }, { isPaid: true }],
  }).sort({ createdAt: -1 });
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
  createOrder, createRazorpayOrder, verifyPayment, markPaymentFailed, razorpayWebhook,
  getOrders, getMyOrders, updateOrderStatus,
};
