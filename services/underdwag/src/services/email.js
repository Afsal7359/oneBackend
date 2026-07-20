import nodemailer from 'nodemailer';

let _transporter;

export const getTransporter = () => {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transporter;
};

const brand = `<span style="font-family:Georgia,serif;letter-spacing:0.15em;font-weight:700">underdawg</span>`;

const wrap = (body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:4px;overflow:hidden">
        <tr>
          <td style="background:#111;padding:28px 40px;text-align:center">
            <a href="#" style="color:#fff;text-decoration:none;font-size:22px">${brand}</a>
          </td>
        </tr>
        <tr><td style="padding:40px">${body}</td></tr>
        <tr>
          <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee">
            <p style="margin:0;font-size:12px;color:#999">© ${new Date().getFullYear()} underdawg. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/* ── OTP ─────────────────────────────────────────────────────────────────── */
export const sendOtp = async (email, otp, subject = 'Your underdawg verification code') => {
  await getTransporter().sendMail({
    from: `"underdawg" <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    html: wrap(`
      <p style="font-size:15px;color:#333;margin-top:0">Your one-time code:</p>
      <div style="font-size:40px;letter-spacing:0.3em;font-weight:700;color:#111;margin:24px 0;text-align:center">${otp}</div>
      <p style="font-size:13px;color:#999;text-align:center">Valid for 10 minutes. Do not share this code.</p>
    `),
  });
};

/* ── Order items table ───────────────────────────────────────────────────── */
const itemsTable = (items, uploadsUrl = '') => `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
  <thead>
    <tr style="background:#f9f9f9">
      <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#666;border-bottom:1px solid #eee">Product</th>
      <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#666;border-bottom:1px solid #eee">Qty</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#666;border-bottom:1px solid #eee">Price</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it) => {
  const imgSrc = it.image
    ? (it.image.startsWith('http') ? it.image : `${uploadsUrl}${it.image}`)
    : '';
  return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #f5f5f5;font-size:14px;color:#333">
          ${imgSrc ? `<img src="${imgSrc}" width="48" height="60" style="object-fit:cover;border-radius:3px;vertical-align:middle;margin-right:10px">` : ''}
          ${it.title}${it.size ? ` <span style="color:#999;font-size:12px">(${it.size})</span>` : ''}
        </td>
        <td style="padding:12px;border-bottom:1px solid #f5f5f5;font-size:14px;color:#333;text-align:center">${it.quantity}</td>
        <td style="padding:12px;border-bottom:1px solid #f5f5f5;font-size:14px;color:#333;text-align:right;white-space:nowrap">£${(it.price * it.quantity).toLocaleString('en-GB')}</td>
      </tr>`;
}).join('')}
  </tbody>
</table>`;

const totalsBlock = (order) => `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="font-size:13px;color:#555;padding:4px 0">Subtotal</td>
    <td style="font-size:13px;color:#555;text-align:right;padding:4px 0">£${order.subtotal.toLocaleString('en-GB')}</td>
  </tr>
  <tr>
    <td style="font-size:13px;color:#555;padding:4px 0">Shipping</td>
    <td style="font-size:13px;color:#555;text-align:right;padding:4px 0">${order.shippingFee === 0 ? 'Free' : `£${order.shippingFee}`}</td>
  </tr>
  ${order.couponDiscount > 0 ? `
  <tr>
    <td style="font-size:13px;color:#16a34a;padding:4px 0">Coupon (${order.couponCode})</td>
    <td style="font-size:13px;color:#16a34a;text-align:right;padding:4px 0">−£${order.couponDiscount.toLocaleString('en-GB')}</td>
  </tr>` : ''}
  <tr>
    <td style="font-size:16px;font-weight:700;color:#111;padding:12px 0 4px;border-top:2px solid #111">Total</td>
    <td style="font-size:16px;font-weight:700;color:#111;text-align:right;padding:12px 0 4px;border-top:2px solid #111">£${order.total.toLocaleString('en-GB')}</td>
  </tr>
</table>`;

const addressBlock = (addr) => `
<div style="background:#f9f9f9;border-radius:4px;padding:16px;font-size:13px;color:#555;line-height:1.7">
  <strong style="color:#111">${addr.fullName}</strong><br>
  ${addr.line1}${addr.line2 ? `, ${addr.line2}` : ''}<br>
  ${addr.city}, ${addr.state} ${addr.postalCode}<br>
  ${addr.country}<br>
  ${addr.phone}
</div>`;

/* ── Customer confirmation ───────────────────────────────────────────────── */
export const sendOrderConfirmation = async (order) => {
  const uploadsUrl = process.env.UPLOADS_URL || process.env.NEXT_PUBLIC_UPLOADS_URL || 'http://localhost:5005';
  await getTransporter().sendMail({
    from: `"underdawg" <${process.env.SMTP_USER}>`,
    to: order.email,
    subject: `Order Confirmed — ${order.orderNumber}`,
    html: wrap(`
      <h2 style="font-size:24px;color:#111;margin-top:0">Thank you for your order!</h2>
      <p style="font-size:15px;color:#555;margin-bottom:24px">
        Hi ${order.shippingAddress?.fullName?.split(' ')[0] || 'there'},<br>
        We've received your order and it's being prepared. Here's a summary:
      </p>

      <div style="background:#f9f9f9;border-radius:4px;padding:14px 18px;margin-bottom:24px;display:flex;justify-content:space-between">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Order</div>
          <div style="font-size:16px;font-weight:700;color:#111">${order.orderNumber}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Payment</div>
          <div style="font-size:14px;color:#555;text-transform:uppercase">${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod}</div>
        </div>
      </div>

      ${itemsTable(order.items, uploadsUrl)}
      ${totalsBlock(order)}

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px">Shipping to</h3>
      ${addressBlock(order.shippingAddress)}

      <p style="font-size:13px;color:#999;margin-top:24px">
        We'll notify you once your order ships. Questions? Reply to this email.
      </p>
    `),
  });
};

/* ── Admin notification ──────────────────────────────────────────────────── */
export const sendAdminOrderNotification = async (order) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  await getTransporter().sendMail({
    from: `"underdawg orders" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    subject: `New Order — ${order.orderNumber} — £${order.total.toLocaleString('en-GB')}`,
    html: wrap(`
      <h2 style="font-size:22px;color:#111;margin-top:0">New order received</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
        <tr>
          <td style="font-size:13px;color:#555;padding:3px 0">Order #</td>
          <td style="font-size:13px;color:#111;font-weight:600;text-align:right">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#555;padding:3px 0">Customer</td>
          <td style="font-size:13px;color:#111;text-align:right">${order.shippingAddress?.fullName} — ${order.email}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#555;padding:3px 0">Phone</td>
          <td style="font-size:13px;color:#111;text-align:right">${order.shippingAddress?.phone}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#555;padding:3px 0">Payment</td>
          <td style="font-size:13px;color:#111;text-align:right;text-transform:uppercase">${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#555;padding:3px 0">Total</td>
          <td style="font-size:16px;font-weight:700;color:#111;text-align:right">£${order.total.toLocaleString('en-GB')}</td>
        </tr>
      </table>

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px">Items (${order.items.length})</h3>
      ${itemsTable(order.items)}

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px">Ship to</h3>
      ${addressBlock(order.shippingAddress)}
    `),
  });
};
