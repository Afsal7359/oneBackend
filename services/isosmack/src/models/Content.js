import mongoose from 'mongoose';
import slugify from 'slugify';

/* ------------------------------------------------------------------ Banner */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Hero banner' },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, default: '' },
      alt: { type: String, default: '' },
    },
    mobileImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    ctaText: { type: String, default: 'Shop the range' },
    ctaLink: { type: String, default: '/products' },
    position: { type: String, enum: ['hero', 'strip'], default: 'hero', index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------- Page */
const pageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true, lowercase: true },
    content: { type: String, default: '' }, // sanitised HTML
    excerpt: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    showInFooter: { type: Boolean, default: true },
    footerGroup: { type: String, default: 'Support' },
    sortOrder: { type: Number, default: 0 },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
  },
  { timestamps: true }
);

pageSchema.pre('validate', function makeSlug(next) {
  if (this.isModified('title') || !this.slug) {
    this.slug = slugify(this.slug || this.title || 'page', { lower: true, strict: true });
  }
  next();
});

/* ----------------------------------------------------------------- Setting */
/** Single document (key: 'global') holding everything the admin can tune. */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },

    siteName: { type: String, default: 'ISOSMACK' },
    tagline: { type: String, default: 'Fuel Strong. Live Strong.' },
    logoText: { type: String, default: 'ISOSMACK' },

    tickerItems: {
      type: [String],
      default: [
        'Free shipping on orders over ₹999',
        '3% off on prepaid orders',
        'New: Chocolate Brownie Protein Bar',
        '20–26g protein in every product',
        'No added sugar. Ever.',
      ],
    },

    advantages: {
      type: [{ title: String, text: String, icon: String, _id: false }],
      default: [],
    },

    story: {
      eyebrow: { type: String, default: 'Built for the everyday' },
      heading: { type: String, default: 'Fuel Strong.\nLive Strong.' },
      body: { type: String, default: '' },
      points: { type: [String], default: [] },
      image: { url: String, publicId: String },
    },

    faqs: { type: [{ q: String, a: String, _id: false }], default: [] },
    knowMore: { type: [{ q: String, a: String, _id: false }], default: [] },

    socials: {
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      email: { type: String, default: 'hello@isosmack.com' },
    },

    contact: {
      ordersEmail: { type: String, default: 'orders@isosmack.com' },
      supportEmail: { type: String, default: 'hello@isosmack.com' },
      phone: { type: String, default: '' },
      hours: { type: String, default: 'Mon–Sat, 10AM–6PM IST' },
      address: { type: String, default: '' },
    },

    shipping: {
      freeAbove: { type: Number, default: 999 },
      fee: { type: Number, default: 69 },
      codEnabled: { type: Boolean, default: true },
      codFee: { type: Number, default: 49 },
      codMaxOrder: { type: Number, default: 5000 },
      prepaidDiscountPct: { type: Number, default: 3 },
      etaMetro: { type: String, default: '2–3 days' },
      etaRest: { type: String, default: '4–6 days' },
    },

    payments: {
      razorpayEnabled: { type: Boolean, default: true },
      methods: { type: [String], default: ['UPI', 'Visa', 'Mastercard', 'Rupay', 'Net Banking', 'COD'] },
    },
  },
  { timestamps: true }
);

settingSchema.statics.getGlobal = async function getGlobal() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

/* ----------------------------------------------------------------- Contact */
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    subject: { type: String, default: '' },
    message: { type: String, required: true },
    orderNumber: { type: String, default: '' },
    status: { type: String, enum: ['new', 'read', 'resolved'], default: 'new', index: true },
    adminReply: { type: String, default: '' },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------- Subscriber */
const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Banner = mongoose.model('Banner', bannerSchema);
export const Page = mongoose.model('Page', pageSchema);
export const Setting = mongoose.model('Setting', settingSchema);
export const Contact = mongoose.model('Contact', contactSchema);
export const Subscriber = mongoose.model('Subscriber', subscriberSchema);
