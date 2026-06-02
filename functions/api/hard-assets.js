import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'HardAssets';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const data = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      sort: [{ field: 'current_value', direction: 'desc' }],
      pageSize: 100
    });
    // Flatten records to match L082 shape
    const records = (data.records || []).map(r => ({
      id: r.id,
      ...r.fields
    }));
    return jsonResponse({ records });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  const { name } = body;
  if (!name) return errorResponse('name is required');

  const fields = { name };
  if (body.category)       fields.category       = body.category;
  if (body.purchase_date)  fields.purchase_date  = body.purchase_date;
  if (body.purchase_price !== undefined) fields.purchase_price = Number(body.purchase_price);
  if (body.current_value  !== undefined) fields.current_value  = Number(body.current_value);
  if (body.location)       fields.location       = body.location;
  if (body.notes)          fields.notes          = body.notes;
  if (body.status)         fields.status         = body.status || 'Active';
  if (body.image_url)      fields.image_url      = body.image_url;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    const flat = { id: record.id, ...record.fields };
    return jsonResponse({ record: flat }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
