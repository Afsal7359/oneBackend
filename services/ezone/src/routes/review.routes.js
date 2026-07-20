import express from 'express';
import {
  listProductReviews,
  createReview,
  canReviewProduct,
  deleteReview,
  adminListReviews,
  adminCreateReview,
  adminUpdateReview,
} from '../controllers/review.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public
router.get('/product/:productId', listProductReviews);

// Customer (protected)
router.get('/can-review/:productId', protect, canReviewProduct);
router.post('/', protect, createReview);
router.delete('/:id', protect, deleteReview);

// Admin
router.get('/admin/product/:productId', protect, admin, adminListReviews);
router.post('/admin', protect, admin, adminCreateReview);
router.put('/admin/:id', protect, admin, adminUpdateReview);

export default router;
