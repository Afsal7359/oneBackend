import { z } from 'zod';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Review from '../models/Review.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

const SORTS = {
  featured: { sortOrder: 1, createdAt: -1 },
  newest: { createdAt: -1 },
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  rating: { ratingAvg: -1, ratingCount: -1 },
  popular: { soldCount: -1 },
};

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(Object.keys(SORTS)).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  featured: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
});

export const listProducts = asyncHandler(async (req, res) => {
  const { q, category, minPrice, maxPrice, sort, page, limit, featured, inStock } =
    req.validatedQuery || listQuerySchema.parse(req.query);

  const filter = { isActive: true };

  if (q) filter.$text = { $search: q };
  if (featured) filter.isFeatured = true;
  if (inStock) filter.stock = { $gt: 0 };

  if (category) {
    const cat = await Category.findOne({ slug: category, isActive: true }).select('_id');
    if (!cat) return ok(res, { products: [], total: 0, page, pages: 0 });
    filter.category = cat._id;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return ok(res, {
    products,
    total,
    page,
    pages: Math.ceil(total / limit) || 0,
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug')
    .lean({ virtuals: true });

  if (!product) throw ApiError.notFound('We could not find that product');

  const [related, reviews] = await Promise.all([
    Product.find({
      _id: { $ne: product._id },
      isActive: true,
      ...(product.category ? { category: product.category._id } : {}),
    })
      .sort({ sortOrder: 1 })
      .limit(4)
      .lean({ virtuals: true }),
    Review.find({ product: product._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  // If the category had too few siblings, top up with anything else active.
  let relatedList = related;
  if (relatedList.length < 4) {
    const extra = await Product.find({
      _id: { $ne: product._id, $nin: relatedList.map((r) => r._id) },
      isActive: true,
    })
      .sort({ sortOrder: 1 })
      .limit(4 - relatedList.length)
      .lean({ virtuals: true });
    relatedList = [...relatedList, ...extra];
  }

  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return ok(res, { product, related: relatedList, reviews, ratingBreakdown: breakdown });
});

/** Lightweight payload for the home page: hero products + counts. */
export const getStorefront = asyncHandler(async (_req, res) => {
  const products = await Product.find({ isActive: true })
    .populate('category', 'name slug')
    .sort({ sortOrder: 1, createdAt: -1 })
    .limit(12)
    .lean({ virtuals: true });

  return ok(res, { products });
});

export const searchSuggest = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return ok(res, { products: [] });

  const products = await Product.find({
    isActive: true,
    name: { $regex: q, $options: 'i' },
  })
    .select('name slug images price mrp')
    .limit(6)
    .lean({ virtuals: true });

  return ok(res, { products });
});
