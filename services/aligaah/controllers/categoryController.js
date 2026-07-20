const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const Product = require('../models/Product');

// @route GET /api/categories  (public) — with live product counts
const getCategories = asyncHandler(async (req, res) => {
  const filter = req.query.all ? {} : { isActive: true };
  const cats = await Category.find(filter).sort({ order: 1, createdAt: 1 }).lean();
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  const withCounts = cats.map((c) => ({ ...c, count: map[String(c._id)] || 0 }));
  res.json(withCounts);
});

// @route GET /api/categories/:slug (public)
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const cat = await Category.findOne({ slug: req.params.slug });
  if (!cat) { res.status(404); throw new Error('Category not found'); }
  res.json(cat);
});

// @route POST /api/categories (admin)
const createCategory = asyncHandler(async (req, res) => {
  const cat = await Category.create(req.body);
  res.status(201).json(cat);
});

// @route PUT /api/categories/:id (admin)
const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cat) { res.status(404); throw new Error('Category not found'); }
  // keep denormalized categoryName in products in sync
  await Product.updateMany({ category: cat._id }, { categoryName: cat.name });
  res.json(cat);
});

// @route DELETE /api/categories/:id (admin)
const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) { res.status(404); throw new Error('Category not found'); }
  const count = await Product.countDocuments({ category: cat._id });
  if (count > 0) { res.status(400); throw new Error(`Cannot delete: ${count} products use this category`); }
  await cat.deleteOne();
  res.json({ ok: true });
});

module.exports = { getCategories, getCategoryBySlug, createCategory, updateCategory, deleteCategory };
