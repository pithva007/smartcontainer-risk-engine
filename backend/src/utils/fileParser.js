/**
 * CSV / Excel file parser utility
 * Parses uploaded files into an array of plain objects
 */
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const { normaliseRecord } = require('./featureEngineering');

/**
 * Parse a CSV file into an array of record objects.
 *
 * @param {string} filePath - absolute path to CSV file
 * @returns {Promise<Array>}
 */
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => results.push(normaliseRecord(row)))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

/**
 * Parse an Excel (.xlsx / .xls) file into an array of record objects.
 * Uses the first sheet by default.
 *
 * @param {string} filePath
 * @returns {Array}
 */
const parseExcel = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows.map(normaliseRecord);
};

/**
 * Auto-detect file type and parse accordingly.
 *
 * @param {string} filePath
 * @returns {Promise<Array>}
 */
const parseFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    return parseCSV(filePath);
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(filePath);
  }
  throw new Error(`Unsupported file type: ${ext}. Accepted: .csv, .xlsx, .xls`);
};

module.exports = { parseFile, parseCSV, parseExcel };
