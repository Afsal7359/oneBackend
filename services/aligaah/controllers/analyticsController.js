const asyncHandler = require('express-async-handler');
const Visit = require('../models/Visit');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');

// @route POST /api/analytics/track (public) — log a page/screen visit
const track = asyncHandler(async (req, res) => {
  const { path = '/', screen = '', type = 'page', productCode = '', sessionId = '', referrer = '' } = req.body;
  const day = new Date().toISOString().slice(0, 10);
  await Visit.create({
    type, path, screen, productCode, sessionId, referrer,
    userAgent: req.headers['user-agent'] || '', day,
  });
  res.status(201).json({ ok: true });
});

// helper: build last-N-days array of YYYY-MM-DD
const lastNDays = (n) => {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
};

// @route GET /api/analytics/overview?days=30 (admin)
const overview = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDay = since.toISOString().slice(0, 10);

  const [
    totalVisits, pageVisits, productVisits, totalProducts,
    totalOrders, totalUsers, uniqueSessions,
  ] = await Promise.all([
    Visit.countDocuments({ day: { $gte: sinceDay } }),
    Visit.countDocuments({ type: 'page', day: { $gte: sinceDay } }),
    Visit.countDocuments({ type: 'product', day: { $gte: sinceDay } }),
    Product.countDocuments({}),
    // Abandoned Razorpay attempts are parked as unpaid orders — don't count them.
    Order.countDocuments({ $or: [{ paymentMethod: { $ne: 'Razorpay' } }, { isPaid: true }] }),
    User.countDocuments({ role: 'user' }),
    Visit.distinct('sessionId', { day: { $gte: sinceDay }, sessionId: { $ne: '' } }),
  ]);

  const revenueAgg = await Order.aggregate([
    {
      $match: {
        status: { $ne: 'cancelled' },
        $or: [{ paymentMethod: { $ne: 'Razorpay' } }, { isPaid: true }],
      },
    },
    { $group: { _id: null, total: { $sum: '$grandTotal' } } },
  ]);

  res.json({
    days,
    totals: {
      visits: totalVisits, pageVisits, productVisits,
      products: totalProducts, orders: totalOrders,
      users: totalUsers, uniqueVisitors: uniqueSessions.length,
      revenue: revenueAgg[0]?.total || 0,
    },
  });
});

// @route GET /api/analytics/visits-daily?days=30 (admin) — date-wise visits
const visitsDaily = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);
  const range = lastNDays(days);
  const sinceDay = range[0];

  const agg = await Visit.aggregate([
    { $match: { day: { $gte: sinceDay } } },
    {
      $group: {
        _id: '$day',
        total: { $sum: 1 },
        pages: { $sum: { $cond: [{ $eq: ['$type', 'page'] }, 1, 0] } },
        products: { $sum: { $cond: [{ $eq: ['$type', 'product'] }, 1, 0] } },
        sessions: { $addToSet: '$sessionId' },
      },
    },
  ]);
  const map = Object.fromEntries(agg.map((a) => [a._id, a]));
  const series = range.map((day) => {
    const a = map[day];
    const uniq = a ? a.sessions.filter((s) => s).length : 0;
    return { day, total: a?.total || 0, pages: a?.pages || 0, products: a?.products || 0, visitors: uniq };
  });
  res.json(series);
});

// @route GET /api/analytics/top-products?limit=10 (admin) — most viewed
const topProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  // From logged visits (date-accurate) + fall back to cumulative product.views
  const byVisits = await Visit.aggregate([
    { $match: { type: 'product', productCode: { $ne: '' } } },
    { $group: { _id: '$productCode', views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: limit },
  ]);
  const codes = byVisits.map((b) => b._id);
  const products = await Product.find({ code: { $in: codes } }).select('code title categoryName price images views');
  const pmap = Object.fromEntries(products.map((p) => [p.code, p]));
  let result = byVisits.map((b) => ({
    code: b._id,
    title: pmap[b._id]?.title || b._id,
    category: pmap[b._id]?.categoryName || '',
    price: pmap[b._id]?.price || 0,
    image: pmap[b._id]?.images?.[0]?.url || '',
    views: b.views,
  }));
  // Fallback if no visit logs yet: use cumulative product.views
  if (result.length === 0) {
    const top = await Product.find({}).sort({ views: -1 }).limit(limit)
      .select('code title categoryName price images views');
    result = top.map((p) => ({
      code: p.code, title: p.title, category: p.categoryName,
      price: p.price, image: p.images?.[0]?.url || '', views: p.views,
    }));
  }
  res.json(result);
});

// @route GET /api/analytics/top-screens?limit=10 (admin) — most visited screens
const topScreens = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const agg = await Visit.aggregate([
    { $match: { type: 'page' } },
    { $group: { _id: { screen: '$screen', path: '$path' }, visits: { $sum: 1 } } },
    { $sort: { visits: -1 } },
    { $limit: limit },
  ]);
  res.json(agg.map((a) => ({ screen: a._id.screen || a._id.path || 'Unknown', path: a._id.path, visits: a.visits })));
});

module.exports = { track, overview, visitsDaily, topProducts, topScreens };
