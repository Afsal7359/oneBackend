import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

export const dashboardStats = asyncHandler(async (_req, res) => {
  const [usersCount, productsCount, ordersCount, paidOrders, revenueAgg, lowStock, recentOrders] =
    await Promise.all([
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments({}),
      Order.countDocuments({}),
      Order.countDocuments({ paymentStatus: 'paid' }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      Product.find({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
        .limit(6)
        .select('name stock images')
        .lean(),
      Order.find({ paymentStatus: 'paid' })
        .select('orderNumber totalPrice paymentStatus status createdAt user')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

  const revenue = revenueAgg[0]?.total || 0;

  // Revenue over last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const daily = await Order.aggregate([
    { $match: { paymentStatus: 'paid', createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: '$totalPrice' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top products
  const topProducts = await Order.aggregate([
    { $unwind: '$items' },
    { $group: { _id: '$items.product', name: { $first: '$items.name' }, sold: { $sum: '$items.quantity' } } },
    { $sort: { sold: -1 } },
    { $limit: 5 },
  ]);

  res.json({
    success: true,
    stats: {
      usersCount,
      productsCount,
      ordersCount,
      paidOrders,
      revenue,
      daily,
      topProducts,
      lowStock,
      recentOrders,
    },
  });
});
