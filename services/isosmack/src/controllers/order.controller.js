import { z } from 'zod';
import Order from '../models/Order.js';
import Coupon from '../models/Coupon.js';
import Cart from '../models/Cart.js';
import User from '../models/User.js';
import { buildCart, commitStock, releaseStock } from '../services/pricing.js';
import { createGatewayOrder, publicKey, razorpayEnabled } from '../services/razorpay.js';
import { Setting } from '../models/Content.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

const addressInput = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient name'),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(4, 'Enter the address'),
  line2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Enter the state'),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().default('India'),
});

export const createOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), qty: z.coerce.number().int().min(1).max(10) }))
    .min(1, 'Your cart is empty'),
  couponCode: z.string().trim().max(32).optional().or(z.literal('')),
  paymentMethod: z.enum(['razorpay', 'cod']),
  addressId: z.string().optional(),
  address: addressInput.optional(),
  saveAddress: z.boolean().optional(),
  customerNote: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Creates an order from a client cart.
 * Pricing is always recomputed server-side — the client total is never trusted.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { items, couponCode, paymentMethod, addressId, address, saveAddress, customerNote } = req.body;

  /* ------------------------------ address ------------------------------ */
  let shippingAddress = null;
  if (addressId) {
    const saved = req.user.addresses.id(addressId);
    if (!saved) throw ApiError.badRequest('That delivery address no longer exists');
    shippingAddress = {
      fullName: saved.fullName,
      phone: saved.phone,
      line1: saved.line1,
      line2: saved.line2,
      city: saved.city,
      state: saved.state,
      pincode: saved.pincode,
      country: saved.country,
    };
  } else if (address) {
    shippingAddress = address;
    if (saveAddress) {
      const user = await User.findById(req.user._id);
      user.addresses.push({ ...address, isDefault: user.addresses.length === 0 });
      await user.save();
    }
  } else {
    throw ApiError.badRequest('Please choose a delivery address');
  }

  /* --------------------------- price the cart -------------------------- */
  const cart = await buildCart({ items, couponCode, paymentMethod, user: req.user });

  if (!cart.lines.length) {
    throw ApiError.badRequest(cart.issues[0]?.message || 'None of these items are available right now');
  }
  const blocking = cart.issues.filter((i) => i.type !== 'reduced');
  if (blocking.length) throw ApiError.badRequest(blocking[0].message, cart.issues);
  if (cart.couponError) throw ApiError.badRequest(cart.couponError);

  const settings = await Setting.getGlobal();
  if (paymentMethod === 'cod') {
    if (!settings.shipping.codEnabled) throw ApiError.badRequest('Cash on delivery is unavailable right now');
    if (cart.totals.grandTotal > settings.shipping.codMaxOrder) {
      throw ApiError.badRequest(
        `Cash on delivery is only available for orders up to ₹${settings.shipping.codMaxOrder}`
      );
    }
  }

  /* ---------------------------- create order --------------------------- */
  const order = new Order({
    user: req.user._id,
    email: req.user.email,
    phone: shippingAddress.phone || req.user.phone,
    items: cart.lines.map((l) => ({
      product: l.productId,
      name: l.name,
      slug: l.slug,
      image: l.image,
      flavour: l.flavour,
      packValue: l.packValue,
      price: l.price,
      mrp: l.mrp,
      qty: l.qty,
      subtotal: l.subtotal,
    })),
    shippingAddress,
    pricing: {
      itemsTotal: cart.totals.itemsTotal,
      itemsMrpTotal: cart.totals.itemsMrpTotal,
      couponCode: cart.totals.couponCode,
      couponDiscount: cart.totals.couponDiscount,
      shippingFee: cart.totals.shippingFee,
      codFee: cart.totals.codFee,
      prepaidDiscount: cart.totals.prepaidDiscount,
      grandTotal: cart.totals.grandTotal,
      currency: 'INR',
    },
    payment: { method: paymentMethod, status: 'pending' },
    status: 'pending',
    customerNote: customerNote || '',
  });

  order.pushTimeline('pending', 'Order created', 'customer');

  /* ------------------------- COD confirms at once ----------------------- */
  if (paymentMethod === 'cod') {
    order.status = 'confirmed';
    order.pushTimeline('confirmed', 'Cash on delivery order confirmed', 'system');
    await commitStock(order);
    await order.save();
    await afterOrderConfirmed(order, req.user);

    return ok(res, { order: shapeOrder(order), payment: null }, 201);
  }

  /* --------------------- prepaid: open a gateway order ------------------ */
  const gateway = await createGatewayOrder({
    amountPaise: order.pricing.grandTotal * 100,
    receipt: order.orderNumber || `iso-${Date.now()}`,
    notes: { email: req.user.email, userId: String(req.user._id) },
  });

  order.payment.razorpayOrderId = gateway.id;
  order.payment.simulated = Boolean(gateway.simulated);
  await order.save();

  return ok(
    res,
    {
      order: shapeOrder(order),
      payment: {
        provider: 'razorpay',
        simulated: Boolean(gateway.simulated),
        key: publicKey(),
        orderId: gateway.id,
        amount: gateway.amount,
        currency: gateway.currency || 'INR',
        name: settings.siteName,
        description: `Order ${order.orderNumber}`,
        prefill: {
          name: shippingAddress.fullName,
          email: req.user.email,
          contact: shippingAddress.phone,
        },
      },
    },
    201
  );
});

/** Shared post-confirmation side effects: coupon usage + cart cleanup. */
export async function afterOrderConfirmed(order, user) {
  if (order.pricing.couponCode) {
    await Coupon.updateOne({ code: order.pricing.couponCode }, { $inc: { usedCount: 1 } });
  }
  if (user) await Cart.findOneAndUpdate({ user: user._id }, { items: [], couponCode: '' });
}

export function shapeOrder(order) {
  const o = order.toObject ? order.toObject() : order;
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    items: o.items,
    shippingAddress: o.shippingAddress,
    pricing: o.pricing,
    payment: {
      method: o.payment.method,
      status: o.payment.status,
      razorpayOrderId: o.payment.razorpayOrderId,
      simulated: o.payment.simulated,
      paidAt: o.payment.paidAt,
    },
    tracking: o.tracking,
    timeline: o.timeline,
    customerNote: o.customerNote,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
  };
}

/* ------------------------------- customer views ------------------------------- */

export const listMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 10;

  const [orders, total] = await Promise.all([
    Order.find({ user: req.user._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments({ user: req.user._id }),
  ]);

  return ok(res, {
    orders: orders.map(shapeOrder),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const getMyOrder = asyncHandler(async (req, res) => {
  // Accept either the Mongo id or the human-readable order number.
  const { id } = req.params;
  const matchers = [{ orderNumber: id.toUpperCase() }];
  if (/^[0-9a-fA-F]{24}$/.test(id)) matchers.push({ _id: id });

  const order = await Order.findOne({ user: req.user._id, $or: matchers });
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, { order: shapeOrder(order) });
});

export const cancelMyOrder = asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body || {});

  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');

  if (!['pending', 'confirmed', 'processing'].includes(order.status)) {
    throw ApiError.badRequest(`An order that is already ${order.status} cannot be cancelled here`);
  }

  order.status = 'cancelled';
  order.cancelReason = reason || 'Cancelled by customer';
  order.cancelledAt = new Date();
  order.pushTimeline('cancelled', order.cancelReason, 'customer');

  await releaseStock(order);

  if (order.payment.status === 'paid') {
    order.adminNote = `${order.adminNote}\n[auto] Refund pending for cancelled paid order.`.trim();
  }

  await order.save();
  return ok(res, { order: shapeOrder(order), message: 'Order cancelled' });
});

export { razorpayEnabled };
