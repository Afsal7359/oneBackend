const router = require('express').Router();
const c = require('../controllers/orderController');
const { protect, optionalAuth, admin } = require('../middleware/auth');

// Public: the cart needs a shipping figure before there is an order.
router.post('/quote', c.quote);

router.post('/', optionalAuth, c.createOrder);
router.post('/razorpay', optionalAuth, c.createRazorpayOrder);
router.post('/razorpay/failed', c.markPaymentFailed);
router.post('/razorpay/webhook', c.razorpayWebhook); // Razorpay -> us; signed, no auth
router.post('/verify', optionalAuth, c.verifyPayment);
router.get('/mine', protect, c.getMyOrders);
router.get('/', protect, admin, c.getOrders);
router.put('/:id/status', protect, admin, c.updateOrderStatus);

module.exports = router;
