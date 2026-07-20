const router = require('express').Router();
const multer = require('multer');
const c = require('../controllers/uploadController');
const { protect, admin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/', protect, admin, upload.single('image'), c.uploadImage);
router.delete('/', protect, admin, c.deleteImage);

module.exports = router;
