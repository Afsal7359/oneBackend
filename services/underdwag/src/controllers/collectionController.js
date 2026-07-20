import asyncHandler from 'express-async-handler';
import Collection from '../models/Collection.js';
import Product from '../models/Product.js';

const withInStock = (p) => ({
  ...p,
  inStock: (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0) > 0,
});

export const listCollections = asyncHandler(async (req, res) => {
  const { featured, active = 'true' } = req.query;
  const filter = {};
  if (active === 'true') filter.isActive = true;
  if (featured === 'true') filter.isFeatured = true;
  const items = await Collection.find(filter).sort({ order: 1, createdAt: -1 }).lean();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ items });
});

export const getCollection = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isId = idOrSlug.match(/^[0-9a-fA-F]{24}$/);
  const collection = await Collection.findOne(isId ? { _id: idOrSlug } : { slug: idOrSlug }).lean();
  if (!collection) {
    res.status(404);
    throw new Error('Collection not found');
  }
  const products = await Product.find({ collections: collection._id, status: 'active' })
    .sort('-createdAt').limit(60).lean();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ collection, products: products.map(withInStock) });
});

export const createCollection = asyncHandler(async (req, res) => {
  const col = await Collection.create(req.body);
  res.status(201).json(col);
});

export const updateCollection = asyncHandler(async (req, res) => {
  const col = await Collection.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!col) {
    res.status(404);
    throw new Error('Collection not found');
  }
  res.json(col);
});

export const deleteCollection = asyncHandler(async (req, res) => {
  const col = await Collection.findByIdAndDelete(req.params.id);
  if (!col) {
    res.status(404);
    throw new Error('Collection not found');
  }
  res.json({ message: 'Collection deleted' });
});
