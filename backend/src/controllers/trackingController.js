/**
 * Tracking Controller
 * GET  /api/map/track/:container_id              — full track data + GeoJSON
 * GET  /api/map/tracks                           — FeatureCollection for many shipments
 * GET  /api/map/heatmap                          — aggregated risk heatmap
 * POST /api/tracking/link-vessel                 — link container to vessel IMO/name
 * POST /api/tracking/refresh/:container_id       — force refresh position
 */
const ShipmentTrack = require('../models/shipmentTrackModel');
const Container = require('../models/containerModel');
const { getOrCreateTrack, refreshTrack } = require('../services/trackingService');
const { featureCollection, pointFeature } = require('../utils/geojson');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

// ── GET Single Track ───────────────────────────────────────────────────────────
const getTrack = async (req, res) => {
  const { container_id } = req.params;

  let track = await ShipmentTrack.findOne({ container_id });

  if (!track) {
    // Try to create it from container data
    const container = await Container.findOne({ container_id }).lean();
    if (!container) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Container '${container_id}' not found.`, request_id: req.requestId },
      });
    }
    track = await getOrCreateTrack(container);
    if (!track) {
      return res.status(422).json({
        error: { code: 'TRACK_UNAVAILABLE', message: 'Cannot build track — missing geocoding data.', request_id: req.requestId },
      });
    }
  }

  await audit({
    user: req.user,
    action: 'VIEW_TRACK',
    entityType: 'ShipmentTrack',
    entityId: container_id,
    req,
  });

  return res.status(200).json({
    success: true,
    container_id: track.container_id,
    risk_level: track.risk_level,
    risk_score: track.risk_score,
    anomaly_flag: track.anomaly_flag,
    vessel_name: track.vessel_name,
    vessel_imo: track.vessel_imo,
    current_position: track.last_position,
    eta: track.eta,
    voyage_start: track.voyage_start,
    estimated_duration_hours: track.estimated_duration_hours,
    progress: track.progress,
    status: track.status,
    provider: track.provider,
    origin: track.origin,
    destination: track.destination,
    stops: track.stops,
    events: track.events,
    geojson: track.route_geojson,
    last_updated: track.last_updated,
  });
};

// ── GET Many Tracks (FeatureCollection) ───────────────────────────────────────
const getTracks = async (req, res) => {
  const { risk_level, status, limit = 200, page = 1 } = req.query;

  const filter = {};
  if (risk_level) filter.risk_level = risk_level;
  if (status) filter.status = status;

  const tracks = await ShipmentTrack.find(filter)
    .sort({ last_updated: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit))
    .select('container_id last_position risk_level risk_score anomaly_flag status last_updated origin destination')
    .lean();

  const features = tracks
    .filter((t) => t.last_position?.lat && t.last_position?.lng)
    .map((t) =>
      pointFeature(t.last_position.lat, t.last_position.lng, {
        container_id: t.container_id,
        risk_level: t.risk_level,
        risk_score: t.risk_score,
        anomaly_flag: t.anomaly_flag,
        status: t.status,
        last_update: t.last_updated,
        origin: t.origin?.name,
        destination: t.destination?.name,
      })
    );

  return res.status(200).json({
    success: true,
    count: features.length,
    geojson: featureCollection(features),
  });
};

// ── GET Heatmap ────────────────────────────────────────────────────────────────
const getHeatmap = async (req, res) => {
  const { metric = 'risk_score' } = req.query;

  const validMetrics = ['risk_score', 'anomaly_score', 'dwell_time_hours'];
  if (!validMetrics.includes(metric)) {
    return res.status(422).json({
      error: { code: 'INVALID_METRIC', message: `metric must be one of: ${validMetrics.join(', ')}`, request_id: req.requestId },
    });
  }

  // Aggregate containers by origin country for heatmap
  const data = await Container.aggregate([
    { $match: { origin_coordinates: { $exists: true }, [`${metric}`]: { $exists: true } } },
    {
      $group: {
        _id: { lat: { $round: ['$origin_coordinates.lat', 1] }, lng: { $round: ['$origin_coordinates.lng', 1] } },
        value: { $avg: `$${metric}` },
        count: { $sum: 1 },
      },
    },
    { $sort: { value: -1 } },
    { $limit: 500 },
  ]);

  const features = data.map((p) =>
    pointFeature(p._id.lat, p._id.lng, {
      metric,
      value: parseFloat((p.value || 0).toFixed(4)),
      count: p.count,
    })
  );

  return res.status(200).json({
    success: true,
    metric,
    count: features.length,
    geojson: featureCollection(features),
  });
};

// ── Link Vessel ────────────────────────────────────────────────────────────────
const linkVessel = async (req, res) => {
  const { container_id, vessel_imo, vessel_name } = req.body;

  let track = await ShipmentTrack.findOne({ container_id });

  if (!track) {
    const container = await Container.findOne({ container_id }).lean();
    if (!container) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Container '${container_id}' not found.`, request_id: req.requestId },
      });
    }
    track = await getOrCreateTrack(container);
  }

  const update = { last_updated: new Date() };
  if (vessel_imo) update.vessel_imo = vessel_imo;
  if (vessel_name) update.vessel_name = vessel_name;

  await ShipmentTrack.updateOne({ container_id }, update);

  await audit({
    user: req.user,
    action: 'LINK_VESSEL',
    entityType: 'ShipmentTrack',
    entityId: container_id,
    req,
    metadata: { vessel_imo, vessel_name },
  });

  return res.status(200).json({ success: true, container_id, vessel_imo, vessel_name });
};

// ── Force Refresh ──────────────────────────────────────────────────────────────
const forceRefresh = async (req, res) => {
  const { container_id } = req.params;

  // Full rebuild — re-geocode origin/destination from the container record
  const container = await Container.findOne({ container_id }).lean();
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${container_id}' not found.`, request_id: req.requestId },
    });
  }

  // Delete old track so getOrCreateTrack always rebuilds fresh
  await ShipmentTrack.deleteOne({ container_id });
  const track = await getOrCreateTrack(container);

  if (!track) {
    return res.status(422).json({
      error: { code: 'TRACK_UNAVAILABLE', message: 'Could not rebuild track — missing geocoding data.', request_id: req.requestId },
    });
  }

  return res.status(200).json({ success: true, container_id, status: track.status, progress: track.progress, last_updated: track.last_updated });
};

module.exports = { getTrack, getTracks, getHeatmap, linkVessel, forceRefresh };
