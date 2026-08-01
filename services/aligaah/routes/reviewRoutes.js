const router = require('express').Router();
const c = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/auth');
const { cache } = require('../utils/responseCache');

router.get('/', cache(['Review'], 120_000), c.getReviews);
router.post('/', protect, admin, c.createReview);
router.put('/:id', protect, admin, c.updateReview);
router.delete('/:id', protect, admin, c.deleteReview);

module.exports = router;
