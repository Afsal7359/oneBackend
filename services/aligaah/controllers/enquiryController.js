const asyncHandler = require('express-async-handler');
const Enquiry = require('../models/Enquiry');

/**
 * A contact form is an unauthenticated write, so it needs a brake. This is the
 * same trade-off the response cache makes: a plain in-process Map, good enough
 * for a single service instance. If this ever runs multi-process, move the
 * counter to Redis — one bucket per IP would otherwise let N processes through.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Bound the map so a spray of unique IPs can't grow it without limit.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return recent.length > RATE_MAX;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route POST /api/enquiries (public)
const createEnquiry = asyncHandler(async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  if (rateLimited(ip)) {
    res.status(429);
    throw new Error('Too many messages from this device. Please try again later.');
  }

  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const phone = (req.body.phone || '').trim();
  const message = (req.body.message || '').trim();
  const subject = (req.body.subject || '').trim() || 'General enquiry';

  if (name.length < 2) { res.status(400); throw new Error('Please enter your name'); }
  if (message.length < 10) { res.status(400); throw new Error('Please tell us a little more (at least 10 characters)'); }
  // One of the two, or there is no way to answer them.
  if (!email && !phone) { res.status(400); throw new Error('Please leave an email or a phone number so we can reply'); }
  if (email && !EMAIL_RE.test(email)) { res.status(400); throw new Error('Please enter a valid email address'); }
  if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, '').slice(-10))) {
    res.status(400); throw new Error('Please enter a valid 10-digit phone number');
  }

  await Enquiry.create({ name, email, phone, subject, message, ip });

  // Deliberately does not echo the saved document — the client only needs to
  // know it landed, and the id is of no use to an anonymous sender.
  res.status(201).json({ ok: true, message: 'Thank you — we have received your message and will get back to you soon.' });
});

// @route GET /api/enquiries?status=new&page=1 (admin)
const getEnquiries = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

  const [enquiries, total, newCount] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Enquiry.countDocuments(filter),
    Enquiry.countDocuments({ status: 'new' }),
  ]);

  res.json({ enquiries, total, page, pages: Math.ceil(total / limit) || 1, newCount });
});

// @route PUT /api/enquiries/:id (admin) — status / note only
const updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) { res.status(404); throw new Error('Enquiry not found'); }

  if (req.body.status) enquiry.status = req.body.status;
  if (req.body.adminNote !== undefined) enquiry.adminNote = req.body.adminNote;
  await enquiry.save();
  res.json(enquiry);
});

// @route DELETE /api/enquiries/:id (admin)
const deleteEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) { res.status(404); throw new Error('Enquiry not found'); }
  await enquiry.deleteOne();
  res.json({ ok: true });
});

module.exports = { createEnquiry, getEnquiries, updateEnquiry, deleteEnquiry };
