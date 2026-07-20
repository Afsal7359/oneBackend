const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');

const getReviews = asyncHandler(async (req, res) => {
  const filter = req.query.all ? {} : { isApproved: true };
  const reviews = await Review.find(filter).sort({ order: 1, createdAt: -1 });
  res.json(reviews);
});

const createReview = asyncHandler(async (req, res) => {
  const review = await Review.create(req.body);
  res.status(201).json(review);
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!review) { res.status(404); throw new Error('Review not found'); }
  res.json(review);
});

const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) { res.status(404); throw new Error('Review not found'); }
  res.json({ ok: true });
});

module.exports = { getReviews, createReview, updateReview, deleteReview };
