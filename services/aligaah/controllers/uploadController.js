const asyncHandler = require('express-async-handler');
const { cloudinary, isConfigured } = require('../config/cloudinary');

// Cloudinary's own ceiling for an image upload on the free/standard plans.
const MAX_BYTES = 10 * 1024 * 1024;
// Product photos never need to be larger than this. Capping keeps uploads fast
// and the storefront light; Cloudinary does the resize, we send the original.
const MAX_EDGE = 2400;

// Push the raw buffer straight to Cloudinary. The previous implementation
// base64'd the file into a data URL first, which inflates it by ~33% (an 11.4MB
// photo became a 15.3MB string) and reliably tripped the SDK's 60s timeout.
function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        timeout: 120000,
        transformation: [{ width: MAX_EDGE, height: MAX_EDGE, crop: 'limit' }],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Accepts a multipart file (multer memory storage) OR a base64/remote URL in body.image
// @route POST /api/upload   (admin)
const uploadImage = asyncHandler(async (req, res) => {
  if (!isConfigured()) {
    res.status(500);
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_* env vars.');
  }
  const folder = req.body.folder || 'aligaah';

  // Argument checks first, so a bad request never reaches Cloudinary.
  if (req.file) {
    if (!/^image\//.test(req.file.mimetype || '')) {
      res.status(400);
      throw new Error('That file is not an image. Upload a JPG, PNG or WebP.');
    }
    if (req.file.size > MAX_BYTES) {
      res.status(413);
      throw new Error(`Image is ${(req.file.size / 1048576).toFixed(1)}MB — the limit is 10MB.`);
    }
  } else if (!req.body.image) {
    res.status(400);
    throw new Error('No image provided');
  }

  let result;
  try {
    result = req.file
      ? await uploadBuffer(req.file.buffer, folder)
      : await cloudinary.uploader.upload(req.body.image, {
          folder,
          resource_type: 'image',
          timeout: 120000,
          transformation: [{ width: MAX_EDGE, height: MAX_EDGE, crop: 'limit' }],
        });
  } catch (err) {
    // Cloudinary rejects with { message, http_code } and no stack. Translate the
    // cases an admin can act on instead of surfacing raw "Request Timeout".
    const raw = err?.message || err?.error?.message || 'Upload failed';
    console.error(`[upload] cloudinary failed for folder "${folder}": ${raw}`);

    if (/timeout/i.test(raw)) {
      res.status(504);
      throw new Error('The image took too long to upload. Try a smaller file or a stronger connection.');
    }
    if (/invalid image|unsupported|not an image|corrupt/i.test(raw)) {
      res.status(400);
      throw new Error('That file could not be read as an image. Try re-saving it as JPG or PNG.');
    }
    if (/file size|too large|maximum/i.test(raw)) {
      res.status(413);
      throw new Error('The image is too large. The limit is 10MB.');
    }
    res.status(502);
    throw new Error(`Image upload failed: ${raw}`);
  }

  res.json({
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  });
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

module.exports = { uploadImage, deleteImage, MAX_BYTES };
