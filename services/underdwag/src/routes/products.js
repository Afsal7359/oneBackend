import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { cache } from '../utils/responseCache.js';
import {
  listProducts,
  getProduct,
  categoryImages,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';

const router = Router();

// Catalogue reads dominate traffic and only change when an admin edits
// something, which clears these entries on the spot.
router.get('/category-images', cache(['Product'], 300_000), categoryImages);
router.get('/', cache(['Product', 'Collection'], 60_000), listProducts);
router.get('/:idOrSlug', cache(['Product', 'Collection'], 60_000), getProduct);
router.post('/', protect, createProduct);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);

export default router;
