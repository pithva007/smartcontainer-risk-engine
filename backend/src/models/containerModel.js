const mongoose = require('mongoose');

/**
 * Schema for raw container shipment records
 * Mirrors the CSV/Excel dataset structure
 */
const containerSchema = new mongoose.Schema(
  {
    // --- Core Identifiers ---
    container_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    declaration_date: {
      type: Date,
    },
    declaration_time: {
      type: String,
    },

    // --- Trade Information ---
    trade_regime: {
      type: String,
      trim: true,
    },
    origin_country: {
      type: String,
      trim: true,
      index: true,
    },
    destination_country: {
      type: String,
      trim: true,
      index: true,
    },
    destination_port: {
      type: String,
      trim: true,
    },
    hs_code: {
      type: String,
      trim: true,
    },

    // --- Party Identifiers ---
    importer_id: {
      type: String,
      trim: true,
      index: true,
    },
    exporter_id: {
      type: String,
      trim: true,
      index: true,
    },

    // --- Financial & Physical ---
    declared_value: {
      type: Number,
      min: 0,
    },
    declared_weight: {
      type: Number,
      min: 0,
    },
    measured_weight: {
      type: Number,
      min: 0,
    },
    shipping_line: {
      type: String,
      trim: true,
    },
    dwell_time_hours: {
      type: Number,
      min: 0,
    },
    clearance_status: {
      type: String,
      trim: true,
    },

    // --- Engineered Features ---
    weight_difference: Number,
    weight_mismatch_percentage: Number,
    value_to_weight_ratio: Number,
    high_dwell_time_flag: Boolean,
    importer_frequency: Number,
    exporter_frequency: Number,
    trade_route_risk: Number,

    // --- ML Outputs ---
    risk_score: {
      type: Number,
      min: 0,
      max: 1,
    },
    risk_level: {
      type: String,
      enum: ['Critical', 'Low Risk', 'Clear', null],
      default: null,
    },
    anomaly_flag: {
      type: Boolean,
      default: false,
    },
    anomaly_score: {
      type: Number,
    },
    explanation: {
      type: String,
    },

    // --- Geo Data ---
    origin_coordinates: {
      lat: Number,
      lng: Number,
    },
    destination_coordinates: {
      lat: Number,
      lng: Number,
    },
    route_path: {
      type: [[Number]], // Array of [lat, lng] pairs
      default: [],
    },

    // --- Metadata ---
    upload_batch_id: {
      type: String,
      index: true,
    },
    processed_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'containers',
  }
);

// Compound index for common queries
containerSchema.index({ risk_level: 1, anomaly_flag: 1 });
containerSchema.index({ origin_country: 1, destination_country: 1 });
containerSchema.index({ upload_batch_id: 1, risk_level: 1 });

module.exports = mongoose.model('Container', containerSchema);
