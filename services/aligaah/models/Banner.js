const mongoose = require('mongoose');

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

module.exports = mongoose.model('Banner', bannerSchema);
