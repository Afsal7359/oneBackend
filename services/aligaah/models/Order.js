const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    code: String,
    title: String,
    image: String,
    price: Number,
    qty: Number,
    // Snapshot of what was chosen, so the packing slip still reads correctly
    // after the product's size or colour list is later edited.
    size: { type: String, default: '' },
    color: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [orderItemSchema],
    shipping: {
      name: String, phone: String, email: String,
      line1: String, line2: String, city: String,
      state: String, pincode: String, country: { type: String, default: 'India' },
    },
    // Snapshot of the partner chosen at checkout, so the order still reads
    // correctly after the settings list changes.
    courier: {
      name: { type: String, default: '' },
      description: { type: String, default: '' },
    },
    itemsTotal: { type: Number, default: 0 },
    coupon: { code: String, discount: { type: Number, default: 0 } },
    shippingFee: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'COD' },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
    payment: {
      provider: { type: String, default: '' },
      orderId: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      signature: { type: String, default: '' },
      // 'created'  -> gateway order opened, customer hasn't paid yet
      // 'paid'     -> signature/webhook confirmed, money captured
      // 'failed'   -> gateway reported a failed attempt
      status: { type: String, enum: ['', 'created', 'paid', 'failed'], default: '' },
      amount: { type: Number, default: 0 },   // paise, as sent to the gateway
      method: { type: String, default: '' },  // upi / card / netbanking ...
      error: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// One local order per gateway order id — makes verify/webhook lookups fast and
// stops a replayed verify call from creating a second order for one payment.
orderSchema.index(
  { 'payment.orderId': 1 },
  { unique: true, partialFilterExpression: { 'payment.orderId': { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('Order', orderSchema);
