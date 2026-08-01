import { z } from 'zod';
import { Banner, Page, Setting, Contact, Subscriber } from '../models/Content.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

/** Everything the storefront shell needs: header ticker, footer, hero, policies. */
export const getSiteConfig = asyncHandler(async (_req, res) => {
  const [settings, banners, pages] = await Promise.all([
    Setting.getGlobal(),
    Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    Page.find({ isActive: true, showInFooter: true })
      .select('title slug footerGroup sortOrder')
      .sort({ sortOrder: 1 })
      .lean(),
  ]);

  return ok(res, {
    settings: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoText: settings.logoText,
      tickerItems: settings.tickerItems,
      advantages: settings.advantages,
      story: settings.story,
      faqs: settings.faqs,
      knowMore: settings.knowMore,
      socials: settings.socials,
      contact: settings.contact,
      shipping: settings.shipping,
      payments: settings.payments,
    },
    hero: banners.find((b) => b.position === 'hero') || null,
    strips: banners.filter((b) => b.position === 'strip'),
    footerPages: pages,
  });
});

export const getPage = asyncHandler(async (req, res) => {
  const page = await Page.findOne({ slug: req.params.slug, isActive: true }).lean();
  if (!page) throw ApiError.notFound('That page does not exist');
  return ok(res, { page });
});

export const listPages = asyncHandler(async (_req, res) => {
  const pages = await Page.find({ isActive: true }).select('title slug excerpt footerGroup').sort({ sortOrder: 1 }).lean();
  return ok(res, { pages });
});

export const submitContact = asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Please enter your name'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    subject: z.string().trim().max(140).optional().or(z.literal('')),
    orderNumber: z.string().trim().max(40).optional().or(z.literal('')),
    message: z.string().trim().min(10, 'Please tell us a little more').max(3000),
  });
  const data = schema.parse(req.body);

  await Contact.create(data);
  return ok(res, { message: "Thanks — we've got your message and will reply within one working day." }, 201);
});

export const subscribe = asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }).parse(req.body);

  await Subscriber.findOneAndUpdate(
    { email },
    { email, isActive: true },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return ok(res, { message: "You're on the list." });
});
