import { updateRecord, deleteRecord, jsonResponse, errorResponse } from '../../_airtable.js';

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
    story_refs:       r.fields.story_refs       || null,
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
  const numFields = [
    'year','month','financial_earn','knowledge_earn','happiness_factor','health',
    'relationship','creation','achievement','a_impact','failure','f_impact',
    'travel','t_impact','hobby','h_impact'
  ];
  // story_refs is handled separately below — excluded from textFields
  const textFields = ['name','location','decision','tags','story','people'];

  for (const f of numFields) {
    if (body[f] != null) fields[f] = Number(body[f]);
  }
  for (const f of textFields) {
    if (body[f] != null) fields[f] = body[f];
  }

  // story_refs: append-only merge — fetch current record, merge IDs, deduplicate
  if (body.story_refs != null) {
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
      // If fetch fails, fall back to setting directly
      fields.story_refs = body.story_refs;
    }
  }

  // Sync name field if year is updated
  if (fields.year && !fields.name) {
    fields.name = String(fields.year);
  }

  if (Object.keys(fields).length === 0) return errorResponse('No fields to update');

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, fields);
    return jsonResponse({ record: flat(record) });
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
