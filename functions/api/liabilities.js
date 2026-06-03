import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Liabilities';
const TX_TABLE = 'Transactions';
const CAT_TABLE = 'Categories';
const KV_KEY = 'liabilities_all_v1';
const KV_TTL = 1800; // 30 minutes — liabilities change rarely

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === 'true';
  const refresh = url.searchParams.get('refresh') === '1';

  // Cache only the full unfiltered list
  const canCache = all;

  if (canCache && !refresh && env.CHAIJOHN_KV) {
    try {
      const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
      if (cached) return jsonResponse({ records: cached, cached: true });
    } catch { /* KV miss — fall through */ }
  }

  let filterByFormula;
  if (!all) {
    filterByFormula = `{active}=TRUE()`;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'name', direction: 'asc' }]
    });

    if (canCache && env.CHAIJOHN_KV) {
      await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(data.records), { expirationTtl: KV_TTL }).catch(() => {});
    }

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
  if (body.payment_due_day !== undefined) fields.payment_due_day = Number(body.payment_due_day);
  if (body.start_date) fields.start_date = body.start_date;
  if (body.notes) fields.notes = body.notes;

  const loanAmt = Number(body.loan_size || 0);
  if (body.current_balance !== undefined && body.current_balance !== null && body.current_balance !== '') {
    fields.current_balance = Number(body.current_balance);
  } else {
    fields.current_balance = loanAmt;
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);

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

    if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
