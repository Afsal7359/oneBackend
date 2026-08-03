const mongoose = require('mongoose');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

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
    // Only the four channels the brand actually posts on. A blank value hides
    // the icon rather than rendering a dead link, so the admin can drop one
    // channel without leaving a '#' in the top bar.
    social: {
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
    },

    // Shown on the contact page and used for the "get directions" link.
    contact: {
      phone: { type: String, default: '' },
      whatsapp: { type: String, default: '' },   // digits only, e.g. 919876543210
      email: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      landmark: { type: String, default: '' },
      district: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      mapUrl: { type: String, default: '' },     // Google Maps place/directions link
      hours: { type: String, default: '' },      // free text, e.g. "Mon–Sat, 10am–7pm"
    },

    // Drives the return policy page. The window is a number rather than prose
    // so the page and any future order-side check read the same source.
    returns: {
      windowDays: { type: Number, default: 7 },
      // A parcel-opening video is what makes a damage claim verifiable, so the
      // policy hinges on it. Kept as a flag in case the brand ever relaxes it.
      requireOpeningVideo: { type: Boolean, default: true },
      extraNote: { type: String, default: '' },  // optional admin addition
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

// Swapping the logo or favicon leaves the previous one unreferenced.
settingsSchema.plugin(cloudinaryCleanupPlugin);

module.exports = mongoose.model('Settings', settingsSchema);
