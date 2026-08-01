const router = require('express').Router();
const c = require('../controllers/productController');
const { protect, admin } = require('../middleware/auth');
const { cache } = require('../utils/responseCache');

// Catalogue reads are the hottest endpoints on the site and change only when
// an admin edits something — which clears these entries instantly.
router.get('/', cache(['Product', 'Category'], 60_000), c.getProducts);
router.post('/', protect, admin, c.createProduct);
router.get('/:id', cache(['Product', 'Category'], 60_000), c.getProduct);
router.put('/:id', protect, admin, c.updateProduct);
router.delete('/:id', protect, admin, c.deleteProduct);

module.exports = router;
