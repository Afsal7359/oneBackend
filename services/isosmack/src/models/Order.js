import mongoose from 'mongoose';

/** Atomic sequence source for human-readable order numbers. */
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String, default: '' },
    flavour: { type: String, default: '' },
    packValue: { type: String, default: '' },
    price: { type: Number, required: true }, // unit price charged
    mrp: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },

    shippingAddress: {
      fullName: String,
      phone: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },

    pricing: {
      itemsTotal: { type: Number, required: true }, // sum of line subtotals
      itemsMrpTotal: { type: Number, default: 0 },
      couponCode: { type: String, default: '' },
      couponDiscount: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      codFee: { type: Number, default: 0 },
      prepaidDiscount: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },

    payment: {
      method: { type: String, enum: ['razorpay', 'cod'], required: true },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      razorpaySignature: { type: String, default: '' },
      simulated: { type: Boolean, default: false },
      paidAt: { type: Date },
      failureReason: { type: String, default: '' },
      refundId: { type: String, default: '' },
      refundedAmount: { type: Number, default: 0 },
      refundedAt: { type: Date },
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    timeline: {
      type: [
        {
          status: String,
          note: String,
          at: { type: Date, default: Date.now },
          by: { type: String, default: 'system' },
          _id: false,
        },
      ],
      default: [],
    },

    tracking: {
      carrier: { type: String, default: '' },
      awb: { type: String, default: '' },
      url: { type: String, default: '' },
    },

    /** Guards against decrementing inventory twice for the same order. */
    stockCommitted: { type: Boolean, default: false },
    stockReleased: { type: Boolean, default: false },

    customerNote: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    cancelReason: { type: String, default: '' },
    deliveredAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });

orderSchema.pre('save', async function assignNumber(next) {
  if (this.orderNumber) return next();
  const year = new Date().getFullYear();
  const counter = await Counter.findByIdAndUpdate(
    `order-${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  this.orderNumber = `ISO${year}${String(counter.seq).padStart(5, '0')}`;
  next();
});

orderSchema.methods.pushTimeline = function pushTimeline(status, note = '', by = 'system') {
  this.timeline.push({ status, note, by, at: new Date() });
};

export { Counter };
export default mongoose.model('Order', orderSchema);
