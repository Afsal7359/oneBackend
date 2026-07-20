import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional for admin-created custom reviews
    name: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: String,
    comment: String,
    images: [String],
    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true },
    isCustom: { type: Boolean, default: false }, // admin-created review
  },
  { timestamps: true }
);

// sparse: true means null user values are excluded from uniqueness check
// so multiple admin custom reviews (user: null) can exist for the same product
reviewSchema.index({ product: 1, user: 1 }, { unique: true, sparse: true });

export default mongoose.model('Review', reviewSchema);
