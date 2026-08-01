const mongoose = require('mongoose');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  flavor: { type: String, default: '' },
  description: { type: String, default: '' },
  badge: { type: String, default: '' },
  tags: { type: [String], default: [] },
  priceGBP: { type: Number, required: true },
  priceINR: { type: Number, required: true },
  image: { type: String, default: '' },
  spice: { type: String, default: 'None' },
  rating: { type: Number, default: 5 },
  inStock: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// The shop lists products in stock, in display order — index that exact shape.
productSchema.index({ inStock: 1, order: 1, createdAt: -1 });
productSchema.index({ order: 1, createdAt: -1 });

// Swapping or deleting a product photo removes the old Cloudinary asset, unless
// an order or a site-content block still shows it.
productSchema.plugin(cloudinaryCleanupPlugin, {
  protectedBy: [
    { model: () => require('./Order') },
    { model: () => require('./SiteContent'), scanAll: true },
  ],
});

module.exports = mongoose.model('Product', productSchema);
