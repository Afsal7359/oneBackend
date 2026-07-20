import express from 'express';
import { createPaymentIntent, stripeWebhook } from '../controllers/stripeController.js';

const router = express.Router();

// Webhook needs raw body — must be registered BEFORE express.json() in server.js
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
router.post('/create-intent', createPaymentIntent);

export default router;
