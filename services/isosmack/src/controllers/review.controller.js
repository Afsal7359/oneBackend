import { z } from 'zod';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

export const listReviews = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }).select('_id');
  if (!product) throw ApiError.notFound('Product not found');

  const reviews = await Review.find({ product: product._id, isApproved: true })
    .sort({ createdAt: -1 })
    .lean();

  return ok(res, { reviews });
});

export const createReview = asyncHandler(async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    rating: z.coerce.number().int().min(1, 'Pick a rating').max(5),
    title: z.string().trim().max(120).optional().or(z.literal('')),
    body: z.string().trim().max(2000).optional().or(z.literal('')),
  });
  const { productId, rating, title, body } = schema.parse(req.body);

  const product = await Product.findById(productId).select('_id');
  if (!product) throw ApiError.notFound('Product not found');

  if (await Review.exists({ product: productId, user: req.user._id })) {
    throw ApiError.conflict("You've already reviewed this product");
  }

  const purchased = await Order.exists({
    user: req.user._id,
    'items.product': productId,
    status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
  });

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    name: req.user.name,
    rating,
    title: title || '',
    body: body || '',
    isVerifiedPurchase: Boolean(purchased),
  });

  return ok(res, { review }, 201);
});

export const updateReview = asyncHandler(async (req, res) => {
  const schema = z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().max(2000).optional(),
  });
  const data = schema.parse(req.body);

  const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
  if (!review) throw ApiError.notFound('Review not found');

  Object.assign(review, data);
  await review.save();
  return ok(res, { review });
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!review) throw ApiError.notFound('Review not found');
  return ok(res, { message: 'Review removed' });
});
