import { z } from 'zod';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Coupon from '../models/Coupon.js';
import Order from '../models/Order.js';
import { Banner, Page, Setting } from '../models/Content.js';
import { uploadBuffer, destroyImage, cloudinaryEnabled } from '../services/upload.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

/* --------------------------------------------------------------------- uploads */

export const uploadImages = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('Choose at least one image to upload');

  const folder = ['products', 'banners', 'categories', 'pages'].includes(req.body.folder)
    ? req.body.folder
    : 'products';

  const images = await Promise.all(
    req.files.map((file) => uploadBuffer(file.buffer, { folder, filename: file.originalname }))
  );

  return ok(res, { images, storage: cloudinaryEnabled ? 'cloudinary' : 'local' }, 201);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const { publicId } = z.object({ publicId: z.string().min(1) }).parse(req.body);
  await destroyImage(publicId);
  return ok(res, { message: 'Image removed' });
});

/* -------------------------------------------------------------------- products */

const imageSchema = z.object({
  url: z.string().min(1),
  publicId: z.string().optional().default(''),
  alt: z.string().optional().default(''),
});

const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name').max(140),
  cardTitle: z.string().trim().max(160).optional().or(z.literal('')),
  tagline: z.string().trim().max(200).optional().or(z.literal('')),
  description: z.string().max(8000).optional().or(z.literal('')),
  category: z.string().optional().nullable(),
  images: z.array(imageSchema).default([]),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  mrp: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  allowBackorder: z.boolean().default(false),
  packLabel: z.string().max(24).optional().or(z.literal('')),
  packValue: z.string().max(24).optional().or(z.literal('')),
  badge: z.string().max(40).optional().or(z.literal('')),
  badgeDark: z.boolean().default(false),
  offerText: z.string().max(120).optional().or(z.literal('')),
  flavour: z.string().max(80).optional().or(z.literal('')),
  specs: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  nutrition: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  ingredients: z.string().max(4000).optional().or(z.literal('')),
  allergens: z.string().max(1000).optional().or(z.literal('')),
  howToUse: z.string().max(4000).optional().or(z.literal('')),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  weightGrams: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  seoTitle: z.string().max(160).optional().or(z.literal('')),
  seoDescription: z.string().max(300).optional().or(z.literal('')),
});

export const listProductsAdmin = asyncHandler(async (req, res) => {
  const q = z
    .object({
      search: z.string().trim().optional(),
      category: z.string().optional(),
      status: z.enum(['all', 'active', 'inactive', 'low', 'out']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);

  const filter = {};
  if (q.search) filter.name = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (q.category) filter.category = q.category;
  if (q.status === 'active') filter.isActive = true;
  if (q.status === 'inactive') filter.isActive = false;
  if (q.status === 'out') filter.stock = { $lte: 0 };
  if (q.status === 'low') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return ok(res, { products, total, page: q.page, pages: Math.ceil(total / q.limit) });
});

export const getProductAdmin = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean({ virtuals: true });
  if (!product) throw ApiError.notFound('Product not found');
  return ok(res, { product });
});

export const createProduct = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  if (data.mrp < data.price) throw ApiError.badRequest('MRP cannot be lower than the selling price');
  if (!data.category) delete data.category;

  const product = await Product.create(data);
  return ok(res, { product }, 201);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const data = productSchema.partial().parse(req.body);

  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const nextPrice = data.price ?? product.price;
  const nextMrp = data.mrp ?? product.mrp;
  if (nextMrp < nextPrice) throw ApiError.badRequest('MRP cannot be lower than the selling price');

  // Clean up images that were dropped from the gallery.
  if (data.images) {
    const keep = new Set(data.images.map((i) => i.publicId).filter(Boolean));
    const orphans = product.images.filter((i) => i.publicId && !keep.has(i.publicId));
    await Promise.all(orphans.map((i) => destroyImage(i.publicId)));
  }

  if (data.category === '' || data.category === null) data.category = undefined;
  Object.assign(product, data);
  await product.save();

  return ok(res, { product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  // Keep the record if it appears in order history — deactivate instead, so
  // past invoices keep resolving.
  const ordered = await Order.exists({ 'items.product': product._id });
  if (ordered) {
    product.isActive = false;
    await product.save();
    return ok(res, { message: 'This product appears in past orders, so it was deactivated instead of deleted', deactivated: true });
  }

  await Promise.all(product.images.map((i) => destroyImage(i.publicId)));
  await product.deleteOne();
  return ok(res, { message: 'Product deleted', deactivated: false });
});

/* ------------------------------------------------------------------ categories */

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name'),
  description: z.string().max(1000).optional().or(z.literal('')),
  image: z.object({ url: z.string(), publicId: z.string().optional() }).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const listCategoriesAdmin = asyncHandler(async (_req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  return ok(res, {
    categories: categories.map((c) => ({
      ...c,
      productCount: counts.find((x) => String(x._id) === String(c._id))?.count || 0,
    })),
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(categorySchema.parse(req.body));
  return ok(res, { category }, 201);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, categorySchema.partial().parse(req.body), {
    new: true,
    runValidators: true,
  });
  if (!category) throw ApiError.notFound('Category not found');
  return ok(res, { category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = await Product.countDocuments({ category: req.params.id });
  if (inUse) throw ApiError.badRequest(`${inUse} product(s) still use this category — move them first`);

  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  return ok(res, { message: 'Category deleted' });
});

/* --------------------------------------------------------------------- coupons */

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, 'Code must be at least 3 characters')
      .max(32)
      .regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore only'),
    description: z.string().max(200).optional().or(z.literal('')),
    type: z.enum(['percent', 'flat', 'freeship']),
    value: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).default(0),
    minOrder: z.coerce.number().min(0).default(0),
    appliesTo: z.enum(['all', 'products', 'categories']).default('all'),
    products: z.array(z.string()).default([]),
    categories: z.array(z.string()).default([]),
    usageLimit: z.coerce.number().int().min(0).default(0),
    perUserLimit: z.coerce.number().int().min(0).default(1),
    firstOrderOnly: z.boolean().default(false),
    validFrom: z.string().optional().nullable(),
    validTo: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    showOnSite: z.boolean().default(false),
  })
  .refine((d) => d.type !== 'percent' || (d.value > 0 && d.value <= 100), {
    message: 'A percentage coupon needs a value between 1 and 100',
    path: ['value'],
  })
  .refine((d) => d.type !== 'flat' || d.value > 0, {
    message: 'A flat coupon needs a rupee value',
    path: ['value'],
  });

export const listCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  return ok(res, { coupons });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const data = couponSchema.parse(req.body);
  if (await Coupon.exists({ code: data.code })) throw ApiError.conflict('A coupon with that code already exists');

  const coupon = await Coupon.create({
    ...data,
    validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
    validTo: data.validTo ? new Date(data.validTo) : undefined,
  });
  return ok(res, { coupon }, 201);
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const data = couponSchema.partial().parse(req.body);
  if (data.validFrom) data.validFrom = new Date(data.validFrom);
  if (data.validTo) data.validTo = new Date(data.validTo);
  else if (data.validTo === null || data.validTo === '') data.validTo = undefined;

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return ok(res, { coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return ok(res, { message: 'Coupon deleted' });
});

/* --------------------------------------------------------------------- banners */

const bannerSchema = z.object({
  title: z.string().trim().max(140).optional().or(z.literal('')),
  image: z.object({ url: z.string().min(1, 'Upload a banner image'), publicId: z.string().optional(), alt: z.string().optional() }),
  mobileImage: z.object({ url: z.string(), publicId: z.string().optional() }).optional(),
  ctaText: z.string().max(60).optional().or(z.literal('')),
  ctaLink: z.string().max(200).optional().or(z.literal('')),
  position: z.enum(['hero', 'strip']).default('hero'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const listBanners = asyncHandler(async (_req, res) => {
  const banners = await Banner.find().sort({ position: 1, sortOrder: 1 }).lean();
  return ok(res, { banners });
});

export const createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create(bannerSchema.parse(req.body));
  return ok(res, { banner }, 201);
});

export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, bannerSchema.partial().parse(req.body), { new: true });
  if (!banner) throw ApiError.notFound('Banner not found');
  return ok(res, { banner });
});

export const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');
  await destroyImage(banner.image?.publicId);
  return ok(res, { message: 'Banner deleted' });
});

/* ----------------------------------------------------------------------- pages */

const pageSchema = z.object({
  title: z.string().trim().min(2, 'Enter a page title').max(140),
  slug: z.string().trim().max(140).optional().or(z.literal('')),
  content: z.string().max(200000).optional().or(z.literal('')),
  excerpt: z.string().max(400).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  showInFooter: z.boolean().default(true),
  footerGroup: z.string().max(40).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().default(0),
  seoTitle: z.string().max(160).optional().or(z.literal('')),
  seoDescription: z.string().max(300).optional().or(z.literal('')),
});

export const listPagesAdmin = asyncHandler(async (_req, res) => {
  const pages = await Page.find().sort({ sortOrder: 1, title: 1 }).lean();
  return ok(res, { pages });
});

export const getPageAdmin = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id).lean();
  if (!page) throw ApiError.notFound('Page not found');
  return ok(res, { page });
});

export const createPage = asyncHandler(async (req, res) => {
  const page = await Page.create(pageSchema.parse(req.body));
  return ok(res, { page }, 201);
});

export const updatePage = asyncHandler(async (req, res) => {
  const data = pageSchema.partial().parse(req.body);
  const page = await Page.findById(req.params.id);
  if (!page) throw ApiError.notFound('Page not found');

  Object.assign(page, data);
  await page.save();
  return ok(res, { page });
});

export const deletePage = asyncHandler(async (req, res) => {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) throw ApiError.notFound('Page not found');
  return ok(res, { message: 'Page deleted' });
});

/* -------------------------------------------------------------------- settings */

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Setting.getGlobal();
  return ok(res, { settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const schema = z.object({
    siteName: z.string().max(80).optional(),
    tagline: z.string().max(140).optional(),
    logoText: z.string().max(40).optional(),
    tickerItems: z.array(z.string().max(140)).max(12).optional(),
    advantages: z.array(z.object({ title: z.string(), text: z.string(), icon: z.string().optional() })).optional(),
    story: z
      .object({
        eyebrow: z.string().optional(),
        heading: z.string().optional(),
        body: z.string().optional(),
        points: z.array(z.string()).optional(),
        image: z.object({ url: z.string(), publicId: z.string().optional() }).optional(),
      })
      .optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    knowMore: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    socials: z.object({ instagram: z.string().optional(), youtube: z.string().optional(), email: z.string().optional() }).optional(),
    contact: z
      .object({
        ordersEmail: z.string().optional(),
        supportEmail: z.string().optional(),
        phone: z.string().optional(),
        hours: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
    shipping: z
      .object({
        freeAbove: z.coerce.number().min(0).optional(),
        fee: z.coerce.number().min(0).optional(),
        codEnabled: z.boolean().optional(),
        codFee: z.coerce.number().min(0).optional(),
        codMaxOrder: z.coerce.number().min(0).optional(),
        prepaidDiscountPct: z.coerce.number().min(0).max(50).optional(),
        etaMetro: z.string().optional(),
        etaRest: z.string().optional(),
      })
      .optional(),
    payments: z.object({ razorpayEnabled: z.boolean().optional(), methods: z.array(z.string()).optional() }).optional(),
  });

  const data = schema.parse(req.body);
  const settings = await Setting.getGlobal();

  // Merge nested objects rather than replacing them wholesale.
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (Array.isArray(value) || typeof value !== 'object') settings[key] = value;
    else settings[key] = { ...(settings[key]?.toObject?.() ?? settings[key] ?? {}), ...value };
  }

  await settings.save();
  return ok(res, { settings });
});
