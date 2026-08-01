import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: {
      type: [
        {
          product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
          qty: { type: Number, required: true, min: 1, default: 1 },
          addedAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
    couponCode: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Cart', cartSchema);
