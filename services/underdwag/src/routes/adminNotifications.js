/**
 * Notification control panel, managed from the WEBSITE admin.
 * Mounted at /api/admin/notifications behind the admin JWT.
 */

import express from 'express';
import asyncHandler from 'express-async-handler';
import { protect } from '../middleware/auth.js';
import { NotifySettings, getNotifySettings, BillingPushSub } from '../models/billing.js';
import { sendPush, pushAvailable } from '../services/push.js';

const router = express.Router();
router.use(protect);

/** Current settings + the devices that will receive notifications. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getNotifySettings();
    const devices = await BillingPushSub.find()
      .populate('user', 'name email role')
      .sort({ lastUsedAt: -1 })
      .lean();

    res.json({
      available: pushAvailable(),
      settings,
      devices: devices.map((d) => ({
        id: String(d._id),
        user: d.user ? { name: d.user.name, email: d.user.email, role: d.user.role } : null,
        label: d.label || deviceLabel(d.userAgent),
        userAgent: d.userAgent,
        lastUsedAt: d.lastUsedAt,
        createdAt: d.createdAt,
      })),
    });
  })
);

/** Turn events on/off, set the summary hour and quiet hours. */
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const patch = {};

    if (body.enabled !== undefined) patch.enabled = !!body.enabled;
    if (body.dailySummaryHour !== undefined) {
      const h = Number(body.dailySummaryHour);
      if (Number.isFinite(h) && h >= 0 && h <= 23) patch.dailySummaryHour = h;
    }
    if (body.events && typeof body.events === 'object') {
      for (const k of ['websiteOrder', 'dailySummary', 'paymentReceived', 'outOfStock']) {
        if (body.events[k] !== undefined) patch[`events.${k}`] = !!body.events[k];
      }
    }
    if (body.quietHours && typeof body.quietHours === 'object') {
      if (body.quietHours.enabled !== undefined) patch['quietHours.enabled'] = !!body.quietHours.enabled;
      const f = Number(body.quietHours.from), t = Number(body.quietHours.to);
      if (Number.isFinite(f) && f >= 0 && f <= 23) patch['quietHours.from'] = f;
      if (Number.isFinite(t) && t >= 0 && t <= 23) patch['quietHours.to'] = t;
    }

    const settings = await NotifySettings.findOneAndUpdate(
      { key: 'default' },
      { $set: patch },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(settings);
  })
);

/** Send a test notification to every registered device. */
router.post(
  '/test',
  asyncHandler(async (_req, res) => {
    const r = await sendPush(
      {
        title: 'Test notification',
        body: 'If you can see this, notifications are working ✅',
        tag: 'admin-test',
      },
      { force: true }   // ignore enable/quiet-hours so a test always sends
    );
    res.json(r);
  })
);

/** Remove a device (it will stop receiving notifications). */
router.delete(
  '/devices/:id',
  asyncHandler(async (req, res) => {
    const d = await BillingPushSub.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ message: 'Device not found' });
    res.json({ ok: true, id: req.params.id });
  })
);

/** Best-effort friendly device name from the user agent. */
function deviceLabel(ua = '') {
  const s = String(ua);
  const os = /iPhone/.test(s) ? 'iPhone'
    : /iPad/.test(s) ? 'iPad'
    : /Android/.test(s) ? 'Android'
    : /Mac OS X/.test(s) ? 'Mac'
    : /Windows/.test(s) ? 'Windows'
    : 'Device';
  const br = /CriOS|Chrome/.test(s) ? 'Chrome'
    : /FxiOS|Firefox/.test(s) ? 'Firefox'
    : /Edg/.test(s) ? 'Edge'
    : /Safari/.test(s) ? 'Safari'
    : '';
  return br ? `${os} · ${br}` : os;
}

export default router;
