/**
 * GeoCache Model
 * Persists geocoding results in MongoDB to reduce API calls.
 * Acts as a fallback when Redis is unavailable.
 */
const mongoose = require('mongoose');

const geoCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    location: String,
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    source: {
      type: String,
      enum: ['static', 'api', 'manual'],
      default: 'api',
    },
    hit_count: {
      type: Number,
      default: 0,
    },
    expires_at: {
      type: Date,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeoCache', geoCacheSchema);
