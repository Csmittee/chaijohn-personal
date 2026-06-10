import { jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'LifeTimeline';

function flat(r) {
  return {
    id:               r.id,
    name:             r.fields.name             || null,
    year:             r.fields.year             || null,
    month:            r.fields.month            || null,
    location:         r.fields.location         || null,
    financial_earn:   r.fields.financial_earn   || null,
    knowledge_earn:   r.fields.knowledge_earn   || null,
    happiness_factor: r.fields.happiness_factor || null,
    health:           r.fields.health           || null,
    relationship:     r.fields.relationship     || null,
    creation:         r.fields.creation         || null,
    achievement:      r.fields.achievement      || null,
    a_impact:         r.fields.a_impact         || null,
    failure:          r.fields.failure          || null,
    f_impact:         r.fields.f_impact         || null,
    travel:           r.fields.travel           || null,
    t_impact:         r.fields.t_impact         || null,
    hobby:            r.fields.hobby            || null,
    h_impact:         r.fields.h_impact         || null,
    decision:         r.fields.decision         || null,
    tags:             r.fields.tags             || null,
    story:            r.fields.story            || null,
    people:           r.fields.people           || null,
  };
}

const NUM_FIELDS  = [
  'year','month','financial_earn','knowledge_earn','happiness_factor','health',
  'relationship','creation','achievement','a_impact','failure','f_impact',
  'travel','t_impact','hobby','h_impact'
];
const TEXT_FIELDS = ['name','location','decision','tags','story','people'];

function buildFields(raw) {
  const fields = {};
  for (const f of NUM_FIELDS)  if (raw[f] != null) fields[f] = Number(raw[f]);
  for (const f of TEXT_FIELDS) if (raw[f] != null) fields[f] = raw[f];
  return fields;
}

// POST /api/life-timeline/batch
// body: { updates: [ { id, fields: {} } ] }
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { updates } = body;
  if (!Array.isArray(updates) || updates.length === 0) return errorResponse('updates array is required');
  if (updates.length > 10) return errorResponse('Maximum 10 updates per batch');

  const apiKey = env.AIRTABLE_API_KEY;
  const records = updates.map(u => ({
    id:     u.id,
    fields: buildFields(u.fields || {})
  })).filter(u => u.id && Object.keys(u.fields).length > 0);

  if (records.length === 0) return jsonResponse({ saved: 0, errors: [] });

  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records })
  });

  if (!res.ok) {
    const err = await res.text();
    return errorResponse(err, res.status);
  }

  const data = await res.json();
  return jsonResponse({ saved: (data.records || []).length, errors: [] });
}
