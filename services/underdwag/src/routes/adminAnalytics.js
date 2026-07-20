import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getSummary,
  getTimeline,
  getPages,
  getSources,
  getDevices,
  getLocations,
  getClicks,
  getSections,
  getFunnel,
  getSessions,
  getSessionDetail,
} from '../controllers/analyticsController.js';

const router = Router();

router.use(protect);

router.get('/summary',          getSummary);
router.get('/timeline',         getTimeline);
router.get('/pages',            getPages);
router.get('/sources',          getSources);
router.get('/devices',          getDevices);
router.get('/locations',        getLocations);
router.get('/clicks',           getClicks);
router.get('/sections',         getSections);
router.get('/funnel',           getFunnel);
router.get('/sessions',         getSessions);
router.get('/sessions/:sid',    getSessionDetail);

export default router;
