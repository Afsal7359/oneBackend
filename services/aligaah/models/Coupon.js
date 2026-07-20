const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    value: { type: Number, required: true, min: 0 }, // percent or rupees
    minCartValue: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },       // cap for percent (0 = no cap)
    usageLimit: { type: Number, default: 0 },        // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.methods.isValidNow = function (cartValue = 0) {
  if (!this.isActive) return { ok: false, reason: 'Coupon is not active' };
  if (this.expiresAt && this.expiresAt < new Date()) return { ok: false, reason: 'Coupon has expired' };
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return { ok: false, reason: 'Coupon usage limit reached' };
  if (cartValue < this.minCartValue) return { ok: false, reason: `Minimum cart value is ₹${this.minCartValue}` };
  return { ok: true };
};

couponSchema.methods.computeDiscount = function (cartValue = 0) {
  let d = this.type === 'percent' ? (cartValue * this.value) / 100 : this.value;
  if (this.type === 'percent' && this.maxDiscount > 0) d = Math.min(d, this.maxDiscount);
  return Math.min(Math.round(d), cartValue);
};

module.exports = mongoose.model('Coupon', couponSchema);
