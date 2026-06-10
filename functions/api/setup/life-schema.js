import { createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

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

async function countRecords(apiKey, tableId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${tableId}?maxRecords=1&fields%5B%5D=year`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return (data.records || []).length;
}

async function seedYears(apiKey, env) {
  const years = [];
  for (let y = 1972; y <= 2037; y++) years.push(y);

  // Airtable batch create: max 10 per call
  let seeded = 0;
  for (let i = 0; i < years.length; i += 10) {
    const batch = years.slice(i, i + 10).map(y => ({
      fields: { name: String(y), year: y }
    }));
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/LifeTimeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch })
    });
    if (res.ok) {
      const data = await res.json();
      seeded += (data.records || []).length;
    }
    if (i + 10 < years.length) await delay(250);
  }
  return seeded;
}

export async function onRequestGet(context) {
  const { env } = context;
  const key     = env.AIRTABLE_API_KEY;

  const existing = await getTableIds(key);

  if (existing['LifeTimeline']) {
    // Check if already seeded
    const count = await countRecords(key, existing['LifeTimeline']);
    if (count > 0) {
      return jsonResponse({ status: 'ok', created: false, seeded: 0, message: 'already_exists' });
    }
    // Table exists but empty — seed it
    const seeded = await seedYears(key, env);
    return jsonResponse({ status: 'ok', created: false, seeded });
  }

  // Create table
  await delay(200);
  const result = await createTable(key, {
    name: 'LifeTimeline',
    fields: [
      { name: 'name',             type: 'singleLineText' },
      { name: 'year',             type: 'number',         options: { precision: 0 } },
      { name: 'month',            type: 'number',         options: { precision: 0 } },
      { name: 'location',         type: 'singleLineText' },
      { name: 'financial_earn',   type: 'number',         options: { precision: 0 } },
      { name: 'knowledge_earn',   type: 'number',         options: { precision: 0 } },
      { name: 'happiness_factor', type: 'number',         options: { precision: 0 } },
      { name: 'health',           type: 'number',         options: { precision: 0 } },
      { name: 'relationship',     type: 'number',         options: { precision: 0 } },
      { name: 'creation',         type: 'number',         options: { precision: 0 } },
      { name: 'achievement',      type: 'number',         options: { precision: 0 } },
      { name: 'a_impact',         type: 'number',         options: { precision: 0 } },
      { name: 'failure',          type: 'number',         options: { precision: 0 } },
      { name: 'f_impact',         type: 'number',         options: { precision: 0 } },
      { name: 'travel',           type: 'number',         options: { precision: 0 } },
      { name: 't_impact',         type: 'number',         options: { precision: 0 } },
      { name: 'hobby',            type: 'number',         options: { precision: 0 } },
      { name: 'h_impact',         type: 'number',         options: { precision: 0 } },
      { name: 'decision',         type: 'multilineText' },
      { name: 'tags',             type: 'singleLineText' },
      { name: 'story',            type: 'multilineText' },
      { name: 'people',           type: 'singleLineText' }
    ]
  });

  if (result.status === 'error') {
    return errorResponse(JSON.stringify(result), 500);
  }

  await delay(500);
  const seeded = await seedYears(key, env);

  return jsonResponse({ status: 'ok', created: true, seeded });
}
