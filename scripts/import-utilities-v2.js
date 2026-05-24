#!/usr/bin/env node
'use strict';

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'apphBGWfSPL45oSFd';
const EXCEL_FILE       = 'My_house_Expense_control_tracking_x_8_24.xlsx';
const TABLE            = 'Utilities';

if (!AIRTABLE_API_KEY) {
  console.error('ERROR: AIRTABLE_API_KEY not set in .env');
  process.exit(1);
}

const AT_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`;
const HEADERS = { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' };

// ─── Airtable helpers ──────────────────────────────────────────────────────

async function atFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  const json = await r.json();
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function listAllRecords() {
  const records = [];
  let offset;
  do {
    const qs  = offset ? `?offset=${offset}` : '';
    const res = await atFetch(`${AT_BASE}${qs}`);
    records.push(...(res.records || []));
    offset = res.offset;
  } while (offset);
  return records;
}

async function batchCreate(rows) {
  // 10 records per POST per Airtable limit
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10).map(f => ({ fields: f }));
    await atFetch(AT_BASE, {
      method: 'POST',
      body: JSON.stringify({ records: chunk })
    });
  }
}

async function patchRecord(id, fields) {
  await atFetch(`${AT_BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields })
  });
}

// ─── Excel parsing helpers ─────────────────────────────────────────────────

function findSheetByKeyword(workbook, keyword) {
  return workbook.SheetNames.find(n => n.toLowerCase().includes(keyword));
}

function normalizeHeader(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColIndex(headers, keywords) {
  return headers.findIndex(h => keywords.some(kw => h.includes(kw)));
}

function parseSheetRows(sheet, unitKeywords, chargeKeywords) {
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (json.length < 2) return [];

  const headerRow = json[0].map(normalizeHeader);
  const yearIdx   = findColIndex(headerRow, ['year', 'ปี']);
  const monthIdx  = findColIndex(headerRow, ['month', 'เดือน']);
  const unitIdx   = findColIndex(headerRow, unitKeywords);
  const chargeIdx = findColIndex(headerRow, chargeKeywords);

  if (yearIdx < 0 || monthIdx < 0) return [];

  const rows = [];
  for (let i = 1; i < json.length; i++) {
    const row   = json[i];
    const year  = parseInt(row[yearIdx]);
    const month = parseInt(row[monthIdx]);
    if (!year || !month || isNaN(year) || isNaN(month)) continue;
    if (month < 1 || month > 12) continue;

    rows.push({
      year, month,
      units:  unitIdx  >= 0 ? parseFloat(row[unitIdx])  || null : null,
      charge: chargeIdx >= 0 ? parseFloat(row[chargeIdx]) || null : null
    });
  }
  return rows;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const filePath = path.resolve(process.cwd(), EXCEL_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Excel file not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading ${EXCEL_FILE}…`);
  const workbook = XLSX.readFile(filePath);

  // Find electricity and water sheets
  const elecSheetName  = findSheetByKeyword(workbook, 'elec') || workbook.SheetNames[0];
  const waterSheetName = findSheetByKeyword(workbook, 'water') || workbook.SheetNames[1];

  const elecSheet  = workbook.Sheets[elecSheetName];
  const waterSheet = workbook.Sheets[waterSheetName];

  const elecRows  = parseSheetRows(elecSheet,  ['unit', 'kw'], ['charge', 'amount', 'cost', 'baht', '฿']);
  const waterRows = parseSheetRows(waterSheet, ['unit', 'volume'], ['charge', 'amount', 'cost', 'baht', '฿']);

  console.log(`Parsed: ${elecRows.length} electricity rows, ${waterRows.length} water rows`);

  // Merge into a single map by YYYY-MM
  const merged = {};
  const addRow = (row, prefix) => {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    if (!merged[key]) merged[key] = {};
    if (row.units  !== null) merged[key][`${prefix}_units`]  = row.units;
    if (row.charge !== null) merged[key][`${prefix}_charge`] = row.charge;
  };
  elecRows.forEach(r  => addRow(r, 'electricity'));
  waterRows.forEach(r => addRow(r, 'water'));

  // Filter out empty rows
  const keys = Object.keys(merged).filter(k => Object.keys(merged[k]).length > 0);
  console.log(`Unique months to import: ${keys.length}`);
  if (keys.length === 0) {
    console.log('Nothing to import. Check Excel column headers.');
    return;
  }

  // Fetch existing Airtable records
  console.log('Fetching existing Airtable records…');
  const existing = await listAllRecords();
  const existingMap = {};
  existing.forEach(r => {
    const ym = (r.fields.month || '').slice(0, 7);
    if (ym) existingMap[ym] = r.id;
  });
  console.log(`Found ${existing.length} existing records`);

  let created = 0, updated = 0, skipped = 0;
  const toCreate = [];

  for (const ym of keys) {
    const fields = { month: ym + '-01', ...merged[ym] };
    if (existingMap[ym]) {
      await patchRecord(existingMap[ym], merged[ym]);
      updated++;
    } else {
      toCreate.push(fields);
    }
  }

  if (toCreate.length > 0) {
    await batchCreate(toCreate);
    created = toCreate.length;
  }

  console.log(`\nDone! Created: ${created} | Updated: ${updated} | Skipped (empty): ${skipped}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

// HOW TO RUN:
// 1. npm install xlsx dotenv
// 2. Create .env file in project root with:
//    AIRTABLE_API_KEY=your_key_here
//    AIRTABLE_BASE_ID=apphBGWfSPL45oSFd
// 3. Place Excel file in project root:
//    My_house_Expense_control_tracking_x_8_24.xlsx
// 4. node scripts/import-utilities-v2.js
