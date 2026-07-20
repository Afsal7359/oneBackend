const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    code: String,
    title: String,
    image: String,
    price: Number,
    qty: Number,
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
    itemsTotal: { type: Number, default: 0 },
    coupon: { code: String, discount: { type: Number, default: 0 } },
    shippingFee: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'COD' },
    isPaid: { type: Boolean, default: false },
    payment: {
      provider: { type: String, default: '' },
      orderId: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      signature: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
