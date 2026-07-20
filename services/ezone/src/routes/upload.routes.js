import express from 'express';
import { upload, buildFileUrl } from '../middleware/upload.middleware.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/single', protect, admin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  res.json({ success: true, url: buildFileUrl(req, req.file) });
});

router.post('/multiple', protect, admin, upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files' });
  res.json({ success: true, urls: req.files.map((f) => buildFileUrl(req, f)) });
});

export default router;
