const mongoose = require('mongoose');
const slugify = require('slugify');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, index: true },
    image: { type: String, default: '' },      // Cloudinary URL
    imagePublicId: { type: String, default: '' },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function (next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

categorySchema.index({ isActive: 1, order: 1, createdAt: 1 });

categorySchema.plugin(cloudinaryCleanupPlugin);

module.exports = mongoose.model('Category', categorySchema);
