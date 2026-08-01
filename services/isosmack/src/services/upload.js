import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import env, { cloudinaryEnabled } from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log('[upload] Cloudinary enabled →', env.CLOUDINARY_CLOUD_NAME);
} else {
  console.warn('[upload] Cloudinary keys not set — storing uploads on local disk (./uploads)');
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG, WEBP, AVIF or GIF images are allowed'));
    }
    return cb(null, true);
  },
});

/**
 * Uploads a buffer and returns { url, publicId }.
 * Uses Cloudinary when configured, otherwise falls back to local disk so the
 * admin panel works out of the box in development.
 */
export async function uploadBuffer(buffer, { folder = 'products', filename = 'image' } = {}) {
  if (cloudinaryEnabled) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          resource_type: 'image',
          transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        },
        (err, result) => {
          if (err) return reject(new ApiError(502, `Image upload failed: ${err.message}`));
          return resolve({ url: result.secure_url, publicId: result.public_id });
        }
      );
      stream.end(buffer);
    });
  }

  const dir = path.join(LOCAL_UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(filename) || '.jpg';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return { url: `/uploads/${folder}/${name}`, publicId: `local:${folder}/${name}` };
}

export async function destroyImage(publicId) {
  if (!publicId) return;
  if (publicId.startsWith('local:')) {
    const rel = publicId.slice('local:'.length);
    await fs.unlink(path.join(LOCAL_UPLOAD_DIR, rel)).catch(() => {});
    return;
  }
  if (cloudinaryEnabled) await cloudinary.uploader.destroy(publicId).catch(() => {});
}

export { cloudinaryEnabled };
