/**
 * End-of-day sales summary push.
 * ---------------------------------------------------------------------------
 * Checks once every 15 minutes whether we've reached the configured hour (in
 * LONDON time) and haven't already sent today's summary. Deliberately avoids a
 * cron dependency — the service already runs continuously under pm2, and this
 * survives restarts because "did we already send today" is derived from a
 * stored date rather than an in-memory flag.
 */

import { BillingOrder, getNotifySettings, NotifySettings } from '../models/billing.js';
import { sendPush, londonHour } from './push.js';

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** YYYY-MM-DD in London, so "today" means the shop's today. */
function londonDateKey(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

async function maybeSendSummary() {
  const settings = await getNotifySettings();
  if (!settings.enabled || !settings.events?.dailySummary) return;

  const hour = londonHour();
  if (hour < (settings.dailySummaryHour ?? 20)) return;

  const todayKey = londonDateKey();
  if (settings.lastDailySummary === todayKey) return;   // already sent today

  // Today's live bills, in London time.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const orders = await BillingOrder.find({
    date: { $gte: start },
    voided: { $ne: true },
  }).lean();

  const total = orders.reduce((s, o) => s + (o.total || 0), 0);
  const collected = orders.reduce((s, o) => s + (o.paid || 0), 0);
  const items = orders.reduce(
    (s, o) => s + (o.items || []).reduce((a, i) => a + (i.qty || 0), 0), 0
  );
  const due = Math.round((total - collected) * 100) / 100;

  // Mark as sent BEFORE sending so a push failure can't cause a repeat loop.
  await NotifySettings.updateOne({ key: 'default' }, { $set: { lastDailySummary: todayKey } });

  await sendPush(
    {
      title: `Today: £${total.toFixed(2)}`,
      body: orders.length
        ? `${orders.length} bill${orders.length === 1 ? '' : 's'} · ${items} item${items === 1 ? '' : 's'}${due > 0 ? ` · £${due.toFixed(2)} due` : ''}`
        : 'No sales recorded today',
      tag: 'daily-summary',
      data: { kind: 'dailySummary' },
    },
    { event: 'dailySummary' }
  );

  console.log(`[push] daily summary sent for ${todayKey}: £${total.toFixed(2)}`);
}

export function startDailySummaryJob() {
  const tick = () => maybeSendSummary().catch((e) => console.error('[dailySummary]', e.message));
  setTimeout(tick, 30_000);              // first check shortly after boot
  setInterval(tick, CHECK_EVERY_MS);
}
