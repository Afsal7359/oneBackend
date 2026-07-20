import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

export const listCategories = asyncHandler(async (req, res) => {
  const filter = req.query.active === 'true' ? { isActive: true } : {};

  // Run categories fetch and product counts in parallel
  const [items, counts] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  const withCount = items.map((c) => ({ ...c, productCount: map[String(c._id)] || 0 }));

  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, items: withCount });
});

export const getCategory = asyncHandler(async (req, res) => {
  const key = req.params.idOrSlug;
  const isObjectId = /^[0-9a-f]{24}$/i.test(key);
  const category = await Category.findOne(
    isObjectId ? { _id: key } : { slug: key }
  ).lean();
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }
  res.json({ success: true, category });
});

export const createCategory = asyncHandler(async (req, res) => {
  const cat = await Category.create(req.body);
  res.status(201).json({ success: true, category: cat });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!cat) {
    res.status(404);
    throw new Error('Category not found');
  }
  res.json({ success: true, category: cat });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (!cat) {
    res.status(404);
    throw new Error('Category not found');
  }
  res.json({ success: true, message: 'Category deleted' });
});
