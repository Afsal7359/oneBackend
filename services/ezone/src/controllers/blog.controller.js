import asyncHandler from 'express-async-handler';
import Blog from '../models/Blog.js';

export const listBlogs = asyncHandler(async (req, res) => {
  const { q, tag, page = 1, limit = 10, admin } = req.query;
  const filter = admin === 'true' ? {} : { isPublished: true };
  if (q) filter.title = new RegExp(q, 'i');
  if (tag) filter.tags = tag;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Blog.find(filter)
      .select('title slug excerpt coverImage tags publishedAt createdAt views isPublished')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Blog.countDocuments(filter),
  ]);
  if (!filter.admin) res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

export const getBlog = asyncHandler(async (req, res) => {
  const b = await Blog.findOneAndUpdate(
    { slug: req.params.slug },
    { $inc: { views: 1 } },
    { new: true }
  );
  if (!b) {
    res.status(404);
    throw new Error('Post not found');
  }
  res.json({ success: true, blog: b });
});

export const createBlog = asyncHandler(async (req, res) => {
  const b = await Blog.create({
    ...req.body,
    author: req.user._id,
    authorName: req.user.name,
  });
  res.status(201).json({ success: true, blog: b });
});

export const updateBlog = asyncHandler(async (req, res) => {
  const b = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!b) {
    res.status(404);
    throw new Error('Post not found');
  }
  res.json({ success: true, blog: b });
});

export const deleteBlog = asyncHandler(async (req, res) => {
  await Blog.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
