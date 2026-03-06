/**
 * Report Controller
 * GET /api/report/summary.csv  — download full CSV report
 * GET /api/report/summary.pdf  — download PDF report
 * GET /api/report/predictions.csv — download focused prediction CSV
 */
const { generateCSV, generatePDF, generatePredictionCSVFromDB } = require('../services/reportService');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

// ── CSV Report ─────────────────────────────────────────────────────────────────
const downloadCSV = async (req, res) => {
  const { batch_id, risk_level, from_date, to_date } = req.query;

  try {
    const csv = await generateCSV({ batch_id, risk_level, from_date, to_date });

    await audit({
      user: req.user,
      action: 'DOWNLOAD_REPORT',
      entityType: 'Report',
      req,
      metadata: { format: 'csv', filters: { batch_id, risk_level } },
    });

    const filename = `smartcontainer-report-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csv);
  } catch (err) {
    logger.error(`CSV report error: ${err.message}`);
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: 'Failed to generate CSV report.', request_id: req.requestId },
    });
  }
};

// ── PDF Report ─────────────────────────────────────────────────────────────────
const downloadPDF = async (req, res) => {
  const { batch_id, risk_level, from_date, to_date } = req.query;

  try {
    const pdfBuffer = await generatePDF({ batch_id, risk_level, from_date, to_date });

    await audit({
      user: req.user,
      action: 'DOWNLOAD_REPORT',
      entityType: 'Report',
      req,
      metadata: { format: 'pdf', filters: { batch_id, risk_level } },
    });

    const filename = `smartcontainer-report-${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error(`PDF report error: ${err.message}`);
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: 'Failed to generate PDF report.', request_id: req.requestId },
    });
  }
};

// ── Focused Prediction CSV Export ──────────────────────────────────────────────
/**
 * GET /api/report/predictions.csv
 * Downloads a focused CSV with exactly four columns:
 *   Container_ID, Risk_Score, Risk_Level, Explanation_Summary
 *
 * Optional query params (all same as summary.csv):
 *   batch_id, risk_level, from_date, to_date
 */
const downloadPredictionsCSV = async (req, res) => {
  const { batch_id, risk_level, from_date, to_date } = req.query;

  try {
    const { csv, summary } = await generatePredictionCSVFromDB({ batch_id, risk_level, from_date, to_date });

    await audit({
      user: req.user,
      action: 'DOWNLOAD_REPORT',
      entityType: 'Report',
      req,
      metadata: { format: 'prediction-csv', filters: { batch_id, risk_level }, summary },
    });

    const date = new Date().toISOString().split('T')[0];
    const filename = batch_id ? `risk_predictions_${batch_id}_${date}.csv` : `risk_predictions_${date}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // Expose summary in headers so the frontend can display it without parsing the CSV
    res.setHeader('X-Prediction-Total',    String(summary.total));
    res.setHeader('X-Prediction-Critical', String(summary.critical));
    res.setHeader('X-Prediction-LowRisk',  String(summary.low_risk));
    res.setHeader('X-Prediction-Clear',    String(summary.clear));
    return res.send(csv);
  } catch (err) {
    logger.error(`Prediction CSV export error: ${err.message}`);
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: 'Failed to generate prediction CSV.', request_id: req.requestId },
    });
  }
};

module.exports = { downloadCSV, downloadPDF, downloadPredictionsCSV };