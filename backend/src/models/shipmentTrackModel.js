/**
 * ShipmentTrack Model
 * Tracks real-time (or simulated) ship positions, stops, and timeline events.
 * Powers the Ship Tracking Map feature.
 */
const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    speed_knots: { type: Number, default: 0 },
    heading: { type: Number, default: 0 }, // 0-360 degrees
  },
  { _id: false }
);

const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['PORT', 'ANCHORAGE', 'CANAL', 'WAYPOINT'],
      default: 'PORT',
    },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    arrival_time: Date,
    departure_time: Date,
    reason: String,
    duration_hours: Number,
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: [
        'DEPARTED',
        'ARRIVED',
        'STOP_STARTED',
        'STOP_ENDED',
        'DELAYED',
        'POSITION_UPDATE',
        'CUSTOMS_HOLD',
        'STATUS_CHANGE',
      ],
      required: true,
    },
    description: { type: String, required: true },
    meta: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const shipmentTrackSchema = new mongoose.Schema(
  {
    container_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    vessel_imo: {
      type: String,
      sparse: true,
      index: true,
    },
    vessel_name: String,

    // Endpoints
    origin: {
      name: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      _id: false,
    },
    destination: {
      name: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      _id: false,
    },

    // Live or simulated position
    last_position: positionSchema,

    // Array of port/waypoint stops
    stops: [stopSchema],

    // Timeline of events
    events: [eventSchema],

    // Full GeoJSON for map rendering
    route_geojson: mongoose.Schema.Types.Mixed,

    // ETA and voyage info
    eta: Date,
    voyage_start: Date,
    estimated_duration_hours: Number,
    actual_departure: Date,

    // Current status
    status: {
      type: String,
      enum: ['AT_SEA', 'IN_PORT', 'DELAYED', 'ARRIVED', 'UNKNOWN'],
      default: 'UNKNOWN',
      index: true,
    },

    // Provider info
    provider: {
      type: String,
      enum: ['SIMULATED', 'MARINETRAFFIC', 'AISSTREAM', 'AISHUB', 'MANUAL'],
      default: 'SIMULATED',
    },

    // Mirrored from Container for quick lookups
    risk_level: {
      type: String,
      enum: ['Critical', 'Low Risk', 'Clear', null],
      index: true,
    },
    risk_score: Number,
    anomaly_flag: Boolean,

    // Voyage progress (0-1)
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    last_updated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

shipmentTrackSchema.index({ 'last_position.timestamp': -1 });
shipmentTrackSchema.index({ status: 1, risk_level: 1 });
shipmentTrackSchema.index({ last_updated: -1 });

module.exports = mongoose.model('ShipmentTrack', shipmentTrackSchema);
