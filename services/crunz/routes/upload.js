const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminAuth = require('../middleware/adminAuth');
const { v2: cloudinary } = require('cloudinary');

const HAS_CLOUDINARY = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (HAS_CLOUDINARY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Folder names the admin panel is allowed to target on Cloudinary.
const ALLOWED_FOLDERS = ['crunz/banners', 'crunz/products', 'crunz/images'];
function safeFolder(folder) {
  return ALLOWED_FOLDERS.includes(folder) ? folder : 'crunz/images';
}

function diskStorage(subdir = '') {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'uploads', subdir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, unique + path.extname(file.originalname).toLowerCase());
    }
  });
}

// ── Image upload → Cloudinary (10 MB, images only) ────────────────────
// Files are held in memory and streamed straight to Cloudinary so nothing
// is written to the server disk. If Cloudinary env vars are missing we fall
// back to local disk so local development still works.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files allowed (jpg, png, webp, gif, avif)'));
  }
});

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Deliver through Cloudinary's auto format/quality so banners load fast
// (https://res.cloudinary.com/x/image/upload/f_auto,q_auto/v123/crunz/banners/y.jpg)
function optimizedUrl(secureUrl) {
  return secureUrl.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

router.post('/', adminAuth, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const folder = safeFolder(req.body.folder || req.query.folder);

  if (HAS_CLOUDINARY) {
    try {
      const result = await uploadBufferToCloudinary(req.file.buffer, folder);
      return res.json({
        url: optimizedUrl(result.secure_url),
        publicId: result.public_id,
        filename: result.public_id,
        storage: 'cloudinary',
      });
    } catch (err) {
      console.error('[upload] Cloudinary image upload failed:', err.message);
      return res.status(502).json({ message: `Cloudinary upload failed: ${err.message}` });
    }
  }

  // ── Fallback: write to local disk (Cloudinary not configured) ───────
  const dir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname).toLowerCase()}`;
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);

  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  res.json({
    url: `${backendUrl}/uploads/${filename}`,
    filename,
    storage: 'local',
  });
});

// ── Video upload (25 MB, video only) ──────────────────────────────────
const videoUpload = multer({
  storage: diskStorage('videos'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only video files allowed (mp4, webm, mov, avi, mkv)'));
  }
});

router.post('/video', adminAuth, videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  res.json({
    url: `${backendUrl}/uploads/videos/${req.file.filename}`,
    filename: req.file.filename
  });
});

// ── Delete a video file by filename ──────────────────────────────────
router.delete('/video/:filename', adminAuth, (req, res) => {
  const { filename } = req.params;
  // Only allow safe filenames — no path traversal
  if (!filename || /[/\\]/.test(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  const filePath = path.join(__dirname, '..', 'uploads', 'videos', filename);
  if (!fs.existsSync(filePath)) {
    return res.json({ message: 'File not found (already deleted)' });
  }
  fs.unlink(filePath, err => {
    if (err) return res.status(500).json({ message: 'Failed to delete file' });
    res.json({ message: 'Deleted' });
  });
});

// ── Delete a Cloudinary asset by public_id ────────────────────────────
// resourceType: 'image' (default) | 'video'
router.delete('/cloudinary', adminAuth, async (req, res) => {
  const { publicId } = req.body;
  const resourceType = req.body.resourceType === 'video' ? 'video' : 'image';
  if (!publicId) return res.status(400).json({ message: 'publicId is required' });

  if (!HAS_CLOUDINARY) {
    return res.status(501).json({ message: 'Cloudinary not configured on server' });
  }

  const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  if (result.result === 'ok' || result.result === 'not found') {
    return res.json({ message: 'Deleted', result: result.result });
  }
  res.status(500).json({ message: 'Cloudinary deletion failed', result: result.result });
});

// ── Is Cloudinary available? (admin panel shows a warning if not) ─────
router.get('/config', adminAuth, (req, res) => {
  res.json({ cloudinary: HAS_CLOUDINARY });
});

module.exports = router;
