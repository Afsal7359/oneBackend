import asyncHandler from 'express-async-handler';
import Setting from '../models/Setting.js';

export const getSettings = asyncHandler(async (_req, res) => {
  let s = await Setting.findOne({ key: 'main' });
  if (!s) s = await Setting.create({ key: 'main' });

  // Auto-migrate: replace any leftover "eTrade" branding with "ezoneshoppi"
  let dirty = false;
  if (s.siteName && s.siteName.toLowerCase().includes('etrade')) {
    s.siteName = 'ezoneshoppi'; dirty = true;
  }
  if (s.footer?.copyright && s.footer.copyright.includes('eTrade')) {
    s.footer.copyright = s.footer.copyright.replace(/eTrade/g, 'ezoneshoppi'); dirty = true;
  }
  // Auto-migrate: update stale announcement text
  if (s.announcement?.text && s.announcement.text.includes('₹999')) {
    s.announcement.text = 'Free shipping on orders over ₹5999 • 2-day returns'; dirty = true;
  }
  // Auto-migrate: set default WhatsApp number if none saved
  if (!s.social?.whatsapp) {
    s.social = { ...(s.social || {}), whatsapp: '919495517763' }; dirty = true;
  }
  if (dirty) await s.save();

  res.json({ success: true, settings: s });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const s = await Setting.findOneAndUpdate(
    { key: 'main' },
    { ...req.body, key: 'main' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, settings: s });
});
