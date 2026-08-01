import mongoose from 'mongoose';
import slugify from 'slugify';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, index: true, lowercase: true },
    description: { type: String, default: '' },
    image: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function makeSlug(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name || 'category', { lower: true, strict: true });
  }
  next();
});

export default mongoose.model('Category', categorySchema);
