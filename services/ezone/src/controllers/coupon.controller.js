import asyncHandler from 'express-async-handler';
import Coupon from '../models/Coupon.js';

export const listCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Coupon.countDocuments(),
  ]);
  res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const c = await Coupon.create({ ...req.body, code: req.body.code?.toUpperCase() });
  res.status(201).json({ success: true, coupon: c });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  if (req.body.code) req.body.code = req.body.code.toUpperCase();
  const c = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  res.json({ success: true, coupon: c });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// @route POST /api/coupons/validate  { code, subtotal }
export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal = 0 } = req.body;
  const c = await Coupon.findOne({ code: code?.toUpperCase(), isActive: true });
  if (!c) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  if (c.expiresAt && c.expiresAt < new Date()) {
    res.status(400);
    throw new Error('Coupon expired');
  }
  if (c.minOrderAmount && subtotal < c.minOrderAmount) {
    res.status(400);
    throw new Error(`Minimum order ₹${c.minOrderAmount} required`);
  }
  const discount =
    c.type === 'percent'
      ? Math.min((subtotal * c.value) / 100, c.maxDiscount || Infinity)
      : c.value;
  res.json({ success: true, coupon: c, discount: Math.min(discount, subtotal) });
});
