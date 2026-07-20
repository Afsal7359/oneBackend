import mongoose from 'mongoose';

const utmSchema = new mongoose.Schema(
  {
    source:   { type: String, default: '' },
    medium:   { type: String, default: '' },
    campaign: { type: String, default: '' },
  },
  { _id: false }
);

const pageEventSchema = new mongoose.Schema(
  {
    sid:     { type: String, required: true },          // session ID from frontend
    uid:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type:    {
      type: String,
      required: true,
      enum: ['pageview', 'click', 'section_view', 'cart_add', 'cart_remove',
             'checkout_start', 'purchase', 'scroll_depth'],
    },
    page:    { type: String, default: '' },             // pathname e.g. /product/blue-tee
    data:    { type: mongoose.Schema.Types.Mixed, default: {} },
    ref:     { type: String, default: '' },             // referrer URL
    src:     { type: String, default: 'direct' },       // traffic source
    utm:     { type: utmSchema, default: () => ({}) },
    device:  { type: String, default: '' },             // desktop | mobile | tablet
    browser: { type: String, default: '' },
    os:      { type: String, default: '' },
    screen:  { type: String, default: '' },             // "390x844"
    ip:      { type: String, default: '' },
    country: { type: String, default: '' },
    city:    { type: String, default: '' },
    ts:      { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Indexes for fast range queries
pageEventSchema.index({ ts: -1 });
pageEventSchema.index({ sid: 1, ts: -1 });
pageEventSchema.index({ type: 1, ts: -1 });
pageEventSchema.index({ src: 1, ts: -1 });

export default mongoose.model('PageEvent', pageEventSchema);
