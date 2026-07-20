import mongoose from 'mongoose';

const usageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    usedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, default: '' },

    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscountAmount: { type: Number }, // cap for percentage coupons

    minOrderAmount: { type: Number, default: 0 },

    maxUses: { type: Number, default: null }, // null = unlimited
    usedCount: { type: Number, default: 0 },
    usedBy: [usageSchema],

    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.methods.isValid = function (orderAmount, userIdOrEmail) {
  if (!this.isActive) return { ok: false, msg: 'Coupon is inactive' };

  const now = new Date();
  if (this.startDate && now < this.startDate) return { ok: false, msg: 'Coupon not yet active' };
  if (this.expiryDate && now > this.expiryDate) return { ok: false, msg: 'Coupon has expired' };

  if (orderAmount < this.minOrderAmount)
    return { ok: false, msg: `Minimum order amount is £${this.minOrderAmount}` };

  if (this.maxUses !== null && this.usedCount >= this.maxUses)
    return { ok: false, msg: 'Coupon usage limit reached' };

  // Check per-user usage (if userIdOrEmail provided)
  if (userIdOrEmail) {
    const alreadyUsed = this.usedBy.some(
      (u) =>
        (u.user && u.user.toString() === userIdOrEmail.toString()) ||
        u.email === userIdOrEmail
    );
    if (alreadyUsed) return { ok: false, msg: 'You have already used this coupon' };
  }

  return { ok: true };
};

couponSchema.methods.calculateDiscount = function (orderAmount) {
  let discount = 0;
  if (this.type === 'percentage') {
    discount = (orderAmount * this.value) / 100;
    if (this.maxDiscountAmount) discount = Math.min(discount, this.maxDiscountAmount);
  } else {
    discount = Math.min(this.value, orderAmount);
  }
  return Math.round(discount * 100) / 100;
};

export default mongoose.model('Coupon', couponSchema);
