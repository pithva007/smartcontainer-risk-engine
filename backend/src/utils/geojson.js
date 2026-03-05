/**
 * GeoJSON Utility
 * Helper functions for building GeoJSON-compliant objects.
 */

/**
 * Build a GeoJSON Point feature.
 */
const pointFeature = (lat, lng, properties = {}) => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [lng, lat], // GeoJSON is [lng, lat]
  },
  properties,
});

/**
 * Build a GeoJSON LineString feature from an array of [lat, lng] pairs.
 */
const lineStringFeature = (points, properties = {}) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: points.map(([lat, lng]) => [lng, lat]),
  },
  properties,
});

/**
 * Build a GeoJSON FeatureCollection.
 */
const featureCollection = (features = []) => ({
  type: 'FeatureCollection',
  features,
});

/**
 * Compute great-circle distance between two points (Haversine formula).
 * Returns distance in kilometres.
 */
const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Linear interpolation of position along a path at a given progress [0, 1].
 * `path` is an array of { lat, lng } objects representing waypoints.
 */
const interpolatePosition = (path, progress) => {
  if (!path || path.length === 0) return null;
  if (progress <= 0) return { lat: path[0].lat, lng: path[0].lng };
  if (progress >= 1) return { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng };

  const totalSegments = path.length - 1;
  const scaledPos = progress * totalSegments;
  const segIndex = Math.floor(scaledPos);
  const segProgress = scaledPos - segIndex;

  const from = path[Math.min(segIndex, path.length - 1)];
  const to = path[Math.min(segIndex + 1, path.length - 1)];

  return {
    lat: from.lat + (to.lat - from.lat) * segProgress,
    lng: from.lng + (to.lng - from.lng) * segProgress,
  };
};

/**
 * Compute approximate heading (bearing) from point A to point B.
 * Returns degrees (0-360).
 */
const bearingDeg = (lat1, lng1, lat2, lng2) => {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

module.exports = {
  pointFeature,
  lineStringFeature,
  featureCollection,
  haversineDistanceKm,
  interpolatePosition,
  bearingDeg,
};
