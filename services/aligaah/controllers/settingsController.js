const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');

// @route GET /api/settings (public)
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  res.json(settings);
});

// @route PUT /api/settings (admin)
const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  Object.assign(settings, req.body);
  await settings.save();
  res.json(settings);
});

module.exports = { getSettings, updateSettings };
