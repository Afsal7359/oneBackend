const router = require('express').Router();
const c = require('../controllers/couponController');
const { protect, admin } = require('../middleware/auth');

router.post('/validate', c.validateCoupon);
router.get('/', protect, admin, c.getCoupons);
router.post('/', protect, admin, c.createCoupon);
router.put('/:id', protect, admin, c.updateCoupon);
router.delete('/:id', protect, admin, c.deleteCoupon);

module.exports = router;
