/**
 * Billing (NexBill) models.
 * ---------------------------------------------------------------------------
 * These live in the SAME database as the underdawg website and deliberately
 * reuse the website's `Product` collection as the catalogue — a bill sells the
 * very same products the shop sells, and completing a bill decrements the same
 * variant stock. Everything billing-specific is namespaced with a `Billing`
 * prefix so it can never collide with the website's own User/Order models.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/* ------------------------------------------------------------------ users -- */
/** Staff logins for the billing app. Created from the website admin panel. */
const billingUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['cashier', 'manager'], default: 'cashier' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

billingUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
billingUserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};
billingUserSchema.methods.toJSON = function () {
  const o = this.toObject();
  delete o.password;
  return o;
};

/* ---------------------------------------------------------------- parties -- */
/** Customers & suppliers with a running balance (khata). */
const billingPartySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    type: { type: String, enum: ['customer', 'supplier'], default: 'customer' },
    bal: { type: Number, default: 0 },   // >0 = they owe us, <0 = we owe them
    hue: { type: Number, default: 210 }, // avatar gradient
    walk: { type: Boolean, default: false }, // the default "Walk-in Customer"
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

/* ----------------------------------------------------------------- orders -- */
/**
 * A bill. Line items are SNAPSHOTS (name/price/image captured at sale time) so
 * historical invoices never change when a product is later edited or renamed.
 * `custom: true` marks an ad-hoc line typed at the counter that is not — and
 * never becomes — a catalogue product.
 */
const billingItemSchema = new mongoose.Schema(
  {
    pid: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // null for custom lines
    name: { type: String, required: true },
    size: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    img: { type: String, default: '' },
    code: { type: String, default: '' },
    custom: { type: Boolean, default: false },
  },
  { _id: false }
);

const billingOrderSchema = new mongoose.Schema(
  {
    no: { type: String, required: true, unique: true, index: true }, // INV-1068
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingParty', index: true },
    items: { type: [billingItemSchema], default: [] },
    sub: { type: Number, default: 0 },
    disc: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    mode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Credit'], default: 'Cash' },
    status: { type: String, enum: ['paid', 'partial', 'pending', 'overdue'], default: 'paid', index: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser' },
  },
  { timestamps: true }
);

/* --------------------------------------------------------------- payments -- */
const billingPaymentSchema = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingParty', index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingOrder' },
    amt: { type: Number, required: true },
    mode: { type: String, default: 'Cash' },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser' },
  },
  { timestamps: true }
);

/* --------------------------------------------------------------- expenses -- */
const billingExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    cat: { type: String, default: 'Other' },
    amt: { type: Number, required: true, min: 0 },
    mode: { type: String, default: 'Cash' },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

/* --------------------------------------------------------------- settings -- */
const billingSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    storeName: { type: String, default: 'underdawg' },
    owner: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    currency: { type: String, default: 'GBP' },
    taxRate: { type: Number, default: 0 },      // % — 0 = no tax by default
    taxLabel: { type: String, default: 'VAT' },
    taxDefaultOn: { type: Boolean, default: false },
    logoUrl: { type: String, default: '/logo.png' },
    footerNote: { type: String, default: 'Thank you for shopping with underdawg.' },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------------- counter -- */
/** Atomic sequence source for invoice numbers. */
const billingCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 1000 },
});

export const BillingUser = mongoose.model('BillingUser', billingUserSchema);
export const BillingParty = mongoose.model('BillingParty', billingPartySchema);
export const BillingOrder = mongoose.model('BillingOrder', billingOrderSchema);
export const BillingPayment = mongoose.model('BillingPayment', billingPaymentSchema);
export const BillingExpense = mongoose.model('BillingExpense', billingExpenseSchema);
export const BillingSettings = mongoose.model('BillingSettings', billingSettingsSchema);
export const BillingCounter = mongoose.model('BillingCounter', billingCounterSchema);

/**
 * Reserve the next invoice number atomically (safe under concurrent bills).
 * The counter is seeded at 1000 on first use so invoices start at INV-1001
 * rather than INV-1 — `setDefaultsOnInsert` can't do this because `seq` is
 * itself the field being $inc'd on upsert.
 */
export async function nextInvoiceNo() {
  const existing = await BillingCounter.findOne({ key: 'invoice' });
  if (!existing) {
    await BillingCounter.updateOne(
      { key: 'invoice' },
      { $setOnInsert: { key: 'invoice', seq: 1000 } },
      { upsert: true }
    );
  }
  const c = await BillingCounter.findOneAndUpdate(
    { key: 'invoice' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `INV-${c.seq}`;
}

/** Load (creating on first run) the single settings document. */
export async function getBillingSettings() {
  let s = await BillingSettings.findOne({ key: 'default' });
  if (!s) s = await BillingSettings.create({ key: 'default' });
  return s;
}
