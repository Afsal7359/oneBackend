import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { cache } from '../utils/responseCache.js';
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../controllers/collectionController.js';

const router = Router();

router.get('/', cache(['Collection', 'Product'], 60_000), listCollections);
router.get('/:idOrSlug', cache(['Collection', 'Product'], 60_000), getCollection);
router.post('/', protect, createCollection);
router.put('/:id', protect, updateCollection);
router.delete('/:id', protect, deleteCollection);

export default router;
