const router = require('express').Router();
const c = require('../controllers/productController');
const { protect, admin } = require('../middleware/auth');

router.get('/', c.getProducts);
router.post('/', protect, admin, c.createProduct);
router.get('/:id', c.getProduct);
router.put('/:id', protect, admin, c.updateProduct);
router.delete('/:id', protect, admin, c.deleteProduct);

module.exports = router;
