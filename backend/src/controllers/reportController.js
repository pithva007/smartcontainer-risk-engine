/**
 * Report Controller
 * GET /api/report/summary.csv  — download full CSV report
 * GET /api/report/summary.pdf  — download PDF report
 */
const { generateCSV, generatePDF } = require('../services/reportService');
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

module.exports = { downloadCSV, downloadPDF };
