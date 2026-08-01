import mongoose from 'mongoose';
import { cloudinaryCleanupPlugin } from '../utils/cloudinaryCleanup.js';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', maxlength: 120 },
    body: { type: String, default: '', maxlength: 2000 },
    images: { type: [{ url: String, publicId: String, _id: false }], default: [] },
    isApproved: { type: Boolean, default: true, index: true },
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One review per customer per product.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

/** Recomputes the denormalised rating fields on the parent product. */
reviewSchema.statics.syncProductRating = async function syncProductRating(productId) {
  const [agg] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await mongoose.model('Product').findByIdAndUpdate(productId, {
    ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0,
    ratingCount: agg ? agg.count : 0,
  });
};

reviewSchema.post('save', function afterSave() {
  this.constructor.syncProductRating(this.product);
});
reviewSchema.post('findOneAndUpdate', function afterUpdate(doc) {
  if (doc) doc.constructor.syncProductRating(doc.product);
});
reviewSchema.post('findOneAndDelete', function afterDelete(doc) {
  if (doc) doc.constructor.syncProductRating(doc.product);
});

reviewSchema.index({ product: 1, isApproved: 1, createdAt: -1 });

// Customer review photos are freed when the review is edited or removed.
reviewSchema.plugin(cloudinaryCleanupPlugin);

export default mongoose.model('Review', reviewSchema);
