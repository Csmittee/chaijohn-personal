import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Categories';
const KV_KEY = 'categories_all_v1';
const KV_TTL = 3600; // 1 hour — categories are near-static

async function resolveOrCreateGroup(apiKey, groupInput) {
  let choices = [];
  let tableId, fieldId;
  try {
    const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const table = (meta.tables || []).find(t => t.name === TABLE);
      if (table) {
        tableId = table.id;
        const groupField = (table.fields || []).find(f => f.name === 'group');
        if (groupField?.options?.choices) {
          choices = groupField.options.choices;
          fieldId = groupField.id;
        }
      }
    }
  } catch { /* fall through */ }

  const match = choices.find(c => c.name.toLowerCase() === groupInput.toLowerCase());
  if (match) return match.name;

  if (tableId && fieldId) {
    try {
      await fetch(
        `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${tableId}/fields/${fieldId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            options: {
              choices: [
                ...choices.map(c => ({ id: c.id, name: c.name })),
                { name: groupInput }
              ]
            }
          })
        }
      );
    } catch { /* typecast:true fallback */ }
  }

  return groupInput;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const group = url.searchParams.get('group');
  const activeOnly = url.searchParams.get('active') !== 'false';
  const refresh = url.searchParams.get('refresh') === '1';

  // Cache only the default unfiltered active list (no type/group filters)
  const canCache = !type && !group && activeOnly;

  if (canCache && !refresh && env.CHAIJOHN_KV) {
    try {
      const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
      if (cached) return jsonResponse({ records: cached, cached: true });
    } catch { /* KV miss — fall through */ }
  }

  const filters = [];
  if (activeOnly) filters.push(`{active}=TRUE()`);
  if (type) filters.push(`{type}='${type}'`);
  if (group) filters.push(`{group}='${group}'`);

  const filterByFormula = filters.length === 0
    ? undefined
    : filters.length === 1 ? filters[0] : `AND(${filters.join(', ')})`;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [
        { field: 'group', direction: 'asc' },
        { field: 'name', direction: 'asc' }
      ],
      maxRecords: 500
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

  const { name, type } = body;
  if (!name || !type) return errorResponse('name and type are required');

  const validTypes = ['Earn', 'Expense', 'Loan', 'Investment'];
  if (!validTypes.includes(type)) return errorResponse(`type must be one of: ${validTypes.join(', ')}`);

  try {
    const existing = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula: `LOWER({name})="${name.toLowerCase().replace(/"/g, '\\"')}"`,
      maxRecords: 1
    });
    if (existing.records.length > 0) {
      return errorResponse(`Category "${name}" already exists`);
    }
  } catch { /* non-fatal */ }

  const fields = {
    name,
    type,
    active: body.active !== undefined ? body.active : true
  };

  if (body.group) fields.group = await resolveOrCreateGroup(env.AIRTABLE_API_KEY, body.group);
  if (body.expense_type) fields.expense_type = body.expense_type;
  if (body.is_business !== undefined) fields.is_business = Boolean(body.is_business);
  if (body.cash_flow) fields.cash_flow = body.cash_flow;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields, { typecast: true });
    if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
