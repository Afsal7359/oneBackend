import express from 'express';
import {
  listBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
} from '../controllers/blog.controller.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { cache } from '../utils/responseCache.js';

const router = express.Router();

router.get('/', cache(['Blog'], 120_000), listBlogs);
router.get('/:slug', cache(['Blog'], 120_000), getBlog);
router.post('/', protect, admin, createBlog);
router.put('/:id', protect, admin, updateBlog);
router.delete('/:id', protect, admin, deleteBlog);

export default router;
