const router = require('express').Router();
const c = require('../controllers/bannerController');
const { protect, admin } = require('../middleware/auth');

router.get('/', c.getBanners);
router.post('/', protect, admin, c.createBanner);
router.put('/:id', protect, admin, c.updateBanner);
router.delete('/:id', protect, admin, c.deleteBanner);

module.exports = router;
