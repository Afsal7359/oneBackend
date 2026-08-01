const router = require('express').Router();
const c = require('../controllers/bannerController');
const { protect, admin } = require('../middleware/auth');
const { cache } = require('../utils/responseCache');

router.get('/', cache(['Banner'], 120_000), c.getBanners);
router.post('/', protect, admin, c.createBanner);
router.put('/:id', protect, admin, c.updateBanner);
router.delete('/:id', protect, admin, c.deleteBanner);

module.exports = router;
