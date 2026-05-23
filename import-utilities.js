#!/usr/bin/env node
/**
 * import-utilities.js
 * Import utility data (electricity + water) from Excel spreadsheet to Airtable.
 *
 * Usage:
 *   AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node import-utilities.js [path-to-xlsx]
 *
 * Expected Excel format:
 *   Sheet name: "Electric" or similar (auto-detected)
 *   Columns: Year | Month | Units | Charge  (flexible — auto-detected by header keywords)
 *
 * If both Electric and Water sheets exist, both are merged by month.
 */

import * as XLSX from 'xlsx';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const FILE_PATH = process.argv[2] || 'My_house_Expense_control_tracking_x_8_24.xlsx';

if (!API_KEY || !BASE_ID) {
  console.error('Error: Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables');
  process.exit(1);
}

/**
 * Create or upsert a utility record in Airtable.
 */
async function createUtilityRecord(month, fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/Utilities`;
  const body = {
    records: [{
      fields: {
        month,
        ...fields
      }
    }]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.records[0];
}

/**
 * Fetch existing utility records to avoid duplicates.
 */
async function listExistingMonths() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/Utilities?fields[]=month&pageSize=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return (data.records || []).map(r => String(r.fields.month || '').substring(0, 7));
}

/**
 * Parse rows from an Excel sheet into {month, units, charge} entries.
 * Flexible parsing: tries to detect year + month names + numeric columns.
 */
function parseSheet(sheet, type) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const results = [];

  const MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];

  const MONTH_MAP = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12
  };

  let headerRow = -1;
  let colYear = -1;
  let colMonth = -1;
  let colUnits = -1;
  let colCharge = -1;

  // Find header row
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    const lower = row.map(c => String(c || '').toLowerCase().trim());

    // Look for column headers
    const yearIdx = lower.findIndex(c => c === 'year' || c === 'ปี');
    const monthIdx = lower.findIndex(c => c === 'month' || c === 'เดือน' || c.includes('month'));
    const unitsIdx = lower.findIndex(c => c.includes('unit') || c.includes('หน่วย') || c === 'units');
    const chargeIdx = lower.findIndex(c =>
      c.includes('charge') || c.includes('baht') || c.includes('amount') ||
      c.includes('cost') || c.includes('บาท') || c.includes('ค่า')
    );

    if (yearIdx >= 0 || monthIdx >= 0 || unitsIdx >= 0 || chargeIdx >= 0) {
      headerRow = i;
      colYear = yearIdx;
      colMonth = monthIdx;
      colUnits = unitsIdx;
      colCharge = chargeIdx;
      break;
    }
  }

  // Process rows after header (or from row 0 if no header found)
  const startRow = headerRow >= 0 ? headerRow + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue; // skip empty rows

    const flat = row.map(c => String(c == null ? '' : c).trim());

    let year = null, monthNum = null, units = null, charge = null;

    // Method 1: Use detected header columns
    if (headerRow >= 0) {
      if (colYear >= 0 && flat[colYear]) {
        const y = parseInt(flat[colYear]);
        if (y >= 2000 && y <= 2099) year = y;
      }
      if (colMonth >= 0 && flat[colMonth]) {
        const mRaw = flat[colMonth].toLowerCase();
        // Try as number first
        const mNum = parseInt(mRaw);
        if (mNum >= 1 && mNum <= 12) {
          monthNum = mNum;
        } else {
          // Try as name
          const found = Object.keys(MONTH_MAP).find(k => mRaw.startsWith(k));
          if (found) monthNum = MONTH_MAP[found];
        }
      }
      if (colUnits >= 0 && flat[colUnits]) {
        const u = parseFloat(flat[colUnits].replace(/[^0-9.]/g, ''));
        if (!isNaN(u) && u > 0) units = u;
      }
      if (colCharge >= 0 && flat[colCharge]) {
        const c = parseFloat(flat[colCharge].replace(/[^0-9.]/g, ''));
        if (!isNaN(c) && c > 0) charge = c;
      }
    }

    // Method 2: Fallback — scan row for year, month, numbers
    if (!year || !monthNum) {
      flat.forEach((cell, idx) => {
        const lower = cell.toLowerCase();
        // Detect year
        if (!year) {
          const yMatch = cell.match(/\b(20\d{2})\b/);
          if (yMatch) year = parseInt(yMatch[1]);
        }
        // Detect month name
        if (!monthNum) {
          const foundMonth = Object.keys(MONTH_MAP).find(k => lower.startsWith(k));
          if (foundMonth) monthNum = MONTH_MAP[foundMonth];
        }
        // Detect month as number in "MM/YYYY" or "YYYY-MM"
        if (!monthNum && !year) {
          const mmYyyy = cell.match(/^(\d{1,2})\/(\d{4})$/);
          if (mmYyyy) {
            monthNum = parseInt(mmYyyy[1]);
            year = parseInt(mmYyyy[2]);
          }
          const yyyyMm = cell.match(/^(\d{4})-(\d{2})$/);
          if (yyyyMm) {
            year = parseInt(yyyyMm[1]);
            monthNum = parseInt(yyyyMm[2]);
          }
        }
      });

      // Extract first two positive numbers as units and charge
      if (!units || !charge) {
        const nums = flat
          .map(c => parseFloat(c.replace(/[^0-9.]/g, '')))
          .filter(n => !isNaN(n) && n > 0 && n < 100000);
        if (!units && nums[0]) units = nums[0];
        if (!charge && nums[1]) charge = nums[1];
      }
    }

    if (year && monthNum && (units || charge)) {
      const month = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      results.push({ month, units, charge });
    }
  }

  return results;
}

async function main() {
  console.log(`Reading: ${FILE_PATH}`);
  let wb;
  try {
    wb = XLSX.readFile(FILE_PATH);
  } catch (e) {
    console.error('Could not read file:', e.message);
    process.exit(1);
  }

  const sheetNames = wb.SheetNames;
  console.log('Sheets found:', sheetNames.join(', '));

  // Fetch existing months to skip duplicates
  let existingMonths = [];
  try {
    existingMonths = await listExistingMonths();
    console.log('Existing records in Airtable:', existingMonths.length);
  } catch (e) {
    console.warn('Could not fetch existing records:', e.message);
  }

  // Build combined records map: month → {electricity_units, electricity_charge, water_units, water_charge}
  const records = new Map(); // month → fields

  // Find and parse electric sheet
  const elecSheetName = sheetNames.find(n => {
    const lower = n.toLowerCase();
    return lower.includes('elec') || lower.includes('electricity') || lower.includes('light') || lower === 'e';
  }) || sheetNames[0];

  if (elecSheetName) {
    console.log(`Parsing electricity from sheet: "${elecSheetName}"`);
    const elecSheet = wb.Sheets[elecSheetName];
    const elecData = parseSheet(elecSheet, 'electricity');
    elecData.forEach(({ month, units, charge }) => {
      const existing = records.get(month) || {};
      records.set(month, {
        ...existing,
        electricity_units: units || existing.electricity_units,
        electricity_charge: charge || existing.electricity_charge
      });
    });
    console.log(`  Found ${elecData.length} electricity records`);
  }

  // Find and parse water sheet
  const waterSheetName = sheetNames.find(n => {
    const lower = n.toLowerCase();
    return lower.includes('water') || lower.includes('น้ำ') || lower === 'w';
  });

  if (waterSheetName && waterSheetName !== elecSheetName) {
    console.log(`Parsing water from sheet: "${waterSheetName}"`);
    const waterSheet = wb.Sheets[waterSheetName];
    const waterData = parseSheet(waterSheet, 'water');
    waterData.forEach(({ month, units, charge }) => {
      const existing = records.get(month) || {};
      records.set(month, {
        ...existing,
        water_units: units || existing.water_units,
        water_charge: charge || existing.water_charge
      });
    });
    console.log(`  Found ${waterData.length} water records`);
  } else if (!waterSheetName) {
    console.log('No water sheet found — only electricity will be imported');
  }

  // Filter out records with no meaningful data and skip existing
  const toImport = [...records.entries()]
    .filter(([month, fields]) => {
      const monthShort = month.substring(0, 7);
      if (existingMonths.includes(monthShort)) {
        console.log(`Skip (exists): ${month}`);
        return false;
      }
      const hasData = (fields.electricity_units > 0 || fields.electricity_charge > 0 ||
        fields.water_units > 0 || fields.water_charge > 0);
      return hasData;
    })
    .sort(([a], [b]) => a > b ? 1 : -1);

  console.log(`\nTo import: ${toImport.length} new records`);

  if (toImport.length === 0) {
    console.log('Nothing to import. Done.');
    return;
  }

  let success = 0;
  let errors = 0;

  for (const [month, fields] of toImport) {
    // Clean up fields: remove null/undefined/zero values
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v != null && v > 0)
    );

    try {
      await createUtilityRecord(month, cleanFields);
      console.log(`✓ ${month.substring(0, 7)}  electricity: ${fields.electricity_units || '—'} units / ${fields.electricity_charge ? '฿' + fields.electricity_charge : '—'}  water: ${fields.water_units || '—'} units / ${fields.water_charge ? '฿' + fields.water_charge : '—'}`);
      success++;
      // Rate limit: ~5 requests/second max for Airtable free tier
      await new Promise(r => setTimeout(r, 210));
    } catch (e) {
      console.error(`✗ ${month}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone. ${success} imported, ${errors} errors.`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
