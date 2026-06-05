import { jsonResponse, errorResponse } from '../../_airtable.js';

const META    = 'https://api.airtable.com/v0/meta/bases';
const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'DailyItems';
const delay   = ms => new Promise(r => setTimeout(r, ms));

async function getTableIds(apiKey) {
  const res = await fetch(`${META}/${BASE_ID}/tables`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries((data.tables || []).map(t => [t.name, t.id]));
}

async function createTable(apiKey, def) {
  const res = await fetch(`${META}/${BASE_ID}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(def)
  });
  if (res.status === 422 || res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const msg  = (body?.error?.message || body?.message || '').toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate') || res.status === 409)
      return { status: 'already_exists', name: def.name };
    return { status: 'error', name: def.name, error: JSON.stringify(body) };
  }
  if (!res.ok) return { status: 'error', name: def.name, error: await res.text() };
  const data = await res.json();
  return { status: 'created', name: def.name, id: data.id };
}

// Add a field to an existing table — 422 means already exists (treat as ok)
async function addFieldIfMissing(apiKey, tableId, fieldDef) {
  const res = await fetch(`${META}/${BASE_ID}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fieldDef)
  });
  return res.status === 422 || res.ok;
}

export async function onRequestGet(context) {
  const { env } = context;
  const key     = env.AIRTABLE_API_KEY;

  const existing = await getTableIds(key);

  if (existing[TABLE]) {
    const tableId = existing[TABLE];
    // Add end_time field if not present (F4 — safe to call multiple times, 422 = already exists)
    const added = await addFieldIfMissing(key, tableId, { name: 'end_time', type: 'singleLineText' });
    return jsonResponse({ status: 'exists', tableId, field_added: added });
  }

  const result = await createTable(key, {
    name: TABLE,
    fields: [
      { name: 'title',            type: 'singleLineText' },
      { name: 'pane',             type: 'singleSelect',  options: { choices: [{ name: 'Do' }, { name: 'Follow' }, { name: 'BuyPay' }, { name: 'Schedule' }] } },
      { name: 'amount',           type: 'number',        options: { precision: 2 } },
      { name: 'force',            type: 'checkbox',      options: { color: 'redBright',   icon: 'check' } },
      { name: 'high_impact',      type: 'checkbox',      options: { color: 'redBright',   icon: 'check' } },
      { name: 'done',             type: 'checkbox',      options: { color: 'greenBright', icon: 'check' } },
      { name: 'done_at',          type: 'date',          options: { dateFormat: { name: 'iso' } } },
      { name: 'date',             type: 'date',          options: { dateFormat: { name: 'iso' } } },
      { name: 'budget_id',        type: 'singleLineText' },
      { name: 'schedule_time',    type: 'singleLineText' },
      { name: 'end_time',         type: 'singleLineText' },
      { name: 'schedule_type',    type: 'singleSelect',  options: { choices: [{ name: 'Routine' }, { name: 'General' }] } },
      { name: 'source',           type: 'singleSelect',  options: { choices: [{ name: 'manual' }, { name: 'project' }] } },
      { name: 'project_task_id',  type: 'singleLineText' },
      { name: 'project_id',       type: 'singleLineText' },
      { name: 'project_name',     type: 'singleLineText' },
      { name: 'booked',           type: 'checkbox',      options: { color: 'blueBright',  icon: 'check' } }
    ]
  });

  await delay(200);

  if (result.status === 'error') return errorResponse(result.error, 500);

  return jsonResponse({ status: 'ok', created: true, result });
}
