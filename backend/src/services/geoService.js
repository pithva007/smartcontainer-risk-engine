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
const { findMaritimeRoute } = require('./maritimeRoutingService');

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
  // ── East Asia ────────────────────────────────────────────────────────────
  'china': { lat: 31.2304, lng: 121.4737 }, // Shanghai (Coastal)
  'mainland china': { lat: 31.2304, lng: 121.4737 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'hksar': { lat: 22.3193, lng: 114.1694 },
  'taiwan': { lat: 23.6978, lng: 120.9605 },
  'japan': { lat: 35.4437, lng: 139.6380 }, // Yokohama (Coastal)
  'south korea': { lat: 35.1796, lng: 129.0756 }, // Busan (Coastal)
  'korea': { lat: 35.9078, lng: 127.7669 },
  'north korea': { lat: 40.3399, lng: 127.5101 },
  'mongolia': { lat: 46.8625, lng: 103.8467 },

  // Chinese ports
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'shenzhen': { lat: 22.5431, lng: 114.0579 },
  'guangzhou': { lat: 23.1291, lng: 113.2644 },
  'ningbo': { lat: 29.8683, lng: 121.5440 },
  'ningbo-zhoushan': { lat: 29.9590, lng: 121.8070 },
  'qingdao': { lat: 36.0671, lng: 120.3826 },
  'tianjin': { lat: 39.3434, lng: 117.3616 },
  'dalian': { lat: 38.9140, lng: 121.6147 },
  'xiamen': { lat: 24.4798, lng: 118.0894 },
  'suzhou': { lat: 31.2989, lng: 120.5853 },
  'nanjing': { lat: 32.0603, lng: 118.7969 },
  'wuhan': { lat: 30.5928, lng: 114.3055 },
  'chongqing': { lat: 29.5630, lng: 106.5516 },
  'guangzhou nansha': { lat: 22.7874, lng: 113.5244 },
  'yantian': { lat: 22.5665, lng: 114.2817 },
  'shekou': { lat: 22.4844, lng: 113.9063 },
  'chiwan': { lat: 22.4748, lng: 113.8826 },

  // Korean ports
  'busan': { lat: 35.1796, lng: 129.0756 },
  'incheon': { lat: 37.4563, lng: 126.7052 },
  'gwangyang': { lat: 34.9242, lng: 127.6933 },
  'ulsan': { lat: 35.5384, lng: 129.3114 },

  // Japanese ports
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'yokohama': { lat: 35.4437, lng: 139.6380 },
  'nagoya': { lat: 35.1815, lng: 136.9066 },
  'osaka': { lat: 34.6937, lng: 135.5023 },
  'kobe': { lat: 34.6901, lng: 135.1956 },
  'kyushu': { lat: 33.0000, lng: 131.0000 },

  // ── Southeast Asia ───────────────────────────────────────────────────────
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'singapore port': { lat: 1.2966, lng: 103.7764 },
  'psa singapore': { lat: 1.2966, lng: 103.7764 },
  'malaysia': { lat: 4.2105, lng: 101.9758 },
  'port klang': { lat: 3.0000, lng: 101.4000 },
  'klang': { lat: 3.0000, lng: 101.4000 },
  'tanjung pelepas': { lat: 1.3631, lng: 103.5494 },
  'penang': { lat: 5.4141, lng: 100.3288 },
  'johor bahru': { lat: 1.4927, lng: 103.7414 },
  'indonesia': { lat: -0.7893, lng: 113.9213 },
  'jakarta': { lat: -6.2088, lng: 106.8456 },
  'tanjung priok': { lat: -6.1017, lng: 106.8805 },
  'surabaya': { lat: -7.2575, lng: 112.7521 },
  'belawan': { lat: 3.7894, lng: 98.6824 },
  'thailand': { lat: 15.8700, lng: 100.9925 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'laem chabang': { lat: 13.0880, lng: 100.8803 },
  'vietnam': { lat: 14.0583, lng: 108.2772 },
  'ho chi minh city': { lat: 10.8231, lng: 106.6297 },
  'ho chi minh': { lat: 10.8231, lng: 106.6297 },
  'hanoi': { lat: 21.0278, lng: 105.8342 },
  'haiphong': { lat: 20.8449, lng: 106.6881 },
  'cat lai': { lat: 10.7769, lng: 106.7535 },
  'philippines': { lat: 12.8797, lng: 121.7740 },
  'manila': { lat: 14.5995, lng: 120.9842 },
  'subic bay': { lat: 14.8002, lng: 120.2716 },
  'myanmar': { lat: 19.1633, lng: 96.0785 },
  'thilawa': { lat: 16.7027, lng: 96.2761 },
  'cambodia': { lat: 12.5657, lng: 104.9910 },
  'sihanoukville': { lat: 10.6094, lng: 103.5297 },

  // ── South Asia ───────────────────────────────────────────────────────────
  'india': { lat: 18.9488, lng: 72.9540 }, // Nhava Sheva (Coastal)
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'nhava sheva': { lat: 18.9488, lng: 72.9540 },
  'jawaharlal nehru port': { lat: 18.9488, lng: 72.9540 },
  'jnpt': { lat: 18.9488, lng: 72.9540 },
  'chennai': { lat: 13.0827, lng: 80.2707 },
  'kolkata': { lat: 22.5726, lng: 88.3639 },
  'haldia': { lat: 22.0667, lng: 88.0833 },
  'vizag': { lat: 17.6868, lng: 83.2185 },
  'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
  'cochin': { lat: 9.9312, lng: 76.2673 },
  'kochi': { lat: 9.9312, lng: 76.2673 },
  'mundra': { lat: 22.7500, lng: 69.7000 },
  'kandla': { lat: 23.0333, lng: 70.2167 },
  'new mangalore': { lat: 12.8667, lng: 74.8500 },
  'sri lanka': { lat: 7.8731, lng: 80.7718 },
  'colombo': { lat: 6.9271, lng: 79.8612 },
  'pakistan': { lat: 30.3753, lng: 69.3451 },
  'karachi': { lat: 24.8607, lng: 67.0011 },
  'port qasim': { lat: 24.7700, lng: 67.3200 },
  'bangladesh': { lat: 23.6850, lng: 90.3563 },
  'chittagong': { lat: 22.3569, lng: 91.7832 },
  'dhaka': { lat: 23.8103, lng: 90.4125 },

  // ── Middle East ───────────────────────────────────────────────────────────
  'uae': { lat: 23.4241, lng: 53.8478 },
  'united arab emirates': { lat: 23.4241, lng: 53.8478 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'jebel ali': { lat: 25.0008, lng: 55.0880 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'khalifa port': { lat: 24.8051, lng: 54.6463 },
  'sharjah': { lat: 25.3463, lng: 55.4209 },
  'oman': { lat: 21.4735, lng: 55.9754 },
  'muscat': { lat: 23.5880, lng: 58.3829 },
  'sohar': { lat: 24.3476, lng: 56.7440 },
  'bahrain': { lat: 26.0667, lng: 50.5577 },
  'salmabad': { lat: 26.1530, lng: 50.5000 },
  'kuwait': { lat: 29.3117, lng: 47.4818 },
  'shuwaikh': { lat: 29.3648, lng: 47.9261 },
  'saudi arabia': { lat: 23.8859, lng: 45.0792 },
  'jeddah': { lat: 21.4858, lng: 39.1925 },
  'dammam': { lat: 26.4207, lng: 50.0888 },
  'yanbu': { lat: 24.0895, lng: 38.0618 },
  'jordan': { lat: 30.5852, lng: 36.2384 },
  'aqaba': { lat: 29.5266, lng: 35.0061 },
  'iraq': { lat: 33.2232, lng: 43.6793 },
  'umm qasr': { lat: 30.0298, lng: 47.9244 },
  'iran': { lat: 32.4279, lng: 53.6880 },
  'bandar abbas': { lat: 27.1865, lng: 56.2808 },
  'bushehr': { lat: 28.9234, lng: 50.8203 },
  'turkey': { lat: 38.9637, lng: 35.2433 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'izmir': { lat: 38.4192, lng: 27.1287 },
  'mersin': { lat: 36.7892, lng: 34.6218 },
  'israel': { lat: 31.0461, lng: 34.8516 },
  'haifa': { lat: 32.7940, lng: 34.9896 },
  'ashdod': { lat: 31.7940, lng: 34.7016 },

  // ── Europe ────────────────────────────────────────────────────────────────
  'netherlands': { lat: 51.9244, lng: 4.4777 }, // Rotterdam
  'rotterdam': { lat: 51.9244, lng: 4.4777 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'germany': { lat: 53.5753, lng: 9.8689 }, // Hamburg
  'hamburg': { lat: 53.5753, lng: 9.8689 },
  'bremerhaven': { lat: 53.5396, lng: 8.5809 },
  'bremen': { lat: 53.0793, lng: 8.8017 },
  'belgium': { lat: 50.5039, lng: 4.4699 },
  'antwerp': { lat: 51.2194, lng: 4.4025 },
  'zeebrugge': { lat: 51.3394, lng: 3.1977 },
  'united kingdom': { lat: 55.3781, lng: -3.4360 },
  'uk': { lat: 55.3781, lng: -3.4360 },
  'london': { lat: 51.5072, lng: -0.1276 },
  'felixstowe': { lat: 51.9625, lng: 1.3514 },
  'southampton': { lat: 50.9097, lng: -1.4044 },
  'liverpool': { lat: 53.4084, lng: -2.9916 },
  'grimsby': { lat: 53.5667, lng: -0.0708 },
  'france': { lat: 49.4938, lng: 0.1078 }, // Le Havre
  'le havre': { lat: 49.4938, lng: 0.1078 },
  'marseille': { lat: 43.2965, lng: 5.3698 },
  'dunkirk': { lat: 51.0318, lng: 2.3774 },
  'spain': { lat: 36.1408, lng: -5.4548 }, // Algeciras
  'algeciras': { lat: 36.1408, lng: -5.4548 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'valencia': { lat: 39.4699, lng: -0.3763 },
  'bilbao': { lat: 43.2627, lng: -2.9253 },
  'portugal': { lat: 38.7223, lng: -9.1393 }, // Lisbon
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'sines': { lat: 37.9576, lng: -8.8670 },
  'leixoes': { lat: 41.1963, lng: -8.7016 },
  'italy': { lat: 44.4056, lng: 8.9463 }, // Genoa
  'genoa': { lat: 44.4056, lng: 8.9463 },
  'la spezia': { lat: 44.1024, lng: 9.8237 },
  'gioia tauro': { lat: 38.4267, lng: 15.9014 },
  'venice': { lat: 45.4408, lng: 12.3155 },
  'naples': { lat: 40.8518, lng: 14.2681 },
  'greece': { lat: 39.0742, lng: 21.8243 },
  'piraeus': { lat: 37.9476, lng: 23.6348 },
  'thessaloniki': { lat: 40.6401, lng: 22.9444 },
  'malta': { lat: 35.9375, lng: 14.3754 },
  'marsaxlokk': { lat: 35.8490, lng: 14.5443 },
  'sweden': { lat: 57.7089, lng: 11.9746 }, // Gothenburg
  'gothenburg': { lat: 57.7089, lng: 11.9746 },
  'denmark': { lat: 55.6761, lng: 12.5683 }, // Copenhagen
  'copenhagen': { lat: 55.6761, lng: 12.5683 },
  'norway': { lat: 59.9139, lng: 10.7522 }, // Oslo
  'oslo': { lat: 59.9139, lng: 10.7522 },
  'finland': { lat: 60.1699, lng: 24.9384 }, // Helsinki
  'helsinki': { lat: 60.1699, lng: 24.9384 },
  'poland': { lat: 51.9194, lng: 19.1451 },
  'gdansk': { lat: 54.3520, lng: 18.6466 },
  'russia': { lat: 59.9311, lng: 30.3609 }, // St. Petersburg
  'st. petersburg': { lat: 59.9311, lng: 30.3609 },
  'saint petersburg': { lat: 59.9311, lng: 30.3609 },
  'vladivostok': { lat: 43.1332, lng: 131.9113 },
  'novorossiysk': { lat: 44.7230, lng: 37.7687 },
  'ukraine': { lat: 48.3794, lng: 31.1656 },
  'odessa': { lat: 46.4825, lng: 30.7233 },
  'croatia': { lat: 45.1000, lng: 15.2000 },
  'rijeka': { lat: 45.3271, lng: 14.4422 },
  'slovenia': { lat: 46.1512, lng: 14.9955 },
  'koper': { lat: 45.5469, lng: 13.7300 },
  'romania': { lat: 45.9432, lng: 24.9668 },
  'constanta': { lat: 44.1598, lng: 28.6348 },
  'bulgaria': { lat: 42.7339, lng: 25.4858 },
  'varna': { lat: 43.2141, lng: 27.9147 },

  // ── Americas ──────────────────────────────────────────────────────────────
  'united states': { lat: 37.0902, lng: -95.7129 },
  'usa': { lat: 37.0902, lng: -95.7129 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'new york / new jersey': { lat: 40.6640, lng: -74.2130 },
  'los angeles': { lat: 33.7490, lng: -118.2615 },
  'long beach': { lat: 33.7701, lng: -118.1937 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'savannah': { lat: 32.0835, lng: -81.0998 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'tacoma': { lat: 47.2529, lng: -122.4443 },
  'norfolk': { lat: 36.8508, lng: -76.2859 },
  'baltimore': { lat: 39.2904, lng: -76.6122 },
  'charleston': { lat: 32.7765, lng: -79.9311 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'port everglades': { lat: 26.0838, lng: -80.1197 },
  'new orleans': { lat: 29.9511, lng: -90.0715 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'oakland': { lat: 37.8044, lng: -122.2712 },
  'canada': { lat: 56.1304, lng: -106.3468 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'halifax': { lat: 44.6488, lng: -63.5752 },
  'prince rupert': { lat: 54.3150, lng: -130.3208 },
  'mexico': { lat: 23.6345, lng: -102.5528 },
  'manzanillo': { lat: 19.0524, lng: -104.3187 },
  'veracruz': { lat: 19.1738, lng: -96.1342 },
  'altamira': { lat: 22.4025, lng: -97.9147 },
  'brazil': { lat: -23.9608, lng: -46.3334 }, // Santos
  'santos': { lat: -23.9608, lng: -46.3334 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'paranagua': { lat: -25.5127, lng: -48.5089 },
  'itajai': { lat: -26.9101, lng: -48.6614 },
  'fortaleza': { lat: -3.7172, lng: -38.5433 },
  'argentina': { lat: -38.4161, lng: -63.6167 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
  'chile': { lat: -35.6751, lng: -71.5430 },
  'valparaiso': { lat: -33.0472, lng: -71.6127 },
  'san antonio': { lat: -33.5928, lng: -71.6173 },
  'colombia': { lat: 4.5709, lng: -74.2973 },
  'cartagena': { lat: 10.3910, lng: -75.4794 },
  'buenaventura': { lat: 3.8833, lng: -77.0433 },
  'peru': { lat: -9.1900, lng: -75.0152 },
  'callao': { lat: -12.0566, lng: -77.1182 },
  'panama': { lat: 8.5380, lng: -80.7821 },
  'colon': { lat: 9.3547, lng: -79.9003 },
  'balboa': { lat: 8.9508, lng: -79.5663 },
  'manzanillo panama': { lat: 9.3800, lng: -79.8750 },
  'costa rica': { lat: 9.7489, lng: -83.7534 },
  'limon': { lat: 9.9901, lng: -83.0355 },
  'ecuador': { lat: -1.8312, lng: -78.1834 },
  'guayaquil': { lat: -2.1894, lng: -79.8891 },
  'venezuela': { lat: 6.4238, lng: -66.5897 },
  'puerto cabello': { lat: 10.4758, lng: -68.0137 },
  'dominican republic': { lat: 18.7357, lng: -70.1627 },
  'santo domingo': { lat: 18.4861, lng: -69.9312 },
  'jamaica': { lat: 18.1096, lng: -77.2975 },
  'kingston': { lat: 17.9714, lng: -76.7920 },

  // ── Africa ────────────────────────────────────────────────────────────────
  'south africa': { lat: -29.8587, lng: 31.0218 }, // Durban
  'durban': { lat: -29.8587, lng: 31.0218 },
  'cape town': { lat: -33.9249, lng: 18.4241 },
  'port elizabeth': { lat: -33.9608, lng: 25.6022 },
  'egypt': { lat: 26.0975, lng: 31.2357 },
  'port said': { lat: 31.2565, lng: 32.2844 },
  'alexandria': { lat: 31.2001, lng: 29.9187 },
  'nigeria': { lat: 9.0820, lng: 8.6753 },
  'lagos': { lat: 6.5244, lng: 3.3792 },
  'apapa': { lat: 6.4500, lng: 3.3500 },
  'tin can island': { lat: 6.4421, lng: 3.3278 },
  'morocco': { lat: 31.7917, lng: -7.0926 },
  'tanger med': { lat: 35.8811, lng: -5.5038 },
  'casablanca': { lat: 33.5731, lng: -7.5898 },
  'ghana': { lat: 7.9465, lng: -1.0232 },
  'tema': { lat: 5.6345, lng: -0.0000 },
  'kenya': { lat: -0.0236, lng: 37.9062 },
  'mombasa': { lat: -4.0435, lng: 39.6682 },
  'tanzania': { lat: -6.3690, lng: 34.8888 },
  'dar es salaam': { lat: -6.7924, lng: 39.2083 },
  'djibouti': { lat: 11.8251, lng: 42.5903 },
  'senegal': { lat: 14.4974, lng: -14.4524 },
  'dakar': { lat: 14.7167, lng: -17.4677 },
  'ivory coast': { lat: 7.5400, lng: -5.5471 },
  "cote d'ivoire": { lat: 7.5400, lng: -5.5471 },
  'abidjan': { lat: 5.3600, lng: -4.0083 },
  'mozambique': { lat: -18.6657, lng: 35.5296 },
  'maputo': { lat: -25.9692, lng: 32.5732 },
  'ethiopia': { lat: 9.1450, lng: 40.4897 },
  'somalia': { lat: 2.0469, lng: 45.3418 },
  'berbera': { lat: 10.4397, lng: 45.0141 },
  'angola': { lat: -11.2027, lng: 17.8739 },
  'luanda': { lat: -8.8368, lng: 13.2343 },
  'cameroon': { lat: 3.8480, lng: 11.5021 },
  'douala': { lat: 4.0511, lng: 9.7679 },
  'madagascar': { lat: -18.7669, lng: 46.8691 },
  'tamatave': { lat: -18.1520, lng: 49.3810 },

  // ── Oceania ───────────────────────────────────────────────────────────────
  'australia': { lat: -25.2744, lng: 133.7751 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'brisbane': { lat: -27.4698, lng: 153.0251 },
  'fremantle': { lat: -32.0569, lng: 115.7440 },
  'adelaide': { lat: -34.9285, lng: 138.6007 },
  'perth': { lat: -31.9505, lng: 115.8605 },
  'new zealand': { lat: -40.9006, lng: 174.8860 },
  'auckland': { lat: -36.8485, lng: 174.7633 },
  'tauranga': { lat: -37.6870, lng: 176.1654 },
  'papua new guinea': { lat: -6.3150, lng: 143.9555 },
  'port moresby': { lat: -9.4438, lng: 147.1803 },
  'fiji': { lat: -17.7134, lng: 178.0650 },
  'suva': { lat: -18.1416, lng: 178.4415 },

  // ── Central Asia & Caucasus ───────────────────────────────────────────────
  'kazakhstan': { lat: 48.0196, lng: 66.9237 },
  'aktau': { lat: 43.6508, lng: 51.1985 },
  'georgia': { lat: 42.3154, lng: 43.3569 },
  'poti': { lat: 42.1500, lng: 41.6833 },
  'batumi': { lat: 41.6168, lng: 41.6367 },
  'azerbaijan': { lat: 40.1431, lng: 47.5769 },
  'baku': { lat: 40.4093, lng: 49.8671 },

  // ── Misc commonly used shipping terms ────────────────────────────────────
  'transshipment hub': { lat: 1.3521, lng: 103.8198 },
  'unknown': { lat: 0, lng: 0 },
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
 * Now uses the Maritime Routing Service for sea-aware paths,
 * falling back to great-circle approximation if the graph fails.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @param {number} steps - (Used only for linear fallback)
 * @returns {Promise<Array<[number, number]>>}
 */
const generateRoutePath = async (origin, destination, steps = 10) => {
  // Simple linear interpolation from port to port as requested
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

  const route = await generateRoutePath(originCoords, destCoords);

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
          update.route_path = await generateRoutePath(originCoords, destCoords);
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
