const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Visit = require('../models/Visit');

// @route GET /api/products (public)
// query: category(slug), tag(featured|best|new), q(search), sort, page, limit, all(admin)
const getProducts = asyncHandler(async (req, res) => {
  const { category, tag, q, sort, page = 1, limit = 24, all } = req.query;
  const filter = {};
  if (!all) filter.isActive = true;

  if (category) {
    const cat = await Category.findOne({ slug: category });
    if (cat) filter.category = cat._id;
    else return res.json({ products: [], total: 0, page: 1, pages: 0 });
  }
  if (tag === 'featured') filter.isFeatured = true;
  if (tag === 'best') filter.isBestSeller = true;
  if (tag === 'new') filter.isNewArrival = true;
  if (q) filter.$or = [
    { title: { $regex: q, $options: 'i' } },
    { code: { $regex: q, $options: 'i' } },
    { categoryName: { $regex: q, $options: 'i' } },
  ];

  let sortBy = { createdAt: -1 };
  if (sort === 'price_asc') sortBy = { price: 1 };
  if (sort === 'price_desc') sortBy = { price: -1 };
  if (sort === 'popular') sortBy = { views: -1 };
  if (sort === 'bestselling') sortBy = { sales: -1 };

  const lim = Math.min(Number(limit), 100);
  const skip = (Number(page) - 1) * lim;

  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort(sortBy).skip(skip).limit(lim),
    Product.countDocuments(filter),
  ]);

  res.json({ products, total, page: Number(page), pages: Math.ceil(total / lim) });
});

// @route GET /api/products/:idOrCode (public) — increments views + logs visit
const getProduct = asyncHandler(async (req, res) => {
  const key = req.params.id;
  const query = key.match(/^[0-9a-fA-F]{24}$/) ? { _id: key } : { $or: [{ code: key }, { slug: key }] };
  const product = await Product.findOne(query).populate('category', 'name slug');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  if (req.query.track !== 'false') {
    product.views += 1;
    await product.save();
    const day = new Date().toISOString().slice(0, 10);
    Visit.create({
      type: 'product', product: product._id, productCode: product.code,
      path: `/product/${product.slug}`, screen: 'Product',
      sessionId: req.headers['x-session-id'] || '',
      userAgent: req.headers['user-agent'] || '', day,
    }).catch(() => {});
  }
  res.json(product);
});

// @route POST /api/products (admin)
const createProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.category) {
    const cat = await Category.findById(body.category);
    if (cat) body.categoryName = cat.name;
  }
  const product = await Product.create(body);
  res.status(201).json(product);
});

// @route PUT /api/products/:id (admin)
const updateProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.category) {
    const cat = await Category.findById(body.category);
    if (cat) body.categoryName = cat.name;
  }
  const product = await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json(product);
});

// @route DELETE /api/products/:id (admin)
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ ok: true });
});

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct };
