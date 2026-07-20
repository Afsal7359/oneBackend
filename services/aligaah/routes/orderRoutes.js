const router = require('express').Router();
const c = require('../controllers/orderController');
const { protect, optionalAuth, admin } = require('../middleware/auth');

router.post('/', optionalAuth, c.createOrder);
router.post('/razorpay', optionalAuth, c.createRazorpayOrder);
router.post('/verify', optionalAuth, c.verifyPayment);
router.get('/mine', protect, c.getMyOrders);
router.get('/', protect, admin, c.getOrders);
router.put('/:id/status', protect, admin, c.updateOrderStatus);

module.exports = router;
