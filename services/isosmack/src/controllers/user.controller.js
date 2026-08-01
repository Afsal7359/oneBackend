import { z } from 'zod';
import User from '../models/User.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler, ok } from '../utils/asyncHandler.js';

const addressSchema = z.object({
  label: z.string().trim().max(24).optional(),
  fullName: z.string().trim().min(2, 'Enter the recipient name'),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(4, 'Enter the address'),
  line2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Enter the state'),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().default('India'),
  isDefault: z.boolean().optional(),
});

export const updateProfile = asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  });
  const data = schema.parse(req.body);

  const user = await User.findByIdAndUpdate(req.user._id, data, { new: true, runValidators: true });
  return ok(res, { user: user.toSafeJSON() });
});

/* ------------------------------------------------------------ addresses */

export const listAddresses = asyncHandler(async (req, res) => ok(res, { addresses: req.user.addresses }));

export const addAddress = asyncHandler(async (req, res) => {
  const data = addressSchema.parse(req.body);
  const user = await User.findById(req.user._id);

  if (data.isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
  if (user.addresses.length === 0) data.isDefault = true;

  user.addresses.push(data);
  await user.save();
  return ok(res, { addresses: user.addresses }, 201);
});

export const updateAddress = asyncHandler(async (req, res) => {
  const data = addressSchema.partial().parse(req.body);
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');

  if (data.isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
  Object.assign(address, data);
  await user.save();
  return ok(res, { addresses: user.addresses });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');

  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();
  return ok(res, { addresses: user.addresses });
});

/* ------------------------------------------------------------- wishlist */

export const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'wishlist',
    match: { isActive: true },
    populate: { path: 'category', select: 'name slug' },
  });
  return ok(res, { products: user.wishlist });
});

export const toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = z.object({ productId: z.string() }).parse(req.body);
  if (!(await Product.exists({ _id: productId }))) throw ApiError.notFound('Product not found');

  const user = await User.findById(req.user._id);
  const idx = user.wishlist.findIndex((p) => String(p) === String(productId));
  const added = idx === -1;

  if (added) user.wishlist.push(productId);
  else user.wishlist.splice(idx, 1);

  await user.save({ validateBeforeSave: false });
  return ok(res, { added, wishlist: user.wishlist });
});
