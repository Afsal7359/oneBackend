import mongoose from 'mongoose';
import slugify from 'slugify';
import { cloudinaryCleanupPlugin } from '../utils/cloudinaryCleanup.js';

const collectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, default: '' },
    eyebrow: { type: String, default: '' },
    desktopImage: { type: String, default: '' },
    mobileImage: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

collectionSchema.pre('validate', function (next) {
  if (this.isModified('title') || !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

collectionSchema.index({ isActive: 1, order: 1 });
collectionSchema.index({ isActive: 1, isFeatured: 1, order: 1 });

// Collections carry a desktop and a mobile hero image; both are swept.
collectionSchema.plugin(cloudinaryCleanupPlugin);

export default mongoose.model('Collection', collectionSchema);
