import mongoose from 'mongoose';
import slugify from 'slugify';
import { cloudinaryCleanupPlugin } from '../utils/cloudinaryCleanup.js';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: String,
    icon: { type: String, default: '' }, // icon name or image URL
    image: { type: String, default: '' },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, sortOrder: 1 });

categorySchema.pre('validate', function (next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

categorySchema.plugin(cloudinaryCleanupPlugin);

export default mongoose.model('Category', categorySchema);
