import express from 'express';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { cache } from '../utils/responseCache.js';

const router = express.Router();

router.get('/', cache(['Category', 'Product'], 60_000), listCategories);
router.get('/:idOrSlug', cache(['Category'], 60_000), getCategory);
router.post('/', protect, admin, createCategory);
router.put('/:id', protect, admin, updateCategory);
router.delete('/:id', protect, admin, deleteCategory);

export default router;
