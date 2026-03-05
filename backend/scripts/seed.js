/**
 * Seed script — populates local MongoDB with realistic dummy data
 * for SmartContainer Risk Engine v2.
 * Run: node scripts/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartcontainer_db';

// ── Mini-schemas (avoids loading all app models) ─────────────────────────────
const ContainerSchema = new mongoose.Schema({}, { strict: false });
const ShipmentTrackSchema = new mongoose.Schema({}, { strict: false });
const UserSchema = new mongoose.Schema({}, { strict: false });
const BatchSchema = new mongoose.Schema({}, { strict: false });

const Container = mongoose.model('Container', ContainerSchema, 'containers');
const ShipmentTrack = mongoose.model('ShipmentTrack', ShipmentTrackSchema, 'shipmenttracks');
const User = mongoose.model('User', UserSchema, 'users');
const Batch = mongoose.model('Batch', BatchSchema, 'batches');

// ── Data helpers ──────────────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isoDate = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

const countries = ['China', 'India', 'United Arab Emirates', 'United States', 'Germany', 'Japan', 'Brazil', 'Malaysia', 'Singapore', 'United Kingdom'];
const ports = ['Shanghai', 'Mumbai', 'Dubai', 'Los Angeles', 'Hamburg', 'Tokyo', 'Santos', 'Klang', 'Singapore', 'Felixstowe'];
const hsCodes = ['8471.30', '6203.42', '9401.61', '8516.60', '2709.00', '3004.90', '7208.51', '6110.20', '8544.42', '2710.19'];
const importers = ['IMP001', 'IMP002', 'IMP003', 'IMP004', 'IMP005', 'IMP006', 'IMP007', 'IMP008'];
const exporters = ['EXP001', 'EXP002', 'EXP003', 'EXP004', 'EXP005', 'EXP006', 'EXP007', 'EXP008'];
const shippingLines = ['COSCO', 'Maersk', 'MSC', 'CMA CGM', 'Evergreen', 'Hapag-Lloyd', 'ONE', 'Yang Ming'];
const clearanceStatuses = ['Cleared', 'Pending', 'Hold', 'Flagged'];
const tradeRegimes = ['Import', 'Export', 'Transit', 'Re-Export'];

const COUNTRY_COORDS = {
  'China': [31.23, 121.47], 'India': [19.08, 72.88], 'United Arab Emirates': [25.20, 55.27],
  'United States': [33.75, -118.27], 'Germany': [53.55, 9.99], 'Japan': [35.45, 139.64],
  'Brazil': [-23.56, -46.63], 'Malaysia': [3.14, 101.69], 'Singapore': [1.35, 103.82],
  'United Kingdom': [51.51, -0.13],
};

function makeContainer(idx) {
  const risk_score = parseFloat(rand(0.05, 0.99).toFixed(4));
  const risk_level = risk_score > 0.7 ? 'Critical' : risk_score > 0.4 ? 'Low Risk' : 'Clear';
  const origin = pick(countries);
  const destination = pick(countries.filter(c => c !== origin));
  const declared_value = parseFloat(rand(500, 200000).toFixed(2));
  const declared_weight = parseFloat(rand(100, 25000).toFixed(2));
  const weight_deviation = parseFloat(rand(-0.3, 0.3).toFixed(4));
  const measured_weight = parseFloat((declared_weight * (1 + weight_deviation)).toFixed(2));
  const daysAgo = Math.floor(rand(0, 60));

  const anomaly_flags = [];
  if (Math.abs(weight_deviation) > 0.15) anomaly_flags.push('weight_discrepancy');
  if (declared_value > 100000) anomaly_flags.push('high_value');
  if (risk_score > 0.7) anomaly_flags.push('behavior');

  return {
    container_id: `C${String(10000 + idx).padStart(5, '0')}`,
    declaration_date: isoDate(daysAgo).slice(0, 10),
    declaration_time: `${String(Math.floor(rand(0, 24))).padStart(2, '0')}:${String(Math.floor(rand(0, 60))).padStart(2, '0')}`,
    trade_regime: pick(tradeRegimes),
    origin_country: origin,
    destination_country: destination,
    destination_port: pick(ports),
    hs_code: pick(hsCodes),
    importer_id: pick(importers),
    exporter_id: pick(exporters),
    declared_value,
    declared_weight,
    measured_weight,
    shipping_line: pick(shippingLines),
    dwell_time_hours: parseFloat(rand(2, 240).toFixed(1)),
    clearance_status: pick(clearanceStatuses),
    risk_score,
    risk_level,
    anomaly_flags,
    anomaly_flag: anomaly_flags.length > 0,
    processed_at: isoDate(daysAgo),
    batch_id: `BATCH_SEED_001`,
  };
}

function makeTrack(container) {
  const originCoords = COUNTRY_COORDS[container.origin_country] || [0, 0];
  const destCoords = COUNTRY_COORDS[container.destination_country] || [10, 10];
  const midLat = (originCoords[0] + destCoords[0]) / 2;
  const midLon = (originCoords[1] + destCoords[1]) / 2;
  const progress = rand(0.1, 0.9);
  const currentLat = originCoords[0] + (destCoords[0] - originCoords[0]) * progress + rand(-2, 2);
  const currentLon = originCoords[1] + (destCoords[1] - originCoords[1]) * progress + rand(-2, 2);

  return {
    container_id: container.container_id,
    status: pick(['active', 'active', 'port', 'arrived']),
    origin: { name: container.origin_country, coordinates: [originCoords[1], originCoords[0]] },
    destination: { name: container.destination_country, coordinates: [destCoords[1], destCoords[0]] },
    current_position: { type: 'Point', coordinates: [parseFloat(currentLon.toFixed(4)), parseFloat(currentLat.toFixed(4))] },
    stops: [
      { name: container.origin_country, coordinates: [originCoords[1], originCoords[0]], arrived_at: isoDate(10) },
      { name: `Mid-Ocean (${midLon.toFixed(1)}°E)`, coordinates: [parseFloat(midLon.toFixed(2)), parseFloat(midLat.toFixed(2))], arrived_at: isoDate(5) },
    ],
    events: [
      { timestamp: isoDate(10), type: 'departure', description: `Departed ${container.origin_country}` },
      { timestamp: isoDate(5), type: 'waypoint', description: 'Mid-ocean waypoint passed' },
      { timestamp: isoDate(1), type: 'position_update', description: 'Position updated via AIS' },
    ],
    geojson: {
      type: 'Feature',
      properties: { container_id: container.container_id, risk_level: container.risk_level },
      geometry: {
        type: 'LineString',
        coordinates: [
          [originCoords[1], originCoords[0]],
          [parseFloat(midLon.toFixed(4)), parseFloat(midLat.toFixed(4))],
          [destCoords[1], destCoords[0]],
        ],
      },
    },
    vessel_name: `MV ${pick(shippingLines)} ${Math.floor(rand(100, 999))}`,
    imo_number: String(Math.floor(rand(9000000, 9999999))),
    updated_at: isoDate(0),
    created_at: isoDate(10),
  };
}

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to:', MONGO_URI);

  // Clear existing seed data
  await Container.deleteMany({ batch_id: 'BATCH_SEED_001' });
  await ShipmentTrack.deleteMany({});
  await Batch.deleteMany({ batch_id: 'BATCH_SEED_001' });

  // Create admin user if needed
  const existingAdmin = await User.findOne({ username: process.env.ADMIN_USERNAME || 'admin' });
  if (!existingAdmin) {
    await User.create({
      username: process.env.ADMIN_USERNAME || 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@smartcontainer.local',
      password_hash: process.env.ADMIN_PASSWORD || 'Admin@12345',
      role: 'admin', full_name: 'System Administrator',
      created_at: new Date(),
    });
    console.log(`Created admin user (${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'Admin@12345'})`);
  } else {
    console.log('Admin user already exists');
  }

  // Seed 200 containers
  console.log('Seeding 200 containers...');
  const containers = Array.from({ length: 200 }, (_, i) => makeContainer(i + 1));
  await Container.insertMany(containers);
  console.log('  Inserted 200 containers');

  // Seed batch record
  await Batch.create({
    batch_id: 'BATCH_SEED_001',
    total_records: 200,
    processed: 200,
    created_at: new Date(),
    uploaded_by: 'admin',
  });

  // Seed tracking for first 50 containers
  console.log('Seeding tracking records for 50 containers...');
  const trackContainers = containers.slice(0, 50);
  const tracks = trackContainers.map(makeTrack);
  await ShipmentTrack.insertMany(tracks);
  console.log('  Inserted 50 tracking records');

  // Summary stats
  const total = await Container.countDocuments();
  const critical = await Container.countDocuments({ risk_level: 'Critical' });
  const lowRisk = await Container.countDocuments({ risk_level: 'Low Risk' });
  const clear = await Container.countDocuments({ risk_level: 'Clear' });

  console.log('\n=== Seed complete ===');
  console.log(`Total containers: ${total}`);
  console.log(`  Critical:  ${critical}`);
  console.log(`  Low Risk:  ${lowRisk}`);
  console.log(`  Clear:     ${clear}`);

  await mongoose.disconnect();
  console.log('\nDone. Start the backend with: node server.js');
}

seed().catch(e => { console.error(e); process.exit(1); });
