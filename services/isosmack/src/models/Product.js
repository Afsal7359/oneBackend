import mongoose from 'mongoose';
import slugify from 'slugify';
import mongooseLeanVirtuals from 'mongoose-lean-virtuals';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    alt: { type: String, default: '' },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 140 },
    slug: { type: String, unique: true, index: true, lowercase: true },

    /** Card headline, e.g. "20g Protein Oats – Chocolate Hazelnut" */
    cardTitle: { type: String, trim: true, default: '' },
    tagline: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
    images: { type: [imageSchema], default: [] },

    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },

    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    allowBackorder: { type: Boolean, default: false },

    /** Corner tag on the card: "Net Wt" / "500g" */
    packLabel: { type: String, default: 'Net Wt' },
    packValue: { type: String, default: '' },

    /** Ribbon: "Bestseller" / "Just launched" */
    badge: { type: String, default: '' },
    badgeDark: { type: Boolean, default: false },

    /** Red pill under the price */
    offerText: { type: String, default: '' },

    flavour: { type: String, default: '' },
    specs: { type: [String], default: [] },
    highlights: { type: [String], default: [] },
    nutrition: { type: [{ key: String, value: String, _id: false }], default: [] },
    ingredients: { type: String, default: '' },
    allergens: { type: String, default: '' },
    howToUse: { type: String, default: '' },
    faqs: { type: [{ q: String, a: String, _id: false }], default: [] },

    weightGrams: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },

    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.index({ name: 'text', description: 'text', flavour: 'text' });
productSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

productSchema.pre('validate', async function makeSlug(next) {
  if (this.isModified('name') || !this.slug) {
    const base = slugify(this.name || 'product', { lower: true, strict: true });
    let slug = base;
    let i = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await mongoose.models.Product.exists({ slug, _id: { $ne: this._id } })) {
      slug = `${base}-${i++}`;
    }
    this.slug = slug;
  }
  if (!this.cardTitle) this.cardTitle = this.name;
  next();
});

productSchema.pre('save', function guardPricing(next) {
  if (this.mrp < this.price) this.mrp = this.price;
  next();
});

productSchema.virtual('discountPercent').get(function discountPercent() {
  if (!this.mrp || this.mrp <= this.price) return 0;
  return Math.round((1 - this.price / this.mrp) * 100);
});

productSchema.virtual('inStock').get(function inStock() {
  return this.allowBackorder || this.stock > 0;
});

productSchema.virtual('primaryImage').get(function primaryImage() {
  return this.images?.[0]?.url || '';
});

// Lets `.lean({ virtuals: true })` carry discountPercent / inStock into plain results.
productSchema.plugin(mongooseLeanVirtuals);

export default mongoose.model('Product', productSchema);
