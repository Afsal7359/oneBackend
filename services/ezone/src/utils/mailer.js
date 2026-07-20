import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

const FROM = () => process.env.EMAIL_FROM || 'ezoneshoppi <noreply@ezoneshoppi.com>';
const SITE = () => process.env.SITE_NAME || 'ezoneshoppi';
const SITE_URL = () => process.env.CLIENT_URL || 'https://www.ezoneshoppi.com';

function rupee(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

/* ── shared wrapper ─────────────────────────────────────────────── */
async function send(opts) {
  try {
    await getTransporter().sendMail({ from: FROM(), ...opts });
  } catch (err) {
    console.error('[mailer] Failed to send email to', opts.to, '—', err.message);
  }
}

/* ── OTP (login / signup) ───────────────────────────────────────── */
export async function sendOtpEmail(to, otp, siteName = SITE()) {
  await send({
    to,
    subject: `${otp} is your ${siteName} verification code`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;border:1px solid #e5e7eb">
        <h2 style="margin:0 0 8px;font-size:22px;color:#111827">${siteName}</h2>
        <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Your verification code is:</p>
        <div style="letter-spacing:10px;font-size:40px;font-weight:800;color:#2563eb;text-align:center;padding:24px 0;background:#eff6ff;border-radius:12px">${otp}</div>
        <p style="margin:20px 0 0;color:#6b7280;font-size:13px;text-align:center">Expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>`,
  });
}

/* ── Forgot-password OTP ────────────────────────────────────────── */
export async function sendForgotPasswordOtp(to, otp, siteName = SITE()) {
  await send({
    to,
    subject: `Reset your ${siteName} password`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;border:1px solid #e5e7eb">
        <h2 style="margin:0 0 8px;font-size:22px;color:#111827">${siteName}</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:15px">You requested a password reset.</p>
        <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Use this OTP to set a new password:</p>
        <div style="letter-spacing:10px;font-size:40px;font-weight:800;color:#dc2626;text-align:center;padding:24px 0;background:#fef2f2;border-radius:12px">${otp}</div>
        <p style="margin:20px 0 0;color:#6b7280;font-size:13px;text-align:center">Expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
      </div>`,
  });
}

/* ── Order confirmation (to customer) ──────────────────────────── */
export async function sendOrderConfirmationEmail(to, order, siteName = SITE()) {
  const addr = order.shippingAddress || {};
  const itemsHtml = (order.items || []).map((it) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6">
        ${it.image ? `<img src="${it.image}" width="50" height="50" style="border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:10px" />` : ''}
        <span style="font-size:14px;color:#111827">${it.name}</span>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:center;color:#6b7280;font-size:14px">×${it.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;font-size:14px">${rupee(it.price * it.quantity)}</td>
    </tr>`).join('');

  await send({
    to,
    subject: `Order confirmed — #${order.orderNumber} | ${siteName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff">
        <!-- Header -->
        <div style="background:#2563eb;padding:24px 32px;border-radius:16px 16px 0 0">
          <h1 style="margin:0;color:#fff;font-size:24px">${siteName}</h1>
          <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px">Order Confirmation</p>
        </div>

        <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-size:16px;color:#166534;font-weight:600">✅ Your order has been placed successfully!</p>
            <p style="margin:4px 0 0;color:#15803d;font-size:14px">Order #<strong>${order.orderNumber}</strong></p>
          </div>

          <!-- Items -->
          <h3 style="margin:0 0 12px;font-size:16px;color:#111827">Items Ordered</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Product</th>
                <th style="padding:8px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Qty</th>
                <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <!-- Totals -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
            ${order.discount > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Discount</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-size:14px">-${rupee(order.discount)}</td></tr>` : ''}
            ${order.shippingPrice > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Shipping</td><td style="padding:4px 0;text-align:right;font-size:14px">${rupee(order.shippingPrice)}</td></tr>` : `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Shipping</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-size:14px">Free</td></tr>`}
            ${order.taxPrice > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Tax</td><td style="padding:4px 0;text-align:right;font-size:14px">${rupee(order.taxPrice)}</td></tr>` : ''}
            <tr style="border-top:2px solid #e5e7eb">
              <td style="padding:10px 0 4px;font-weight:700;font-size:16px;color:#111827">Total</td>
              <td style="padding:10px 0 4px;text-align:right;font-weight:700;font-size:18px;color:#2563eb">${rupee(order.totalPrice)}</td>
            </tr>
          </table>

          <!-- Shipping Address -->
          <div style="margin-top:24px;padding:16px 20px;background:#f9fafb;border-radius:12px">
            <h3 style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600">📍 Delivery Address</h3>
            <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6">
              ${addr.fullName}<br/>
              ${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}<br/>
              ${addr.city}, ${addr.state} — ${addr.postalCode}<br/>
              ${addr.country || 'India'}
            </p>
          </div>

          <!-- Payment -->
          <div style="margin-top:16px;padding:12px 20px;background:#eff6ff;border-radius:12px">
            <p style="margin:0;font-size:14px;color:#1e40af">
              💳 <strong>Payment:</strong> ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod === 'razorpay' ? 'Paid via Razorpay' : 'WhatsApp Order'} &nbsp;|&nbsp;
              <strong>Status:</strong> ${order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'}
            </p>
          </div>

          <div style="margin-top:28px;text-align:center">
            <a href="${SITE_URL()}/account/orders/${order._id}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">View Your Order</a>
          </div>

          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center">
            Thank you for shopping at ${siteName}! If you have any questions, reply to this email.
          </p>
        </div>
      </div>`,
  });
}

/* ── New order notification (to admin) ──────────────────────────── */
export async function sendAdminNewOrderEmail(order, customerEmail, siteName = SITE()) {
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER;
  if (!adminTo) return;

  const addr = order.shippingAddress || {};
  const itemsList = (order.items || []).map((it) =>
    `<li style="padding:4px 0;font-size:14px;color:#374151">${it.name} × ${it.quantity} — ${rupee(it.price * it.quantity)}</li>`
  ).join('');

  await send({
    to: adminTo,
    subject: `🛒 New Order #${order.orderNumber} — ${rupee(order.totalPrice)} | ${siteName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;border:1px solid #e5e7eb">
        <div style="background:#1e293b;padding:20px 24px;border-radius:12px;margin-bottom:24px">
          <h2 style="margin:0;color:#fff;font-size:20px">🛒 New Order Received</h2>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:14px">${siteName} Admin Alert</p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:130px">Order #</td><td style="padding:6px 0;font-weight:700;font-size:15px;color:#111827">${order.orderNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Customer</td><td style="padding:6px 0;font-size:14px;color:#111827">${addr.fullName} &lt;${customerEmail}&gt;</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Phone</td><td style="padding:6px 0;font-size:14px;color:#111827">${addr.phone || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Payment</td><td style="padding:6px 0;font-size:14px;color:#111827">${order.paymentMethod} — ${order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Total</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#2563eb">${rupee(order.totalPrice)}</td></tr>
        </table>

        <h3 style="margin:0 0 8px;font-size:14px;color:#374151">Items:</h3>
        <ul style="margin:0 0 20px;padding-left:20px">${itemsList}</ul>

        <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
          <p style="margin:0;font-size:13px;color:#6b7280">
            📍 ${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}, ${addr.city}, ${addr.state} — ${addr.postalCode}
          </p>
        </div>

        <div style="text-align:center">
          <a href="${SITE_URL()}/admin/orders/${order._id}" style="display:inline-block;padding:11px 26px;background:#1e293b;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">View in Admin Panel</a>
        </div>
      </div>`,
  });
}
