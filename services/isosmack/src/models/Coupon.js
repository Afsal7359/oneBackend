import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      maxlength: 32,
    },
    description: { type: String, default: '' },

    /** percent → % off, flat → ₹ off, freeship → waives shipping */
    type: { type: String, enum: ['percent', 'flat', 'freeship'], required: true },
    value: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = uncapped, only used by `percent`
    minOrder: { type: Number, default: 0 },

    appliesTo: { type: String, enum: ['all', 'products', 'categories'], default: 'all' },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 }, // 0 = unlimited
    firstOrderOnly: { type: Boolean, default: false },

    validFrom: { type: Date, default: Date.now },
    validTo: { type: Date },

    isActive: { type: Boolean, default: true, index: true },
    showOnSite: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/**
 * Returns the set of line items this coupon is allowed to discount.
 * Items carry a populated `product` (or at least category/_id) from the cart builder.
 */
couponSchema.methods.eligibleItems = function eligibleItems(items) {
  if (this.appliesTo === 'all') return items;
  if (this.appliesTo === 'products') {
    const ids = this.products.map(String);
    return items.filter((i) => ids.includes(String(i.productId)));
  }
  const ids = this.categories.map(String);
  return items.filter((i) => i.categoryId && ids.includes(String(i.categoryId)));
};

/**
 * Computes the rupee discount for a cart.
 * @returns {{discount:number, freeShipping:boolean, eligibleTotal:number}}
 */
couponSchema.methods.computeDiscount = function computeDiscount(items) {
  const eligible = this.eligibleItems(items);
  const eligibleTotal = eligible.reduce((s, i) => s + i.price * i.qty, 0);

  if (this.type === 'freeship') return { discount: 0, freeShipping: true, eligibleTotal };
  if (eligibleTotal <= 0) return { discount: 0, freeShipping: false, eligibleTotal };

  let discount =
    this.type === 'percent' ? (eligibleTotal * this.value) / 100 : Math.min(this.value, eligibleTotal);

  if (this.type === 'percent' && this.maxDiscount > 0) discount = Math.min(discount, this.maxDiscount);

  return {
    discount: Math.max(0, Math.round(discount)),
    freeShipping: false,
    eligibleTotal,
  };
};

/** Validity checks that do not depend on the cart. */
couponSchema.methods.checkWindow = function checkWindow() {
  const now = new Date();
  if (!this.isActive) return 'This coupon is no longer active';
  if (this.validFrom && now < this.validFrom) return 'This coupon is not active yet';
  if (this.validTo && now > this.validTo) return 'This coupon has expired';
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit)
    return 'This coupon has reached its usage limit';
  return null;
};

export default mongoose.model('Coupon', couponSchema);
