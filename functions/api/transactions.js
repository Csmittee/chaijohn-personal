import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'Transactions';
const META_BASE = 'https://api.airtable.com/v0/meta/bases';

// Required source values — kept in sync with all callers
const REQUIRED_SOURCE_VALUES = [
  'Manual', 'LiabilityPayment', 'M2.2', 'presale', 'cash_in',
  'hard_asset_sale', 'project_funding', 'collection'
];

// Patched once per cold start so the first POST isn't blocked by 422
let sourceFieldPatched = false;

async function patchSourceOptions(apiKey) {
  if (sourceFieldPatched) return;
  sourceFieldPatched = true; // optimistic — don't retry on every POST even if it fails
  try {
    const tablesRes = await fetch(`${META_BASE}/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!tablesRes.ok) return;
    const { tables } = await tablesRes.json();
    const txTable = tables.find(t => t.name === TABLE);
    if (!txTable) return;
    const srcField = txTable.fields.find(f => f.name === 'source');
    if (!srcField || srcField.type !== 'singleSelect') return;

    const existingNames = new Set((srcField.options?.choices || []).map(c => c.name));
    const toAdd = REQUIRED_SOURCE_VALUES.filter(v => !existingNames.has(v));
    if (toAdd.length === 0) return;

    const allChoices = [
      ...(srcField.options?.choices || []),
      ...toAdd.map(name => ({ name }))
    ];

    await fetch(`${META_BASE}/${BASE_ID}/tables/${txTable.id}/fields/${srcField.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: { choices: allChoices } })
    });
  } catch (e) {
    // Non-fatal — the save will still be attempted
    console.warn('patchSourceOptions failed:', e.message);
  }
}

function linkedId(field) {
  if (!field) return null;
  return Array.isArray(field) ? (field[0] || null) : field;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const params = url.searchParams;

  const type      = params.get('type');
  const category  = params.get('category');
  const start     = params.get('start');
  const end       = params.get('end');
  const source    = params.get('source');
  const projectId = params.get('project_id');
  const limit     = parseInt(params.get('limit') || '200', 10);

  const filters = [];
  if (type)      filters.push(`{type}='${type}'`);
  if (category)  filters.push(`{category_id}='${category}'`);
  if (start)     filters.push(`NOT(IS_BEFORE({date}, '${start}'))`);
  if (end)       filters.push(`IS_BEFORE({date}, '${end}')`);
  if (source)    filters.push(`{source}='${source}'`);
  if (projectId) filters.push(`{project_id}='${projectId}'`);

  // M2.3 Expense view: exclude project_funding (it hits Cashflow only, not Expense panel)
  if (type === 'Expense' && !source) {
    filters.push(`NOT({source}='project_funding')`);
  }

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
      const fields      = { ...r.fields };
      const budgetId    = linkedId(fields.budget_id);
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

  // Expense transactions require budget_id, except for LiabilityPayment and project_funding
  if (type === 'Expense' && !body.budget_id
      && body.source !== 'LiabilityPayment'
      && body.source !== 'project_funding') {
    return errorResponse('budget_id is required for Expense transactions');
  }

  // Ensure source singleSelect field has all required options (once per cold start)
  await patchSourceOptions(env.AIRTABLE_API_KEY);

  const fields = {
    date,
    type,
    amount: Number(amount),
    source: body.source || 'Manual'
  };

  if (body.entity)         fields.entity         = body.entity;
  if (body.description)    fields.description    = body.description;
  if (body.note)           fields.note           = body.note;
  if (body.fixed_variable) fields.fixed_variable = body.fixed_variable;
  if (body.period)         fields.period         = body.period;

  // budget_id for expense; category_id for earn/income only
  if (body.budget_id) {
    fields.budget_id = Array.isArray(body.budget_id) ? body.budget_id : [body.budget_id];
  }
  if (body.category_id && type !== 'Expense') {
    fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
  }
  if (body.project_id) fields.project_id = body.project_id;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
