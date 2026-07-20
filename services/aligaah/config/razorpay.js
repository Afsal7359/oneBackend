let Razorpay;
try { Razorpay = require('razorpay'); } catch (_) { Razorpay = null; }

const isConfigured = () =>
  !!(Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const instance = isConfigured()
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

module.exports = { instance, isConfigured };
