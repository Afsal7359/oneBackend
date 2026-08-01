const router = require('express').Router();
const multer = require('multer');
const c = require('../controllers/uploadController');
const { protect, admin } = require('../middleware/auth');

// The cap matches Cloudinary's own 10MB image limit. It used to be 15MB, so
// files between 10 and 15MB sailed past multer only to be rejected upstream
// with an unhelpful error after a long wait.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: c.MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype || '')) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  },
});

// Multer throws before the controller runs, so its errors need translating here
// or they surface as a bare 500 with a stack trace.
const handleUpload = (req, res, next) =>
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413);
      return next(new Error('Image is larger than 10MB. Please compress it or pick a smaller file.'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400);
      return next(new Error('That file is not an image. Upload a JPG, PNG or WebP.'));
    }
    res.status(400);
    return next(new Error(err.message || 'Could not read the uploaded file'));
  });

router.post('/', protect, admin, handleUpload, c.uploadImage);
router.delete('/', protect, admin, c.deleteImage);

module.exports = router;
