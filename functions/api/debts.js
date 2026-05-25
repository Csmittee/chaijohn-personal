import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Debts';

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
      sort: [{ field: 'creditor_name', direction: 'asc' }]
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

  const { creditor_name } = body;
  if (!creditor_name) return errorResponse('creditor_name is required');

  const fields = {
    creditor_name,
    active: body.active !== undefined ? body.active : true
  };

  if (body.creditor_type) fields.creditor_type = body.creditor_type;
  if (body.original_amount !== undefined) fields.original_amount = Number(body.original_amount);
  if (body.current_balance !== undefined) fields.current_balance = Number(body.current_balance);
  if (body.interest_rate !== undefined) fields.interest_rate = Number(body.interest_rate);
  if (body.monthly_payment !== undefined) fields.monthly_payment = Number(body.monthly_payment);
  if (body.due_date) fields.due_date = body.due_date;
  if (body.last_payment_date) fields.last_payment_date = body.last_payment_date;
  if (body.notes) fields.notes = body.notes;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);

    // F2: loan received = cash IN — create Income transaction (non-fatal)
    const loanSize = Number(body.original_amount || 0);
    if (loanSize > 0) {
      try {
        await createRecord(env.AIRTABLE_API_KEY, BASE_ID, 'Transactions', {
          date: new Date().toISOString().split('T')[0],
          type: 'Income',
          amount: loanSize,
          entity: creditor_name,
          description: `Loan received — ${creditor_name}`,
          source: 'LiabilityCreation'
        });
      } catch (e) {
        console.error('Failed to create income tx for debt:', e.message);
      }
    }

    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
