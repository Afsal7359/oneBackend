const router = require('express').Router();
const c = require('../controllers/enquiryController');
const { protect, admin } = require('../middleware/auth');

// Public: anyone can send a message. Not cached — it is a write, and the admin
// list below must never be served from a shared cache.
router.post('/', c.createEnquiry);

router.get('/', protect, admin, c.getEnquiries);
router.put('/:id', protect, admin, c.updateEnquiry);
router.delete('/:id', protect, admin, c.deleteEnquiry);

module.exports = router;
