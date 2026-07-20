import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listProducts,
  getProduct,
  categoryImages,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';

const router = Router();

router.get('/category-images', categoryImages);
router.get('/', listProducts);
router.get('/:idOrSlug', getProduct);
router.post('/', protect, createProduct);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);

export default router;
