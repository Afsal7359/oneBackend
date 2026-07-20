import Coupon from '../models/Coupon.js';

// ── VALIDATE COUPON (public — called from cart) ──────────────────────────────
export const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount, email } = req.body;
    if (!code) return res.status(400).json({ message: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });

    const identifier = req.userId || email;
    const { ok, msg } = coupon.isValid(orderAmount || 0, identifier);
    if (!ok) return res.status(400).json({ message: msg });

    const discount = coupon.calculateDiscount(orderAmount || 0);
    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      description: coupon.description,
    });
  } catch (err) {
    console.error('validateCoupon error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADMIN: LIST ALL COUPONS ──────────────────────────────────────────────────
export const listCoupons = async (_req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADMIN: GET ONE COUPON ────────────────────────────────────────────────────
export const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADMIN: CREATE COUPON ─────────────────────────────────────────────────────
export const createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Coupon code already exists' });
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ── ADMIN: UPDATE COUPON ─────────────────────────────────────────────────────
export const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ── ADMIN: DELETE COUPON ─────────────────────────────────────────────────────
export const deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
