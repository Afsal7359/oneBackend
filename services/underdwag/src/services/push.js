/**
 * Web Push for the billing app.
 * ---------------------------------------------------------------------------
 * Free, no Firebase — standard Web Push with VAPID. Notifications reach staff
 * devices even when the app is closed.
 *
 * Platform note: on iPhone/iPad this only works when the app has been INSTALLED
 * to the Home Screen (iOS 16.4+). In a Safari tab iOS delivers nothing — there
 * is no way around that, it's an Apple restriction.
 */

import webpush from 'web-push';
import { BillingPushSub, getNotifySettings } from '../models/billing.js';

let configured = false;

/** Configure VAPID once, lazily. Returns false if keys aren't set. */
function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@underdawg.com',
    pub,
    priv
  );
  configured = true;
  return true;
}

export function pushAvailable() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Current hour in London — the shop's timezone, whatever the server runs in. */
export function londonHour(d = new Date()) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(d)
    );
  } catch {
    return d.getHours();
  }
}

/** True when we're inside the configured quiet hours (handles overnight spans). */
function inQuietHours(settings, hour = londonHour()) {
  const q = settings?.quietHours;
  if (!q || !q.enabled) return false;
  const { from, to } = q;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * Send a notification to every subscribed staff device.
 *
 * @param {object} payload           {title, body, tag?, url?, data?}
 * @param {object} [opts]
 * @param {string} [opts.event]      event key checked against admin settings
 * @param {boolean} [opts.force]     bypass enable/quiet-hours checks (test sends)
 * @returns {{sent:number, removed:number, skipped?:string}}
 */
export async function sendPush(payload, opts = {}) {
  const { event, force = false } = opts;

  if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: 'no-vapid-keys' };

  if (!force) {
    const settings = await getNotifySettings();
    if (!settings.enabled) return { sent: 0, removed: 0, skipped: 'notifications-off' };
    if (event && settings.events && settings.events[event] === false) {
      return { sent: 0, removed: 0, skipped: `event-off:${event}` };
    }
    if (inQuietHours(settings)) return { sent: 0, removed: 0, skipped: 'quiet-hours' };
  }

  const subs = await BillingPushSub.find().lean();
  if (!subs.length) return { sent: 0, removed: 0, skipped: 'no-subscribers' };

  const body = JSON.stringify({
    title: payload.title || 'underdawg Bill',
    body: payload.body || '',
    tag: payload.tag || 'underdawg',
    url: payload.url || '/',
    data: payload.data || {},
  });

  let sent = 0;
  const dead = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          body,
          { TTL: 3600, urgency: 'normal' }
        );
        sent += 1;
      } catch (err) {
        // 404/410 mean the browser dropped the subscription — it will never
        // work again, so remove it rather than retrying forever.
        const code = err?.statusCode;
        if (code === 404 || code === 410) dead.push(s._id);
        else console.error('[push] send failed:', code || err.message);
      }
    })
  );

  if (dead.length) await BillingPushSub.deleteMany({ _id: { $in: dead } });
  if (sent) {
    await BillingPushSub.updateMany(
      { _id: { $nin: dead } },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => {});
  }

  return { sent, removed: dead.length };
}

/**
 * Fire-and-forget wrapper: never let a notification failure break the request
 * that triggered it (an order must still be created if push is down).
 */
export function sendPushSafe(payload, opts) {
  sendPush(payload, opts).catch((e) => console.error('[push]', e.message));
}
