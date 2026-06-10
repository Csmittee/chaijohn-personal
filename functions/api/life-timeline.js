import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

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

// GET /api/life-timeline
// ?year=YYYY            → rows for that year
// ?from=YYYY&to=YYYY    → rows in year range
// (no params)           → all rows
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
  if (body.month            != null) fields.month            = Number(body.month);
  if (body.location         != null) fields.location         = body.location;
  if (body.financial_earn   != null) fields.financial_earn   = Number(body.financial_earn);
  if (body.knowledge_earn   != null) fields.knowledge_earn   = Number(body.knowledge_earn);
  if (body.happiness_factor != null) fields.happiness_factor = Number(body.happiness_factor);
  if (body.health           != null) fields.health           = Number(body.health);
  if (body.relationship     != null) fields.relationship     = Number(body.relationship);
  if (body.creation         != null) fields.creation         = Number(body.creation);
  if (body.achievement      != null) fields.achievement      = Number(body.achievement);
  if (body.a_impact         != null) fields.a_impact         = Number(body.a_impact);
  if (body.failure          != null) fields.failure          = Number(body.failure);
  if (body.f_impact         != null) fields.f_impact         = Number(body.f_impact);
  if (body.travel           != null) fields.travel           = Number(body.travel);
  if (body.t_impact         != null) fields.t_impact         = Number(body.t_impact);
  if (body.hobby            != null) fields.hobby            = Number(body.hobby);
  if (body.h_impact         != null) fields.h_impact         = Number(body.h_impact);
  if (body.decision         != null) fields.decision         = body.decision;
  if (body.tags             != null) fields.tags             = body.tags;
  if (body.story            != null) fields.story            = body.story;
  if (body.people           != null) fields.people           = body.people;
  if (body.story_refs       != null) fields.story_refs       = body.story_refs;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
