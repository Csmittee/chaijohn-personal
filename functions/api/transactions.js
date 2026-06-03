import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'Transactions';
const KV_TTL  = 300; // 5 minutes

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
  const refresh   = params.get('refresh') === '1';

  // Bust counter — read once upfront for cache key construction
  const bust = env.CHAIJOHN_KV
    ? ((await env.CHAIJOHN_KV.get('tx:bust', { type: 'text' }).catch(() => null)) || '0')
    : '0';

  // Cache only unfiltered date-range requests (no type/source/project/category filters)
  const canCache = !type && !source && !projectId && !category;
  const period   = start || 'all';
  const KV_KEY   = `tx:${period}:${bust}`;

  if (canCache && !refresh && env.CHAIJOHN_KV) {
    try {
      const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
      if (cached) return jsonResponse({ records: cached, cached: true });
    } catch { /* KV miss — fall through */ }
  }

  const filters = [];
  if (type)      filters.push(`{type}='${type}'`);
  if (category)  filters.push(`{category_id}='${category}'`);
  if (start)     filters.push(`NOT(IS_BEFORE({date}, '${start}'))`);
  if (end)       filters.push(`IS_BEFORE({date}, '${end}')`);
  if (source)    filters.push(`{source}='${source}'`);
  if (projectId) filters.push(`{project_id}='${projectId}'`);

  if (type === 'Expense' && !source) {
    filters.push(`NOT({budget_id}='')`);
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
      if (canCache && env.CHAIJOHN_KV) {
        await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(records), { expirationTtl: KV_TTL }).catch(() => {});
      }
      return jsonResponse({ records });
    }

    // KV-first lookup for budgets and categories — reduces 3 Airtable calls to 1 on warm cache
    const [budgetsCached, catsCached] = await Promise.all([
      env.CHAIJOHN_KV?.get('budgets_all_v1', { type: 'json' }).catch(() => null) ?? null,
      env.CHAIJOHN_KV?.get('categories_all_v1', { type: 'json' }).catch(() => null) ?? null
    ]);

    const [budgetRes, catRes] = await Promise.allSettled([
      hasBudgetLinks && !budgetsCached
        ? listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Budgets', { maxRecords: 500 })
        : Promise.resolve({ records: budgetsCached || [] }),
      !catsCached
        ? listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Categories', { maxRecords: 500 })
        : Promise.resolve({ records: catsCached })
    ]);

    const budgetMap = {};
    const catMap    = {};

    if (budgetRes.status === 'fulfilled') {
      const recs = Array.isArray(budgetRes.value.records) ? budgetRes.value.records : budgetsCached || [];
      recs.forEach(r => { budgetMap[r.id] = r.fields; });
    }
    if (catRes.status === 'fulfilled') {
      const recs = Array.isArray(catRes.value.records) ? catRes.value.records : catsCached || [];
      recs.forEach(r => { catMap[r.id] = r.fields; });
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

    if (canCache && env.CHAIJOHN_KV) {
      await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(enriched), { expirationTtl: KV_TTL }).catch(() => {});
    }

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

  if (type === 'Expense' && (!body.source || body.source === 'Manual') && !body.budget_id) {
    return errorResponse('budget_id is required for personal expense transactions');
  }

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

  if (body.budget_id) {
    fields.budget_id = Array.isArray(body.budget_id) ? body.budget_id : [body.budget_id];
  }
  if (body.project_id) fields.project_id = body.project_id;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    // Increment bust counter — old tx:* cache entries expire by TTL naturally (no list+delete needed)
    if (env.CHAIJOHN_KV) {
      const cur = parseInt(await env.CHAIJOHN_KV.get('tx:bust', { type: 'text' }).catch(() => '0')) || 0;
      await env.CHAIJOHN_KV.put('tx:bust', String(cur + 1), { expirationTtl: 86400 }).catch(() => {});
    }
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
