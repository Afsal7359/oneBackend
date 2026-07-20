import asyncHandler from 'express-async-handler';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

const recomputeRating = async (productId) => {
  const agg = await Review.aggregate([
    { $match: { product: productId, isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = agg[0] || {};
  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(avg * 10) / 10,
    numReviews: count,
  });
};

/* ── Public: list approved reviews for a product ────────────────── */
export const listProductReviews = asyncHandler(async (req, res) => {
  const items = await Review.find({ product: req.params.productId, isApproved: true })
    .select('name rating title comment isVerifiedPurchase isCustom createdAt images')
    .sort({ createdAt: -1 })
    .lean();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, items });
});

/* ── Customer: create review (purchase-gated) ───────────────────── */
export const createReview = asyncHandler(async (req, res) => {
  const { product, rating, title, comment, images } = req.body;
  const existing = await Review.findOne({ product, user: req.user._id });
  if (existing) { res.status(400); throw new Error('You have already reviewed this product'); }
  const hasPurchased = await Order.findOne({
    user: req.user._id, 'items.product': product, paymentStatus: 'paid',
  });
  const r = await Review.create({
    product, user: req.user._id, name: req.user.name,
    rating, title, comment, images, isVerifiedPurchase: !!hasPurchased,
  });
  await recomputeRating(r.product);
  res.status(201).json({ success: true, review: r });
});

/* ── Customer: can review? ──────────────────────────────────────── */
export const canReviewProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const hasPurchased = await Order.findOne({
    user: req.user._id, 'items.product': productId, paymentStatus: 'paid',
  });
  const alreadyReviewed = await Review.findOne({ product: productId, user: req.user._id });
  res.json({
    success: true,
    canReview: !!hasPurchased && !alreadyReviewed,
    hasPurchased: !!hasPurchased,
    alreadyReviewed: !!alreadyReviewed,
  });
});

/* ── Admin: list ALL reviews for a product (approved + unapproved) ─ */
export const adminListReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const items = await Review.find({ product: productId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, items });
});

/* ── Admin: create custom review with any reviewer name ─────────── */
export const adminCreateReview = asyncHandler(async (req, res) => {
  const { product, name, rating, title, comment, isVerifiedPurchase = false, isApproved = true } = req.body;
  if (!product || !name || !rating) {
    res.status(400); throw new Error('product, name and rating are required');
  }
  const r = await Review.create({
    product, name: name.trim(), rating, title, comment,
    isVerifiedPurchase, isApproved, isCustom: true,
    // user intentionally omitted — sparse unique index allows this
  });
  await recomputeRating(r.product);
  res.status(201).json({ success: true, review: r });
});

/* ── Admin: update a review (approve/edit) ──────────────────────── */
export const adminUpdateReview = asyncHandler(async (req, res) => {
  const r = await Review.findById(req.params.id);
  if (!r) { res.status(404); throw new Error('Review not found'); }
  const { name, rating, title, comment, isVerifiedPurchase, isApproved } = req.body;
  if (name !== undefined) r.name = name;
  if (rating !== undefined) r.rating = rating;
  if (title !== undefined) r.title = title;
  if (comment !== undefined) r.comment = comment;
  if (isVerifiedPurchase !== undefined) r.isVerifiedPurchase = isVerifiedPurchase;
  if (isApproved !== undefined) r.isApproved = isApproved;
  await r.save();
  await recomputeRating(r.product);
  res.json({ success: true, review: r });
});

/* ── Delete (admin or review owner) ────────────────────────────── */
export const deleteReview = asyncHandler(async (req, res) => {
  const r = await Review.findById(req.params.id);
  if (!r) { res.status(404); throw new Error('Review not found'); }
  if (req.user.role !== 'admin' && String(r.user) !== String(req.user._id)) {
    res.status(403); throw new Error('Forbidden');
  }
  const pid = r.product;
  await r.deleteOne();
  await recomputeRating(pid);
  res.json({ success: true });
});
