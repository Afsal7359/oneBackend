import express from 'express';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  relatedProducts,
} from '../controllers/product.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { cache } from '../utils/responseCache.js';

const router = express.Router();

// The catalogue is the hottest path on the site and changes only when an
// admin edits something, which clears these entries on the spot.
router.get('/', cache(['Product', 'Category'], 60_000), listProducts);
router.get('/related/:id', cache(['Product'], 60_000), relatedProducts);
router.get('/:idOrSlug', cache(['Product', 'Category'], 60_000), getProduct);
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);

export default router;
