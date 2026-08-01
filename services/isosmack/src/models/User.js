import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: '', trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: 'India', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    phone: { type: String, trim: true, default: '' },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },

    addresses: { type: [addressSchema], default: [] },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // hashed refresh tokens, so sessions can be revoked individually
    refreshTokens: { type: [{ token: String, createdAt: Date, ua: String }], default: [], select: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Exactly one default address at a time.
userSchema.pre('save', function normaliseAddresses(next) {
  if (this.isModified('addresses') && this.addresses.length) {
    const defaults = this.addresses.filter((a) => a.isDefault);
    if (defaults.length === 0) this.addresses[0].isDefault = true;
    if (defaults.length > 1) {
      let seen = false;
      this.addresses.forEach((a) => {
        if (a.isDefault && seen) a.isDefault = false;
        else if (a.isDefault) seen = true;
      });
    }
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const { _id, name, email, phone, role, addresses, wishlist, createdAt } = this;
  return { id: _id, name, email, phone, role, addresses, wishlist, createdAt };
};

export default mongoose.model('User', userSchema);
