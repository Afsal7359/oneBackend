import mongoose from 'mongoose';
import slugify from 'slugify';
import { generateUniqueBarcode, isValidEan13 } from '../utils/barcode.js';
import { cloudinaryCleanupPlugin } from '../utils/cloudinaryCleanup.js';

const variantSchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    stock: { type: Number, default: 0, min: 0 },
    sku: { type: String },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'GBP' },

    // Unique EAN-13 used by the billing app's scanner and printed labels.
    // Auto-generated on create (see pre-save hook below) in the "200" range,
    // which GS1 reserves for a retailer's own in-store barcodes.
    // `sparse` so legacy documents without a barcode don't collide on null.
    barcode: { type: String, unique: true, sparse: true, index: true, trim: true },

    // Purchase/landed cost — optional, used by billing for margin reporting.
    cost: { type: Number, min: 0 },

    images: [{ type: String }],

    category: {
      type: String,
      enum: ['tshirts', 'hoodies', 'jackets', 'shirts', 'sweatshirts', 'polos', 'pants', 'shorts', 'caps', 'bags', 'other'],
      default: 'tshirts',
    },
    tags: [{ type: String }],
    colors: [{ type: String }],
    variants: [variantSchema],

    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
    relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active', index: true },
    isFeatured: { type: Boolean, default: false },
    isNew: { type: Boolean, default: true },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Compound indexes matching the hot read paths in productController.
// (slug + status already have single-field indexes above.)
productSchema.index({ status: 1, createdAt: -1 });               // default list + sort
productSchema.index({ category: 1, status: 1, createdAt: -1 });  // category filter
productSchema.index({ collections: 1, status: 1, createdAt: -1 }); // collection filter
productSchema.index({ status: 1, isFeatured: -1, createdAt: -1 }); // featured rails

productSchema.pre('save', async function (next) {
  if (this.isModified('title') || !this.slug) {
    const base = slugify(this.title, { lower: true, strict: true });
    let slug = base;
    let i = 1;
    // Increment suffix until the slug is unique (handles bulk inserts with same title)
    while (await mongoose.model('Product').exists({ slug, _id: { $ne: this._id } })) {
      slug = `${base}-${i++}`;
    }
    this.slug = slug;
  }
  next();
});

// Every product gets a unique, scannable EAN-13 on creation. If an operator
// typed one in manually we keep it (only regenerating when it isn't a valid
// EAN-13), so hand-entered manufacturer barcodes are respected.
productSchema.pre('save', async function (next) {
  try {
    if (!this.barcode || !isValidEan13(this.barcode)) {
      if (this.barcode && !isValidEan13(this.barcode)) {
        // Keep a non-EAN code the operator deliberately typed, as long as it's
        // a plausible code; only auto-replace when the field is blank.
        const raw = String(this.barcode).trim();
        if (raw.length >= 6) return next();
      }
      this.barcode = await generateUniqueBarcode(mongoose.model('Product'));
    }
    next();
  } catch (err) {
    next(err);
  }
});

productSchema.virtual('inStock').get(function () {
  return (this.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0) > 0;
});

productSchema.set('toJSON', { virtuals: true });

// Removing a photo from a product removes it from Cloudinary too, unless an
// order (which snapshots the image at checkout) or the site settings still
// point at it.
productSchema.plugin(cloudinaryCleanupPlugin, {
  protectedBy: [
    { model: () => mongoose.model('Order') },
    { model: () => mongoose.model('SiteSettings'), scanAll: true },
  ],
});

export default mongoose.model('Product', productSchema);
