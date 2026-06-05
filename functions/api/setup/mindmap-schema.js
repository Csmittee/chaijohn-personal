import { jsonResponse, errorResponse } from '../../_airtable.js';

const META    = 'https://api.airtable.com/v0/meta/bases';
const BASE_ID = 'apphBGWfSPL45oSFd';
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

export async function onRequestGet(context) {
  const { env } = context;
  const key     = env.AIRTABLE_API_KEY;

  const existing = await getTableIds(key);

  const results = {};

  if (!existing['MindMapNodes']) {
    await delay(200);
    results.nodes = await createTable(key, {
      name: 'MindMapNodes',
      fields: [
        { name: 'label',       type: 'singleLineText' },
        { name: 'node_type',   type: 'singleSelect', options: { choices: [
          { name: 'Business' }, { name: 'Project' }, { name: 'Tool' },
          { name: 'People' }, { name: 'Skill' }, { name: 'Resource' }, { name: 'Idea' }
        ] } },
        { name: 'description', type: 'multilineText' },
        { name: 'tags',        type: 'singleLineText' },
        { name: 'context',     type: 'multilineText' },
        { name: 'status',      type: 'singleSelect', options: { choices: [
          { name: 'Active' }, { name: 'Paused' }, { name: 'Archived' }, { name: 'Idea' }
        ] } },
        { name: 'url',         type: 'singleLineText' }
      ]
    });
  } else {
    results.nodes = { status: 'already_exists', name: 'MindMapNodes' };
  }

  await delay(200);

  if (!existing['MindMapEdges']) {
    results.edges = await createTable(key, {
      name: 'MindMapEdges',
      fields: [
        { name: 'from_id',   type: 'singleLineText' },
        { name: 'to_id',     type: 'singleLineText' },
        { name: 'edge_type', type: 'singleSelect', options: { choices: [
          { name: 'uses' }, { name: 'funds' }, { name: 'spawned' },
          { name: 'inspired_by' }, { name: 'requires' }, { name: 'knows' },
          { name: 'failed_to' }, { name: 'led_to' }, { name: 'supports' }, { name: 'enables' }
        ] } },
        { name: 'label',    type: 'singleLineText' },
        { name: 'strength', type: 'number', options: { precision: 0 } }
      ]
    });
  } else {
    results.edges = { status: 'already_exists', name: 'MindMapEdges' };
  }

  const hasError = Object.values(results).some(r => r.status === 'error');
  if (hasError) return errorResponse(JSON.stringify(results), 500);

  const created = Object.values(results).some(r => r.status === 'created');
  return jsonResponse({ status: 'ok', created, results });
}
