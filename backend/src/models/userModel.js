/**
 * User Model
 * Supports roles: admin, officer, viewer
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password_hash: {
      type: String,
      required: true,
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ['admin', 'officer', 'viewer'],
      default: 'viewer',
      index: true,
    },
    full_name: {
      type: String,
      trim: true,
    },
    phone_number: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    profile_photo: {
      type: String,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    last_login: Date,
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    settings: {
      notifications: {
        highRisk: { type: Boolean, default: true },
        anomaly: { type: Boolean, default: false },
        weeklySummary: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();

  // Prevent double-hashing if it already looks like a bcrypt hash
  // (though isModified should handle this, it's a safe guard)
  if (this.password_hash.startsWith('$2a$') || this.password_hash.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare plaintext password to hash
userSchema.methods.comparePassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.password_hash);
};

// Return safe object without sensitive fields
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
