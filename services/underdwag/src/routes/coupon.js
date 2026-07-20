import express from 'express';
import { validateCoupon, listCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon } from '../controllers/couponController.js';
import { protect } from '../middleware/auth.js';
import { softUserAuth } from '../middleware/auth.js';

const router = express.Router();

// Public (with optional user identification)
router.post('/validate', softUserAuth, validateCoupon);

// Admin
router.get('/',      protect, listCoupons);
router.get('/:id',   protect, getCoupon);
router.post('/',     protect, createCoupon);
router.put('/:id',   protect, updateCoupon);
router.delete('/:id',protect, deleteCoupon);

export default router;
