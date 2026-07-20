import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const useCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'ezoneshoppi',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'heic', 'heif'],
    },
  });
} else {
  const dir = path.resolve('uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  });
}

const fileFilter = (_req, file, cb) => {
  const ok = /jpeg|jpg|png|webp|gif|svg|avif|heic|heif/i.test(file.mimetype) ||
    file.mimetype === 'image/avif' ||
    file.mimetype === 'image/heic' ||
    file.mimetype === 'image/heif';
  cb(ok ? null : new Error('Only images allowed (jpg, png, webp, avif, heic supported)'), ok);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const buildFileUrl = (req, file) => {
  if (useCloudinary) return file.path;
  return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
};
