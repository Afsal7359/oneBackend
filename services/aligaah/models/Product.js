const mongoose = require('mongoose');
const slugify = require('slugify');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

const imageSchema = new mongoose.Schema(
  { url: String, publicId: String },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true }, // e.g. AB0501
    title: { type: String, required: true, trim: true },
    slug: { type: String, index: true },
    description: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryName: { type: String, default: '' }, // denormalized for fast display

    price: { type: Number, required: true, min: 0 },       // selling price
    oldPrice: { type: Number, default: 0 },                // MRP / compare-at
    discount: { type: Number, default: 0 },                // percent

    images: [imageSchema],
    stock: { type: Number, default: 10 },

    // Variant choices. Both are opt-in per product: a stole has no size and a
    // single-colourway saree has no colour, and the storefront renders a
    // chooser only for the arrays that are non-empty. An empty array therefore
    // means "this product has no such choice", not "choices unknown".
    sizes: { type: [String], default: [] },              // ['S','M','L']
    colors: {
      type: [new mongoose.Schema(
        { name: { type: String, required: true, trim: true }, hex: { type: String, default: '#000000' } },
        { _id: false }
      )],
      default: [],
    },

    // Hand-picked "you may also like". Empty falls back to same-category
    // products at render time, so a product is never left with a bare page.
    relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    isHot: { type: Boolean, default: false },
    isSoldOut: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },

    views: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.pre('validate', function (next) {
  if (this.title && (!this.slug || this.isModified('title'))) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  if (this.oldPrice && this.price && this.oldPrice > this.price) {
    this.discount = Math.round(((this.oldPrice - this.price) / this.oldPrice) * 100);
  }
  next();
});

productSchema.virtual('primaryImage').get(function () {
  return this.images && this.images.length ? this.images[0].url : '';
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

/* ------------------------------------------------------------------ indexes */
// One index per shape the storefront actually queries. Each covers its filter
// *and* the sort, so Mongo answers from the index instead of loading every
// product into memory to sort it.
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ category: 1, isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isBestSeller: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isNewArrival: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, views: -1 });
productSchema.index({ isActive: 1, sales: -1 });

// Old photos are removed from Cloudinary when they leave a product. Order items
// keep a copy of the image URL from purchase time, so anything an order still
// references survives.
productSchema.plugin(cloudinaryCleanupPlugin, {
  protectedBy: [{ model: () => require('./Order') }],
});

module.exports = mongoose.model('Product', productSchema);
