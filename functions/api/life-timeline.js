import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'LifeTimeline';

// Definitive field schema — L204 in RULES.md (2026-06-11)
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

// GET /api/life-timeline
export async function onRequestGet(context) {
  const { env, request } = context;
  const url  = new URL(request.url);
  const year = url.searchParams.get('year');
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  let filterByFormula;
  if (year) {
    filterByFormula = `{year}=${year}`;
  } else if (from && to) {
    filterByFormula = `AND({year}>=${from},{year}<=${to})`;
  } else if (from) {
    filterByFormula = `{year}>=${from}`;
  } else if (to) {
    filterByFormula = `{year}<=${to}`;
  }

  const sort = [{ field: 'year', direction: 'asc' }, { field: 'month', direction: 'asc' }];

  try {
    const res = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, { filterByFormula, sort });
    return jsonResponse({ records: res.records.map(flat) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// POST /api/life-timeline
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { year } = body;
  if (!year) return errorResponse('year is required');

  const fields = { name: String(year), year: Number(year) };

  // Number integer fields
  const numFields = ['month', 'age', 'financial_earn', 'happiness_factor', 'health'];
  for (const f of numFields) {
    if (body[f] != null && body[f] !== '') {
      const n = Number(body[f]);
      if (!isNaN(n)) fields[f] = Math.round(n);
    }
  }

  // Text and long text fields
  const strFields = [
    'location', 'knowledge_earn', 'relationship', 'creation', 'achievement',
    'failure', 'travel', 'hobby', 'tags', 'people', 'story_refs',
    'company-school', 'title', 'a_impact', 'f_impact', 't_impact', 'h_impact',
    'decision', 'note'
  ];
  for (const f of strFields) {
    if (body[f] != null && body[f] !== '') fields[f] = body[f];
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
