const router = require('express').Router();
const c = require('../controllers/analyticsController');
const { protect, admin } = require('../middleware/auth');

router.post('/track', c.track);            // public
router.get('/overview', protect, admin, c.overview);
router.get('/visits-daily', protect, admin, c.visitsDaily);
router.get('/top-products', protect, admin, c.topProducts);
router.get('/top-screens', protect, admin, c.topScreens);

module.exports = router;
