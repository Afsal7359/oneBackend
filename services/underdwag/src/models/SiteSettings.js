import mongoose from 'mongoose';
const { Schema } = mongoose;

const siteSettingsSchema = new Schema({
  hero: {
    desktop: { type: String, default: '' },
    mobile:  { type: String, default: '' },
    eyebrow: { type: String, default: 'SS26 — Drop 01' },
    title:   { type: String, default: 'Built For The Street' },
    ctaLabel:{ type: String, default: 'Shop the collection' },
    ctaHref: { type: String, default: '/collections' },
  },
  stories: [{ label: String, image: String, href: String }],
  stores:  [{ city: String, address: String, image: String, directionsUrl: String, phone: String, isOpen: { type: Boolean, default: true } }],
  announcements: [{ type: String }],
  marquee:       [{ type: String }],
  craft: {
    image:    { type: String, default: '' },
    products: [{
      _id:            { type: String },
      title:          { type: String },
      price:          { type: Number },
      compareAtPrice: { type: Number },
      images:         [{ type: String }],
      slug:           { type: String },
      isNew:          { type: Boolean },
    }],
  },
  shippingInfo: [{ type: String }],
  pages: {
    contact: {
      email:        { type: String, default: 'support@northverse.com' },
      whatsappHref: { type: String, default: '' },
      hours:        { type: String, default: 'Mon–Sat, 10am–6pm GMT' },
    },
    faq: {
      supportHours: { type: String, default: 'Mon–Sat · 10am–6pm GMT · Reply within 24 hours' },
    },
    shipping: {
      standardPrice: { type: String, default: '£3.99' },
      standardTime:  { type: String, default: '3–5 working days' },
      expressPrice:  { type: String, default: '£6.99' },
      expressTime:   { type: String, default: '1–2 working days' },
      freeThreshold: { type: String, default: '£250' },
      cutoffTime:    { type: String, default: '2pm GMT' },
    },
    returns: {
      email:         { type: String, default: 'support@northverse.com' },
      windowDays:    { type: String, default: '7' },
      refundDays:    { type: String, default: '5–7' },
    },
  },
  footer: {
    description:   { type: String, default: 'Premium streetwear. New drops every season.' },
    instagramUrl:  { type: String, default: '' },
    whatsappUrl:   { type: String, default: '' },
    copyrightText: { type: String, default: '' },
    supportLinks:  [{
      label: { type: String },
      href:  { type: String },
    }],
  },
}, { timestamps: true });

export default mongoose.model('SiteSettings', siteSettingsSchema);
