#!/usr/bin/env node
/**
 * import-assets.js
 * Import asset/collection data from Excel spreadsheet(s) to Airtable.
 *
 * Usage:
 *   AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node import-assets.js [file1.xlsx] [file2.xlsx]
 *
 * Defaults to Fin_Track_2025.xlsx and Fin_Track_2026.xlsx if no files specified.
 *
 * Category auto-detection by name keywords:
 *   knife/blade/cyclop/damascus/tanto/cleaver/chef/santoku → Collection-Knife
 *   vice/vise                                              → Collection-Vice
 *   plant/cactus/succulent/fern/monstera/bonsai            → Collection-Plant
 *   doll/figure/toy/nendoroid/statue/figurine              → Collection-Doll
 *   Otherwise                                              → Other
 */

import * as XLSX from 'xlsx';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const FILES = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['Fin_Track_2025.xlsx', 'Fin_Track_2026.xlsx'];

if (!API_KEY || !BASE_ID) {
  console.error('Error: Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables');
  process.exit(1);
}

/* ─── Category detection ─── */
function detectCategory(name) {
  if (!name) return 'Other';
  const n = name.toLowerCase();
  if (/knife|blade|cyclop|cyclops|damascus|tanto|cleaver|chef|santoku|paring|boning|fillet|nakiri|gyuto|bunka|sujihiki|yanagiba/.test(n)) {
    return 'Collection-Knife';
  }
  if (/vice|vise|clamp|anvil/.test(n)) {
    return 'Collection-Vice';
  }
  if (/plant|cactus|succulent|fern|monstera|bonsai|orchid|flower|agave|aloe|haworthia|echeveria|euphorbia/.test(n)) {
    return 'Collection-Plant';
  }
  if (/doll|figure|toy|nendoroid|statue|figurine|action figure|gacha|funko|pop|plush/.test(n)) {
    return 'Collection-Doll';
  }
  return 'Other';
}

/* ─── Detect asset velocity from name or metadata ─── */
function detectVelocity(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/limited|rare|exclusive|collab|custom|handmade|artisan/.test(n)) return 'Slow';
  if (/mass|common|basic|standard|regular/.test(n)) return 'Fast';
  return null;
}

/* ─── Airtable API helpers ─── */
async function createAsset(fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Assets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ records: [{ fields }] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.records[0];
}

async function listExistingNames() {
  const names = [];
  let offset = null;

  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/Assets?fields[]=name&pageSize=100${offset ? '&offset=' + offset : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    (data.records || []).forEach(r => {
      if (r.fields.name) names.push(r.fields.name.toLowerCase().trim());
    });
    offset = data.offset;
    if (offset) await new Promise(r => setTimeout(r, 210));
  } while (offset);

  return names;
}

/* ─── Parse an asset sheet ─── */
function parseAssetSheet(sheet, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const assets = [];

  if (rows.length < 2) return assets;

  // Find header row (first row with "name" or "asset" keyword)
  let headerRowIdx = -1;
  let headers = [];

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map(c => String(c || '').toLowerCase().trim());
    if (row.some(c => c.includes('asset') || c.includes('name') || c.includes('item') || c === 'ชื่อ')) {
      headerRowIdx = i;
      headers = row;
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Assume first row is header
    headerRowIdx = 0;
    headers = rows[0].map(c => String(c || '').toLowerCase().trim());
  }

  // Detect column indices
  const nameCol = headers.findIndex(h => h.includes('asset') || h.includes('name') || h.includes('item') || h === 'ชื่อ' || h === 'ชื่อสินค้า');
  const valueCol = headers.findIndex(h =>
    h.includes('current') || h.includes('value') || h.includes('estimate') ||
    h.includes('market') || h.includes('ราคา') || h.includes('มูลค่า')
  );
  const costCol = headers.findIndex(h =>
    h.includes('cost') || h.includes('buy') || h.includes('purchase') ||
    h.includes('ต้นทุน') || h.includes('ซื้อ')
  );
  const soldCol = headers.findIndex(h =>
    h.includes('sold') || h.includes('sell') || h.includes('sale') ||
    h.includes('ขาย')
  );
  const incomingCol = headers.findIndex(h =>
    h.includes('incoming') || h.includes('incoming') || h.includes('รับเข้า')
  );
  const dateCol = headers.findIndex(h =>
    h.includes('date') || h.includes('วันที่') || h.includes('acquired')
  );
  const notesCol = headers.findIndex(h =>
    h.includes('note') || h.includes('remark') || h.includes('หมายเหตุ') || h.includes('desc')
  );

  console.log(`  Sheet "${sheetName}": nameCol=${nameCol}, valueCol=${valueCol}, costCol=${costCol}, soldCol=${soldCol}`);

  // Parse data rows
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];

    const nameRaw = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
    if (!nameRaw || nameRaw === '0' || nameRaw === '-' || nameRaw.toLowerCase() === 'total') continue;

    // Parse numbers (remove currency symbols, commas, etc.)
    function parseNum(val) {
      if (val === null || val === undefined || val === '') return null;
      const s = String(val).replace(/[^0-9.]/g, '');
      const n = parseFloat(s);
      return isNaN(n) || n === 0 ? null : n;
    }

    const currentValue = valueCol >= 0 ? parseNum(row[valueCol]) : null;
    const costPrice = costCol >= 0 ? parseNum(row[costCol]) : null;
    const soldValue = soldCol >= 0 ? parseNum(row[soldCol]) : null;
    const notes = notesCol >= 0 ? String(row[notesCol] || '').trim() : null;

    // Determine status
    let status = 'Holding';
    if (soldValue && soldValue > 0) status = 'Sold';
    else if (incomingCol >= 0 && parseNum(row[incomingCol])) status = 'For Sale';

    // Parse date
    let dateAcquired = null;
    if (dateCol >= 0 && row[dateCol]) {
      const d = new Date(row[dateCol]);
      if (!isNaN(d.getTime())) {
        dateAcquired = d.toISOString().split('T')[0];
      }
    }

    assets.push({
      name: nameRaw,
      category: detectCategory(nameRaw),
      cost_price: costPrice || currentValue, // fall back to value if no cost
      estimated_value: status === 'Sold' ? (costPrice || currentValue) : currentValue,
      sold_price: soldValue || undefined,
      status,
      velocity: detectVelocity(nameRaw) || undefined,
      date_acquired: dateAcquired || undefined,
      notes: notes && notes.length > 0 ? notes : undefined
    });
  }

  return assets;
}

/* ─── Main ─── */
async function main() {
  // Fetch existing asset names to skip duplicates
  let existingNames = [];
  try {
    existingNames = await listExistingNames();
    console.log(`Existing assets in Airtable: ${existingNames.length}`);
  } catch (e) {
    console.warn('Could not fetch existing assets:', e.message);
  }

  // Collect all assets from all files (deduplicated by name)
  const allAssetsMap = new Map(); // lowercase name → fields

  for (const file of FILES) {
    let wb;
    try {
      wb = XLSX.readFile(file);
    } catch (e) {
      console.warn(`Skip ${file}: ${e.message}`);
      continue;
    }

    console.log(`\nReading ${file}:`);
    console.log(`  Sheets: ${wb.SheetNames.join(', ')}`);

    for (const sheetName of wb.SheetNames) {
      // Skip obviously non-asset sheets
      const lower = sheetName.toLowerCase();
      if (['summary', 'dashboard', 'chart', 'pivot', 'electric', 'water', 'utility', 'cash', 'income', 'expense'].some(k => lower.includes(k))) {
        console.log(`  Skip sheet: "${sheetName}" (likely not assets)`);
        continue;
      }

      const sheet = wb.Sheets[sheetName];
      const sheetAssets = parseAssetSheet(sheet, sheetName);
      console.log(`  "${sheetName}": ${sheetAssets.length} assets found`);

      sheetAssets.forEach(asset => {
        const key = asset.name.toLowerCase().trim();
        if (!allAssetsMap.has(key)) {
          allAssetsMap.set(key, asset);
        } else {
          // If already exists from another sheet, merge/update with newer data
          const existing = allAssetsMap.get(key);
          allAssetsMap.set(key, {
            ...existing,
            estimated_value: asset.estimated_value || existing.estimated_value,
            cost_price: asset.cost_price || existing.cost_price,
            status: asset.status !== 'Holding' ? asset.status : existing.status,
            sold_price: asset.sold_price || existing.sold_price,
            notes: asset.notes || existing.notes
          });
        }
      });
    }
  }

  // Filter out already-existing assets
  const toImport = [...allAssetsMap.values()].filter(asset => {
    const key = asset.name.toLowerCase().trim();
    if (existingNames.includes(key)) {
      console.log(`\nSkip (exists): ${asset.name}`);
      return false;
    }
    return true;
  });

  console.log(`\nTo import: ${toImport.length} new assets`);

  if (toImport.length === 0) {
    console.log('Nothing to import. Done.');
    return;
  }

  // Sort by category for better UX
  toImport.sort((a, b) => {
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return a.name.localeCompare(b.name);
  });

  let success = 0;
  let errors = 0;

  for (const asset of toImport) {
    // Build clean fields object (no undefined)
    const fields = Object.fromEntries(
      Object.entries(asset).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    try {
      await createAsset(fields);
      const valueStr = asset.estimated_value ? '฿' + Math.round(asset.estimated_value).toLocaleString('en-US') : '—';
      console.log(`✓ ${asset.name.padEnd(40)} | ${asset.category.padEnd(20)} | ${asset.status.padEnd(10)} | ${valueStr}`);
      success++;
      // Rate limit: max 5 req/sec for Airtable
      await new Promise(r => setTimeout(r, 210));
    } catch (e) {
      console.error(`✗ ${asset.name}: ${e.message}`);
      errors++;
    }
  }

  // Print summary by category
  console.log('\n── Summary by category ──');
  const byCat = {};
  toImport.forEach(a => {
    byCat[a.category] = (byCat[a.category] || 0) + 1;
  });
  Object.entries(byCat).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  console.log(`\nDone. ${success} imported, ${errors} errors.`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
