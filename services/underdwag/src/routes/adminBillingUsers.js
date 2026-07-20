/**
 * Billing staff accounts, managed from the WEBSITE admin panel.
 * Mounted at /api/admin/billing-users and guarded by the existing admin JWT,
 * so only a website admin can create or disable a billing login.
 */

import express from 'express';
import asyncHandler from 'express-async-handler';
import { protect } from '../middleware/auth.js';
import { BillingUser } from '../models/billing.js';

const router = express.Router();
router.use(protect);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await BillingUser.find().sort({ createdAt: -1 });
    res.json(users.map((u) => u.toJSON()));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password, role, isActive } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const exists = await BillingUser.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'A billing user with that email already exists' });

    const user = await BillingUser.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      role: role === 'manager' ? 'manager' : 'cashier',
      isActive: isActive !== false,
    });
    res.status(201).json(user.toJSON());
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, email, password, role, isActive } = req.body || {};
    const user = await BillingUser.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Billing user not found' });

    if (name !== undefined) user.name = String(name).trim();
    if (email !== undefined) user.email = String(email).toLowerCase().trim();
    if (role !== undefined) user.role = role === 'manager' ? 'manager' : 'cashier';
    if (isActive !== undefined) user.isActive = !!isActive;
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      user.password = password; // re-hashed by the pre-save hook
    }
    await user.save();
    res.json(user.toJSON());
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await BillingUser.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Billing user not found' });
    res.json({ ok: true, id: req.params.id });
  })
);

export default router;
