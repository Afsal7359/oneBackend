import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// ── CREATE PAYMENT INTENT ────────────────────────────────────────────────────
export const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'gbp', metadata = {} } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ message: 'Invalid amount' });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // pence
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    console.error('createPaymentIntent error', err);
    res.status(500).json({ message: err.message });
  }
};

// ── STRIPE WEBHOOK ───────────────────────────────────────────────────────────
export const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature error', err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    // Update order payment status
    const { default: Order } = await import('../models/Order.js');
    const order = await Order.findOne({ paymentIntentId: intent.id });
    if (order) {
      order.paymentStatus = 'paid';
      order.status = 'confirmed';
      order.trackingEvents.push({ status: 'confirmed', message: 'Payment received', timestamp: new Date() });
      await order.save();
    }
  }

  res.json({ received: true });
};
