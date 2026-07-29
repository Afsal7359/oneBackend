/**
 * Billing (NexBill) API — mounted at /api/billing on the underdawg service,
 * so it shares the website's port, database and product catalogue.
 */

import express from 'express';
import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import {
  BillingUser, BillingParty, BillingOrder, BillingPayment, BillingExpense,
  BillingPushSub, nextInvoiceNo, getBillingSettings, BillingSettings,
} from '../models/billing.js';
import { sendPush, sendPushSafe, pushAvailable, publicKey } from '../services/push.js';
import { billingProtect, signBillingToken } from '../middleware/billingAuth.js';

const router = express.Router();

/* ------------------------------------------------------------- mapping ---- */
/**
 * Map a website Product document into the flat shape the billing UI expects.
 * The website stores stock per size variant; billing shows the total and keeps
 * the per-size breakdown so the counter can pick a size.
 */
function mapProduct(p) {
  const variants = (p.variants || []).map((v) => ({
    size: v.size,
    stock: v.stock || 0,
  }));
  const stock = variants.reduce((s, v) => s + v.stock, 0);
  return {
    id: String(p._id),
    name: p.title,
    price: p.price ?? 0,
    cost: p.cost ?? null,
    stock,
    variants,
    cat: p.category || 'other',
    code: p.barcode || '',
    img: (p.images && p.images[0]) || '',
    status: p.status,
    currency: p.currency || 'GBP',
    // Extra identifiers so staff can tell similar products apart in the list
    // (several underdawg products share a title, e.g. "Pocket sweater").
    slug: p.slug || '',
    ref: String(p._id).slice(-6).toUpperCase(),   // short human-quotable id
  };
}

/**
 * The catalogue's real category list, read straight from the website's Product
 * schema so the billing app's filter chips always match the shop. (The app used
 * to ship a hardcoded grocery list — Beverages/Snacks/Dairy — which matched no
 * underdawg product, so the chips filtered everything away.)
 */
function productCategories() {
  const path = Product.schema.path('category');
  const fromEnum = (path && path.enumValues) || [];
  return fromEnum.length ? [...fromEnum] : [];
}

const mapParty = (c) => ({
  id: String(c._id), name: c.name, phone: c.phone, type: c.type,
  bal: c.bal, hue: c.hue, walk: c.walk, notes: c.notes,
});

const mapOrder = (o) => ({
  id: String(o._id),
  no: o.no,
  cid: o.party ? String(o.party) : null,
  items: (o.items || []).map((i) => ({
    pid: i.pid ? String(i.pid) : null,
    name: i.name, size: i.size, price: i.price, qty: i.qty,
    img: i.img, code: i.code, custom: i.custom,
  })),
  sub: o.sub, disc: o.disc, tax: o.tax, taxRate: o.taxRate,
  total: o.total, paid: o.paid, mode: o.mode, status: o.status, date: o.date,
  voided: !!o.voided,
  voidType: o.voidType || null,
  voidReason: o.voidReason || '',
  voidedAt: o.voidedAt || null,
  refundDue: o.refundDue || 0,
});

const mapPayment = (p) => ({
  id: String(p._id), party: p.party ? String(p.party) : null,
  order: p.order ? String(p.order) : null, amt: p.amt, mode: p.mode, date: p.date,
});

// Field names here MUST match what the app's screens read: `amount`,
// `category` and `mode` (not amt/cat) — Expenses.jsx and Reports.jsx use those.
const mapExpense = (e) => ({
  id: String(e._id),
  title: e.title,
  category: e.cat,
  amount: e.amt,
  mode: e.mode,
  note: e.note,
  date: e.date,
  voided: !!e.voided,
  voidReason: e.voidReason || '',
  voidedAt: e.voidedAt || null,
});

/**
 * Round to 2 decimals. Money is summed from floats (28.99 + 2.50 ...), which
 * accumulates binary-float error — every monetary value is passed through this
 * before being stored or returned so totals are exact to the penny.
 */
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Recompute an order's status from what's been paid. */
function statusFor(total, paid, date) {
  if (paid >= total - 0.005) return 'paid';
  if (paid > 0) return 'partial';
  const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
  return ageDays > 30 ? 'overdue' : 'pending';
}

/* ---------------------------------------------------------------- auth ---- */
router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await BillingUser.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    if (!user.isActive) return res.status(403).json({ error: 'This account has been disabled' });

    user.lastLoginAt = new Date();
    await user.save();
    res.json({ token: signBillingToken(user), user: user.toJSON() });
  })
);

router.get('/auth/me', billingProtect, (req, res) => res.json({ user: req.billingUser.toJSON() }));

// Everything below requires a signed-in billing user.
router.use(billingProtect);

/* ----------------------------------------------------------- bootstrap ---- */
router.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.orders) || 200, 1000);

    // Ensure a default walk-in customer exists so a bill can always be raised.
    let walk = await BillingParty.findOne({ walk: true });
    if (!walk) walk = await BillingParty.create({ name: 'Walk-in Customer', type: 'customer', walk: true, hue: 210 });

    const [products, parties, orders, payments, expenses, settings] = await Promise.all([
      Product.find({ status: { $ne: 'archived' } }).sort({ createdAt: -1 }).lean(),
      BillingParty.find().sort({ createdAt: 1 }).lean(),
      BillingOrder.find().sort({ date: -1 }).limit(limit).lean(),
      BillingPayment.find().sort({ date: -1 }).limit(1000).lean(),
      // Load ALL expenses (incl. trashed) so the app's Trash view works
      // client-side; the live list filters voided out, like orders do.
      BillingExpense.find().sort({ date: -1 }).limit(500).lean(),
      getBillingSettings(),
    ]);

    // Only offer categories that actually have products, in catalogue order —
    // an empty chip that filters to nothing is just noise at the till.
    const used = new Set(products.map((p) => p.category || 'other'));
    const categories = productCategories().filter((c) => used.has(c));

    res.json({
      products: products.map(mapProduct),
      categories,
      parties: parties.map(mapParty),
      orders: orders.map(mapOrder),
      payments: payments.map(mapPayment),
      expenses: expenses.map(mapExpense),
      settings: settings.toJSON ? settings.toJSON() : settings,
      user: req.billingUser.toJSON(),
    });
  })
);

/* ------------------------------------------------------------ products ---- */
router.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const products = await Product.find({ status: { $ne: 'archived' } }).sort({ createdAt: -1 }).lean();
    res.json(products.map(mapProduct));
  })
);

/** Look a product up by its scanned barcode. */
router.get(
  '/products/by-code/:code',
  asyncHandler(async (req, res) => {
    const p = await Product.findOne({ barcode: String(req.params.code).trim() }).lean();
    if (!p) return res.status(404).json({ error: 'No product with that barcode' });
    res.json(mapProduct(p));
  })
);

/** Create a catalogue product from the billing app (gets a barcode automatically). */
router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const { name, price, cost, stock, cat, code, size } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });

    const doc = await Product.create({
      title: String(name).trim(),
      price: Number(price) || 0,
      cost: cost === undefined || cost === '' ? undefined : Number(cost),
      category: cat || 'other',
      barcode: code || undefined, // blank => auto-generated by the model hook
      status: 'active',
      variants: [{ size: size || 'One Size', stock: Number(stock) || 0 }],
    });
    res.status(201).json(mapProduct(doc.toObject()));
  })
);

/** Adjust stock. Applies the delta to a specific size when given. */
router.patch(
  '/products/:id/stock',
  asyncHandler(async (req, res) => {
    const { delta, size } = req.body || {};
    const d = Number(delta) || 0;
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });

    if (!p.variants || p.variants.length === 0) {
      p.variants = [{ size: 'One Size', stock: 0 }];
    }
    const v = (size && p.variants.find((x) => x.size === size)) || p.variants[0];
    v.stock = Math.max((v.stock || 0) + d, 0);
    await p.save();
    res.json(mapProduct(p.toObject()));
  })
);

router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { name, price, cost, cat } = req.body || {};
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    if (name !== undefined) p.title = String(name).trim();
    if (price !== undefined) p.price = Number(price) || 0;
    if (cost !== undefined) p.cost = cost === '' ? undefined : Number(cost);
    if (cat !== undefined) p.category = cat;
    await p.save();
    res.json(mapProduct(p.toObject()));
  })
);

/* ------------------------------------------------------------- parties ---- */
router.get(
  '/parties',
  asyncHandler(async (_req, res) => {
    const parties = await BillingParty.find().sort({ createdAt: 1 }).lean();
    res.json(parties.map(mapParty));
  })
);

router.post(
  '/parties',
  asyncHandler(async (req, res) => {
    const { name, phone, type, hue, notes } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const c = await BillingParty.create({
      name: String(name).trim(),
      phone: phone || '',
      type: type === 'supplier' ? 'supplier' : 'customer',
      hue: Number(hue) || Math.floor(Math.random() * 360),
      notes: notes || '',
    });
    res.status(201).json(mapParty(c));
  })
);

/* -------------------------------------------------------------- orders ---- */
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    // ?trash=1 lists voided bills; by default only live ones.
    const filter = req.query.trash === '1'
      ? { voided: true }
      : { voided: { $ne: true } };
    const orders = await BillingOrder.find(filter).sort({ date: -1 }).limit(limit).lean();
    res.json(orders.map(mapOrder));
  })
);

/* ------------------------------------------------------ void / restore ---- */
/**
 * Put the stock a bill consumed back on the shelf.
 * Custom (ad-hoc) lines have no catalogue product, so they're skipped.
 * Returns the touched product docs so the caller can save + return them.
 */
async function restockFromOrder(order, direction = +1) {
  const ids = (order.items || []).filter((i) => !i.custom && i.pid).map((i) => i.pid);
  if (!ids.length) return [];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const touched = new Map();

  for (const it of order.items || []) {
    if (it.custom || !it.pid) continue;
    const p = byId.get(String(it.pid));
    if (!p) continue;                       // product deleted since the sale
    if (!p.variants || !p.variants.length) p.variants = [{ size: it.size || 'One Size', stock: 0 }];
    const v = (it.size && p.variants.find((x) => x.size === it.size)) || p.variants[0];
    v.stock = Math.max((v.stock || 0) + direction * (it.qty || 0), 0);
    touched.set(String(p._id), p);
  }
  await Promise.all([...touched.values()].map((p) => p.save()));
  return [...touched.values()];
}

/**
 * Void a bill — 'deleted' (billed in error) or 'returned' (goods came back).
 * Both unwind the sale identically:
 *   • stock goes back to the exact size that was sold
 *   • any amount still owed comes off the customer's balance
 *   • the bill drops out of sales/reports (they filter voided)
 * Nothing is destroyed: the bill moves to the trash and can be restored.
 */
router.post(
  '/orders/:id/void',
  asyncHandler(async (req, res) => {
    const type = req.body?.type === 'returned' ? 'returned' : 'deleted';
    const reason = String(req.body?.reason || '').slice(0, 300);

    const order = await BillingOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Invoice not found' });
    if (order.voided) return res.status(400).json({ error: 'This bill is already in the trash' });

    const products = await restockFromOrder(order, +1);

    // Remove whatever is still outstanding from the customer's balance. Money
    // already taken stays recorded as payments and is reported as refundDue.
    const outstanding = Math.round(((order.total || 0) - (order.paid || 0)) * 100) / 100;
    let party = null;
    if (order.party) {
      party = outstanding
        ? await BillingParty.findByIdAndUpdate(order.party, { $inc: { bal: -outstanding } }, { new: true })
        : await BillingParty.findById(order.party);
    }

    order.voided = true;
    order.voidType = type;
    order.voidReason = reason;
    order.voidedAt = new Date();
    order.voidedBy = req.billingUser._id;
    order.refundDue = Math.round((order.paid || 0) * 100) / 100;
    await order.save();

    res.json({
      order: mapOrder(order.toObject()),
      products: products.map((p) => mapProduct(p.toObject())),
      party: party ? mapParty(party) : null,
    });
  })
);

/** Bring a bill back out of the trash, re-applying stock and balance. */
router.post(
  '/orders/:id/restore',
  asyncHandler(async (req, res) => {
    const order = await BillingOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Invoice not found' });
    if (!order.voided) return res.status(400).json({ error: 'This bill is not in the trash' });

    const products = await restockFromOrder(order, -1);   // take the stock back out

    const outstanding = Math.round(((order.total || 0) - (order.paid || 0)) * 100) / 100;
    let party = null;
    if (order.party) {
      party = outstanding
        ? await BillingParty.findByIdAndUpdate(order.party, { $inc: { bal: outstanding } }, { new: true })
        : await BillingParty.findById(order.party);
    }

    order.voided = false;
    order.voidType = null;
    order.voidReason = '';
    order.voidedAt = null;
    order.voidedBy = null;
    order.refundDue = 0;
    await order.save();

    res.json({
      order: mapOrder(order.toObject()),
      products: products.map((p) => mapProduct(p.toObject())),
      party: party ? mapParty(party) : null,
    });
  })
);

/**
 * Create a bill.
 * Totals are always recomputed server-side from the catalogue price (never
 * trusted from the client) except for `custom` lines, which are ad-hoc items
 * typed at the counter and deliberately never written to the catalogue.
 */
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const { cid, items, disc, tax, taxRate, mode, recv } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item to the bill' });
    }

    const settings = await getBillingSettings();
    const rate = tax ? (taxRate !== undefined ? Number(taxRate) : settings.taxRate || 0) : 0;

    // Resolve catalogue lines
    const catalogueIds = items.filter((i) => !i.custom && i.pid).map((i) => i.pid);
    const products = await Product.find({ _id: { $in: catalogueIds } });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const lines = [];
    const touched = new Map(); // productId -> doc (to save once after all lines)

    for (const it of items) {
      const qty = Math.max(Number(it.qty) || 0, 0);
      if (!qty) continue;

      if (it.custom) {
        const name = String(it.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Custom items need a name' });
        lines.push({
          pid: null, name, size: it.size || '',
          price: Number(it.price) || 0, qty,
          img: '', code: '', custom: true,
        });
        continue;
      }

      const p = byId.get(String(it.pid));
      if (!p) return res.status(400).json({ error: 'One of the items is no longer available' });

      // Decrement the chosen size (or the first variant holding stock).
      if (p.variants && p.variants.length) {
        const v =
          (it.size && p.variants.find((x) => x.size === it.size)) ||
          p.variants.find((x) => (x.stock || 0) >= qty) ||
          p.variants[0];
        v.stock = Math.max((v.stock || 0) - qty, 0);
        touched.set(String(p._id), p);
      }

      lines.push({
        pid: p._id,
        name: p.title,
        size: it.size || (p.variants && p.variants[0] ? p.variants[0].size : ''),
        price: p.price ?? 0,
        qty,
        img: (p.images && p.images[0]) || '',
        code: p.barcode || '',
        custom: false,
      });
    }

    if (!lines.length) return res.status(400).json({ error: 'Add at least one item to the bill' });

    const sub = money(lines.reduce((s, l) => s + l.price * l.qty, 0));
    const discount = money(Math.min(Math.max(Number(disc) || 0, 0), sub));
    const taxAmt = rate ? money((sub - discount) * (rate / 100)) : 0;
    const total = money(sub - discount + taxAmt);

    const paid = money(
      mode === 'Credit'
        ? 0
        : recv === '' || recv === undefined || recv === null
          ? total
          : Math.min(Math.max(Number(recv) || 0, 0), total)
    );

    const date = new Date();
    const order = await BillingOrder.create({
      no: await nextInvoiceNo(),
      party: cid || undefined,
      items: lines,
      sub, disc: discount, taxRate: rate, tax: taxAmt, total, paid,
      mode: ['Cash', 'Stripe', 'Card', 'Credit'].includes(mode) ? mode : 'Cash',
      status: statusFor(total, paid, date),
      date,
      createdBy: req.billingUser._id,
    });

    // Persist stock changes only after the order is safely written.
    await Promise.all([...touched.values()].map((p) => p.save()));

    // Anything that just hit zero is worth flagging to the shop.
    const emptied = [...touched.values()].filter(
      (p) => (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0) === 0
    );
    if (emptied.length) {
      sendPushSafe(
        {
          title: emptied.length === 1 ? 'Out of stock' : `${emptied.length} items out of stock`,
          body: emptied.map((p) => p.title).slice(0, 3).join(', '),
          tag: 'out-of-stock',
          data: { kind: 'outOfStock' },
        },
        { event: 'outOfStock' }
      );
    }

    // Any unpaid remainder goes onto the customer's khata.
    let party = null;
    const due = money(total - paid);
    if (cid && due > 0) {
      party = await BillingParty.findByIdAndUpdate(cid, { $inc: { bal: due } }, { new: true });
    } else if (cid) {
      party = await BillingParty.findById(cid);
    }

    res.status(201).json({
      order: mapOrder(order),
      products: [...touched.values()].map((p) => mapProduct(p.toObject())),
      party: party ? mapParty(party) : null,
    });
  })
);

/* ------------------------------------------------------------ payments ---- */
/** Record a payment against an invoice (`kind:'order'`) or a party balance. */
router.post(
  '/payments',
  asyncHandler(async (req, res) => {
    const { target, amt, mode } = req.body || {};
    const amount = Number(amt) || 0;
    if (!target || !target.kind || amount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required' });
    }

    if (target.kind === 'order') {
      const order = await BillingOrder.findById(target.id);
      if (!order) return res.status(404).json({ error: 'Invoice not found' });
      if (order.voided) return res.status(400).json({ error: 'This bill is in the trash — restore it first' });

      const due = money(order.total - order.paid);
      const applied = money(Math.min(amount, due));
      order.paid = money(order.paid + applied);
      order.status = statusFor(order.total, order.paid, order.date);
      await order.save();

      let party = null;
      if (order.party) {
        party = await BillingParty.findByIdAndUpdate(order.party, { $inc: { bal: -applied } }, { new: true });
      }
      const payment = await BillingPayment.create({
        party: order.party, order: order._id, amt: applied,
        mode: mode || 'Cash', createdBy: req.billingUser._id,
      });

      sendPushSafe(
        {
          title: `Payment received · ${money(applied).toFixed(2)} GBP`,
          body: `${order.no}${order.status === 'paid' ? ' — now fully paid' : ` · ${money(order.total - order.paid).toFixed(2)} still due`}`,
          tag: `pay-${order._id}`,
          data: { kind: 'paymentReceived', orderId: String(order._id) },
        },
        { event: 'paymentReceived' }
      );

      return res.json({
        order: mapOrder(order),
        party: party ? mapParty(party) : null,
        payment: mapPayment(payment),
      });
    }

    // Account-level payment against a party's running balance.
    const party = await BillingParty.findByIdAndUpdate(
      target.id, { $inc: { bal: -amount } }, { new: true }
    );
    if (!party) return res.status(404).json({ error: 'Account not found' });

    const payment = await BillingPayment.create({
      party: party._id, amt: amount, mode: mode || 'Cash', createdBy: req.billingUser._id,
    });
    res.json({ order: null, party: mapParty(party), payment: mapPayment(payment) });
  })
);

/* ------------------------------------------------------------ expenses ---- */
router.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    // ?trash=1 lists trashed expenses; by default only live ones.
    const filter = req.query.trash === '1' ? { voided: true } : { voided: { $ne: true } };
    const list = await BillingExpense.find(filter).sort({ date: -1 }).limit(500).lean();
    res.json(list.map(mapExpense));
  })
);

// The app posts { title, amount, category, mode, note } — accept the short
// aliases too so either shape works.
router.post(
  '/expenses',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const title = b.title;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    const e = await BillingExpense.create({
      title: String(title).trim(),
      cat: b.category ?? b.cat ?? 'Other',
      amt: Number(b.amount ?? b.amt) || 0,
      mode: b.mode || 'Cash',
      note: b.note || '',
      date: b.date ? new Date(b.date) : new Date(),
    });
    res.status(201).json(mapExpense(e));
  })
);

router.patch(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const e = await BillingExpense.findById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Expense not found' });
    if (b.title !== undefined) e.title = String(b.title).trim();
    if (b.category !== undefined || b.cat !== undefined) e.cat = b.category ?? b.cat;
    if (b.amount !== undefined || b.amt !== undefined) e.amt = Number(b.amount ?? b.amt) || 0;
    if (b.mode !== undefined) e.mode = b.mode;
    if (b.note !== undefined) e.note = b.note;
    if (b.date !== undefined) e.date = new Date(b.date);
    await e.save();
    res.json(mapExpense(e));
  })
);

// "Delete" soft-voids the expense — it moves to the trash instead of being
// destroyed, and drops out of lists and reports. It can be restored.
router.delete(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const e = await BillingExpense.findById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Expense not found' });
    if (e.voided) return res.json(mapExpense(e));   // already trashed — idempotent
    e.voided = true;
    e.voidedAt = new Date();
    e.voidReason = String(req.body?.reason || '').slice(0, 300);
    e.voidedBy = req.billingUser._id;
    await e.save();
    res.json(mapExpense(e));
  })
);

/** Bring a trashed expense back into the ledger. */
router.post(
  '/expenses/:id/restore',
  asyncHandler(async (req, res) => {
    const e = await BillingExpense.findById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Expense not found' });
    e.voided = false;
    e.voidReason = '';
    e.voidedAt = null;
    e.voidedBy = null;
    await e.save();
    res.json(mapExpense(e));
  })
);

/* ------------------------------------------------------------- reports ---- */
router.get(
  '/reports/overview',
  asyncHandler(async (req, res) => {
    const period = ['7D', '30D', '12M'].includes(req.query.period) ? req.query.period : '30D';
    const now = new Date();
    const from = new Date(now);
    if (period === '7D') from.setDate(now.getDate() - 6);
    else if (period === '30D') from.setDate(now.getDate() - 29);
    else from.setMonth(now.getMonth() - 11);
    from.setHours(0, 0, 0, 0);

    const [orders, expenses] = await Promise.all([
      // Voided bills (deleted or returned) are NOT sales — they must never
      // appear in revenue, profit, top items or any statement.
      BillingOrder.find({ date: { $gte: from }, voided: { $ne: true } }).lean(),
      BillingExpense.find({ date: { $gte: from }, voided: { $ne: true } }).lean(),
    ]);

    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const collected = orders.reduce((s, o) => s + (o.paid || 0), 0);
    const spend = expenses.reduce((s, e) => s + (e.amt || 0), 0);

    // Bucket revenue by day (7D/30D) or by month (12M).
    //
    // Keys MUST be built from LOCAL date parts. Using toISOString() here (UTC)
    // while generating buckets from local midnight shifts every key back a day
    // in any UTC+ timezone — today's bucket then never exists and today's sales
    // silently vanish from the chart.
    const pad = (n) => String(n).padStart(2, '0');
    const keyOf = (d) =>
      period === '12M'
        ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
        : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const labelOf = (d) =>
      period === '12M'
        ? d.toLocaleDateString('en-GB', { month: 'short' })
        : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // Build the buckets and their labels together so the label always matches
    // the key it belongs to.
    const buckets = new Map();
    const labels = new Map();
    const cursor = new Date(from);
    // Walk to the end of today so the current day always gets a bucket.
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    while (cursor <= end) {
      const k = keyOf(cursor);
      buckets.set(k, 0);
      labels.set(k, labelOf(cursor));
      if (period === '12M') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    }

    for (const o of orders) {
      const k = keyOf(new Date(o.date));
      if (buckets.has(k)) buckets.set(k, buckets.get(k) + (o.total || 0));
    }

    // The chart reads dataKey="label" for the X axis and "v" for the value.
    const series = [...buckets.entries()].map(([k, v]) => ({
      k,
      label: labels.get(k),
      v: money(v),
    }));

    // Category / item / payment-mode breakdowns
    const byCat = {}, byItem = {}, byMode = {};
    for (const o of orders) {
      byMode[o.mode] = (byMode[o.mode] || 0) + (o.total || 0);
      for (const i of o.items || []) {
        const amt = (i.price || 0) * (i.qty || 0);
        byItem[i.name] = (byItem[i.name] || 0) + amt;
      }
    }
    const catIds = [...new Set(orders.flatMap((o) => (o.items || []).map((i) => i.pid).filter(Boolean)))];
    if (catIds.length) {
      const prods = await Product.find({ _id: { $in: catIds } }, { category: 1 }).lean();
      const catOf = new Map(prods.map((p) => [String(p._id), p.category || 'other']));
      for (const o of orders) {
        for (const i of o.items || []) {
          const c = i.pid ? catOf.get(String(i.pid)) || 'other' : 'custom';
          byCat[c] = (byCat[c] || 0) + (i.price || 0) * (i.qty || 0);
        }
      }
    }

    const sorted = (obj, n = 6) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

    const modesTotal = Object.values(byMode).reduce((s, v) => s + v, 0) || 1;
    const tax = orders.reduce((s, o) => s + (o.tax || 0), 0);

    // NOTE: these key names are dictated by the app's Reports screen —
    // categories use {name,value}, top items {name,rev}, payment modes
    // {k,v,pct} (MODE_ICON is looked up by `k`). Renaming them breaks the UI.
    res.json({
      period,
      revenue: money(revenue),
      collected: money(collected),
      due: money(revenue - collected),
      expenses: money(spend),
      profit: money(collected - spend),
      gst: money(tax),
      orderCount: orders.length,
      aov: orders.length ? money(revenue / orders.length) : 0,
      series,
      categories: sorted(byCat).map(([name, value]) => ({ name, value: money(value) })),
      topItems: sorted(byItem).map(([name, rev]) => ({ name, rev: money(rev) })),
      modes: sorted(byMode, 4).map(([k, v]) => ({
        k,
        v: money(v),
        pct: Math.round((v / modesTotal) * 100),
      })),
    });
  })
);

/* ---------------------------------------------------------------- push ---- */
/** The app needs the public VAPID key (and to know if push is configured). */
router.get('/push/key', (_req, res) =>
  res.json({ available: pushAvailable(), publicKey: publicKey() })
);

/** Register (or refresh) this device for notifications. */
router.post(
  '/push/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys, label } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    // Keyed on endpoint so re-subscribing the same device updates in place.
    const sub = await BillingPushSub.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          endpoint,
          keys,
          user: req.billingUser._id,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          label: label || '',
          lastUsedAt: new Date(),
          failCount: 0,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ ok: true, id: String(sub._id) });
  })
);

/** Stop notifications for this device. */
router.post(
  '/push/unsubscribe',
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    await BillingPushSub.deleteOne({ endpoint });
    res.json({ ok: true });
  })
);

/** Send a test notification to every device (ignores enable/quiet settings). */
router.post(
  '/push/test',
  asyncHandler(async (_req, res) => {
    const r = await sendPush(
      { title: 'underdawg Bill', body: 'Notifications are working ✅', tag: 'test' },
      { force: true }
    );
    res.json(r);
  })
);

/* ------------------------------------------------------------ settings ---- */
router.get('/settings', asyncHandler(async (_req, res) => res.json(await getBillingSettings())));

router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const allowed = [
      'storeName', 'owner', 'address', 'gstin', 'phone', 'email',
      'currency', 'taxRate', 'taxLabel', 'taxDefaultOn', 'logoUrl', 'footerNote',
    ];
    const patch = {};
    for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    const s = await BillingSettings.findOneAndUpdate(
      { key: 'default' }, { $set: patch }, { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(s);
  })
);

export default router;
