import { getRecord, updateRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'HardAssets';

export async function onRequestGet(context) {
  const { env, params } = context;
  try {
    const record = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, params.id);
    return jsonResponse({ record: { id: record.id, ...record.fields } });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const fields = {};
  if (body.name)             fields.name           = body.name;
  if (body.category)         fields.category       = body.category;
  if (body.purchase_date)    fields.purchase_date  = body.purchase_date;
  if (body.purchase_price !== undefined) fields.purchase_price = Number(body.purchase_price);
  if (body.current_value  !== undefined) fields.current_value  = Number(body.current_value);
  if (body.location)         fields.location       = body.location;
  if (body.notes !== undefined) fields.notes       = body.notes;
  if (body.status)           fields.status         = body.status;
  if (body.sold_price !== undefined) fields.sold_price = Number(body.sold_price);
  if (body.sold_date)        fields.sold_date      = body.sold_date;
  if (body.image_url !== undefined) fields.image_url = body.image_url;

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, params.id, fields);
    return jsonResponse({ record: { id: record.id, ...record.fields } });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, params.id, { status: 'Disposed' });
    return jsonResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
