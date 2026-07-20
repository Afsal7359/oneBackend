import express from 'express';
import { verifyPayment, razorpayWebhook } from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Razorpay webhook — raw body needed for signature verification
// This MUST be registered before express.json() parses the body.
// We handle the raw body in app.js by using express.raw() for this path.
router.post('/webhook', razorpayWebhook);

// Client-side payment verification (after Razorpay modal closes)
router.post('/verify', protect, verifyPayment);

export default router;
