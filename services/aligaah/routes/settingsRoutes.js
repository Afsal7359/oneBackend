const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, admin } = require('../middleware/auth');
const { cache } = require('../utils/responseCache');

// Settings are read on every single page render and change a few times a year.
router.get('/', cache(['Settings'], 300_000), c.getSettings);
router.put('/', protect, admin, c.updateSettings);

module.exports = router;
