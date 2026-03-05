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
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();
  this.password_hash = await bcrypt.hash(this.password_hash, 12);
  next();
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
