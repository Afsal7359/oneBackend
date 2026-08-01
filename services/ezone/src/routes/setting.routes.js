import express from 'express';
import { getSettings, updateSettings } from '../controllers/setting.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { cache } from '../utils/responseCache.js';

const router = express.Router();

// Fetched on every page render, edited a few times a year.
router.get('/', cache(['Setting'], 300_000), getSettings);
router.put('/', protect, admin, updateSettings);

export default router;
