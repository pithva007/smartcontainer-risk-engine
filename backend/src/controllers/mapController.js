/**
 * Map Controller
 * Provides shipment route visualisation data for frontend map rendering.
 */
const Container = require('../models/containerModel');
const { getContainerRoute, backfillGeoData } = require('../services/geoService');
const logger = require('../utils/logger');

/**
 * GET /api/container-route/:container_id
 * Return origin/destination coordinates and route path for a container.
 */
const getContainerRouteHandler = async (req, res) => {
  const { container_id } = req.params;

  if (!container_id || container_id.trim() === '') {
    return res.status(400).json({ success: false, message: 'container_id is required.' });
  }

  try {
    const routeData = await getContainerRoute(container_id.trim());

    if (!routeData) {
      return res.status(404).json({
        success: false,
        message: `Container ${container_id} not found.`,
      });
    }

    if (routeData.error) {
      return res.status(422).json({
        success: false,
        message: routeData.error,
        container_id: routeData.container_id,
      });
    }

    return res.status(200).json({
      success: true,
      data: routeData,
    });
  } catch (error) {
    logger.error(`Map route error for ${container_id}: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/map/all-routes
 * Return summarised route data for all containers (paginated).
 * Useful for rendering all shipment pins on a world map.
 */
const getAllRoutes = async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const riskLevel = req.query.risk_level; // optional filter

  try {
    const filter = {
      'origin_coordinates.lat': { $exists: true },
      'destination_coordinates.lat': { $exists: true },
    };
    if (riskLevel) filter.risk_level = riskLevel;

    const total = await Container.countDocuments(filter);
    const containers = await Container.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('container_id origin_country destination_country origin_coordinates destination_coordinates risk_level risk_score anomaly_flag')
      .lean();

    const features = containers.map((c) => ({
      type: 'Feature',
      properties: {
        container_id: c.container_id,
        origin_country: c.origin_country,
        destination_country: c.destination_country,
        risk_level: c.risk_level,
        risk_score: c.risk_score,
        anomaly_flag: c.anomaly_flag,
      },
      geometry: {
        type: 'LineString',
        // GeoJSON convention: [longitude, latitude]
        coordinates: [
          [c.origin_coordinates.lng, c.origin_coordinates.lat],
          [c.destination_coordinates.lng, c.destination_coordinates.lat],
        ],
      },
    }));

    return res.status(200).json({
      success: true,
      page,
      total,
      pages: Math.ceil(total / limit),
      geojson: {
        type: 'FeatureCollection',
        features,
      },
    });
  } catch (error) {
    logger.error(`All routes error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/map/backfill-geo
 * Admin endpoint: geocode all containers missing coordinate data.
 */
const backfillGeo = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const updated = await backfillGeoData(limit);
    return res.status(200).json({
      success: true,
      message: `Geo data backfilled for ${updated} containers.`,
      updated,
    });
  } catch (error) {
    logger.error(`Geo backfill error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getContainerRouteHandler, getAllRoutes, backfillGeo };
