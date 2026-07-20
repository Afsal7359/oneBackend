import { Router } from 'express';
import { protect, userAuth, softUserAuth } from '../middleware/auth.js';
import {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  myOrders,
  myOrderDetail,
} from '../controllers/orderController.js';

const router = Router();

// User-facing
router.post('/',               userAuth, createOrder);
router.get('/my',              userAuth, myOrders);
router.get('/my/:id',          userAuth, myOrderDetail);

// Admin
router.get('/',                protect, listOrders);
router.get('/:id',             protect, getOrder);
router.patch('/:id/status',    protect, updateOrderStatus);

export default router;
