import mongoose from 'mongoose';
import slugify from 'slugify';

const variantSchema = new mongoose.Schema(
  {
    name: String, // e.g. "Color" / "Storage"
    options: [String], // e.g. ["Black","White"]
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: 'text' },
    slug: { type: String, unique: true, index: true },
    sku: { type: String, unique: true, sparse: true },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    brand: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    images: [{ type: String }],
    price: { type: Number, required: true, min: 0 },
    comparePrice: { type: Number, default: 0 }, // original (strike-through)
    cost: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    trackInventory: { type: Boolean, default: true },
    weight: Number,
    variants: [variantSchema],
    tags: [String],
    specifications: [{ key: String, value: String }],
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    seoTitle: String,
    seoDescription: String,
    seoKeywords: [String],
    sold: { type: Number, default: 0 },
    returnDays: { type: Number, default: 30 },
  },
  { timestamps: true }
);

productSchema.pre('validate', function (next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = slugify(this.name + '-' + Date.now().toString(36).slice(-4), {
      lower: true,
      strict: true,
    });
  }
  if (this.comparePrice && this.price && this.comparePrice > this.price) {
    this.discountPercent = Math.round(
      ((this.comparePrice - this.price) / this.comparePrice) * 100
    );
  } else {
    this.discountPercent = 0;
  }
  next();
});

// Text search index (focused — description excluded to keep index smaller)
productSchema.index({ name: 'text', tags: 'text', brand: 'text' });

// Compound indexes for common filter combinations
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isNewArrival: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isBestSeller: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, rating: -1 });
productSchema.index({ isActive: 1, sold: -1 });
productSchema.index({ category: 1, isActive: 1 });

export default mongoose.model('Product', productSchema);
