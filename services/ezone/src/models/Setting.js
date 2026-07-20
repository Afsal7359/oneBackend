import mongoose from 'mongoose';

/**
 * Singleton document holding all site content & settings.
 * Every string, image, color used on the storefront is here - fully editable from admin.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },

    /* ---------------- Branding ---------------- */
    siteName: { type: String, default: 'ezoneshoppi' },
    tagline: { type: String, default: 'Premium electronics store' },
    logo: { type: String, default: '' },
    favicon: { type: String, default: '' },
    primaryColor: { type: String, default: '#2563eb' },
    accentColor: { type: String, default: '#f97316' },
    logoDisplayMode: { type: String, enum: ['logo_name', 'logo_only', 'name_only'], default: 'logo_name' },

    /* --------------- Announcement --------------- */
    announcement: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: 'Free shipping on orders over ₹5999 • 2-day returns' },
      bgColor: { type: String, default: '#000000' },
      link: String,
    },

    /* --------------- Top Hero Slide --------------- */
    hero: {
      tag: { type: String, default: 'Hot Deal in This Week' },
      title: { type: String, default: 'Roco Wireless Headphone' },
      subtitle: { type: String, default: '' },
      price: { type: Number, default: 49 },
      image: { type: String, default: '' },
      ctaText: { type: String, default: 'Shop Now' },
      ctaLink: { type: String, default: '/shop' },
      rating: { type: Number, default: 4 },
      reviewsCount: { type: Number, default: 100 },
    },

    /* --------------- Countdown Banner --------------- */
    dealBanner: {
      enabled: { type: Boolean, default: true },
      tag: { type: String, default: 'Quick Sale!' },
      title: { type: String, default: 'Enhance Your Music Experience' },
      image: { type: String, default: '' },
      endsAt: { type: Date, default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
      ctaText: { type: String, default: 'Check it Out!' },
      ctaLink: { type: String, default: '/shop' },
    },

    /* --------------- Contact --------------- */
    contact: {
      email: { type: String, default: 'hello@etrade.com' },
      phone: { type: String, default: '+91 00000 00000' },
      address: String,
      mapEmbed: String,
    },

    /* --------------- About Page --------------- */
    about: {
      heroTitle: { type: String, default: 'Our Story' },
      heroSubtitle: { type: String, default: '' },
      missionTitle: { type: String, default: 'Electronics for Everyone' },
      missionContent: { type: String, default: '' },
      stat1Label: { type: String, default: 'Happy Customers' },
      stat1Value: { type: String, default: '50,000+' },
      stat2Label: { type: String, default: 'Cities Served' },
      stat2Value: { type: String, default: '200+' },
      stat3Label: { type: String, default: 'Avg. Rating' },
      stat3Value: { type: String, default: '4.9/5' },
      stat4Label: { type: String, default: 'Satisfaction' },
      stat4Value: { type: String, default: '99%' },
    },

    /* --------------- Social --------------- */
    social: {
      facebook:  String,
      instagram: String,
      twitter:   String,
      youtube:   String,
      linkedin:  String,
      whatsapp:  { type: String, default: '919495517763' },
    },

    /* --------------- Footer --------------- */
    footer: {
      about: {
        type: String,
        default: 'ezoneshoppi is your destination for premium electronics — headphones, laptops, wearables and more.',
      },
      columns: [
        {
          title: String,
          links: [{ label: String, url: String }],
        },
      ],
      copyright: { type: String, default: '© ezoneshoppi. All rights reserved.' },
    },

    /* --------------- Shipping & Tax --------------- */
    shipping: {
      freeShippingThreshold: { type: Number, default: 999 },
      flatRate: { type: Number, default: 79 },
      codEnabled: { type: Boolean, default: true },
      codCharge: { type: Number, default: 30 },
    },
    tax: {
      enabled: { type: Boolean, default: true },
      percent: { type: Number, default: 5 },
      label: { type: String, default: 'GST' },
    },

    /* --------------- Payment --------------- */
    payment: {
      razorpayEnabled:  { type: Boolean, default: true },
      codEnabled:       { type: Boolean, default: true },
      whatsappEnabled:  { type: Boolean, default: false },
      currency:         { type: String,  default: 'INR' },
      currencySymbol:   { type: String,  default: '₹' },
    },

    /* --------------- SEO --------------- */
    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: [String],
      ogImage: String,
    },

    /* --------------- Homepage Sections Toggle --------------- */
    homepage: {
      showCategories: { type: Boolean, default: true },
      showDealBanner: { type: Boolean, default: true },
      showFeatured: { type: Boolean, default: true },
      showNewArrivals: { type: Boolean, default: true },
      showBestSellers: { type: Boolean, default: true },
      showBlog: { type: Boolean, default: true },
      showNewsletter: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Setting', settingSchema);
