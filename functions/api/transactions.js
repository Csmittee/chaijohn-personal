import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Transactions';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const params = url.searchParams;

  const type = params.get('type');       // Income | Expense
  const category = params.get('category');
  const start = params.get('start');     // YYYY-MM-DD
  const end = params.get('end');         // YYYY-MM-DD
  const limit = parseInt(params.get('limit') || '200', 10);

  const filters = [];
  if (type) filters.push(`{type}='${type}'`);
  if (category) filters.push(`{category_id}='${category}'`);
  if (start) filters.push(`NOT(IS_BEFORE({date}, '${start}'))`);
  if (end) filters.push(`IS_BEFORE({date}, '${end}')`);

  const filterByFormula = filters.length === 0
    ? undefined
    : filters.length === 1
      ? filters[0]
      : `AND(${filters.join(', ')})`;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: Math.min(limit, 500)
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

  const { amount, type, date } = body;
  if (!amount || !type || !date) {
    return errorResponse('amount, type, and date are required');
  }
  if (!['Income', 'Expense'].includes(type)) {
    return errorResponse('type must be Income or Expense');
  }

  const fields = {
    date,
    type,
    amount: Number(amount),
    source: body.source || 'Manual'
  };

  if (body.entity) fields.entity = body.entity;
  if (body.description) fields.description = body.description;
  if (body.note) fields.note = body.note;
  if (body.fixed_variable) fields.fixed_variable = body.fixed_variable;
  if (body.period) fields.period = body.period;
  if (body.category_id) {
    // category_id is a linked record field — pass as array
    fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
