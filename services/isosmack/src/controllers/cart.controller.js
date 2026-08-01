import { z } from 'zod';
import Cart from '../models/Cart.js';
import { buildCart, MAX_QTY_PER_LINE } from '../services/pricing.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

const itemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1),
      qty: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE),
    })
  )
  .max(50)
  .default([]);

export const previewSchema = z.object({
  items: itemsSchema,
  couponCode: z.string().trim().max(32).optional().or(z.literal('')),
  paymentMethod: z.enum(['razorpay', 'cod']).default('razorpay'),
});

/**
 * Prices a cart. Stateless — the client sends what it holds and the server
 * returns authoritative lines and totals (including stock corrections).
 */
export const previewCart = asyncHandler(async (req, res) => {
  const { items, couponCode, paymentMethod } = req.body;
  const cart = await buildCart({
    items,
    couponCode: couponCode || '',
    paymentMethod,
    user: req.user || null,
  });
  return ok(res, { cart });
});

/* --------------------- persisted cart for signed-in users --------------------- */

export const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).lean();
  return ok(res, {
    items: (cart?.items || []).map((i) => ({ productId: String(i.product), qty: i.qty })),
    couponCode: cart?.couponCode || '',
  });
});

export const saveCart = asyncHandler(async (req, res) => {
  const { items, couponCode } = z
    .object({ items: itemsSchema, couponCode: z.string().trim().max(32).optional().or(z.literal('')) })
    .parse(req.body);

  await Cart.findOneAndUpdate(
    { user: req.user._id },
    {
      user: req.user._id,
      items: items.map((i) => ({ product: i.productId, qty: i.qty })),
      couponCode: couponCode || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return ok(res, { message: 'Cart saved' });
});

export const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate({ user: req.user._id }, { items: [], couponCode: '' });
  return ok(res, { message: 'Cart cleared' });
});
