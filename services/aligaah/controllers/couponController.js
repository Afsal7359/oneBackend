const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');

// @route GET /api/coupons (admin)
const getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json(coupons);
});

// @route POST /api/coupons/validate  body { code, cartValue }  (public)
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, cartValue = 0 } = req.body;
  const coupon = await Coupon.findOne({ code: (code || '').toUpperCase().trim() });
  if (!coupon) { res.status(404); throw new Error('Invalid coupon code'); }
  const check = coupon.isValidNow(cartValue);
  if (!check.ok) { res.status(400); throw new Error(check.reason); }
  const discount = coupon.computeDiscount(cartValue);
  res.json({
    code: coupon.code, type: coupon.type, value: coupon.value,
    discount, description: coupon.description,
    newTotal: Math.max(0, cartValue - discount),
  });
});

// @route POST /api/coupons (admin)
const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json(coupon);
});

// @route PUT /api/coupons/:id (admin)
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!coupon) { res.status(404); throw new Error('Coupon not found'); }
  res.json(coupon);
});

// @route DELETE /api/coupons/:id (admin)
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) { res.status(404); throw new Error('Coupon not found'); }
  res.json({ ok: true });
});

module.exports = { getCoupons, validateCoupon, createCoupon, updateCoupon, deleteCoupon };
