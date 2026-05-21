import { listRecords, createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Assets';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');

  const filters = [];
  if (status) filters.push(`{status}='${status}'`);
  if (category) filters.push(`{category}='${category}'`);

  const filterByFormula = filters.length === 0
    ? undefined
    : filters.length === 1
      ? filters[0]
      : `AND(${filters.join(', ')})`;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date_acquired', direction: 'desc' }],
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

  const { name } = body;
  if (!name) return errorResponse('name is required');

  const fields = { name };

  if (body.category) fields.category = body.category;
  if (body.cost_price !== undefined) fields.cost_price = Number(body.cost_price);
  if (body.estimated_value !== undefined) fields.estimated_value = Number(body.estimated_value);
  if (body.date_acquired) fields.date_acquired = body.date_acquired;
  if (body.status) fields.status = body.status;
  if (body.velocity) fields.velocity = body.velocity;
  if (body.notes) fields.notes = body.notes;
  if (body.cloudinary_image_url) fields.cloudinary_image_url = body.cloudinary_image_url;
  if (body.sold_price !== undefined) fields.sold_price = Number(body.sold_price);
  if (body.sold_date) fields.sold_date = body.sold_date;
  if (body.sold_via) fields.sold_via = body.sold_via;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
