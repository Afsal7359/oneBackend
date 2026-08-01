import { Router } from 'express';
import { getSettings } from '../controllers/settingsController.js';
import { cache } from '../utils/responseCache.js';

const router = Router();
// Read on every page render, changed a handful of times a year.
router.get('/', cache(['SiteSettings'], 300_000), getSettings);

export default router;
