const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, admin } = require('../middleware/auth');

router.get('/', c.getSettings);
router.put('/', protect, admin, c.updateSettings);

module.exports = router;
