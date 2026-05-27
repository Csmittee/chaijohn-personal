import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Budgets';

function linkedId(field) {
  if (!field) return null;
  return Array.isArray(field) ? (field[0] || null) : field;
}

async function enrichWithCategories(apiKey, records) {
  if (records.length === 0) return records;
  try {
    const catData = await listRecords(apiKey, BASE_ID, 'Categories', { maxRecords: 500 });
    const catMap = {};
    catData.records.forEach(r => { catMap[r.id] = r.fields; });

    return records.map(r => {
      const fields = { ...r.fields };
      const catId  = linkedId(fields.category_id);
      if (catId && catMap[catId]) {
        fields.category_name  = catMap[catId].name  || null;
        fields.category_group = catMap[catId].group || null;
        fields.category_type  = catMap[catId].type  || null;
      }
      return { ...r, fields };
    });
  } catch {
    return records;
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const all         = url.searchParams.get('all')          === 'true';
  const activeOnly  = url.searchParams.get('active_only')  === 'true';
  const expenseOnly = url.searchParams.get('expense_only') === 'true';

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

    // G2: enrich with category_name, category_group, category_type
    let records = await enrichWithCategories(env.AIRTABLE_API_KEY, data.records);

    // G2: filter to expense categories only when requested
    if (expenseOnly) {
      records = records.filter(r => r.fields.category_type === 'Expense');
    }

    return jsonResponse({ records });
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

  const catId = body.category_id
    ? (Array.isArray(body.category_id) ? body.category_id[0] : body.category_id)
    : null;

  // G5: check for duplicate label + same category
  if (catId) {
    try {
      const existing = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
        filterByFormula: `{label}="${label.replace(/"/g, '\\"')}"`,
        maxRecords: 20
      });
      const duplicate = existing.records.some(r => {
        const existCatId  = linkedId(r.fields.category_id);
        const existPeriod = r.fields.period || 'Monthly';
        const newPeriod   = body.period || 'Monthly';
        return existCatId === catId && existPeriod === newPeriod;
      });
      if (duplicate) {
        return errorResponse('Budget label already exists for this item with the same period');
      }
    } catch { /* non-fatal — allow creation if check fails */ }
  }

  const fields = {
    label,
    amount: Number(amount),
    active: body.active !== undefined ? body.active : true
  };

  if (catId) fields.category_id = [catId];
  if (body.period)     fields.period     = body.period;
  if (body.start_date) fields.start_date = body.start_date;
  if (body.end_date)   fields.end_date   = body.end_date;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
