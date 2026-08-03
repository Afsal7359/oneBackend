const mongoose = require('mongoose');

// Messages sent from the storefront contact page. Read-only for the public —
// they can create one and never see it again; the admin works the queue.
const enquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    subject: { type: String, trim: true, maxlength: 120, default: 'General enquiry' },
    message: { type: String, required: true, trim: true, maxlength: 2000 },

    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new',
      index: true,
    },
    adminNote: { type: String, default: '', maxlength: 1000 },

    // Kept for abuse triage only — never returned to the public.
    ip: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

// The admin list is always "newest first", optionally filtered by status.
enquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Enquiry', enquirySchema);
