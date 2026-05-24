import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Budgets';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const all        = url.searchParams.get('all')         === 'true';
  const activeOnly = url.searchParams.get('active_only') === 'true';

  let filterByFormula;
  if (all) {
    filterByFormula = undefined;
  } else if (activeOnly) {
    const today = new Date().toISOString().split('T')[0];
    filterByFormula = `AND({active}=TRUE(),OR({period}!="One-time",AND(OR({start_date}="",{start_date}<="${today}"),OR({end_date}="",{end_date}>="${today}"))))`;
  } else {
    filterByFormula = `{active}=TRUE()`;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'label', direction: 'asc' }],
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

  const { label, amount } = body;
  if (!label || amount === undefined) return errorResponse('label and amount are required');

  const fields = {
    label,
    amount: Number(amount),
    active: body.active !== undefined ? body.active : true
  };

  if (body.category_id) {
    fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
  }
  if (body.period) fields.period = body.period;
  if (body.start_date) fields.start_date = body.start_date;
  if (body.end_date) fields.end_date = body.end_date;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
