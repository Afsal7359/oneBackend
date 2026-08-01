const mongoose = require('mongoose');
const { cloudinaryCleanupPlugin } = require('../utils/cloudinaryCleanup');

const siteContentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now }
});

// `value` is free-form JSON, so hero images, banners and gallery shots live at
// arbitrary depths. The cleanup walks the whole blob rather than named fields.
siteContentSchema.plugin(cloudinaryCleanupPlugin, {
  protectedBy: [
    { model: () => require('./Product'), scanAll: true },
    { model: () => require('./Order') },
  ],
});

module.exports = mongoose.model('SiteContent', siteContentSchema);
