import asyncHandler from 'express-async-handler';
import Admin from '../models/Admin.js';
import { sign, SCOPES } from '../config/jwt.js';

// scope=admin, so this token satisfies `protect` and nothing else — it can no
// longer be handed to the customer or billing guards.
const signToken = (id) => sign({ id: String(id) }, SCOPES.ADMIN, {
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  const admin = await Admin.findOne({ email: email.toLowerCase() });
  if (!admin || !(await admin.comparePassword(password))) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  res.json({
    admin: admin.toJSON(),
    token: signToken(admin._id),
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ admin: req.admin.toJSON() });
});
