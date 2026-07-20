import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import Collection from '../models/Collection.js';

// .lean() returns plain objects without Mongoose virtuals — recompute inStock.
const withInStock = (p) => ({
  ...p,
  inStock: (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0) > 0,
});

export const listProducts = asyncHandler(async (req, res) => {
  const {
    q,
    category,
    collection,
    collectionSlug,
    minPrice,
    maxPrice,
    featured,
    isNew,
    status = 'active',
    sort = '-createdAt',
    page = 1,
    limit = 24,
  } = req.query;

  // `status=all` returns every product regardless of state — the admin panel
  // needs this so drafts/archived items aren't invisible there (the storefront
  // keeps the default 'active' filter).
  const filter = {};
  if (status && status !== 'all') filter.status = status;

  // Match the barcode as well as the title so admins can search by scan.
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { barcode: { $regex: `^${String(q).replace(/[^\w-]/g, '')}`, $options: 'i' } },
    ];
  }
  if (category) filter.category = category;
  if (collection) filter.collections = collection;
  if (collectionSlug) {
    const col = await Collection.findOne({ slug: collectionSlug });
    if (col) filter.collections = col._id;
    else filter.collections = null; // no results
  }
  if (featured === 'true') filter.isFeatured = true;
  if (isNew === 'true') filter.isNew = true;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [rawItems, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(Number(limit))
      .populate('collections', 'title slug').lean(),
    Product.countDocuments(filter),
  ]);

  // .lean() skips virtuals — recompute inStock the frontend relies on.
  const items = rawItems.map(withInStock);

  // Only the public 'active' listing is safe to cache publicly — admin views
  // that include drafts/archived items must never land in a shared cache.
  if (!status || status === 'active') {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  } else {
    res.set('Cache-Control', 'no-store');
  }
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

export const getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isId = idOrSlug.match(/^[0-9a-fA-F]{24}$/);
  const product = await Product.findOne(isId ? { _id: idOrSlug } : { slug: idOrSlug })
    .populate('collections', 'title slug')
    .populate('relatedProducts', 'title slug images price compareAtPrice category isNew')
    .lean();
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // If no related products set, fall back to same-category products
  let related = product.relatedProducts || [];
  if (related.length === 0) {
    related = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      status: 'active',
    }).limit(8).select('title slug images price compareAtPrice category isNew').lean();
  }

  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json({ ...withInStock(product), relatedProducts: related });
});

// GET /api/products/category-images — one representative image per category
export const categoryImages = asyncHandler(async (req, res) => {
  const CATS = ['tshirts','hoodies','jackets','shirts','sweatshirts','polos','pants','shorts','caps','bags','other'];
  const results = await Promise.all(
    CATS.map(async (cat) => {
      const p = await Product.findOne({ category: cat, status: 'active', 'images.0': { $exists: true } })
        .sort({ isFeatured: -1, createdAt: -1 })
        .select('images')
        .lean();
      return { category: cat, image: p?.images?.[0] || '' };
    })
  );
  // Return as a map { tshirts: "url", ... }
  const map = {};
  results.forEach(({ category, image }) => { map[category] = image; });
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.json(map);
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json({ message: 'Product deleted' });
});
