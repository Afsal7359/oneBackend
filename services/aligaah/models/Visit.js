const mongoose = require('mongoose');

// One document per tracked event (page view OR product view)
const visitSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['page', 'product'], default: 'page' },
    path: { type: String, default: '/' },          // screen / route (for page)
    screen: { type: String, default: '' },          // friendly screen name
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productCode: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    referrer: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    day: { type: String, index: true },             // YYYY-MM-DD for date-wise grouping
  },
  { timestamps: true }
);

visitSchema.index({ createdAt: 1 });
visitSchema.index({ type: 1, day: 1 });

module.exports = mongoose.model('Visit', visitSchema);
