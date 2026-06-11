import { updateRecord, deleteRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'LifeTimeline';
const META    = 'https://api.airtable.com/v0/meta/bases';

// Returns true if story_refs field confirmed to exist (or was just created).
// Returns false if Meta API unavailable — caller degrades gracefully.
async function ensureStoryRefsField(apiKey) {
  try {
    const res = await fetch(`${META}/${BASE_ID}/tables`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return false;
    const data  = await res.json();
    const table = (data.tables || []).find(t => t.name === TABLE);
    if (!table) return false;
    const exists = (table.fields || []).some(f => f.name === 'story_refs');
    if (exists) return true;
    const cr = await fetch(`${META}/${BASE_ID}/tables/${table.id}/fields`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'story_refs', type: 'singleLineText' })
    });
    return cr.ok;
  } catch (_) { return false; }
}

function flat(r) {
  return {
    id:               r.id,
    name:             r.fields.name             || null,
    year:             r.fields.year             || null,
    month:            r.fields.month            || null,
    age:              r.fields.age              || null,
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
    note:             r.fields.note             || null,
    people:           r.fields.people           || null,
    story_refs:       r.fields.story_refs       || null,
    'company-school': r.fields['company-school'] || null,
    title:            r.fields.title            || null,
  };
}

// PATCH /api/life-timeline/:id
export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const id = params.id;
  if (!id) return errorResponse('id is required');

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const fields = {};

  // Definitive field schema — L204 in RULES.md
  const numFields = ['year', 'month', 'age', 'financial_earn', 'happiness_factor', 'health'];
  // story_refs excluded — handled separately below
  const textFields = [
    'name', 'location', 'knowledge_earn', 'relationship', 'creation',
    'achievement', 'failure', 'travel', 'hobby', 'tags', 'people',
    'company-school', 'title'
  ];
  const longTextFields = ['a_impact', 'f_impact', 't_impact', 'h_impact', 'decision', 'note'];

  for (const f of numFields) {
    if (body[f] == null || body[f] === '') continue;
    const n = Number(body[f]);
    if (!isNaN(n)) fields[f] = Math.round(n);
  }
  for (const f of [...textFields, ...longTextFields]) {
    if (body[f] != null && body[f] !== '') fields[f] = body[f];
  }

  // story_refs: ensure field exists (returns bool), then append-only merge (L203)
  let storyRefsWarning = null;
  if (body.story_refs != null) {
    const fieldReady = await ensureStoryRefsField(env.AIRTABLE_API_KEY);
    if (!fieldReady) {
      storyRefsWarning = 'story_refs field could not be confirmed — skipped';
    } else {
      try {
        const fetchRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/${TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
        );
        let existingStr = '';
        if (fetchRes.ok) {
          const currentRecord = await fetchRes.json();
          existingStr = currentRecord.fields.story_refs || '';
        }
        const existingIds = existingStr.split(',').map(s => s.trim()).filter(Boolean);
        const incomingIds = body.story_refs.split(',').map(s => s.trim()).filter(Boolean);
        for (const inId of incomingIds) {
          if (!existingIds.includes(inId)) existingIds.push(inId);
        }
        fields.story_refs = existingIds.join(',');
      } catch (err) {
        fields.story_refs = body.story_refs;
      }
    }
  }

  // Sync name field if year is updated
  if (fields.year && !fields.name) {
    fields.name = String(fields.year);
  }

  if (Object.keys(fields).length === 0) {
    return storyRefsWarning
      ? errorResponse(storyRefsWarning, 422)
      : errorResponse('No fields to update');
  }

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, fields, { typecast: true });
    return jsonResponse({ record: flat(record), warning: storyRefsWarning });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// DELETE /api/life-timeline/:id
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  if (!id) return errorResponse('id is required');

  try {
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    return jsonResponse({ deleted: true, id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
