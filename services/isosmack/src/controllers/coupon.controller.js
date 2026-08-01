import { z } from 'zod';
import Coupon from '../models/Coupon.js';
import { buildCart } from '../services/pricing.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

/** Coupons the store chooses to advertise on the cart / checkout page. */
export const listPublicCoupons = asyncHandler(async (_req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    showOnSite: true,
    $and: [
      { $or: [{ validFrom: { $exists: false } }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: { $exists: false } }, { validTo: null }, { validTo: { $gte: now } }] },
    ],
  })
    .select('code description type value minOrder maxDiscount validTo')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  return ok(res, { coupons });
});

/**
 * Applies a coupon against a live cart and returns the recalculated totals.
 * Rejects with a human-readable reason so the UI can show it inline.
 */
export const validateCoupon = asyncHandler(async (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1, 'Enter a coupon code').max(32),
    items: z
      .array(z.object({ productId: z.string(), qty: z.coerce.number().int().min(1).max(10) }))
      .min(1, 'Your cart is empty'),
    paymentMethod: z.enum(['razorpay', 'cod']).default('razorpay'),
  });
  const { code, items, paymentMethod } = schema.parse(req.body);

  const cart = await buildCart({
    items,
    couponCode: code,
    paymentMethod,
    user: req.user || null,
  });

  if (cart.couponError) throw ApiError.badRequest(cart.couponError);
  if (!cart.coupon) throw ApiError.badRequest('That coupon code is not valid');

  return ok(res, { cart, message: `${cart.coupon.code} applied` });
});
