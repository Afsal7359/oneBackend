const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: 'Verified Buyer' },
    stars: { type: Number, min: 1, max: 5, default: 5 },
    text: { type: String, required: true },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    isApproved: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
