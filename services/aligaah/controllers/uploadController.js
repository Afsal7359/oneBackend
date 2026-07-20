const asyncHandler = require('express-async-handler');
const { cloudinary, isConfigured } = require('../config/cloudinary');

// Accepts multipart file (via multer memory) OR base64 dataURL in body.image
// @route POST /api/upload   (admin)
const uploadImage = asyncHandler(async (req, res) => {
  if (!isConfigured()) {
    res.status(500);
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_* env vars.');
  }
  const folder = req.body.folder || 'aligaah';
  let dataToUpload;

  if (req.file) {
    dataToUpload = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  } else if (req.body.image) {
    dataToUpload = req.body.image; // expect a data URL or remote URL
  } else {
    res.status(400);
    throw new Error('No image provided');
  }

  const result = await cloudinary.uploader.upload(dataToUpload, {
    folder,
    resource_type: 'image',
  });

  res.json({ url: result.secure_url, publicId: result.public_id });
});

// @route DELETE /api/upload   body { publicId }  (admin)
const deleteImage = asyncHandler(async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) {
    res.status(400);
    throw new Error('publicId required');
  }
  await cloudinary.uploader.destroy(publicId);
  res.json({ ok: true });
});

module.exports = { uploadImage, deleteImage };
