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
    // 'UPI' is retired (replaced by 'Stripe') but must stay accepted — bills
    // written before the switch still hold it, and save() validates the whole
    // doc, so a void/restore/payment on an old bill would otherwise throw.
    mode: { type: String, enum: ['Cash', 'Stripe', 'Card', 'Credit', 'UPI'], default: 'Cash' },
    status: { type: String, enum: ['paid', 'partial', 'pending', 'overdue'], default: 'paid', index: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser' },

    /* ---- void (trash) ----------------------------------------------------
     * Bills are NEVER hard-deleted — a sale is a financial record. Voiding
     * moves it to the trash, returns the stock, unwinds the customer's
     * balance and removes it from sales/reports, while keeping the full
     * audit trail (who, when, why) and allowing a restore.
     *   'deleted'  = billed by mistake, should never have existed
     *   'returned' = customer brought the goods back
     */
    voided: { type: Boolean, default: false, index: true },
    voidType: { type: String, enum: ['deleted', 'returned'], default: null },
    voidReason: { type: String, default: '' },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser' },
    // Money already taken that must be handed back (0 for an unpaid bill).
    refundDue: { type: Number, default: 0 },
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

    // Soft-delete, matching how bills are voided: a deleted expense moves to
    // the trash (out of lists and reports) but can be restored. Never hard-deleted.
    voided: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: '' },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser' },
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

/* ----------------------------------------------------------------- push ---- */
/**
 * One row per DEVICE (not per user) — a cashier may be signed in on a phone and
 * a tablet, and each browser gives its own push endpoint. `endpoint` is unique
 * so re-subscribing the same device updates rather than duplicating.
 */
const billingPushSubSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingUser', index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    label: { type: String, default: '' },      // friendly device name for admin
    lastUsedAt: { type: Date, default: Date.now },
    failCount: { type: Number, default: 0 },   // consecutive send failures
  },
  { timestamps: true }
);

/**
 * Which notifications are switched on. Managed from the WEBSITE admin panel so
 * the shop owner controls this without touching the till app.
 */
const notifySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    enabled: { type: Boolean, default: true },        // master switch
    events: {
      websiteOrder: { type: Boolean, default: true },  // customer bought online
      dailySummary: { type: Boolean, default: true },  // end-of-day totals
      paymentReceived: { type: Boolean, default: false },
      outOfStock: { type: Boolean, default: false },
    },
    // 24h clock, London time, for the daily summary.
    dailySummaryHour: { type: Number, default: 20, min: 0, max: 23 },
    // London YYYY-MM-DD of the last summary sent, so a restart can't re-send it.
    lastDailySummary: { type: String, default: '' },
    quietHours: {
      enabled: { type: Boolean, default: false },
      from: { type: Number, default: 22 },
      to: { type: Number, default: 8 },
    },
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
export const BillingPushSub = mongoose.model('BillingPushSub', billingPushSubSchema);
export const NotifySettings = mongoose.model('NotifySettings', notifySettingsSchema);

/** Load (creating on first run) the single notification-settings document. */
export async function getNotifySettings() {
  let s = await NotifySettings.findOne({ key: 'default' });
  if (!s) s = await NotifySettings.create({ key: 'default' });
  return s;
}

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
