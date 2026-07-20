import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../controllers/collectionController.js';

const router = Router();

router.get('/', listCollections);
router.get('/:idOrSlug', getCollection);
router.post('/', protect, createCollection);
router.put('/:id', protect, updateCollection);
router.delete('/:id', protect, deleteCollection);

export default router;
