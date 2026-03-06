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
        const midPath = generateRoutePath(originCoords, destCoords, 2);
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

    const route = originCoords && destCoords ? generateRoutePath(originCoords, destCoords) : [];

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

module.exports = { getContainerRouteHandler, getAllRoutes, backfillGeo, getContainerLocation };
