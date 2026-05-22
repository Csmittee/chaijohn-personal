import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Liabilities';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === 'true';

  let filterByFormula;
  if (!all) {
    filterByFormula = `{active}=TRUE()`;
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

  const { name } = body;
  if (!name) return errorResponse('name is required');

  const fields = {
    name,
    active: body.active !== undefined ? body.active : true
  };

  if (body.creditor_type) fields.creditor_type = body.creditor_type;
  if (body.loan_size !== undefined) fields.loan_size = Number(body.loan_size);
  if (body.current_balance !== undefined) fields.current_balance = Number(body.current_balance);
  if (body.interest_rate !== undefined) fields.interest_rate = Number(body.interest_rate);
  if (body.monthly_payment !== undefined) fields.monthly_payment = Number(body.monthly_payment);
  if (body.start_date) fields.start_date = body.start_date;
  if (body.notes) fields.notes = body.notes;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
