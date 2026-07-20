import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { login, me } from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { updateSettings } from '../controllers/settingsController.js';

const router = Router();

router.post('/login', login);
router.get('/me', protect, me);
router.put('/settings', protect, updateSettings);

// Direct-upload signature — browser uploads straight to Cloudinary, no double-hop
router.get('/upload-signature', protect, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder: 'underdawg', timestamp };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  res.json({
    signature,
    timestamp,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    folder: 'underdawg',
  });
});

// Legacy upload endpoint (kept for backward compat)
router.post('/upload', protect, upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded' });
  }
  const urls = req.files.map((f) => f.path);
  res.json({ urls });
});

export default router;
