/**
 * Session Model
 * Tracks active login sessions for users.  Stored when user logs in and removed
 * when user logs out or invalidates all sessions.
 */
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    device: String, // user-agent or device identifier
    ip: String,
    user_agent: String,
    login_time: {
      type: Date,
      default: Date.now,
      index: true,
      immutable: true,
    },
    last_seen: Date,
  },
  {
    timestamps: false,
    collection: 'sessions',
  }
);

// TTL in case sessions are forgotten (30 days)
sessionSchema.index({ login_time: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('Session', sessionSchema);
