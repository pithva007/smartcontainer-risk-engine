/**
 * Report Service
 * Generates CSV and PDF reports from container data.
 */
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const Container = require('../models/containerModel');
const logger = require('../utils/logger');

// ── Data Aggregation ───────────────────────────────────────────────────────────

const getReportData = async (filters = {}) => {
  const match = {};
  if (filters.batch_id) match.upload_batch_id = filters.batch_id;
  if (filters.risk_level) match.risk_level = filters.risk_level;
  if (filters.from_date) match.declaration_date = { $gte: new Date(filters.from_date) };
  if (filters.to_date) {
    match.declaration_date = {
      ...(match.declaration_date || {}),
      $lte: new Date(filters.to_date),
    };
  }

  const [containers, riskDist, topRoutes, anomalyStats] = await Promise.all([
    Container.find(match)
      .sort({ risk_score: -1, createdAt: -1 })
      .limit(filters.limit || 5000)
      .lean(),

    Container.aggregate([
      { $match: match },
      { $group: { _id: '$risk_level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    Container.aggregate([
      { $match: match },
      { $group: { _id: { origin: '$origin_country', destination: '$destination_country' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    Container.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          anomalies: { $sum: { $cond: ['$anomaly_flag', 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] } },
          avg_risk_score: { $avg: '$risk_score' },
        },
      },
    ]),
  ]);

  const stats = anomalyStats[0] || { total: 0, anomalies: 0, critical: 0, avg_risk_score: 0 };

  return { containers, riskDist, topRoutes, stats };
};

// ── CSV Export (full report) ───────────────────────────────────────────────────

const generateCSV = async (filters = {}) => {
  const { containers } = await getReportData(filters);

  const fields = [
    'container_id',
    'declaration_date',
    'origin_country',
    'destination_country',
    'destination_port',
    'trade_regime',
    'hs_code',
    'declared_value',
    'declared_weight',
    'measured_weight',
    'dwell_time_hours',
    'clearance_status',
    'risk_score',
    'risk_level',
    'anomaly_flag',
    'anomaly_score',
    'explanation',
    'inspection_status',
    'assigned_to',
  ];

  const data = containers.map((c) => ({
    ...c,
    declaration_date: c.declaration_date ? new Date(c.declaration_date).toISOString().split('T')[0] : '',
    explanation: Array.isArray(c.risk_explanation) ? c.risk_explanation.join(' | ') : (c.explanation || ''),
  }));

  const parser = new Parser({ fields, withBOM: true });
  return parser.parse(data);
};

// ── Prediction CSV Export ──────────────────────────────────────────────────────
// Generates a focused 4-column CSV ("risk_predictions.csv" format):
//   Container_ID, Risk_Score, Risk_Level, Explanation_Summary
// Used by POST /api/report/predictions.csv and the frontend Export button.

/**
 * Convert an array of prediction result objects into a 4-column CSV string.
 * Works with both live-stream rows and DB-persisted container documents.
 *
 * @param {Array<{container_id:string, risk_score:number, risk_level:string, explanation?:string, risk_explanation?:string[]}>} predictions
 * @returns {string} CSV string (UTF-8 BOM + header + rows)
 */
const generatePredictionCSV = (predictions) => {
  const fields = ['Container_ID', 'Risk_Score', 'Risk_Level', 'Explanation_Summary'];

  const rows = predictions.map((p) => {
    const explanation =
      Array.isArray(p.risk_explanation) && p.risk_explanation.length
        ? p.risk_explanation.join('. ')
        : (p.explanation || 'No explanation available.');

    // Pass through the actual risk_level from the model (Critical / Low Risk / Clear)
    const level = p.risk_level || 'Clear';

    return {
      Container_ID: p.container_id || '',
      Risk_Score: typeof p.risk_score === 'number' ? p.risk_score.toFixed(4) : '',
      Risk_Level: level,
      Explanation_Summary: explanation,
    };
  });

  const parser = new Parser({ fields, withBOM: true });
  return parser.parse(rows);
};

/**
 * Build summary stats from prediction results.
 * Returns total + per-level counts.
 *
 * @param {Array} predictions
 * @returns {{ total: number, critical: number, low_risk: number, clear: number }}
 */
const buildPredictionSummary = (predictions) => {
  const total    = predictions.length;
  const critical = predictions.filter((p) => p.risk_level === 'Critical').length;
  const low_risk = predictions.filter((p) => p.risk_level === 'Low Risk').length;
  const clear    = predictions.filter((p) => p.risk_level === 'Clear').length;
  return { total, critical, low_risk, clear };
};

/**
 * Fetch predictions from DB (optionally filtered) and return CSV + summary.
 *
 * @param {Object} filters  – batch_id, risk_level, from_date, to_date, limit
 * @returns {Promise<{ csv: string, summary: Object }>}
 */
const generatePredictionCSVFromDB = async (filters = {}) => {
  const { containers } = await getReportData({ ...filters, limit: filters.limit || 10000 });
  const csv     = generatePredictionCSV(containers);
  const summary = buildPredictionSummary(containers);
  return { csv, summary };
};

// ── PDF Export ─────────────────────────────────────────────────────────────────

const generatePDF = async (filters = {}) => {
  const { containers, riskDist, topRoutes, stats } = await getReportData(filters);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BRAND_BLUE = '#1a3c5e';
    const BRAND_RED = '#c0392b';
    const BRAND_GREEN = '#27ae60';
    const BRAND_YELLOW = '#e67e22';
    const LIGHT_GREY = '#ecf0f1';
    const TEXT_GREY = '#555555';

    const pageW = doc.page.width - 100;

    // ── Cover / Header ──────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 120).fill(BRAND_BLUE);
    doc
      .fillColor('white')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('SmartContainer Risk Engine', 50, 30);
    doc.fontSize(13).font('Helvetica').text('Risk Analysis Report', 50, 60);
    doc
      .fontSize(10)
      .text(`Generated: ${new Date().toUTCString()}`, 50, 80);

    doc.fillColor('#333333').moveDown(4);

    // ── Executive Summary ────────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_BLUE).text('Executive Summary', { underline: false });
    _drawHRule(doc, pageW);

    const criticalCount = riskDist.find((r) => r._id === 'Critical')?.count || 0;
    const lowRiskCount = riskDist.find((r) => r._id === 'Low Risk')?.count || 0;
    const clearCount = riskDist.find((r) => r._id === 'Clear')?.count || 0;

    const summaryRows = [
      ['Total Containers', stats.total.toLocaleString()],
      ['Critical Risk', criticalCount.toLocaleString()],
      ['Low Risk', lowRiskCount.toLocaleString()],
      ['Clear', clearCount.toLocaleString()],
      ['Anomalies Detected', stats.anomalies.toLocaleString()],
      ['Average Risk Score', (stats.avg_risk_score || 0).toFixed(3)],
    ];

    summaryRows.forEach(([label, value]) => {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_GREY).text(`${label}:`, { continued: true, width: 200 });
      doc.font('Helvetica').fillColor('#222222').text(`  ${value}`);
    });

    doc.moveDown(1.5);

    // ── Risk Distribution ────────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_BLUE).text('Risk Distribution');
    _drawHRule(doc, pageW);
    _drawBarChart(doc, riskDist, pageW, BRAND_RED, BRAND_YELLOW, BRAND_GREEN);

    doc.moveDown(1.5);

    // ── Top Trade Routes ─────────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_BLUE).text('Top Trade Routes');
    _drawHRule(doc, pageW);
    _drawTable(
      doc,
      ['Origin', 'Destination', 'Containers'],
      topRoutes.map((r) => [r._id.origin || 'N/A', r._id.destination || 'N/A', r.count.toString()]),
      pageW
    );

    doc.moveDown(1.5);

    // ── Recent Critical Containers ───────────────────────────────────────────
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_BLUE).text('Recent Critical Containers (Top 20)');
    _drawHRule(doc, pageW);

    const critical = containers.filter((c) => c.risk_level === 'Critical').slice(0, 20);
    _drawTable(
      doc,
      ['Container ID', 'Origin', 'Destination', 'Risk Score', 'Anomaly'],
      critical.map((c) => [
        c.container_id || '',
        c.origin_country || '',
        c.destination_country || '',
        (c.risk_score || 0).toFixed(3),
        c.anomaly_flag ? 'Yes' : 'No',
      ]),
      pageW
    );

    doc.end();
  });
};

// ── PDF Helpers ────────────────────────────────────────────────────────────────

const _drawHRule = (doc, width) => {
  doc.moveTo(50, doc.y).lineTo(50 + width, doc.y).stroke('#cccccc');
  doc.moveDown(0.5);
};

const _drawBarChart = (doc, riskDist, width, redColor, yellowColor, greenColor) => {
  const total = riskDist.reduce((s, r) => s + r.count, 0) || 1;
  const colorMap = { Critical: redColor, 'Low Risk': yellowColor, Clear: greenColor };
  const barHeight = 18;
  const labelWidth = 80;

  riskDist.forEach((r) => {
    const barW = Math.max(((r.count / total) * (width - labelWidth - 60)), 2);
    const color = colorMap[r._id] || '#999';
    const y = doc.y;

    doc.fontSize(10).font('Helvetica').fillColor('#333').text(r._id || 'Unknown', 50, y, { width: labelWidth });
    doc.rect(50 + labelWidth, y, barW, barHeight).fill(color);
    doc.fillColor('#333').fontSize(10).text(`${r.count}`, 50 + labelWidth + barW + 6, y);
    doc.moveDown(0.8);
  });
};

const _drawTable = (doc, headers, rows, width) => {
  const colW = Math.floor(width / headers.length);
  const rowH = 18;
  let y = doc.y;

  // Header row
  doc.rect(50, y, width, rowH).fill('#1a3c5e');
  headers.forEach((h, i) => {
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(h, 52 + i * colW, y + 4, { width: colW - 4 });
  });
  y += rowH;

  // Data rows
  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? '#f0f4f8' : 'white';
    doc.rect(50, y, width, rowH).fill(bg);
    row.forEach((cell, i) => {
      doc.fillColor('#222').fontSize(8).font('Helvetica').text(String(cell || ''), 52 + i * colW, y + 4, { width: colW - 4 });
    });
    y += rowH;

    // Page break check
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
  });

  // Move doc cursor
  doc.y = y + 10;
};

module.exports = { generateCSV, generatePDF, generatePredictionCSV, buildPredictionSummary, generatePredictionCSVFromDB };
