import { Router } from 'express';
import { track } from '../controllers/analyticsController.js';

const router = Router();

router.post('/', track);

export default router;
