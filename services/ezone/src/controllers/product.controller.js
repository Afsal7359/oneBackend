import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

// Fields returned in list views
const LIST_PROJECT = {
  name: 1, slug: 1, brand: 1, images: 1,
  price: 1, comparePrice: 1, discountPercent: 1,
  rating: 1, numReviews: 1,
  stock: 1, lowStockThreshold: 1,
  isFeatured: 1, isNewArrival: 1, isBestSeller: 1,
  sold: 1, returnDays: 1, category: 1, variants: 1,
};

// @route GET /api/products
export const listProducts = asyncHandler(async (req, res) => {
  const {
    q, category, brand, minPrice, maxPrice, rating,
    featured, newArrival, bestSeller,
    sort = 'newest', page = 1, limit = 20, onlyActive = 'true',
  } = req.query;

  /* ── Build filter ──────────────────────────────────────── */
  const filter = {};
  if (onlyActive === 'true') filter.isActive = true;
  if (q) filter.$text = { $search: q };

  if (category) {
    if (/^[0-9a-f]{24}$/i.test(category)) {
      // ID passed directly (frontend optimization) — zero extra lookup
      filter.category = new mongoose.Types.ObjectId(category);
    } else {
      // Slug passed — one fast indexed lookup
      const cat = await Category.findOne({ slug: category }, '_id').lean();
      if (!cat) {
        return res.json({ success: true, items: [], total: 0, page: 1, pages: 0 });
      }
      filter.category = cat._id;
    }
  }

  if (brand) filter.brand = new RegExp(`^${brand}$`, 'i');
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (rating)            filter.rating      = { $gte: Number(rating) };
  if (featured    === 'true') filter.isFeatured   = true;
  if (newArrival  === 'true') filter.isNewArrival  = true;
  if (bestSeller  === 'true') filter.isBestSeller  = true;

  const sortMap = {
    priceAsc:  { price: 1 },
    priceDesc: { price: -1 },
    newest:    { createdAt: -1 },
    popular:   { sold: -1 },
    rating:    { rating: -1 },
  };
  const sortObj = sortMap[sort] || { createdAt: -1 };
  const skip = (Number(page) - 1) * Number(limit);
  const lim  = Number(limit);

  /* ── Single aggregation: match → sort → facet(items + count) ──
     Replaces 3 separate queries (find + countDocuments + populate)
     MongoDB uses compound indexes for $match + $sort.
  ─────────────────────────────────────────────────────────────── */
  const [result] = await Product.aggregate([
    { $match: filter },
    { $sort: sortObj },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: lim },
          { $project: LIST_PROJECT },
          {
            $lookup: {
              from: 'categories',
              localField: 'category',
              foreignField: '_id',
              as: '_cat',
              pipeline: [{ $project: { name: 1, slug: 1 } }],
            },
          },
          { $addFields: { category: { $arrayElemAt: ['$_cat', 0] } } },
          { $project: { _cat: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const items = result?.items || [];
  const total = result?.total?.[0]?.n || 0;

  if (onlyActive === 'true') {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }

  res.json({
    success: true,
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / lim) || 0,
  });
});

// @route GET /api/products/:idOrSlug
export const getProduct = asyncHandler(async (req, res) => {
  const key = req.params.idOrSlug;
  const isObjectId = /^[0-9a-f]{24}$/i.test(key);
  const product = await Product.findOne(isObjectId ? { _id: key } : { slug: key })
    .select('-__v')
    .populate('category', 'name slug')
    .lean();

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, product });
});

// @route POST /api/products  (admin)
export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ success: true, product });
});

// @route PUT /api/products/:id  (admin)
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json({ success: true, product });
});

// @route DELETE /api/products/:id  (admin)
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json({ success: true, message: 'Product deleted' });
});

// @route GET /api/products/related/:id
export const relatedProducts = asyncHandler(async (req, res) => {
  const p = await Product.findById(req.params.id, 'category').lean();
  if (!p) return res.json({ success: true, items: [] });

  const items = await Product.find(
    { _id: { $ne: p._id }, category: p.category, isActive: true },
  )
    .select('name slug brand images price comparePrice discountPercent rating numReviews stock lowStockThreshold sold returnDays category variants')
    .populate('category', 'name slug')
    .limit(8)
    .lean();

  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.json({ success: true, items });
});
