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
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n[email:dev] ${text || html}\n`);
    return { sent: false };
  }
  const from = process.env.MAIL_FROM || `Aligaah Designs <${process.env.SMTP_USER}>`;
  await t.sendMail({ from, to, subject, html, text });
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

module.exports = { sendMail, otpEmail, isConfigured };
