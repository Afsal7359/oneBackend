import { Router } from 'express';
import { getSettings } from '../controllers/settingsController.js';

const router = Router();
router.get('/', getSettings);

export default router;
