/**
 * Tracking Service — Simulated Provider
 * Computes vessel position, stops, and events based on shipment data.
 * No external AIS key needed — designed to work out of the box.
 *
 * Provider interface:
 *   getOrCreateTrack(container) → ShipmentTrack doc (upserted)
 *   refreshTrack(container_id) → updated ShipmentTrack doc
 *
 * Replace `simulatedProvider` with a real AIS provider that exposes
 * the same `getPosition(imoOrName)` interface to go live.
 */
const Container = require('../models/containerModel');
const ShipmentTrack = require('../models/shipmentTrackModel');
const GeoCache = require('../models/geoCacheModel');
const { getCache, setCache } = require('../config/redis');
const {
  haversineDistanceKm,
  interpolatePosition,
  lineStringFeature,
  pointFeature,
  featureCollection,
  bearingDeg,
} = require('../utils/geojson');
const logger = require('../utils/logger');

// ── Constants ──────────────────────────────────────────────────────────────────

const AVG_SHIP_SPEED_KMH = 26; // ~14 knots
const UPDATE_INTERVAL_MINUTES = parseInt(process.env.TRACKING_UPDATE_MINS) || 15;

// Known transshipment hubs used to build intermediate stops
const TRANSIT_HUBS = {
  SUEZ: { name: 'Suez Canal', type: 'CANAL', lat: 30.4235, lng: 32.3417 },
  SINGAPORE: { name: 'Port of Singapore', type: 'PORT', lat: 1.2966, lng: 103.7764 },
  ROTTERDAM: { name: 'Port of Rotterdam', type: 'PORT', lat: 51.9244, lng: 4.4777 },
  DUBAI: { name: 'Port of Jebel Ali', type: 'PORT', lat: 25.0173, lng: 55.0762 },
  COLOMBO: { name: 'Port of Colombo', type: 'PORT', lat: 6.9319, lng: 79.8478 },
  PANAMA: { name: 'Panama Canal', type: 'CANAL', lat: 9.0800, lng: -79.6806 },
  HAMBURG: { name: 'Port of Hamburg', type: 'PORT', lat: 53.5753, lng: 9.8689 },
  LOS_ANGELES: { name: 'Port of Los Angeles', type: 'PORT', lat: 33.7490, lng: -118.2615 },
  SHANGHAI: { name: 'Port of Shanghai', type: 'PORT', lat: 31.3888, lng: 121.6380 },
  HONG_KONG: { name: 'Port of Hong Kong', type: 'PORT', lat: 22.3193, lng: 114.1694 },
};

// Region detection helpers — returns a broad ISO region
const EUROPE_COUNTRIES = new Set(['DE', 'FR', 'NL', 'GB', 'UK', 'BE', 'IT', 'ES', 'PL', 'SE', 'NO', 'FI', 'DK', 'PT']);
const EAST_ASIA = new Set(['CN', 'JP', 'KR', 'TW', 'HK']);
const SE_ASIA = new Set(['SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'MM']);
const SOUTH_ASIA = new Set(['IN', 'PK', 'BD', 'LK', 'NP']);
const MIDDLE_EAST = new Set(['AE', 'SA', 'KW', 'OM', 'QA', 'BH', 'IQ', 'IR']);
const AFRICA = new Set(['NG', 'ZA', 'EG', 'MA', 'GH', 'KE', 'TZ', 'ET', 'UG', 'RW']);
const AMERICAS_W = new Set(['US', 'CA', 'MX', 'CL', 'PE', 'EC', 'CO']);
const AMERICAS_E = new Set(['BR', 'AR', 'UY', 'PY', 'VE']);

const regionOf = (code) => {
  const c = (code || '').toUpperCase().substring(0, 2);
  if (EAST_ASIA.has(c)) return 'EAST_ASIA';
  if (SE_ASIA.has(c)) return 'SE_ASIA';
  if (SOUTH_ASIA.has(c)) return 'SOUTH_ASIA';
  if (MIDDLE_EAST.has(c)) return 'MIDDLE_EAST';
  if (AFRICA.has(c)) return 'AFRICA';
  if (EUROPE_COUNTRIES.has(c)) return 'EUROPE';
  if (AMERICAS_W.has(c)) return 'AMERICAS_W';
  if (AMERICAS_E.has(c)) return 'AMERICAS_E';
  return 'UNKNOWN';
};

/**
 * Determine which transit hubs to include based on origin/destination regions.
 */
const selectTransitHubs = (originRegion, destRegion) => {
  const hubs = [];
  const pair = `${originRegion}->${destRegion}`;

  // Asia → Europe / Middle East: via Suez and sometimes Singapore
  if (['EAST_ASIA', 'SE_ASIA', 'SOUTH_ASIA'].includes(originRegion) && destRegion === 'EUROPE') {
    if (originRegion === 'EAST_ASIA') hubs.push(TRANSIT_HUBS.SINGAPORE);
    hubs.push(TRANSIT_HUBS.SUEZ);
  }
  // Asia → Americas West
  else if (['EAST_ASIA', 'SE_ASIA'].includes(originRegion) && destRegion === 'AMERICAS_W') {
    // Direct Trans-Pacific
  }
  // Asia → Americas East
  else if (['EAST_ASIA', 'SE_ASIA'].includes(originRegion) && destRegion === 'AMERICAS_E') {
    hubs.push(TRANSIT_HUBS.SINGAPORE);
    hubs.push(TRANSIT_HUBS.SUEZ);
  }
  // Europe → Asia
  else if (destRegion === 'EAST_ASIA' || destRegion === 'SE_ASIA') {
    hubs.push(TRANSIT_HUBS.SUEZ);
    hubs.push(TRANSIT_HUBS.SINGAPORE);
  }
  // Americas → Europe
  else if (['AMERICAS_W', 'AMERICAS_E'].includes(originRegion) && destRegion === 'EUROPE') {
    if (originRegion === 'AMERICAS_W') hubs.push(TRANSIT_HUBS.PANAMA);
  }
  // Africa → Europe via Suez (North Africa)
  else if (originRegion === 'AFRICA' && destRegion === 'EUROPE') {
    hubs.push(TRANSIT_HUBS.SUEZ);
  }

  return hubs;
};

// ── Geocoding (uses GeoCache model as secondary cache) ─────────────────────────

const FALLBACK_COORDS = {
  // ISO-2 codes
  cn: { lat: 31.2304, lng: 121.4737 },
  in: { lat: 19.0760, lng: 72.8777 },
  us: { lat: 33.7490, lng: -118.2615 },
  gb: { lat: 51.5072, lng: -0.1276 },
  uk: { lat: 51.5072, lng: -0.1276 },
  de: { lat: 53.5753, lng: 9.8689 },
  fr: { lat: 43.2965, lng: 5.3698 },
  nl: { lat: 51.9244, lng: 4.4777 },
  sg: { lat: 1.2966, lng: 103.7764 },
  ae: { lat: 25.0173, lng: 55.0762 },
  jp: { lat: 35.6762, lng: 139.6503 },
  kr: { lat: 35.0996, lng: 129.0404 },
  be: { lat: 51.2993, lng: 4.3018 },
  au: { lat: -33.8688, lng: 151.2093 },
  ca: { lat: 43.7000, lng: -79.4163 },
  tr: { lat: 41.0082, lng: 28.9784 },
  it: { lat: 40.8518, lng: 14.2681 },
  es: { lat: 36.5271, lng: -6.2886 },
  br: { lat: -23.9619, lng: -46.3042 },
  mx: { lat: 31.7228, lng: -116.6435 },
  ru: { lat: 59.9311, lng: 30.3609 },
  sa: { lat: 21.4858, lng: 39.1925 },
  pk: { lat: 24.8607, lng: 67.0011 },
  bd: { lat: 22.5726, lng: 88.3639 },
  vn: { lat: 10.8231, lng: 106.6297 },
  th: { lat: 13.0827, lng: 100.9847 },
  my: { lat: 3.1390, lng: 101.6869 },
  id: { lat: -6.1085, lng: 106.8083 },
  ph: { lat: 14.5995, lng: 120.9842 },
  hk: { lat: 22.3193, lng: 114.1694 },
  za: { lat: -33.9249, lng: 18.4241 },
  eg: { lat: 31.2001, lng: 29.9187 },
  ng: { lat: 6.4527, lng: 3.3958 },
  ke: { lat: -4.0435, lng: 39.6682 },
  pl: { lat: 54.3520, lng: 18.6466 },
  pt: { lat: 38.7223, lng: -9.1393 },
  ro: { lat: 44.1750, lng: 28.6200 },
  uz: { lat: 41.2995, lng: 69.2401 },
  fi: { lat: 60.0587, lng: 24.9252 },
  lk: { lat: 6.9319, lng: 79.8478 },
  // Full country names (primary lookup table)
  china: { lat: 31.2304, lng: 121.4737 },
  india: { lat: 19.0760, lng: 72.8777 },
  'united states': { lat: 33.7490, lng: -118.2615 },
  usa: { lat: 33.7490, lng: -118.2615 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  england: { lat: 51.5074, lng: -0.1278 },
  germany: { lat: 53.5753, lng: 9.8689 },
  france: { lat: 43.2965, lng: 5.3698 },
  netherlands: { lat: 51.9244, lng: 4.4777 },
  singapore: { lat: 1.2966, lng: 103.7764 },
  'united arab emirates': { lat: 25.0173, lng: 55.0762 },
  uae: { lat: 25.0173, lng: 55.0762 },
  japan: { lat: 35.6762, lng: 139.6503 },
  'south korea': { lat: 35.0996, lng: 129.0404 },
  korea: { lat: 35.0996, lng: 129.0404 },
  belgium: { lat: 51.2993, lng: 4.3018 },
  australia: { lat: -33.8688, lng: 151.2093 },
  canada: { lat: 43.7000, lng: -79.4163 },
  turkey: { lat: 41.0082, lng: 28.9784 },
  italy: { lat: 40.8518, lng: 14.2681 },
  spain: { lat: 36.5271, lng: -6.2886 },
  brazil: { lat: -23.9619, lng: -46.3042 },
  mexico: { lat: 31.7228, lng: -116.6435 },
  russia: { lat: 59.9311, lng: 30.3609 },
  'saudi arabia': { lat: 21.4858, lng: 39.1925 },
  pakistan: { lat: 24.8607, lng: 67.0011 },
  bangladesh: { lat: 22.5726, lng: 88.3639 },
  vietnam: { lat: 10.8231, lng: 106.6297 },
  thailand: { lat: 13.0827, lng: 100.9847 },
  malaysia: { lat: 3.1390, lng: 101.6869 },
  indonesia: { lat: -6.1085, lng: 106.8083 },
  philippines: { lat: 14.5995, lng: 120.9842 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'south africa': { lat: -33.9249, lng: 18.4241 },
  egypt: { lat: 31.2001, lng: 29.9187 },
  nigeria: { lat: 6.4527, lng: 3.3958 },
  kenya: { lat: -4.0435, lng: 39.6682 },
  poland: { lat: 54.3520, lng: 18.6466 },
  portugal: { lat: 38.7223, lng: -9.1393 },
  romania: { lat: 44.1750, lng: 28.6200 },
  uzbekistan: { lat: 41.2995, lng: 69.2401 },
  finland: { lat: 60.0587, lng: 24.9252 },
  'sri lanka': { lat: 6.9319, lng: 79.8478 },
  israel: { lat: 32.0853, lng: 34.7818 },
  iraq: { lat: 29.3772, lng: 47.9774 },
  iran: { lat: 29.6100, lng: 50.8427 },
  sweden: { lat: 57.7089, lng: 11.9746 },
  norway: { lat: 59.9127, lng: 10.7461 },
  denmark: { lat: 55.6761, lng: 12.5683 },
  switzerland: { lat: 47.3769, lng: 8.5417 },
  austria: { lat: 48.2082, lng: 16.3738 },
  greece: { lat: 37.9715, lng: 23.7257 },
  'new zealand': { lat: -36.8485, lng: 174.7633 },
  ukraine: { lat: 46.4925, lng: 30.7233 },
  colombia: { lat: 10.3932, lng: -75.4832 },
  peru: { lat: -12.0432, lng: -77.1282 },
  chile: { lat: -33.4489, lng: -70.6693 },
  argentina: { lat: -34.6037, lng: -58.3816 },
  morocco: { lat: 35.7595, lng: -5.8340 },
  tanzania: { lat: -6.8161, lng: 39.2803 },
  ethiopia: { lat: 11.5806, lng: 43.1450 },
  ghana: { lat: 5.5560, lng: -0.1969 },
};

// Build a word-boundary lookup from FALLBACK_COORDS for precise matching
const resolveCoords = async (location) => {
  if (!location) return null;
  const key = location.toLowerCase().trim();

  // Quick-check: if the location is in our FALLBACK_COORDS map, use it directly −
  // this ensures we NEVER return a stale cached value that mismatches our map.
  if (FALLBACK_COORDS[key]) {
    return FALLBACK_COORDS[key];
  }

  // 1. Redis
  const redisHit = await getCache(`geo:${key}`);
  if (redisHit) return redisHit;

  // 2. MongoDB geo cache
  const dbHit = await GeoCache.findOneAndUpdate({ key }, { $inc: { hit_count: 1 } }, { new: false });
  if (dbHit) {
    await setCache(`geo:${key}`, { lat: dbHit.lat, lng: dbHit.lng }, 86400);
    return { lat: dbHit.lat, lng: dbHit.lng };
  }

  // 3. Static fallback map (ISO2 code or name)
  const twoChar = key.substring(0, 2);
  if (FALLBACK_COORDS[key]) {
    await _cacheCoords(key, FALLBACK_COORDS[key], 'static', location);
    return FALLBACK_COORDS[key];
  }
  if (FALLBACK_COORDS[twoChar]) {
    await _cacheCoords(key, FALLBACK_COORDS[twoChar], 'static', location);
    return FALLBACK_COORDS[twoChar];
  }

  // 4. Partial match — word boundary only (avoid "china" matching "in")
  for (const [k, coords] of Object.entries(FALLBACK_COORDS)) {
    // Only match if k length > 2 (skip ISO-2 codes in partial matching)
    if (k.length > 2 && (key === k || key.startsWith(k + ' ') || key.endsWith(' ' + k) || key.includes(' ' + k + ' '))) {
      await _cacheCoords(key, coords, 'static', location);
      return coords;
    }
  }

  logger.warn(`[Tracking] Cannot geocode: "${location}" — using null position`);
  return null;
};

const _cacheCoords = async (key, coords, source, location) => {
  await setCache(`geo:${key}`, coords, 86400);
  await GeoCache.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        location,
        lat: coords.lat,
        lng: coords.lng,
        source,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    },
    { upsert: true }
  ).catch(() => {});
};

// ── Simulated Position Calculator ──────────────────────────────────────────────

/**
 * Build a full waypoint path including transit hubs.
 */
const buildWaypointPath = (origin, dest, hubs) => {
  return [
    { lat: origin.lat, lng: origin.lng },
    ...hubs.map((h) => ({ lat: h.lat, lng: h.lng })),
    { lat: dest.lat, lng: dest.lng },
  ];
};

/**
 * Calculate current simulated position and voyage metadata.
 */
const computeSimulatedState = (track) => {
  const now = new Date();
  const voyageStart = track.voyage_start;
  const durationHours = track.estimated_duration_hours;

  if (!voyageStart || !durationHours) {
    return { progress: 0, status: 'UNKNOWN', currentPos: null, speed: 0, heading: 0 };
  }

  const elapsedHours = (now - voyageStart) / 3600000;
  const rawProgress = elapsedHours / durationHours;
  const progress = Math.min(Math.max(rawProgress, 0), 1);

  // Determine status
  let status;
  if (progress >= 1) {
    status = 'ARRIVED';
  } else if (progress >= 0.96) {
    status = 'IN_PORT';
  } else if (rawProgress < -0.01) {
    status = 'UNKNOWN';
  } else {
    status = 'AT_SEA';
  }

  // Check if currently at a stop
  for (const stop of track.stops || []) {
    if (stop.arrival_time && stop.departure_time) {
      if (now >= stop.arrival_time && now <= stop.departure_time) {
        status = 'IN_PORT';
        break;
      }
    }
  }

  // Build waypoint path for interpolation
  const waypoints = [];
  waypoints.push({ lat: track.origin.lat, lng: track.origin.lng });
  for (const stop of track.stops || []) {
    waypoints.push({ lat: stop.lat, lng: stop.lng });
  }
  waypoints.push({ lat: track.destination.lat, lng: track.destination.lng });

  const currentPos = interpolatePosition(waypoints, progress);

  // Compute heading to next waypoint
  let heading = 0;
  if (currentPos && waypoints.length > 1) {
    const nextIdx = Math.min(Math.ceil(progress * (waypoints.length - 1)), waypoints.length - 1);
    const nxt = waypoints[nextIdx];
    heading = bearingDeg(currentPos.lat, currentPos.lng, nxt.lat, nxt.lng);
  }

  // Speed: ~14 knots at sea, 0 in port/arrived
  const speed = (status === 'AT_SEA') ? 14 + (Math.random() * 2 - 1) : 0;

  return { progress, status, currentPos, speed: parseFloat(speed.toFixed(1)), heading: Math.round(heading) };
};

// ── Build Stop Schedule ────────────────────────────────────────────────────────

const buildStops = (voyageStart, totalDurationHours, hubs, dwellTimeHours = 0) => {
  const stops = [];
  const n = hubs.length;
  if (n === 0) return stops;

  // Distribute hubs evenly — each at (i+1)/(n+1) of total voyage
  hubs.forEach((hub, i) => {
    const fraction = (i + 1) / (n + 1);
    const arrivalHours = totalDurationHours * fraction - 12; // arrive 12h before waypoint fraction
    const departureHours = arrivalHours + 18; // 18h stop

    stops.push({
      name: hub.name,
      type: hub.type,
      lat: hub.lat,
      lng: hub.lng,
      arrival_time: new Date(voyageStart.getTime() + arrivalHours * 3600000),
      departure_time: new Date(voyageStart.getTime() + departureHours * 3600000),
      reason: hub.type === 'CANAL' ? 'Transit passage' : 'Transshipment / fuel',
      duration_hours: 18,
    });
  });

  // If container has high dwell time, model a hold at destination
  if (dwellTimeHours > 72) {
    const destArrivalHours = totalDurationHours;
    stops.push({
      name: 'Destination Port — Customs Hold',
      type: 'PORT',
      lat: 0, lng: 0, // placeholder, overridden by destination
      arrival_time: new Date(voyageStart.getTime() + destArrivalHours * 3600000),
      departure_time: new Date(voyageStart.getTime() + (destArrivalHours + dwellTimeHours) * 3600000),
      reason: `Customs hold — dwell time ${dwellTimeHours}h`,
      duration_hours: dwellTimeHours,
    });
  }

  return stops;
};

// ── Build Initial Events ───────────────────────────────────────────────────────

const buildInitialEvents = (voyageStart, stops, eta, container) => {
  const events = [];

  events.push({
    timestamp: voyageStart,
    type: 'DEPARTED',
    description: `Vessel departed ${container.origin_country}`,
    meta: { origin: container.origin_country },
  });

  stops.forEach((stop) => {
    if (stop.arrival_time) {
      events.push({
        timestamp: stop.arrival_time,
        type: 'STOP_STARTED',
        description: `Arrived at ${stop.name}`,
        meta: { stop_name: stop.name, type: stop.type, reason: stop.reason },
      });
    }
    if (stop.departure_time) {
      events.push({
        timestamp: stop.departure_time,
        type: 'STOP_ENDED',
        description: `Departed ${stop.name}`,
        meta: { stop_name: stop.name },
      });
    }
  });

  if (eta) {
    events.push({
      timestamp: eta,
      type: 'ARRIVED',
      description: `Expected arrival at ${container.destination_country}`,
      meta: { destination: container.destination_country },
    });
  }

  // Anomaly / customs hold event
  if (container.anomaly_flag) {
    events.push({
      timestamp: new Date(voyageStart.getTime() + 3600000),
      type: 'CUSTOMS_HOLD',
      description: 'Anomaly detected — flagged for customs inspection',
      meta: { anomaly_score: container.anomaly_score },
    });
  }

  return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

// ── Route GeoJSON Builder ──────────────────────────────────────────────────────

const buildRouteGeoJSON = (originCoords, destCoords, hubs, currentPos, stops) => {
  const allWaypoints = [
    [originCoords.lat, originCoords.lng],
    ...hubs.map((h) => [h.lat, h.lng]),
    [destCoords.lat, destCoords.lng],
  ];

  const features = [
    lineStringFeature(allWaypoints, { type: 'route', description: 'Planned voyage route' }),
  ];

  // Stop markers
  stops.forEach((stop) => {
    if (stop.lat && stop.lng && !(stop.lat === 0 && stop.lng === 0)) {
      features.push(
        pointFeature(stop.lat, stop.lng, {
          type: 'stop',
          name: stop.name,
          stop_type: stop.type,
          reason: stop.reason,
          arrival_time: stop.arrival_time,
          departure_time: stop.departure_time,
        })
      );
    }
  });

  // Origin
  features.push(
    pointFeature(originCoords.lat, originCoords.lng, { type: 'origin' })
  );

  // Destination
  features.push(
    pointFeature(destCoords.lat, destCoords.lng, { type: 'destination' })
  );

  // Current position
  if (currentPos) {
    features.push(
      pointFeature(currentPos.lat, currentPos.lng, {
        type: 'current_position',
        last_update: new Date().toISOString(),
      })
    );
  }

  return featureCollection(features);
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create or update a ShipmentTrack for the given container.
 * Called after a container is predicted (upload or single predict).
 */
const getOrCreateTrack = async (container) => {
  try {
    const originCoords = await resolveCoords(container.origin_country);
    const destCoords = await resolveCoords(container.destination_country || container.destination_port);

    if (!originCoords || !destCoords) {
      logger.warn(`[Tracking] Cannot build track for ${container.container_id} — missing coordinates`);
      return null;
    }

    const distanceKm = haversineDistanceKm(
      originCoords.lat, originCoords.lng,
      destCoords.lat, destCoords.lng
    );

    const durationHours = Math.max(distanceKm / AVG_SHIP_SPEED_KMH, 24);
    const voyageStart = container.declaration_date
      ? new Date(container.declaration_date)
      : new Date(Date.now() - durationHours * 0.4 * 3600000); // default: 40% into voyage

    const eta = new Date(voyageStart.getTime() + durationHours * 3600000);

    // Select transit hubs
    const originRegion = regionOf(container.origin_country);
    const destRegion = regionOf(container.destination_country || '');
    const hubs = selectTransitHubs(originRegion, destRegion);

    const stops = buildStops(voyageStart, durationHours, hubs, container.dwell_time_hours || 0);
    const events = buildInitialEvents(voyageStart, stops, eta, container);

    // Compute current position
    const { progress, status, currentPos, speed, heading } = computeSimulatedState({
      voyage_start: voyageStart,
      estimated_duration_hours: durationHours,
      stops,
      origin: originCoords,
      destination: destCoords,
    });

    const lastPosition = currentPos
      ? { lat: currentPos.lat, lng: currentPos.lng, timestamp: new Date(), speed_knots: speed, heading }
      : null;

    // Fix destination coords in destination-hold stop
    stops.forEach((stop) => {
      if (stop.lat === 0 && stop.lng === 0) {
        stop.lat = destCoords.lat;
        stop.lng = destCoords.lng;
      }
    });

    const routeGeoJSON = buildRouteGeoJSON(originCoords, destCoords, hubs, currentPos, stops);

    const trackData = {
      container_id: container.container_id,
      origin: { name: container.origin_country, lat: originCoords.lat, lng: originCoords.lng },
      destination: {
        name: container.destination_country || container.destination_port || 'Unknown',
        lat: destCoords.lat,
        lng: destCoords.lng,
      },
      last_position: lastPosition,
      stops,
      events,
      route_geojson: routeGeoJSON,
      eta,
      voyage_start: voyageStart,
      estimated_duration_hours: durationHours,
      status,
      progress,
      provider: 'SIMULATED',
      risk_level: container.risk_level,
      risk_score: container.risk_score,
      anomaly_flag: container.anomaly_flag || false,
      last_updated: new Date(),
    };

    const track = await ShipmentTrack.findOneAndUpdate(
      { container_id: container.container_id },
      trackData,
      { upsert: true, new: true }
    );

    return track;
  } catch (err) {
    logger.error(`[Tracking] getOrCreateTrack error for ${container.container_id}: ${err.message}`);
    return null;
  }
};

/**
 * Refresh the position of an existing track.
 * Called by the background cron worker.
 */
const refreshTrack = async (container_id) => {
  const track = await ShipmentTrack.findOne({ container_id });
  if (!track) return null;

  const { progress, status, currentPos, speed, heading } = computeSimulatedState(track);

  const updates = {
    progress,
    status,
    last_updated: new Date(),
  };

  if (currentPos) {
    updates.last_position = {
      lat: currentPos.lat,
      lng: currentPos.lng,
      timestamp: new Date(),
      speed_knots: speed,
      heading,
    };
  }

  // Add position update event
  const posEvent = {
    timestamp: new Date(),
    type: 'POSITION_UPDATE',
    description: `Position updated — progress ${(progress * 100).toFixed(1)}%`,
    meta: { progress, status },
  };

  await ShipmentTrack.updateOne(
    { container_id },
    { ...updates, $push: { events: posEvent } }
  );

  return ShipmentTrack.findOne({ container_id });
};

/**
 * Refresh all active (non-ARRIVED) tracks.
 * Called by the scheduled worker.
 */
const refreshAllActiveTracks = async () => {
  try {
    const activeTracks = await ShipmentTrack.find({
      status: { $in: ['AT_SEA', 'IN_PORT', 'UNKNOWN'] },
    }).select('container_id voyage_start estimated_duration_hours stops origin destination');

    logger.info(`[Tracking] Refreshing ${activeTracks.length} active tracks`);
    let updated = 0;

    for (const track of activeTracks) {
      await refreshTrack(track.container_id);
      updated++;
    }

    return updated;
  } catch (err) {
    logger.error(`[Tracking] refreshAllActiveTracks error: ${err.message}`);
    return 0;
  }
};

module.exports = {
  getOrCreateTrack,
  refreshTrack,
  refreshAllActiveTracks,
  resolveCoords,
};
