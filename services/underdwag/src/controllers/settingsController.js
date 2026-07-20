import asyncHandler from 'express-async-handler';
import SiteSettings from '../models/SiteSettings.js';

const DEFAULTS = {
  hero: {
    desktop: 'https://picsum.photos/seed/herodesk/1920/1080',
    mobile:  'https://picsum.photos/seed/heromob/900/1200',
    eyebrow: 'SS26 — Drop 01',
    title:   'Built For The Street',
    ctaLabel:'Shop the collection',
    ctaHref: '/collections',
  },
  stories: [
    { label: 'new caps',    image: 'https://picsum.photos/seed/story1/200/200', href: '/collections/caps' },
    { label: 'polo season', image: 'https://picsum.photos/seed/story2/200/200', href: '/collections/polo-club' },
    { label: 'dark grid',   image: 'https://picsum.photos/seed/story3/200/200', href: '/collections' },
    { label: 'new shirts',  image: 'https://picsum.photos/seed/story4/200/200', href: '/collections' },
    { label: 'ss26 look',   image: 'https://picsum.photos/seed/story5/200/200', href: '/collections' },
    { label: 'lookbook',    image: 'https://picsum.photos/seed/story6/200/200', href: '/collections' },
    { label: 'archive',     image: 'https://picsum.photos/seed/story7/200/200', href: '/collections' },
    { label: 'press',       image: 'https://picsum.photos/seed/story8/200/200', href: '/collections' },
  ],
  stores: [],
  announcements: [
    'Free shipping on orders above £250',
    'New Drop — Latest collection live',
    '7-day easy returns & exchanges',
  ],
  marquee: ['Free Shipping', 'New Drop', 'London Streetwear', 'Premium Streetwear', 'Unisex Fits', 'Limited Edition'],
  craft: { image: '', products: [] },
  pages: {
    contact:  { email: 'support@northverse.com', whatsappHref: '', hours: 'Mon–Sat, 10am–6pm GMT' },
    faq:      { supportHours: 'Mon–Sat · 10am–6pm GMT · Reply within 24 hours' },
    shipping: { standardPrice: '£3.99', standardTime: '3–5 working days', expressPrice: '£6.99', expressTime: '1–2 working days', freeThreshold: '£250', cutoffTime: '2pm GMT' },
    returns:  { email: 'support@northverse.com', windowDays: '7', refundDays: '5–7' },
  },
  footer: {
    description:   'Premium streetwear. New drops every season.',
    instagramUrl:  '',
    whatsappUrl:   '',
    copyrightText: '',
    supportLinks: [
      { label: 'Track Order',          href: '/track-order' },
      { label: 'Returns & Exchanges',  href: '/returns' },
      { label: 'Shipping',             href: '/shipping' },
      { label: 'FAQ',                  href: '/faq' },
      { label: 'Contact',              href: '/contact' },
    ],
  },
  shippingInfo: [
    'Free shipping on orders above £250',
    '7-day easy returns & exchanges',
    'UK delivery 2–5 working days',
    'Secure payments with Stripe',
  ],
};

// GET /api/settings  — public, find-or-create singleton
export const getSettings = asyncHandler(async (req, res) => {
  let s = await SiteSettings.findOne().lean();
  if (!s) s = (await SiteSettings.create(DEFAULTS)).toObject();
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
  res.json(s);
});

// PUT /api/admin/settings  — protected
export const updateSettings = asyncHandler(async (req, res) => {
  const { hero, stories, stores, craft, announcements, marquee, shippingInfo, footer, pages } = req.body;
  let s = await SiteSettings.findOne();
  if (!s) {
    s = await SiteSettings.create({ hero, stories, stores, craft, announcements, marquee, footer });
  } else {
    if (hero          !== undefined) s.hero          = hero;
    if (stories       !== undefined) s.stories       = stories;
    if (stores        !== undefined) s.stores        = stores;
    if (craft         !== undefined) s.craft         = craft;
    if (announcements !== undefined) s.announcements = announcements;
    if (marquee       !== undefined) s.marquee       = marquee;
    if (shippingInfo  !== undefined) s.shippingInfo  = shippingInfo;
    if (footer        !== undefined) s.footer        = footer;
    if (pages         !== undefined) s.pages         = pages;
    await s.save();
  }
  res.json(s);
});
