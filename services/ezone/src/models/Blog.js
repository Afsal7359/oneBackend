import mongoose from 'mongoose';
import slugify from 'slugify';

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    excerpt: String,
    content: { type: String, required: true },
    coverImage: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    tags: [String],
    category: String,
    isPublished: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
    publishedAt: Date,
  },
  { timestamps: true }
);

blogSchema.pre('validate', function (next) {
  if (this.title && (!this.slug || this.isModified('title'))) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  if (this.isPublished && !this.publishedAt) this.publishedAt = new Date();
  next();
});

export default mongoose.model('Blog', blogSchema);
