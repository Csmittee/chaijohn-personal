import { listRecords, createRecord, updateRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID   = 'apphBGWfSPL45oSFd';
const TABLE     = 'Utilities';
const META_BASE = 'https://api.airtable.com/v0/meta';

// Fix 16: create ft_note field if missing (once per isolate lifetime)
let ftNoteEnsured = false;
async function ensureFtNoteField(apiKey) {
  if (ftNoteEnsured) return;
  ftNoteEnsured = true;
  try {
    const tablesRes = await fetch(`${META_BASE}/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const tablesJson = await tablesRes.json();
    const table = (tablesJson.tables || []).find(t => t.name === TABLE);
    if (!table) return;
    await fetch(`${META_BASE}/bases/${BASE_ID}/tables/${table.id}/fields`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ft_note', type: 'multilineText' })
    });
  } catch { /* field already exists or meta API unavailable — ignore */ }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url  = new URL(request.url);
  const year = url.searchParams.get('year');

  // Ensure ft_note field exists (non-blocking)
  ensureFtNoteField(env.AIRTABLE_API_KEY).catch(() => {});

  let filterByFormula;
  if (year) {
    filterByFormula = `YEAR({month})=${parseInt(year, 10)}`;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'month', direction: 'desc' }],
      maxRecords: 500
    });
    return jsonResponse({ records: data.records });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { month } = body;
  if (!month) return errorResponse('month is required (format: YYYY-MM-01)');

  // Upsert by month: check if record exists
  let existingRecords;
  try {
    existingRecords = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula: `{month}='${month}'`,
      maxRecords: 1
    });
  } catch (err) {
    return errorResponse('Failed to check existing record: ' + err.message, 500);
  }

  const fields = { month };
  if (body.electricity_units  !== undefined) fields.electricity_units  = Number(body.electricity_units);
  if (body.electricity_charge !== undefined) fields.electricity_charge = Number(body.electricity_charge);
  if (body.water_units        !== undefined) fields.water_units        = Number(body.water_units);
  if (body.water_charge       !== undefined) fields.water_charge       = Number(body.water_charge);
  if (body.notes    !== undefined) fields.notes    = body.notes;
  if (body.ft_note  !== undefined) fields.ft_note  = body.ft_note;

  try {
    if (existingRecords.records && existingRecords.records.length > 0) {
      const existingId = existingRecords.records[0].id;
      const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, existingId, fields);
      return jsonResponse({ record, upserted: 'updated' });
    } else {
      const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
      return jsonResponse({ record, upserted: 'created' }, 201);
    }
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
