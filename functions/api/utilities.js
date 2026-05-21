import { listRecords, createRecord, updateRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Utilities';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const year = url.searchParams.get('year');

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
  if (body.electricity_units !== undefined) fields.electricity_units = Number(body.electricity_units);
  if (body.electricity_charge !== undefined) fields.electricity_charge = Number(body.electricity_charge);
  if (body.water_units !== undefined) fields.water_units = Number(body.water_units);
  if (body.water_charge !== undefined) fields.water_charge = Number(body.water_charge);
  if (body.notes !== undefined) fields.notes = body.notes;

  try {
    if (existingRecords.records && existingRecords.records.length > 0) {
      // Update existing
      const existingId = existingRecords.records[0].id;
      const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, existingId, fields);
      return jsonResponse({ record, upserted: 'updated' });
    } else {
      // Create new
      const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
      return jsonResponse({ record, upserted: 'created' }, 201);
    }
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
