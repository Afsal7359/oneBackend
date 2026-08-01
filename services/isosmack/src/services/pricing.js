import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import Order from '../models/Order.js';
import { Setting } from '../models/Content.js';

export const MAX_QTY_PER_LINE = 10;

const inr = (n) => Math.max(0, Math.round(n));

/**
 * The single source of truth for cart maths.
 * Both the cart preview and order creation call this, so the customer can never
 * be charged a total the server did not compute itself.
 *
 * @param {{productId:string, qty:number}[]} items
 * @param {string} couponCode
 * @param {'razorpay'|'cod'} paymentMethod
 * @param {object} user  optional — enables per-user coupon limits
 */
export async function buildCart({ items = [], couponCode = '', paymentMethod = 'razorpay', user = null }) {
  const settings = await Setting.getGlobal();
  const cfg = settings.shipping;

  const ids = [...new Set(items.map((i) => String(i.productId)).filter(Boolean))];
  const products = ids.length
    ? await Product.find({ _id: { $in: ids }, isActive: true }).populate('category', 'name slug')
    : [];

  const lines = [];
  const issues = [];

  for (const item of items) {
    const p = products.find((x) => String(x._id) === String(item.productId));
    if (!p) {
      issues.push({ productId: item.productId, type: 'unavailable', message: 'This product is no longer available' });
      continue;
    }

    let qty = Math.floor(Number(item.qty) || 1);
    qty = Math.min(Math.max(qty, 1), MAX_QTY_PER_LINE);

    if (!p.allowBackorder) {
      if (p.stock <= 0) {
        issues.push({ productId: String(p._id), type: 'out_of_stock', message: `${p.name} is out of stock` });
        continue;
      }
      if (qty > p.stock) {
        issues.push({
          productId: String(p._id),
          type: 'reduced',
          message: `Only ${p.stock} left of ${p.name} — quantity adjusted`,
        });
        qty = p.stock;
      }
    }

    lines.push({
      productId: String(p._id),
      categoryId: p.category ? String(p.category._id) : null,
      name: p.name,
      cardTitle: p.cardTitle,
      slug: p.slug,
      image: p.images?.[0]?.url || '',
      flavour: p.flavour,
      packValue: p.packValue,
      price: p.price,
      mrp: p.mrp,
      qty,
      subtotal: p.price * qty,
      mrpSubtotal: p.mrp * qty,
      stock: p.stock,
      maxQty: p.allowBackorder ? MAX_QTY_PER_LINE : Math.min(p.stock, MAX_QTY_PER_LINE),
    });
  }

  const itemsTotal = inr(lines.reduce((s, l) => s + l.subtotal, 0));
  const itemsMrpTotal = inr(lines.reduce((s, l) => s + l.mrpSubtotal, 0));
  const productSavings = inr(itemsMrpTotal - itemsTotal);

  /* ----------------------------- coupon ----------------------------- */
  let coupon = null;
  let couponDiscount = 0;
  let freeShipping = false;
  let couponError = null;

  const code = String(couponCode || '').trim().toUpperCase();
  if (code && lines.length) {
    const found = await Coupon.findOne({ code });
    if (!found) {
      couponError = 'That coupon code is not valid';
    } else {
      const windowError = found.checkWindow();
      if (windowError) {
        couponError = windowError;
      } else if (itemsTotal < found.minOrder) {
        couponError = `Add ₹${found.minOrder - itemsTotal} more to use ${code}`;
      } else {
        // per-user limits
        let blocked = null;
        if (user) {
          if (found.firstOrderOnly) {
            const prior = await Order.countDocuments({
              user: user._id,
              'payment.status': { $in: ['paid'] },
            });
            if (prior > 0) blocked = 'This coupon is for first orders only';
          }
          if (!blocked && found.perUserLimit > 0) {
            const used = await Order.countDocuments({
              user: user._id,
              'pricing.couponCode': code,
              status: { $nin: ['cancelled'] },
            });
            if (used >= found.perUserLimit) blocked = "You've already used this coupon";
          }
        }

        if (blocked) {
          couponError = blocked;
        } else {
          const result = found.computeDiscount(lines);
          if (result.discount <= 0 && !result.freeShipping) {
            couponError = 'This coupon does not apply to the items in your cart';
          } else {
            couponDiscount = Math.min(result.discount, itemsTotal);
            freeShipping = result.freeShipping;
            coupon = {
              code: found.code,
              type: found.type,
              value: found.value,
              description: found.description,
            };
          }
        }
      }
    }
  }

  /* ---------------------------- shipping ---------------------------- */
  const afterDiscount = inr(itemsTotal - couponDiscount);
  let shippingFee = 0;
  if (lines.length > 0) {
    shippingFee = afterDiscount >= cfg.freeAbove ? 0 : cfg.fee;
    if (freeShipping) shippingFee = 0;
  }

  /* ------------------------ payment adjustments --------------------- */
  const method = paymentMethod === 'cod' ? 'cod' : 'razorpay';
  let codFee = 0;
  let prepaidDiscount = 0;

  if (lines.length > 0) {
    if (method === 'cod') {
      codFee = cfg.codFee;
    } else if (cfg.prepaidDiscountPct > 0) {
      prepaidDiscount = inr((afterDiscount * cfg.prepaidDiscountPct) / 100);
    }
  }

  const grandTotal = inr(afterDiscount + shippingFee + codFee - prepaidDiscount);

  return {
    lines,
    issues,
    coupon,
    couponError,
    totals: {
      itemsTotal,
      itemsMrpTotal,
      productSavings,
      couponCode: coupon?.code || '',
      couponDiscount,
      shippingFee,
      codFee,
      prepaidDiscount,
      grandTotal,
      totalSavings: inr(productSavings + couponDiscount + prepaidDiscount),
      currency: 'INR',
      freeShippingThreshold: cfg.freeAbove,
      amountToFreeShipping: shippingFee > 0 ? inr(cfg.freeAbove - afterDiscount) : 0,
    },
    config: {
      codEnabled: cfg.codEnabled && grandTotal <= cfg.codMaxOrder,
      codMaxOrder: cfg.codMaxOrder,
      prepaidDiscountPct: cfg.prepaidDiscountPct,
      etaMetro: cfg.etaMetro,
      etaRest: cfg.etaRest,
    },
  };
}

/** Decrements stock and bumps soldCount for a paid/confirmed order. */
export async function commitStock(order) {
  if (order.stockCommitted) return;
  await Promise.all(
    order.items.map((it) =>
      Product.updateOne(
        { _id: it.product },
        { $inc: { stock: -it.qty, soldCount: it.qty } }
      )
    )
  );
  order.stockCommitted = true;
}

/** Returns stock to inventory when an order is cancelled or refunded. */
export async function releaseStock(order) {
  if (!order.stockCommitted || order.stockReleased) return;
  await Promise.all(
    order.items.map((it) =>
      Product.updateOne(
        { _id: it.product },
        { $inc: { stock: it.qty, soldCount: -it.qty } }
      )
    )
  );
  order.stockReleased = true;
}
