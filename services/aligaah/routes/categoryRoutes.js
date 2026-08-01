const router = require('express').Router();
const c = require('../controllers/categoryController');
const { protect, admin } = require('../middleware/auth');
const { cache } = require('../utils/responseCache');

router.get('/', cache(['Category', 'Product'], 60_000), c.getCategories);
router.post('/', protect, admin, c.createCategory);
router.get('/:slug', cache(['Category'], 60_000), c.getCategoryBySlug);
router.put('/:id', protect, admin, c.updateCategory);
router.delete('/:id', protect, admin, c.deleteCategory);

module.exports = router;
