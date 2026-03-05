/**
 * Geo Service
 * Converts country names and port names into geographic coordinates,
 * generates intermediate route waypoints, and returns GeoJSON-compatible data
 * for shipment route visualisation on a map.
 */
const NodeGeocoder = require('node-geocoder');
const Container = require('../models/containerModel');
const { getCache, setCache } = require('../config/redis');
const logger = require('../utils/logger');

// Geocoder configuration — uses OpenStreetMap (Nominatim) by default (no key needed)
const geocoderOptions = {
  provider: process.env.GEOCODER_PROVIDER || 'openstreetmap',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

let geocoder;
try {
  geocoder = NodeGeocoder(geocoderOptions);
} catch (e) {
  logger.warn('Geocoder init failed - will use cached country coordinates only');
}

/**
 * Static fallback coordinate map for common countries/major ports.
 * Used when geocoding API is unavailable or rate-limited.
 */
const FALLBACK_COORDS = {
  'china': { lat: 35.8617, lng: 104.1954 },
  'india': { lat: 20.5937, lng: 78.9629 },
  'united states': { lat: 37.0902, lng: -95.7129 },
  'usa': { lat: 37.0902, lng: -95.7129 },
  'united kingdom': { lat: 55.3781, lng: -3.4360 },
  'uk': { lat: 55.3781, lng: -3.4360 },
  'germany': { lat: 51.1657, lng: 10.4515 },
  'france': { lat: 46.2276, lng: 2.2137 },
  'brazil': { lat: -14.2350, lng: -51.9253 },
  'russia': { lat: 61.5240, lng: 105.3188 },
  'japan': { lat: 36.2048, lng: 138.2529 },
  'south korea': { lat: 35.9078, lng: 127.7669 },
  'australia': { lat: -25.2744, lng: 133.7751 },
  'canada': { lat: 56.1304, lng: -106.3468 },
  'uae': { lat: 23.4241, lng: 53.8478 },
  'united arab emirates': { lat: 23.4241, lng: 53.8478 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'netherlands': { lat: 52.1326, lng: 5.2913 },
  'spain': { lat: 40.4637, lng: -3.7492 },
  'italy': { lat: 41.8719, lng: 12.5674 },
  'malaysia': { lat: 4.2105, lng: 101.9758 },
  'indonesia': { lat: -0.7893, lng: 113.9213 },
  'thailand': { lat: 15.8700, lng: 100.9925 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'turkey': { lat: 38.9637, lng: 35.2433 },
  'mexico': { lat: 23.6345, lng: -102.5528 },
  'saudi arabia': { lat: 23.8859, lng: 45.0792 },
  'south africa': { lat: -30.5595, lng: 22.9375 },
  'nigeria': { lat: 9.0820, lng: 8.6753 },
  'egypt': { lat: 26.0975, lng: 31.2357 },
  'pakistan': { lat: 30.3753, lng: 69.3451 },
  'bangladesh': { lat: 23.6850, lng: 90.3563 },
  'vietnam': { lat: 14.0583, lng: 108.2772 },
  'philippines': { lat: 12.8797, lng: 121.7740 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'rotterdam': { lat: 51.9244, lng: 4.4777 },
  'singapore port': { lat: 1.2966, lng: 103.7764 },
  'los angeles': { lat: 33.7490, lng: -118.2615 },
  'hamburg': { lat: 53.5753, lng: 9.8689 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'london': { lat: 51.5072, lng: -0.1276 },
  'new york': { lat: 40.7128, lng: -74.0060 },
};

/**
 * Geocode a location string to lat/lng.
 * Checks Redis cache first, then fallback map, then live API.
 *
 * @param {string} location - country name or port name
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
const geocodeLocation = async (location) => {
  if (!location) return null;
  const key = location.toLowerCase().trim();

  // 1. Redis cache
  const cached = await getCache(`geo:${key}`);
  if (cached) return cached;

  // 2. Static fallback map
  if (FALLBACK_COORDS[key]) {
    await setCache(`geo:${key}`, FALLBACK_COORDS[key], 86400); // cache 24h
    return FALLBACK_COORDS[key];
  }

  // 3. Partial match in fallback map
  for (const [k, coords] of Object.entries(FALLBACK_COORDS)) {
    if (key.includes(k) || k.includes(key)) {
      await setCache(`geo:${key}`, coords, 86400);
      return coords;
    }
  }

  // 4. Live geocoding API
  if (!geocoder) return null;
  try {
    const results = await geocoder.geocode(location);
    if (results && results.length > 0) {
      const { latitude: lat, longitude: lng } = results[0];
      const coords = { lat, lng };
      await setCache(`geo:${key}`, coords, 86400 * 7); // cache 7 days
      return coords;
    }
  } catch (err) {
    logger.warn(`Geocoding failed for "${location}": ${err.message}`);
  }

  return null;
};

/**
 * Generate intermediate route waypoints between two coordinates.
 * Creates a great-circle approximation with N intermediate points.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @param {number} steps - number of intermediate points (default 8)
 * @returns {Array<[number, number]>} array of [lat, lng]
 */
const generateRoutePath = (origin, destination, steps = 8) => {
  const path = [];

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const lat = origin.lat + (destination.lat - origin.lat) * fraction;
    const lng = origin.lng + (destination.lng - origin.lng) * fraction;
    path.push([parseFloat(lat.toFixed(4)), parseFloat(lng.toFixed(4))]);
  }

  return path;
};

/**
 * Build full route visualisation data for a container.
 *
 * @param {string} containerId
 * @returns {Promise<Object>} GeoJSON-compatible route object
 */
const getContainerRoute = async (containerId) => {
  const cacheKey = `route:${containerId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const container = await Container.findOne({ container_id: containerId }).lean();
  if (!container) {
    return null;
  }

  // Use stored coordinates if available, else geocode
  let originCoords = container.origin_coordinates;
  let destCoords = container.destination_coordinates;

  if (!originCoords || !originCoords.lat) {
    originCoords = await geocodeLocation(container.origin_country);
  }

  if (!destCoords || !destCoords.lat) {
    // Prefer destination port name for accuracy
    destCoords = await geocodeLocation(container.destination_port || container.destination_country);
  }

  if (!originCoords || !destCoords) {
    return {
      container_id: containerId,
      error: 'Could not resolve coordinates for origin or destination',
      origin_country: container.origin_country,
      destination_country: container.destination_country,
    };
  }

  const route = generateRoutePath(originCoords, destCoords);

  const result = {
    container_id: containerId,
    origin: originCoords,
    destination: destCoords,
    origin_country: container.origin_country,
    destination_country: container.destination_country,
    destination_port: container.destination_port,
    route,
    // GeoJSON LineString for map libraries
    geojson: {
      type: 'Feature',
      properties: {
        container_id: containerId,
        risk_level: container.risk_level,
        risk_score: container.risk_score,
      },
      geometry: {
        type: 'LineString',
        coordinates: route.map(([lat, lng]) => [lng, lat]), // GeoJSON: [lng, lat]
      },
    },
  };

  // Update DB with resolved coordinates
  await Container.updateOne(
    { container_id: containerId },
    {
      $set: {
        origin_coordinates: originCoords,
        destination_coordinates: destCoords,
        route_path: route,
      },
    }
  );

  await setCache(cacheKey, result, 3600); // cache 1 hour
  return result;
};

/**
 * Batch geocode and store coordinates for all containers missing geo data.
 * Run periodically or after batch upload.
 *
 * @param {number} limit - max containers to process in one call
 * @returns {Promise<number>} count of containers updated
 */
const backfillGeoData = async (limit = 200) => {
  const containers = await Container.find({
    $or: [
      { 'origin_coordinates.lat': { $exists: false } },
      { 'destination_coordinates.lat': { $exists: false } },
    ],
  })
    .limit(limit)
    .lean();

  let updated = 0;
  for (const c of containers) {
    const [originCoords, destCoords] = await Promise.all([
      geocodeLocation(c.origin_country),
      geocodeLocation(c.destination_port || c.destination_country),
    ]);

    if (originCoords || destCoords) {
      const update = {};
      if (originCoords) update.origin_coordinates = originCoords;
      if (destCoords) {
        update.destination_coordinates = destCoords;
        if (originCoords) {
          update.route_path = generateRoutePath(originCoords, destCoords);
        }
      }
      await Container.updateOne({ _id: c._id }, { $set: update });
      updated++;
    }
  }
  return updated;
};

module.exports = {
  geocodeLocation,
  generateRoutePath,
  getContainerRoute,
  backfillGeoData,
  FALLBACK_COORDS,
};
