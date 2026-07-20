import express from 'express';
import { dashboardStats } from '../controllers/admin.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/stats', protect, admin, dashboardStats);

export default router;
