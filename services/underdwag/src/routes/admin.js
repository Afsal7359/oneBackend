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
// The multer callback is wrapped so a rejected file reports WHY (size / type)
// instead of falling through to the generic 500 handler.
router.post(
  '/upload',
  protect,
  (req, res, next) => {
    upload.array('files', 10)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Image is larger than 5 MB after compression. Please use a smaller file.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Too many files — 10 per upload.' });
      }
      return res.status(400).json({ message: err.message || 'Upload failed' });
    });
  },
  (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    const urls = req.files.map((f) => f.path);
    res.json({ urls });
  }
);

export default router;
