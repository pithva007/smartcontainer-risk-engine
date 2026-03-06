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

/**
 * GET /api/container-location/:container_id
 * Returns the container's CURRENT LOCATION based on clearance_status:
 *   Cleared  → destination port
 *   Transit  → midpoint between origin and destination
 *   Pending  → origin country
 */
const getContainerLocation = async (req, res) => {
  const { container_id } = req.params;
  if (!container_id?.trim()) {
    return res.status(400).json({ success: false, message: 'container_id is required.' });
  }

  const id = container_id.trim().toUpperCase();

  try {
    const container = await Container.findOne({ container_id: id }).lean();
    if (!container) {
      return res.status(404).json({ success: false, message: `Container '${id}' not found.` });
    }

    const { geocodeLocation, generateRoutePath } = require('../services/geoService');

    /**
     * Maps country names to their primary container port.
     * Used when a container record only has a country name and no specific port.
     * This ensures the map pin lands at the actual port, not the country centroid.
     */
    const COUNTRY_TO_PRIMARY_PORT = {
      // ── Full country names ────────────────────────────────────────────────
      // South Asia
      'pakistan': 'karachi',
      'india': 'nhava sheva',
      'bangladesh': 'chittagong',
      'sri lanka': 'colombo',
      // Middle East
      'uae': 'jebel ali',
      'united arab emirates': 'jebel ali',
      'saudi arabia': 'jeddah',
      'oman': 'sohar',
      'kuwait': 'shuwaikh',
      'bahrain': 'salmabad',
      'iraq': 'umm qasr',
      'iran': 'bandar abbas',
      'jordan': 'aqaba',
      'israel': 'haifa',
      'turkey': 'mersin',
      // East Asia
      'china': 'shanghai',
      'mainland china': 'shanghai',
      'hong kong': 'hong kong',
      'hksar': 'hong kong',
      'taiwan': 'kaohsiung',
      'japan': 'yokohama',
      'south korea': 'busan',
      'korea': 'busan',
      // SE Asia
      'singapore': 'singapore port',
      'malaysia': 'port klang',
      'indonesia': 'tanjung priok',
      'thailand': 'laem chabang',
      'vietnam': 'ho chi minh city',
      'philippines': 'manila',
      'myanmar': 'thilawa',
      'cambodia': 'sihanoukville',
      // Europe
      'netherlands': 'rotterdam',
      'belgium': 'antwerp',
      'germany': 'hamburg',
      'united kingdom': 'felixstowe',
      'uk': 'felixstowe',
      'france': 'le havre',
      'spain': 'algeciras',
      'portugal': 'sines',
      'italy': 'genoa',
      'greece': 'piraeus',
      'malta': 'marsaxlokk',
      'sweden': 'gothenburg',
      'poland': 'gdansk',
      'russia': 'novorossiysk',
      'ukraine': 'odessa',
      'romania': 'constanta',
      'slovenia': 'koper',
      'croatia': 'rijeka',
      // Americas
      'united states': 'los angeles',
      'usa': 'los angeles',
      'canada': 'vancouver',
      'mexico': 'manzanillo',
      'brazil': 'santos',
      'argentina': 'buenos aires',
      'chile': 'valparaiso',
      'peru': 'callao',
      'colombia': 'cartagena',
      'ecuador': 'guayaquil',
      'venezuela': 'puerto cabello',
      'panama': 'colon',
      'jamaica': 'kingston',
      // Africa
      'south africa': 'durban',
      'egypt': 'port said',
      'nigeria': 'apapa',
      'ghana': 'tema',
      'kenya': 'mombasa',
      'tanzania': 'dar es salaam',
      'ethiopia': 'djibouti',
      'djibouti': 'djibouti',
      'morocco': 'tanger med',
      "ivory coast": 'abidjan',
      "cote d'ivoire": 'abidjan',
      'senegal': 'dakar',
      'angola': 'luanda',
      'cameroon': 'douala',
      'mozambique': 'maputo',
      // Oceania
      'australia': 'sydney',
      'new zealand': 'auckland',
      'fiji': 'suva',

      // ── ISO 2-letter country codes (very common in shipping datasets) ────
      'cn': 'shanghai',
      'hk': 'hong kong',
      'tw': 'kaohsiung',
      'jp': 'yokohama',
      'kr': 'busan',
      'kp': 'busan',  // North Korea — closest realistic port
      'sg': 'singapore port',
      'my': 'port klang',
      'id': 'tanjung priok',
      'th': 'laem chabang',
      'vn': 'ho chi minh city',
      'ph': 'manila',
      'mm': 'thilawa',
      'kh': 'sihanoukville',
      'in': 'nhava sheva',
      'pk': 'karachi',
      'bd': 'chittagong',
      'lk': 'colombo',
      'ae': 'jebel ali',
      'sa': 'jeddah',
      'om': 'sohar',
      'kw': 'shuwaikh',
      'bh': 'salmabad',
      'iq': 'umm qasr',
      'ir': 'bandar abbas',
      'jo': 'aqaba',
      'il': 'haifa',
      'tr': 'mersin',
      'nl': 'rotterdam',
      'be': 'antwerp',
      'de': 'hamburg',
      'gb': 'felixstowe',
      'fr': 'le havre',
      'es': 'algeciras',
      'pt': 'sines',
      'it': 'genoa',
      'gr': 'piraeus',
      'mt': 'marsaxlokk',
      'se': 'gothenburg',
      'pl': 'gdansk',
      'ru': 'novorossiysk',
      'ua': 'odessa',
      'ro': 'constanta',
      'si': 'koper',
      'hr': 'rijeka',
      'us': 'los angeles',
      'ca': 'vancouver',
      'mx': 'manzanillo',
      'br': 'santos',
      'ar': 'buenos aires',
      'cl': 'valparaiso',
      'pe': 'callao',
      'co': 'cartagena',
      'ec': 'guayaquil',
      've': 'puerto cabello',
      'pa': 'colon',
      'jm': 'kingston',
      'za': 'durban',
      'eg': 'port said',
      'ng': 'apapa',
      'gh': 'tema',
      'ke': 'mombasa',
      'tz': 'dar es salaam',
      'et': 'djibouti',
      'dj': 'djibouti',
      'ma': 'tanger med',
      'ci': 'abidjan',
      'sn': 'dakar',
      'ao': 'luanda',
      'cm': 'douala',
      'mz': 'maputo',
      'au': 'sydney',
      'nz': 'auckland',
      'fj': 'suva',
    };

    /**
     * Resolve coordinates for a location:
     *  1. Try the provided portName directly (specific port field from DB)
     *  2. Try mapping the country name to its primary port
     *  3. Fall back to stored coordinates (but skip if they look like a country centroid)
     *  4. Fall back to geocoding the country name
     */
    const resolveCoords = async (portName, countryName, storedCoords) => {
      // Helper: returns true for synthetic placeholders like PORT_10, DEST_5, LOC_XX
      const isPlaceholder = (name) =>
        !name || /^(port|dest|loc|city|hub|terminal)_?\d*$/i.test(name.trim());

      // 1. Specific real port name provided (e.g. "Jebel Ali", "Karachi")
      if (
        portName &&
        !isPlaceholder(portName) &&
        portName.toLowerCase() !== (countryName || '').toLowerCase()
      ) {
        const portCoords = await geocodeLocation(portName);
        if (portCoords) return portCoords;
      }

      // 2. Map country name / ISO code → primary real port
      const primaryPort = COUNTRY_TO_PRIMARY_PORT[(countryName || '').toLowerCase().trim()];
      if (primaryPort) {
        const portCoords = await geocodeLocation(primaryPort);
        if (portCoords) return portCoords;
      }

      // 3. Stored coordinates — only use if they don't look like a country centroid
      //    (i.e. not an integer lat/lng typical of centroids)
      if (storedCoords?.lat && !(Number.isInteger(storedCoords.lat) && Number.isInteger(storedCoords.lng))) {
        return storedCoords;
      }

      // 4. Geocode the raw country name as absolute last resort
      return geocodeLocation(countryName);
    };

    const [originCoords, destCoords] = await Promise.all([
      resolveCoords(null, container.origin_country, container.origin_coordinates),
      resolveCoords(container.destination_port, container.destination_country, container.destination_coordinates),
    ]);

    const status = (container.clearance_status || 'Pending').toLowerCase();
    let currentCoords, currentPort, currentCountry;

    if (status === 'cleared') {
      currentCoords = destCoords;
      currentPort = container.destination_port || container.destination_country;
      currentCountry = container.destination_country;
    } else if (status === 'transit') {
      if (originCoords && destCoords) {
        const midPath = await generateRoutePath(originCoords, destCoords, 2);
        currentCoords = { lat: midPath[1][0], lng: midPath[1][1] };
      } else {
        currentCoords = originCoords;
      }
      currentPort = 'In Transit';
      currentCountry = container.origin_country;
    } else {
      // Pending or unknown → origin
      currentCoords = originCoords;
      currentPort = container.origin_country;
      currentCountry = container.origin_country;
    }

    if (!currentCoords?.lat) {
      return res.status(422).json({ success: false, message: `Could not resolve location coordinates for '${id}'.` });
    }

    const route = originCoords && destCoords ? await generateRoutePath(originCoords, destCoords) : [];

    return res.status(200).json({
      success: true,
      data: {
        container_id: container.container_id,
        current_port: currentPort,
        country: currentCountry,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
        clearance_status: container.clearance_status,
        risk_level: container.risk_level,
        risk_score: container.risk_score,
        origin_country: container.origin_country,
        destination_country: container.destination_country,
        destination_port: container.destination_port,
        anomaly_flag: container.anomaly_flag,
        explanation: container.explanation,
        route,
        origin_coords: originCoords,
        dest_coords: destCoords,
      },
    });
  } catch (error) {
    logger.error(`Container location error for ${container_id}: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Country → primary port coordinates lookup (150+ countries)
// Used to resolve heat points for containers that lack geocoded coordinates.
// ─────────────────────────────────────────────────────────────────────────────
const COUNTRY_COORDS = {
  // ISO 2-letter codes used in the dataset
  // North America
  'US': { lat: 33.7367, lng: -118.2615 },
  'CA': { lat: 49.2827, lng: -123.1207 },
  'MX': { lat: 19.1663, lng: -96.1333 },
  'CU': { lat: 23.0000, lng: -82.3500 },
  'DO': { lat: 18.4706, lng: -69.9517 },

  // South & Central America
  'BR': { lat: -23.0000, lng: -43.1000 },
  'AR': { lat: -34.6037, lng: -58.3816 },
  'CL': { lat: -33.0472, lng: -71.6127 },
  'CO': { lat: 10.3997, lng: -75.5144 },
  'PE': { lat: -12.0432, lng: -77.1282 },
  'VE': { lat: 10.1833, lng: -64.6833 },
  'EC': { lat: -2.1962, lng: -79.9004 },
  'PA': { lat: 8.9940, lng: -79.5190 },

  // Europe
  'GB': { lat: 51.5000, lng: 0.1000 },
  'DE': { lat: 53.5753, lng: 9.9997 },
  'FR': { lat: 43.2965, lng: 5.3698 },
  'NL': { lat: 51.9496, lng: 4.1419 },
  'BE': { lat: 51.2194, lng: 4.4025 },
  'DK': { lat: 55.6761, lng: 12.5683 },
  'SE': { lat: 57.7089, lng: 11.9746 },
  'NO': { lat: 59.9139, lng: 10.7522 },
  'FI': { lat: 60.1699, lng: 24.9384 },
  'ES': { lat: 41.3888, lng: 2.1597 },
  'PT': { lat: 38.7167, lng: -9.1333 },
  'IT': { lat: 40.8518, lng: 14.2681 },
  'GR': { lat: 37.9432, lng: 23.6484 },
  'TR': { lat: 41.0082, lng: 28.9784 },
  'RU': { lat: 59.9343, lng: 30.3351 },
  'PL': { lat: 54.3520, lng: 18.6466 },
  'CH': { lat: 47.5596, lng: 7.5886 },
  'AT': { lat: 47.8095, lng: 13.0550 },
  'RO': { lat: 44.1598, lng: 28.6348 },

  // Asia
  'CN': { lat: 31.2304, lng: 121.4737 },
  'JP': { lat: 35.4437, lng: 139.6380 },
  'KR': { lat: 35.1796, lng: 129.0756 },
  'TW': { lat: 22.6273, lng: 120.3014 },
  'HK': { lat: 22.3193, lng: 114.1694 },
  'SG': { lat: 1.2966, lng: 103.7764 },
  'IN': { lat: 18.9388, lng: 72.8540 },
  'PK': { lat: 24.8607, lng: 67.0011 },
  'BD': { lat: 22.3569, lng: 91.7832 },
  'LK': { lat: 6.9271, lng: 79.8612 },
  'MY': { lat: 3.0000, lng: 101.4000 },
  'ID': { lat: -6.1017, lng: 106.8805 },
  'TH': { lat: 13.0880, lng: 100.8803 },
  'VN': { lat: 10.7769, lng: 106.7535 },
  'PH': { lat: 14.5995, lng: 120.9842 },
  'MM': { lat: 16.7027, lng: 96.2761 },
  'KH': { lat: 10.6094, lng: 103.5297 },

  // Middle East
  'AE': { lat: 25.0008, lng: 55.0880 },
  'SA': { lat: 21.4858, lng: 39.1925 },
  'QA': { lat: 25.2867, lng: 51.5333 },
  'OM': { lat: 24.3476, lng: 56.7440 },
  'KW': { lat: 29.3648, lng: 47.9261 },
  'BH': { lat: 26.1530, lng: 50.5000 },
  'IL': { lat: 32.7940, lng: 34.9896 },
  'LB': { lat: 33.8869, lng: 35.5131 },
  'IQ': { lat: 30.0298, lng: 47.9244 },
  'IR': { lat: 27.1865, lng: 56.2808 },

  // Africa
  'ZA': { lat: -33.9258, lng: 18.4232 },
  'EG': { lat: 31.2001, lng: 29.9187 },
  'MA': { lat: 35.7595, lng: -5.8340 },
  'DZ': { lat: 36.7753, lng: 3.0585 },
  'NG': { lat: 6.4541, lng: 3.3841 },
  'KE': { lat: -4.0625, lng: 39.6634 },
  'TZ': { lat: -6.8000, lng: 39.2667 },
  'UG': { lat: 0.0512, lng: 32.4637 }, // Kampala roughly
  'ET': { lat: 11.5649, lng: 43.1452 }, // Djibouti port mapping
  'GH': { lat: 5.5502, lng: -0.2174 },
  'CI': { lat: 5.2897, lng: -4.0083 },
  'SN': { lat: 14.6937, lng: -17.4441 },
  'AO': { lat: -8.8368, lng: 13.2343 },
  'MZ': { lat: -25.9665, lng: 32.5892 },
  'DJ': { lat: 11.5797, lng: 43.1453 },
  'SD': { lat: 19.6158, lng: 37.2164 },

  // Oceania
  'AU': { lat: -33.8688, lng: 151.2093 },
  'NZ': { lat: -36.8485, lng: 174.7633 },
  'FJ': { lat: -18.1416, lng: 178.4415 },
  'PG': { lat: -9.4438, lng: 147.1803 },
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/map/heatmap
// Returns lat/lng/intensity points for the risk heatmap layer.
// Covers ALL containers, resolving coordinates from country lookup when
// geocoded coordinates are not stored in the document.
// ─────────────────────────────────────────────────────────────────────────────
const getHeatmapData = async (req, res) => {
  try {
    let getCache, setCache;
    try { ({ getCache, setCache } = require('../config/redis')); } catch (_) { }

    const cacheKey = 'map:heatmap:v4';
    if (getCache) {
      const cached = await getCache(cacheKey);
      if (cached) return res.status(200).json({ success: true, data: cached, cached: true });
    }

    // Fetch ALL containers with risk data — we only need a subset of fields
    const containers = await Container.find(
      { risk_score: { $exists: true, $ne: null } },
      'risk_score risk_level origin_country destination_country origin_coordinates destination_coordinates clearance_status'
    ).lean();

    const intensityMap = { Critical: 1.0, 'Low Risk': 0.5, Clear: 0.15 };

    // Aggregate heat points by coordinate key to avoid duplicates at same location
    // key → { lat, lng, critical: 0, low: 0, clear: 0 }
    const bucket = new Map();

    const resolveCoords = (stored, country) => {
      if (stored?.lat && stored?.lng) return stored;
      return COUNTRY_COORDS[country] ?? null;
    };

    for (const c of containers) {
      const level = c.risk_level === 'Critical' ? 'critical' : c.risk_level === 'Low Risk' ? 'low' : 'clear';
      const status = (c.clearance_status || '').toLowerCase();

      // Ensure origin coords
      const originCoords = resolveCoords(c.origin_coordinates, c.origin_country);
      if (originCoords) {
        const key = `${c.origin_country}`;
        if (!bucket.has(key)) bucket.set(key, { lat: originCoords.lat, lng: originCoords.lng, critical: 0, low: 0, clear: 0 });
        bucket.get(key)[level] += 1;
      }

      // Ensure dest coords for cleared containers
      if (status === 'cleared') {
        const destCoords = resolveCoords(c.destination_coordinates, c.destination_country);
        if (destCoords) {
          const key = `dest_${c.destination_country}`;
          if (!bucket.has(key)) bucket.set(key, { lat: destCoords.lat, lng: destCoords.lng, critical: 0, low: 0, clear: 0 });
          bucket.get(key)[level] += 1;
        }
      }
    }

    // Build output array — determine intensity based on absolute volume of risk
    const points = [];
    for (const [, v] of bucket) {
      // 1+ critical shipments instantly bright red (1.0)
      // 5+ low risk hits yellow/orange (0.6)
      // Otherwise just clear/green (0.2)
      let intensity = 0;

      if (v.critical > 0) {
        // EVEN ONE critical shipment turns the region fully red
        intensity = 1.0;
      } else if (v.low > 0) {
        // 1 low risk -> 0.4, 5+ -> 0.6
        intensity = 0.4 + Math.min(v.low / 5, 1.0) * 0.2;
      } else {
        // Only clear shipments -> Green
        intensity = 0.2;
      }

      // Add significant jitter so identical coords don't perfectly stack
      // Stacking too tightly causes the leaflet.heat plugin to average them out or clip them.
      // 1.5 scatter degree is roughly ~100 miles, making a massive, highly visible red hotspot cloud.
      const scatter = () => (Math.random() - 0.5) * 1.5;

      // Emit 1 point for clear/low, but scatter up to 5 points for heavy critical to make the red dot wider and more opaque
      const copies = v.critical > 2 ? 5 : v.critical === 1 ? 3 : (v.low > 5) ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        points.push({ lat: v.lat + scatter(), lng: v.lng + scatter(), intensity });
      }
    }

    if (setCache) await setCache('map:heatmap:v6', points, 120);
    return res.status(200).json({ success: true, data: points, total_containers: containers.length });
  } catch (error) {
    logger.error(`Heatmap error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/container-analysis/:container_id
// Returns Explainable AI breakdown with full fallback computation from raw
// dataset fields (declared_weight, measured_weight, declared_value, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const getContainerAIAnalysis = async (req, res) => {
  const { container_id } = req.params;
  if (!container_id?.trim()) {
    return res.status(400).json({ success: false, message: 'container_id is required.' });
  }

  try {
    const container = await Container.findOne({ container_id: container_id.trim().toUpperCase() }).lean();
    if (!container) {
      return res.status(404).json({ success: false, message: `Container '${container_id}' not found.` });
    }

    const features = [];

    // ── Feature 1: Weight Discrepancy ──────────────────────────────────────────
    // Use stored engineered field if available, otherwise compute from raw values
    let weightMismatchPct = container.weight_mismatch_percentage;
    if (weightMismatchPct == null && container.declared_weight && container.measured_weight) {
      weightMismatchPct = Math.abs(container.declared_weight - container.measured_weight)
        / container.declared_weight * 100;
    }
    if (weightMismatchPct != null) {
      const raw = Math.abs(weightMismatchPct);
      const value = Math.min(raw / 60, 1); // 60% mismatch = max risk
      const label = raw < 5 ? 'within tolerance' : raw < 20 ? 'slightly elevated' : raw < 40 ? 'concerning' : 'critically high';
      features.push({
        name: 'Weight Discrepancy',
        value,
        detail: `${raw.toFixed(1)}% mismatch — declared ${container.declared_weight ?? '?'} kg vs measured ${container.measured_weight ?? '?'} kg (${label})`,
        icon: '⚖️',
        category: 'physical',
      });
    }

    // ── Feature 2: Value / Weight Ratio ───────────────────────────────────────
    let ratio = container.value_to_weight_ratio;
    if (ratio == null && container.declared_value && container.declared_weight) {
      ratio = container.declared_value / container.declared_weight;
    }
    if (ratio != null && ratio > 0) {
      const benchmark = 50; // USD/kg
      const value = Math.min(ratio / (benchmark * 5), 1);
      const label = ratio < benchmark ? 'normal' : ratio < benchmark * 2 ? 'above average' : ratio < benchmark * 4 ? 'high — possible undervaluation' : 'critically high';
      features.push({
        name: 'Value / Weight Ratio',
        value,
        detail: `$${ratio.toFixed(2)}/kg — ${label}. Benchmark is ~$${benchmark}/kg`,
        icon: '💰',
        category: 'financial',
      });
    }

    // ── Feature 3: Dwell Time ─────────────────────────────────────────────────
    if (container.dwell_time_hours != null) {
      const dwell = container.dwell_time_hours;
      const value = Math.min(dwell / 168, 1); // 168h = 7 days = max
      const label = dwell < 24 ? 'normal' : dwell < 48 ? 'slightly extended' : dwell < 96 ? 'extended — review needed' : 'abnormally long — high risk';
      features.push({
        name: 'Dwell Time',
        value,
        detail: `${dwell.toFixed(1)} hours at port — ${label}`,
        icon: '⏱️',
        category: 'time',
      });
    }

    // ── Feature 4: Trade Route Risk ────────────────────────────────────────────
    // Use stored value OR compute a rough proxy from known high-risk corridors
    let routeRisk = container.trade_route_risk;
    if (routeRisk == null) {
      const HIGH_RISK_ORIGINS = ['Afghanistan', 'Somalia', 'Syria', 'Libya', 'North Korea', 'Iran', 'Venezuela', 'Myanmar', 'Iraq', 'Sudan'];
      const MOD_RISK_ORIGINS = ['Pakistan', 'Nigeria', 'Yemen', 'Ethiopia', 'Bangladesh', 'Cambodia', 'Laos'];
      if (HIGH_RISK_ORIGINS.includes(container.origin_country)) routeRisk = 0.85;
      else if (MOD_RISK_ORIGINS.includes(container.origin_country)) routeRisk = 0.5;
      else routeRisk = 0.2;
    }
    features.push({
      name: 'Trade Route Risk',
      value: Math.min(routeRisk, 1),
      detail: `${container.origin_country} → ${container.destination_country || container.destination_port} — route classified as ${routeRisk > 0.7 ? '🔴 high risk' : routeRisk > 0.4 ? '🟡 moderate risk' : '🟢 low risk'}`,
      icon: '🗺️',
      category: 'route',
    });

    // ── Feature 5: Importer History ────────────────────────────────────────────
    let importerFreq = container.importer_frequency;
    if (importerFreq != null) {
      const value = Math.max(0, 1 - importerFreq / 80);
      const label = importerFreq < 3 ? 'first-time / very low activity' : importerFreq < 15 ? 'limited history' : importerFreq < 50 ? 'moderate history' : 'established importer';
      features.push({
        name: 'Importer History',
        value,
        detail: `Importer ${container.importer_id || 'Unknown'} — ${importerFreq} prior shipments (${label})`,
        icon: '🏢',
        category: 'entity',
      });
    }

    // ── Feature 6: Declared Value Flag ─────────────────────────────────────────
    if (container.declared_value != null) {
      const HIGH_VALUE_THRESHOLD = 500000;
      const LOW_VALUE_THRESHOLD = 100;
      let valueFlag = 0;
      let valueFlagDetail = '';
      if (container.declared_value > HIGH_VALUE_THRESHOLD) {
        valueFlag = Math.min((container.declared_value - HIGH_VALUE_THRESHOLD) / 500000, 1);
        valueFlagDetail = `$${container.declared_value.toLocaleString()} — very high declared value, warrants verification`;
      } else if (container.declared_value < LOW_VALUE_THRESHOLD) {
        valueFlag = 0.8;
        valueFlagDetail = `$${container.declared_value.toLocaleString()} — suspiciously low value for a shipment`;
      } else {
        valueFlag = 0.05;
        valueFlagDetail = `$${container.declared_value.toLocaleString()} — within normal range`;
      }
      features.push({
        name: 'Declared Value',
        value: valueFlag,
        detail: valueFlagDetail,
        icon: '🏷️',
        category: 'financial',
      });
    }

    // ── Feature 7: Anomaly Score ───────────────────────────────────────────────
    if (container.anomaly_flag || container.anomaly_score != null) {
      const value = container.anomaly_score != null ? Math.min(container.anomaly_score, 1) : 0.85;
      features.push({
        name: 'ML Anomaly Score',
        value,
        detail: `Statistical anomaly detector score: ${(value * 100).toFixed(0)}% — ${value > 0.7 ? 'flagged as highly anomalous' : value > 0.4 ? 'moderately unusual pattern' : 'within normal distribution'}`,
        icon: '🚨',
        category: 'ml',
      });
    }

    // Sort by contribution descending
    features.sort((a, b) => b.value - a.value);

    // ── Build explanation bullets ──────────────────────────────────────────────
    let explanationBullets = [];
    if (container.explanation) {
      explanationBullets = container.explanation.split(/[.;]/).filter(Boolean).map(s => s.trim()).filter(s => s.length > 5);
    } else if (Array.isArray(container.risk_explanation) && container.risk_explanation.length) {
      explanationBullets = container.risk_explanation;
    } else {
      // Auto-generate bullets from top features
      explanationBullets = features.slice(0, 4).map(f => `${f.icon} ${f.name}: ${f.detail}`);
    }

    // ── Model confidence proxy (based on how many features have data) ──────────
    const modelConfidence = Math.min(features.length / 6, 1);

    return res.status(200).json({
      success: true,
      data: {
        container_id: container.container_id,
        risk_score: container.risk_score,
        risk_level: container.risk_level,
        anomaly_flag: container.anomaly_flag ?? false,
        model_confidence: parseFloat(modelConfidence.toFixed(2)),
        features,
        explanation: container.explanation,
        explanation_bullets: explanationBullets,
        raw: {
          origin_country: container.origin_country,
          destination_country: container.destination_country,
          destination_port: container.destination_port,
          declared_value: container.declared_value,
          declared_weight: container.declared_weight,
          measured_weight: container.measured_weight,
          dwell_time_hours: container.dwell_time_hours,
          clearance_status: container.clearance_status,
          importer_id: container.importer_id,
          exporter_id: container.exporter_id,
          hs_code: container.hs_code,
          shipping_line: container.shipping_line,
        },
      },
    });
  } catch (error) {
    logger.error(`AI analysis error for ${container_id}: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/container-timeline/:container_id
// Returns ordered shipment events for the timeline panel.
// ─────────────────────────────────────────────────────────────────────────────
const getContainerTimeline = async (req, res) => {
  const { container_id } = req.params;
  if (!container_id?.trim()) {
    return res.status(400).json({ success: false, message: 'container_id is required.' });
  }

  try {
    const container = await Container.findOne({ container_id: container_id.trim().toUpperCase() }).lean();
    if (!container) {
      return res.status(404).json({ success: false, message: `Container '${container_id}' not found.` });
    }

    const decl = container.declaration_date ? new Date(container.declaration_date) : null;
    const status = (container.clearance_status || 'Pending').toLowerCase();

    // Generate plausible event timeline from dataset fields
    const events = [];

    // Event 1 — Declaration / Created
    events.push({
      id: 'created',
      icon: '📦',
      label: 'Shipment Declared',
      location: container.origin_country,
      date: decl ? decl.toISOString() : null,
      status: 'completed',
      detail: `Container ${container.container_id} declared at ${container.origin_country}. Value: $${(container.declared_value ?? 0).toLocaleString()}`,
    });

    // Event 2 — Departed (declaration + 1 day)
    if (decl) {
      const departed = new Date(decl);
      departed.setDate(departed.getDate() + 1);
      events.push({
        id: 'departed',
        icon: '🚢',
        label: 'Departed Port',
        location: container.origin_country,
        date: departed.toISOString(),
        status: 'completed',
        detail: `Vessel departed from ${container.origin_country}. Weight loaded: ${container.declared_weight ?? '?'} kg`,
      });
    }

    // Event 3 — In Transit (only if not still at origin)
    const inTransit = status === 'transit' || status === 'cleared';
    if (decl && inTransit) {
      const transitDate = new Date(decl);
      const dwellDays = Math.round((container.dwell_time_hours ?? 72) / 24);
      transitDate.setDate(transitDate.getDate() + 2 + Math.floor(dwellDays / 3));
      events.push({
        id: 'transit',
        icon: '🌍',
        label: 'In Transit',
        location: 'Open Sea',
        date: transitDate.toISOString(),
        status: status === 'transit' ? 'active' : 'completed',
        detail: `En route from ${container.origin_country} to ${container.destination_country}. Estimated transit time: ${dwellDays} days`,
      });
    }

    // Event 4 — Arrived (only if Cleared or transitioning)
    if (decl && status === 'cleared') {
      const arrivedDate = new Date(decl);
      arrivedDate.setDate(arrivedDate.getDate() + Math.round((container.dwell_time_hours ?? 120) / 24));
      events.push({
        id: 'arrived',
        icon: '⚓',
        label: 'Arrived at Destination',
        location: container.destination_port || container.destination_country,
        date: arrivedDate.toISOString(),
        status: 'completed',
        detail: `Arrived at ${container.destination_port || container.destination_country}. Measured weight: ${container.measured_weight ?? '?'} kg`,
      });

      // Event 5 — Customs cleared
      const clearedDate = new Date(arrivedDate);
      clearedDate.setDate(clearedDate.getDate() + 1);
      events.push({
        id: 'cleared',
        icon: '✅',
        label: 'Customs Cleared',
        location: container.destination_country,
        date: clearedDate.toISOString(),
        status: 'completed',
        detail: `Customs clearance completed. Final risk assessment: ${container.risk_level}`,
      });
    }

    // If Pending — add a pending customs event
    if (status === 'pending') {
      events.push({
        id: 'pending',
        icon: '⏳',
        label: 'Awaiting Customs',
        location: container.origin_country,
        date: null,
        status: 'active',
        detail: `Shipment awaiting customs processing. Risk level: ${container.risk_level}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        container_id: container.container_id,
        origin: container.origin_country,
        destination: container.destination_port || container.destination_country,
        clearance_status: container.clearance_status,
        risk_level: container.risk_level,
        events,
      },
    });
  } catch (error) {
    logger.error(`Timeline error for ${container_id}: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getContainerRouteHandler,
  getAllRoutes,
  backfillGeo,
  getContainerLocation,
  getHeatmapData,
  getContainerAIAnalysis,
  getContainerTimeline,
};
