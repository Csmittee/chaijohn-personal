import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Categories';

async function resolveOrCreateGroup(apiKey, groupInput) {
  // Step 1: fetch categories schema to get current choices with their IDs
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

  // Step 2: case-insensitive match against existing choices
  const match = choices.find(c => c.name.toLowerCase() === groupInput.toLowerCase());
  if (match) return match.name; // return the correctly-cased existing value

  // Step 3: truly new group — add it via Meta API (requires schema.bases:write)
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
                ...choices.map(c => ({ id: c.id, name: c.name })), // existing choices MUST include id
                { name: groupInput }                                  // new choice has no id
              ]
            }
          })
        }
      );
    } catch { /* if Meta API fails, typecast:true on record create is the fallback */ }
  }

  return groupInput;
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

  // Duplicate name check — category names must be unique
  try {
    const existing = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula: `LOWER({name})="${name.toLowerCase().replace(/"/g, '\\"')}"`,
      maxRecords: 1
    });
    if (existing.records.length > 0) {
      return errorResponse(`Category "${name}" already exists`);
    }
  } catch { /* non-fatal — allow creation if check fails */ }

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
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
