import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

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
