const asyncHandler = require('express-async-handler');
const Banner = require('../models/Banner');

const getBanners = asyncHandler(async (req, res) => {
  const filter = req.query.all ? {} : { isActive: true };
  if (req.query.position) filter.position = req.query.position;
  const banners = await Banner.find(filter).sort({ order: 1, createdAt: -1 });
  res.json(banners);
});

const createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create(req.body);
  res.status(201).json(banner);
});

const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!banner) { res.status(404); throw new Error('Banner not found'); }
  res.json(banner);
});

const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) { res.status(404); throw new Error('Banner not found'); }
  res.json({ ok: true });
});

module.exports = { getBanners, createBanner, updateBanner, deleteBanner };
