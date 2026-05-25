import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Transactions';

function linkedId(field) {
  if (!field) return null;
  return Array.isArray(field) ? (field[0] || null) : field;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const params = url.searchParams;

  const type     = params.get('type');
  const category = params.get('category');
  const start    = params.get('start');
  const end      = params.get('end');
  const limit    = parseInt(params.get('limit') || '200', 10);

  const filters = [];
  if (type) filters.push(`{type}='${type}'`);
  if (category) filters.push(`{category_id}='${category}'`);
  if (start) filters.push(`NOT(IS_BEFORE({date}, '${start}'))`);
  if (end) filters.push(`IS_BEFORE({date}, '${end}')`);

  const filterByFormula = filters.length === 0
    ? undefined
    : filters.length === 1 ? filters[0] : `AND(${filters.join(', ')})`;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: Math.min(limit, 500)
    });

    const records = data.records;
    const hasBudgetLinks = records.some(r => linkedId(r.fields.budget_id));
    const hasCatLinks    = records.some(r => linkedId(r.fields.category_id));

    if (!hasBudgetLinks && !hasCatLinks) {
      return jsonResponse({ records });
    }

    // Fetch budgets and categories in parallel for enrichment
    const [budgetRes, catRes] = await Promise.allSettled([
      hasBudgetLinks
        ? listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Budgets', { maxRecords: 500 })
        : Promise.resolve({ records: [] }),
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Categories', { maxRecords: 500 })
    ]);

    const budgetMap = {};
    const catMap    = {};

    if (budgetRes.status === 'fulfilled') {
      budgetRes.value.records.forEach(r => { budgetMap[r.id] = r.fields; });
    }
    if (catRes.status === 'fulfilled') {
      catRes.value.records.forEach(r => { catMap[r.id] = r.fields; });
    }

    const enriched = records.map(r => {
      const fields     = { ...r.fields };
      const budgetId   = linkedId(fields.budget_id);
      const legacyCatId = linkedId(fields.category_id);

      if (budgetId && budgetMap[budgetId]) {
        const budget = budgetMap[budgetId];
        fields.budget_label = budget.label || null;
        const budCatId = linkedId(budget.category_id);
        if (budCatId && catMap[budCatId]) {
          fields.category_name  = catMap[budCatId].name  || null;
          fields.category_group = catMap[budCatId].group || null;
        }
      } else if (legacyCatId && catMap[legacyCatId]) {
        fields.category_name  = catMap[legacyCatId].name  || null;
        fields.category_group = catMap[legacyCatId].group || null;
        fields.legacy = true;
      }

      return { ...r, fields };
    });

    return jsonResponse({ records: enriched });
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

  // G1: Expense transactions require budget_id
  if (type === 'Expense' && !body.budget_id && body.source !== 'LiabilityPayment') {
    return errorResponse('budget_id is required for Expense transactions');
  }

  const fields = {
    date,
    type,
    amount: Number(amount),
    source: body.source || 'Manual'
  };

  if (body.entity)        fields.entity        = body.entity;
  if (body.description)   fields.description   = body.description;
  if (body.note)          fields.note          = body.note;
  if (body.fixed_variable) fields.fixed_variable = body.fixed_variable;
  if (body.period)        fields.period        = body.period;

  // G1: budget_id for expense; category_id only for earn/income (legacy field)
  if (body.budget_id) {
    fields.budget_id = Array.isArray(body.budget_id) ? body.budget_id : [body.budget_id];
  }
  if (body.category_id && type !== 'Expense') {
    fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
