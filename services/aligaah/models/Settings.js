const mongoose = require('mongoose');

// Single-document collection holding global site settings the admin can edit.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'site', unique: true },
    siteTitle: { type: String, default: 'Aligaah Designs — Handcrafted Ethnic Wear' },
    tagline: { type: String, default: 'Handcrafted ethnic wear and modern classics.' },
    logo: { type: String, default: '' },            // header logo (Cloudinary)
    logoPublicId: { type: String, default: '' },
    logoTransparent: { type: String, default: '' }, // footer logo
    logoTransparentPublicId: { type: String, default: '' },
    favicon: { type: String, default: '' },         // favicon URL
    faviconPublicId: { type: String, default: '' },
    brandName: { type: String, default: 'ALIGAAH' },
    brandSub: { type: String, default: 'DESIGNS' },
    footerText: {
      type: String,
      default: 'Handcrafted ethnic wear and modern classics for the woman who dresses with intention.',
    },
    social: {
      facebook: { type: String, default: '#' },
      x: { type: String, default: '#' },
      pinterest: { type: String, default: '#' },
      linkedin: { type: String, default: '#' },
      telegram: { type: String, default: '#' },
    },
    shipping: {
      freeAbove: { type: Number, default: 0 },
      flatFee: { type: Number, default: 0 },
    },
    currency: { type: String, default: '₹' },
    // Payment options (admin-controlled)
    codEnabled: { type: Boolean, default: true },
    onlinePaymentEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'site' });
  if (!doc) doc = await this.create({ key: 'site' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
