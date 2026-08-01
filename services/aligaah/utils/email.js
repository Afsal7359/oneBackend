let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }

const isConfigured = () =>
  !!(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Sends an email. Returns { sent: boolean }. When SMTP is not configured
// it logs the message (so OTP flows are testable in dev) and returns sent:false.
async function sendMail({ to, subject, html, text, replyTo }) {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n[email:dev] ${text || html}\n`);
    return { sent: false };
  }
  const from = process.env.MAIL_FROM || `Aligaah Designs <${process.env.SMTP_USER}>`;
  await t.sendMail({ from, to, subject, html, text, replyTo });
  return { sent: true };
}

function otpEmail(otp, name) {
  const text = `Hi ${name || 'there'}, your Aligaah Designs verification code is ${otp}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#191b22;color:#e8ce8f;padding:20px;text-align:center;font-size:18px;letter-spacing:2px">ALIGAAH DESIGNS</div>
      <div style="padding:28px 26px;color:#333">
        <p>Hi ${name || 'there'},</p>
        <p>Use this code to verify your email / reset your password:</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;color:#B0902F;margin:18px 0">${otp}</div>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    </div>`;
  return { subject: 'Your Aligaah Designs verification code', text, html };
}

// ---------------------------------------------------------------------------
// Order emails
// ---------------------------------------------------------------------------

const GOLD = '#B0902F';
const INK = '#191b22';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
// HTML bodies use entities rather than literal UTF-8: an email client that
// falls back to Latin-1 renders a raw ₹ as "â,¹", which would garble every
// price in the message. Entities are safe in every client.
const moneyH = (n) => `&#8377;${Number(n || 0).toLocaleString('en-IN')}`;
// Anything that reaches a template comes from customer input, so escape it.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const orderRef = (order) => String(order._id).slice(-6).toUpperCase();

function addressLines(s = {}) {
  return [s.line1, s.line2, [s.city, s.state].filter(Boolean).join(', '), s.pincode, s.country || 'India']
    .filter(Boolean);
}

function itemRows(items = []) {
  return items.map((it) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece2">
        <table cellpadding="0" cellspacing="0"><tr>
          ${it.image ? `<td width="56" style="padding-right:12px"><img src="${esc(it.image)}" width="56" height="70" style="display:block;border-radius:6px;object-fit:cover" alt=""></td>` : ''}
          <td style="font-family:Arial,sans-serif;font-size:14px;color:#333">
            <div style="font-weight:600">${esc(it.title)}</div>
            <div style="color:#8a8a8a;font-size:12.5px">${esc(it.code)} &middot; Qty ${it.qty}</div>
          </td>
        </tr></table>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece2;text-align:right;font-family:Arial,sans-serif;font-size:14px;white-space:nowrap">
        ${moneyH(it.price * it.qty)}
      </td>
    </tr>`).join('');
}

function totalsBlock(order) {
  const row = (label, value, bold) => `
    <tr>
      <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:${bold ? '16px' : '14px'};color:${bold ? '#222' : '#666'};${bold ? 'font-weight:700;padding-top:10px' : ''}">${label}</td>
      <td style="padding:4px 0;text-align:right;font-family:Arial,sans-serif;font-size:${bold ? '18px' : '14px'};color:${bold ? GOLD : '#333'};${bold ? 'font-weight:700;padding-top:10px' : ''}">${value}</td>
    </tr>`;
  return `
    ${row('Items total', moneyH(order.itemsTotal))}
    ${order.coupon?.discount ? row(`Coupon ${esc(order.coupon.code)}`, `&minus; ${moneyH(order.coupon.discount)}`) : ''}
    ${row('Shipping', order.shippingFee ? moneyH(order.shippingFee) : 'Free')}
    ${row('Total', moneyH(order.grandTotal), true)}`;
}

function shell(heading, sub, bodyHtml) {
  return `
  <div style="background:#f6f4ef;padding:24px 0;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #ece7db">
      <div style="background:${INK};color:#e8ce8f;padding:22px;text-align:center">
        <div style="font-size:19px;letter-spacing:4px">ALIGAAH DESIGNS</div>
        <div style="font-size:11px;letter-spacing:2px;color:#9d9384;margin-top:4px">HANDCRAFTED ETHNIC WEAR</div>
      </div>
      <div style="padding:28px 26px;color:#333">
        <h1 style="margin:0 0 6px;font-size:21px;font-weight:600;color:#222">${heading}</h1>
        <p style="margin:0 0 20px;color:#777;font-size:14px">${sub}</p>
        ${bodyHtml}
      </div>
      <div style="background:#faf8f3;padding:16px 26px;text-align:center;color:#9a9a9a;font-size:12px">
        Aligaah Designs &middot; This is an automated message.
      </div>
    </div>
  </div>`;
}

// --- customer confirmation ---
function orderConfirmationEmail(order) {
  const ref = orderRef(order);
  const paid = order.isPaid;
  const name = order.shipping?.name || 'there';

  const payLine = paid
    ? `Paid online${order.payment?.paymentId ? ` &middot; ${esc(order.payment.paymentId)}` : ''}`
    : 'Cash on Delivery &mdash; please keep the amount ready';

  const html = shell(
    `Thank you, ${esc(name.split(' ')[0])}!`,
    `Your order <b>#${ref}</b> is confirmed and we've started preparing it.`,
    `
    <table width="100%" cellpadding="0" cellspacing="0">${itemRows(order.items)}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${totalsBlock(order)}</table>

    <div style="margin-top:22px;padding:14px 16px;background:#faf7ee;border-radius:10px;font-size:13.5px;line-height:1.6">
      <b style="color:#222">Payment</b><br>${payLine}
    </div>

    <div style="margin-top:14px;padding:14px 16px;background:#faf7ee;border-radius:10px;font-size:13.5px;line-height:1.6">
      <b style="color:#222">Delivering to</b><br>
      ${esc(order.shipping?.name)}<br>
      ${addressLines(order.shipping).map(esc).join('<br>')}<br>
      ${esc(order.shipping?.phone)}
    </div>

    <p style="margin-top:22px;font-size:13.5px;color:#666;line-height:1.6">
      We'll email you again when your parcel ships. Just reply to this message if
      anything looks wrong &mdash; quote order <b>#${ref}</b>.
    </p>`
  );

  const text = [
    `Thank you, ${name}!`,
    `Your Aligaah Designs order #${ref} is confirmed.`,
    '',
    ...order.items.map((it) => `- ${it.title} (${it.code}) x${it.qty}  ${money(it.price * it.qty)}`),
    '',
    `Items total: ${money(order.itemsTotal)}`,
    order.coupon?.discount ? `Coupon ${order.coupon.code}: -${money(order.coupon.discount)}` : '',
    `Shipping: ${order.shippingFee ? money(order.shippingFee) : 'Free'}`,
    `Total: ${money(order.grandTotal)}`,
    '',
    `Payment: ${paid ? 'Paid online' : 'Cash on Delivery'}`,
    '',
    'Delivering to:',
    order.shipping?.name,
    ...addressLines(order.shipping),
    order.shipping?.phone,
  ].filter(Boolean).join('\n');

  return { subject: `Order #${ref} confirmed — Aligaah Designs`, text, html };
}

// --- owner / admin alert ---
function ownerOrderEmail(order) {
  const ref = orderRef(order);
  const paid = order.isPaid;

  const html = shell(
    `New order #${ref}`,
    `${paid ? 'Paid online' : 'Cash on Delivery'} &middot; <b style="color:${GOLD}">${moneyH(order.grandTotal)}</b>`,
    `
    <div style="padding:14px 16px;background:${paid ? '#eefaf3' : '#fdf6e9'};border-radius:10px;font-size:13.5px;line-height:1.6;margin-bottom:18px">
      <b style="color:#222">${paid ? '&#10003; Payment received' : '&#9888; Collect on delivery'}</b>
      ${order.payment?.paymentId ? `<br>Razorpay: ${esc(order.payment.paymentId)}` : ''}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">${itemRows(order.items)}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${totalsBlock(order)}</table>

    <div style="margin-top:22px;padding:14px 16px;background:#f7f6f2;border-radius:10px;font-size:13.5px;line-height:1.7">
      <b style="color:#222">Ship to</b><br>
      ${esc(order.shipping?.name)}<br>
      ${addressLines(order.shipping).map(esc).join('<br>')}<br>
      <a href="tel:${esc(order.shipping?.phone)}" style="color:${GOLD}">${esc(order.shipping?.phone)}</a>
      ${order.shipping?.email ? `<br><a href="mailto:${esc(order.shipping.email)}" style="color:${GOLD}">${esc(order.shipping.email)}</a>` : ''}
    </div>

    <p style="margin-top:20px;font-size:13px;color:#888">
      Placed ${new Date(order.createdAt || Date.now()).toLocaleString('en-IN')} &middot;
      Open the admin panel to mark it shipped.
    </p>`
  );

  const text = [
    `NEW ORDER #${ref} — ${money(order.grandTotal)} (${paid ? 'PAID online' : 'COD — collect on delivery'})`,
    '',
    ...order.items.map((it) => `- ${it.title} (${it.code}) x${it.qty}  ${money(it.price * it.qty)}`),
    '',
    `Total: ${money(order.grandTotal)}`,
    '',
    'Ship to:',
    order.shipping?.name,
    ...addressLines(order.shipping),
    order.shipping?.phone,
    order.shipping?.email,
  ].filter(Boolean).join('\n');

  return { subject: `New order #${ref} — ${money(order.grandTotal)}${paid ? '' : ' (COD)'}`, text, html };
}

/**
 * Fire both order emails. Never throws and never blocks the checkout response —
 * a mail outage must not cost the shop an order. Failures are logged instead.
 */
function notifyNewOrder(order) {
  const ref = orderRef(order);

  const jobs = [];

  const customer = order.shipping?.email;
  if (customer) {
    jobs.push(
      sendMail({ to: customer, ...orderConfirmationEmail(order) })
        .then((r) => console.log(`[email] order ${ref} confirmation -> ${customer} ${r.sent ? 'sent' : '(smtp off, logged)'}`))
        .catch((e) => console.error(`[email] order ${ref} confirmation to ${customer} FAILED: ${e.message}`))
    );
  } else {
    console.warn(`[email] order ${ref} has no customer email — confirmation skipped`);
  }

  const owners = (process.env.OWNER_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (owners.length) {
    jobs.push(
      // replyTo the customer, so the owner can answer straight from the alert.
      sendMail({ to: owners.join(','), replyTo: customer || undefined, ...ownerOrderEmail(order) })
        .then((r) => console.log(`[email] order ${ref} owner alert -> ${owners.join(',')} ${r.sent ? 'sent' : '(smtp off, logged)'}`))
        .catch((e) => console.error(`[email] order ${ref} owner alert FAILED: ${e.message}`))
    );
  } else {
    console.warn('[email] OWNER_EMAIL not set — no owner alert sent');
  }

  return Promise.allSettled(jobs);
}

module.exports = {
  sendMail, otpEmail, isConfigured,
  orderConfirmationEmail, ownerOrderEmail, notifyNewOrder,
};
