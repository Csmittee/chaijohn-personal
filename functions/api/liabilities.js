import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Liabilities';
const TX_TABLE = 'Transactions';
const CAT_TABLE = 'Categories';

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
  if (body.interest_rate !== undefined) fields.interest_rate = Number(body.interest_rate);
  if (body.monthly_payment !== undefined) fields.monthly_payment = Number(body.monthly_payment);
  if (body.start_date) fields.start_date = body.start_date;
  if (body.notes) fields.notes = body.notes;

  // Default current_balance to loan_size — a new loan starts fully outstanding
  const loanAmt = Number(body.loan_size || 0);
  if (body.current_balance !== undefined && body.current_balance !== null && body.current_balance !== '') {
    fields.current_balance = Number(body.current_balance);
  } else {
    fields.current_balance = loanAmt;
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);

    // E3: loan received = cash IN — create Income transaction (non-fatal)
    const loanSize = Number(body.loan_size || 0);
    if (loanSize > 0) {
      try {
        const catRes = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, CAT_TABLE, {
          filterByFormula: `AND({active}=TRUE(),{type}='Loan')`,
          maxRecords: 1
        });
        const loanCatId = catRes.records?.[0]?.id || null;
        const txFields = {
          date: new Date().toISOString().split('T')[0],
          amount: loanSize,
          type: 'Income',
          entity: name,
          description: `Loan received — ${name}`,
          source: 'LiabilityPayment'
        };
        if (loanCatId) txFields.category_id = [loanCatId];
        await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, txFields);
      } catch { /* non-fatal */ }
    }

    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
