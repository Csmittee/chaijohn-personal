import { listRecords, createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Categories';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // Income | Expense

  let filterByFormula;
  if (type) {
    filterByFormula = `{type}='${type}'`;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'name', direction: 'asc' }]
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

  const { name, type } = body;
  if (!name || !type) {
    return errorResponse('name and type are required');
  }
  if (!['Income', 'Expense'].includes(type)) {
    return errorResponse('type must be Income or Expense');
  }

  const fields = {
    name,
    type,
    active: body.active !== undefined ? body.active : true
  };

  if (body.fixed_variable) fields.fixed_variable = body.fixed_variable;
  if (body.budget_limit_monthly !== undefined) fields.budget_limit_monthly = Number(body.budget_limit_monthly);
  if (body.period) fields.period = body.period;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
