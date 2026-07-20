const router = require('express').Router();
const c = require('../controllers/categoryController');
const { protect, admin } = require('../middleware/auth');

router.get('/', c.getCategories);
router.post('/', protect, admin, c.createCategory);
router.get('/:slug', c.getCategoryBySlug);
router.put('/:id', protect, admin, c.updateCategory);
router.delete('/:id', protect, admin, c.deleteCategory);

module.exports = router;
