import express from 'express';
import {
  createOrder,
  verifyPayment,
  myOrders,
  getOrder,
  updateStatus,
  listAllOrders,
} from '../controllers/order.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', protect, admin, listAllOrders);
router.get('/my', protect, myOrders);
router.get('/:id', protect, getOrder);
router.post('/', protect, createOrder);
router.post('/verify-payment', protect, verifyPayment);
router.put('/:id/status', protect, admin, updateStatus);

export default router;
