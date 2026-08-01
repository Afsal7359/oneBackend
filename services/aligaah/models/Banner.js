const mongoose = require('mongoose');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },     // e.g. "Unleash Your Fashion Potential"
    subtitle: { type: String, default: '' },
    buttonText: { type: String, default: 'SHOP NOW' },
    link: { type: String, default: '#shop' },
    image: { type: String, default: '' },      // Cloudinary URL
    imagePublicId: { type: String, default: '' },
    position: { type: String, enum: ['hero', 'promo', 'strip'], default: 'hero' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Banners are read on every storefront page load and always sorted the same way.
bannerSchema.index({ isActive: 1, position: 1, order: 1, createdAt: -1 });

// Replacing or deleting a banner image drops the old file from Cloudinary.
bannerSchema.plugin(cloudinaryCleanupPlugin);

module.exports = mongoose.model('Banner', bannerSchema);
