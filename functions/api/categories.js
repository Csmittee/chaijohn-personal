import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Categories';

async function ensureGroupChoice(apiKey, groupValue) {
  try {
    const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    const table = (meta.tables || []).find(t => t.name === TABLE);
    if (!table) return;
    const groupField = (table.fields || []).find(f => f.name === 'group');
    if (!groupField || !groupField.options) return;
    const existingChoices = groupField.options.choices || [];
    const alreadyExists = existingChoices.some(
      c => c.name.toLowerCase() === groupValue.toLowerCase()
    );
    if (alreadyExists) return;
    await fetch(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${table.id}/fields/${groupField.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: {
            choices: [
              ...existingChoices.map(c => ({ id: c.id, name: c.name, color: c.color })),
              { name: groupValue }
            ]
          }
        })
      }
    );
  } catch { /* best-effort */ }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const group = url.searchParams.get('group');
  const activeOnly = url.searchParams.get('active') !== 'false';

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

  if (body.group) {
    await ensureGroupChoice(env.AIRTABLE_API_KEY, body.group);
  }

  const fields = {
    name,
    type,
    active: body.active !== undefined ? body.active : true
  };

  if (body.group) fields.group = body.group;
  if (body.expense_type) fields.expense_type = body.expense_type;
  if (body.is_business !== undefined) fields.is_business = Boolean(body.is_business);
  if (body.cash_flow) fields.cash_flow = body.cash_flow;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
