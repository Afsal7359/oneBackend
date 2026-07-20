import { UAParser } from 'ua-parser-js';
import PageEvent from '../models/PageEvent.js';

/* ── IP geolocation (ip-api.com, free, 45 req/min) ───────────────────────── */
const geoCache = new Map();

async function resolveGeo(ip) {
  if (!ip) return { country: '', city: '' };
  if (geoCache.has(ip)) return geoCache.get(ip);
  // Skip private / loopback addresses
  if (/^(127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/.test(ip)) {
    return { country: '', city: '' };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`);
    const d = await res.json();
    const geo = d.status === 'success'
      ? { country: d.country || '', city: d.city || '' }
      : { country: '', city: '' };
    geoCache.set(ip, geo);
    return geo;
  } catch {
    return { country: '', city: '' };
  }
}

/* ── Date-range helper ────────────────────────────────────────────────────── */
function rangeStart(range) {
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '30d':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    default: // 7d
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }
}

/* ── PUBLIC: track events ─────────────────────────────────────────────────── */
export const track = async (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(204).end();
    }

    const ua = new UAParser(req.headers['user-agent'] || '');
    const parsed = ua.getResult();
    const device  = parsed.device?.type || 'desktop';
    const browser = parsed.browser?.name || '';
    const os      = parsed.os?.name || '';

    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.ip
      || req.socket?.remoteAddress
      || '';
    const geo = await resolveGeo(rawIp);

    const docs = events.slice(0, 50).map((ev) => ({
      sid:     ev.sid     || '',
      uid:     ev.uid     || null,
      type:    ev.type    || 'pageview',
      page:    ev.page    || '',
      data:    ev.data    || {},
      ref:     ev.ref     || '',
      src:     ev.src     || 'direct',
      utm:     ev.utm     || {},
      screen:  ev.screen  || '',
      device,
      browser,
      os,
      ip:      rawIp,
      country: geo.country,
      city:    geo.city,
      ts:      ev.ts ? new Date(ev.ts) : new Date(),
    }));

    await PageEvent.insertMany(docs, { ordered: false });
    res.status(204).end();
  } catch {
    res.status(204).end(); // always 204 — never break the frontend
  }
};

/* ── ADMIN: summary KPIs ──────────────────────────────────────────────────── */
export const getSummary = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const match = { ts: { $gte: since } };

    const [
      sessions,
      pageviews,
      visitors,
      purchases,
      cartAdds,
    ] = await Promise.all([
      PageEvent.distinct('sid', match).then((a) => a.length),
      PageEvent.countDocuments({ ...match, type: 'pageview' }),
      PageEvent.distinct('ip',  { ...match, ip: { $ne: '' } }).then((a) => a.length),
      PageEvent.countDocuments({ ...match, type: 'purchase' }),
      PageEvent.countDocuments({ ...match, type: 'cart_add' }),
    ]);

    const conversionRate = sessions > 0
      ? ((purchases / sessions) * 100).toFixed(1)
      : '0.0';

    res.json({ sessions, pageviews, visitors, purchases, cartAdds, conversionRate });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: timeline (pageviews + sessions per day) ──────────────────────── */
export const getTimeline = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);

    const [pvRows, sessRows] = await Promise.all([
      // Pageviews per day
      PageEvent.aggregate([
        { $match: { ts: { $gte: since }, type: 'pageview' } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
            count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      // Sessions per day (distinct sid per day)
      PageEvent.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
              sid: '$sid',
            },
        }},
        { $group: {
            _id: '$_id.date',
            count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Merge into unified array
    const pvMap = Object.fromEntries(pvRows.map((r) => [r._id, r.count]));
    const ssMap = Object.fromEntries(sessRows.map((r) => [r._id, r.count]));
    const allDates = [...new Set([...Object.keys(pvMap), ...Object.keys(ssMap)])].sort();

    const timeline = allDates.map((date) => ({
      date,
      pageviews: pvMap[date] || 0,
      sessions:  ssMap[date] || 0,
    }));

    res.json(timeline);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: top pages ─────────────────────────────────────────────────────── */
export const getPages = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const rows = await PageEvent.aggregate([
      { $match: { ts: { $gte: since }, type: 'pageview', page: { $ne: '' } } },
      { $group: { _id: '$page', views: { $sum: 1 }, sessions: { $addToSet: '$sid' } } },
      { $project: { page: '$_id', views: 1, sessions: { $size: '$sessions' }, _id: 0 } },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: traffic sources ───────────────────────────────────────────────── */
export const getSources = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const rows = await PageEvent.aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: '$src', sessions: { $addToSet: '$sid' } } },
      { $project: { source: '$_id', sessions: { $size: '$sessions' }, _id: 0 } },
      { $sort: { sessions: -1 } },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: device / browser / OS breakdown ──────────────────────────────── */
export const getDevices = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const match = { ts: { $gte: since } };

    const [devices, browsers, oses, screens] = await Promise.all([
      PageEvent.aggregate([
        { $match: { ...match, device: { $ne: '' } } },
        { $group: { _id: '$device', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PageEvent.aggregate([
        { $match: { ...match, browser: { $ne: '' } } },
        { $group: { _id: '$browser', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      PageEvent.aggregate([
        { $match: { ...match, os: { $ne: '' } } },
        { $group: { _id: '$os', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      PageEvent.aggregate([
        { $match: { ...match, screen: { $ne: '' } } },
        { $group: { _id: '$screen', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({ devices, browsers, oses, screens });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: locations ─────────────────────────────────────────────────────── */
export const getLocations = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const match = { ts: { $gte: since } };

    const [countries, cities] = await Promise.all([
      PageEvent.aggregate([
        { $match: { ...match, country: { $ne: '' } } },
        { $group: { _id: '$country', visitors: { $addToSet: '$ip' } } },
        { $project: { country: '$_id', visitors: { $size: '$visitors' }, _id: 0 } },
        { $sort: { visitors: -1 } },
        { $limit: 15 },
      ]),
      PageEvent.aggregate([
        { $match: { ...match, city: { $ne: '' } } },
        { $group: { _id: '$city', visitors: { $addToSet: '$ip' } } },
        { $project: { city: '$_id', visitors: { $size: '$visitors' }, _id: 0 } },
        { $sort: { visitors: -1 } },
        { $limit: 15 },
      ]),
    ]);

    res.json({ countries, cities });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: top click labels ──────────────────────────────────────────────── */
export const getClicks = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const rows = await PageEvent.aggregate([
      { $match: { ts: { $gte: since }, type: 'click', 'data.label': { $exists: true, $ne: '' } } },
      { $group: { _id: '$data.label', clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 15 },
      { $project: { label: '$_id', clicks: 1, _id: 0 } },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: section engagement ────────────────────────────────────────────── */
export const getSections = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);
    const rows = await PageEvent.aggregate([
      { $match: { ts: { $gte: since }, type: 'section_view', 'data.section': { $exists: true, $ne: '' } } },
      { $group: { _id: '$data.section', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
      { $project: { section: '$_id', views: 1, _id: 0 } },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: sessions list (paginated) ─────────────────────────────────────── */
export const getSessions = async (req, res) => {
  try {
    const { range, start, end, page = 1, limit = 25 } = req.query;
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    // Support both quick range and custom start/end dates
    let dateMatch;
    if (start && end) {
      dateMatch = { ts: { $gte: new Date(start), $lte: new Date(new Date(end).setHours(23, 59, 59, 999)) } };
    } else {
      dateMatch = { ts: { $gte: rangeStart(range || '7d') } };
    }

    const [rows, totalArr] = await Promise.all([
      PageEvent.aggregate([
        { $match: dateMatch },
        { $sort: { ts: 1 } },
        { $group: {
          _id: '$sid',
          firstSeen:  { $first: '$ts' },
          lastSeen:   { $last: '$ts' },
          eventCount: { $sum: 1 },
          pages:      { $addToSet: '$page' },
          device:     { $first: '$device' },
          browser:    { $first: '$browser' },
          os:         { $first: '$os' },
          country:    { $first: '$country' },
          city:       { $first: '$city' },
          src:        { $first: '$src' },
          uid:        { $first: '$uid' },
          purchased:  { $max: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } },
        }},
        { $project: {
          sid:        '$_id',
          firstSeen:  1,
          lastSeen:   1,
          eventCount: 1,
          pageCount:  { $size: '$pages' },
          device:     1,
          browser:    1,
          os:         1,
          country:    1,
          city:       1,
          src:        1,
          uid:        1,
          purchased:  1,
          durationMs: { $subtract: ['$lastSeen', '$firstSeen'] },
          _id: 0,
        }},
        { $sort: { firstSeen: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
      ]),
      PageEvent.aggregate([
        { $match: dateMatch },
        { $group: { _id: '$sid' } },
        { $count: 'total' },
      ]),
    ]);

    const total = totalArr[0]?.total || 0;
    res.json({
      sessions: rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: single session journey ────────────────────────────────────────── */
export const getSessionDetail = async (req, res) => {
  try {
    const { sid } = req.params;
    const events = await PageEvent.find({ sid })
      .sort({ ts: 1 })
      .populate('uid', 'name email avatar')
      .lean();

    if (events.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ sid, events });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/* ── ADMIN: conversion funnel ─────────────────────────────────────────────── */
export const getFunnel = async (req, res) => {
  try {
    const since = rangeStart(req.query.range);

    const [productViews, cartAdds, checkouts, purchases] = await Promise.all([
      PageEvent.countDocuments({ ts: { $gte: since }, type: 'pageview', page: /^\/product\// }),
      PageEvent.countDocuments({ ts: { $gte: since }, type: 'cart_add' }),
      PageEvent.countDocuments({ ts: { $gte: since }, type: 'checkout_start' }),
      PageEvent.countDocuments({ ts: { $gte: since }, type: 'purchase' }),
    ]);

    const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');

    res.json([
      { step: 'Product Views',    count: productViews, pct: '100' },
      { step: 'Add to Cart',      count: cartAdds,     pct: pct(cartAdds, productViews) },
      { step: 'Checkout Started', count: checkouts,    pct: pct(checkouts, cartAdds) },
      { step: 'Purchase',         count: purchases,    pct: pct(purchases, checkouts) },
    ]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
