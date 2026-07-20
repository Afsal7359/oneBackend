import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deviceInfoSchema = new mongoose.Schema(
  {
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    device: { type: String, default: '' },
    ip: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    lastSeen: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, select: false },
    googleId: { type: String, sparse: true, index: true },
    avatar: { type: String, default: '' },

    isVerified: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    phone: { type: String, default: '' },

    lastLoginAt: { type: Date },
    deviceInfo: [deviceInfoSchema],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);
