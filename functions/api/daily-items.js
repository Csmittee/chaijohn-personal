import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'DailyItems';

function flat(r) { return { id: r.id, ...r.fields }; }

async function bookBuyPayTransaction(apiKey, item, today) {
  const txFields = {
    date:        today,
    type:        'Expense',
    amount:      Number(item.amount || 0),
    source:      'Manual',
    description: 'book from task'
  };
  if (item.budget_id) {
    txFields.budget_id = [item.budget_id];
  } else {
    console.warn('BuyPay item missing budget_id — booking without budget link');
  }
  return createRecord(apiKey, BASE_ID, 'Transactions', txFields);
}

// ── GET /api/daily-items ──────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const url  = new URL(request.url);
  const pane = url.searchParams.get('pane');
  const date = url.searchParams.get('date');

  const filters = [];
  if (pane) filters.push(`{pane}='${pane}'`);
  if (date) filters.push(`{date}='${date}'`);

  const filterByFormula = filters.length === 0 ? undefined
    : filters.length === 1 ? filters[0]
    : `AND(${filters.join(', ')})`;

  try {
    const res = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date', direction: 'desc' }]
    });
    return jsonResponse({ records: res.records.map(flat) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── POST /api/daily-items ─────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { title, pane } = body;
  if (!title || !pane) return errorResponse('title and pane are required');

  const today = new Date().toISOString().split('T')[0];

  const fields = {
    title,
    pane,
    source: body.source || 'manual'
  };

  if (body.amount      !== undefined) fields.amount         = Number(body.amount);
  if (body.force       !== undefined) fields.force          = Boolean(body.force);
  if (body.high_impact !== undefined) fields.high_impact    = Boolean(body.high_impact);
  if (body.done        !== undefined) fields.done           = Boolean(body.done);
  if (body.date)                      fields.date           = body.date;
  if (body.budget_id)                 fields.budget_id      = body.budget_id;
  if (body.schedule_time)             fields.schedule_time  = body.schedule_time;
  if (body.schedule_type)             fields.schedule_type  = body.schedule_type;
  if (body.project_task_id)           fields.project_task_id = body.project_task_id;
  if (body.project_id)                fields.project_id     = body.project_id;
  if (body.project_name)              fields.project_name   = body.project_name;

  // Book BuyPay transaction on creation if done=true
  if (fields.done && pane === 'BuyPay') {
    try {
      await bookBuyPayTransaction(env.AIRTABLE_API_KEY, body, today);
      fields.booked  = true;
      fields.done_at = today;
    } catch (err) {
      console.error('BuyPay booking failed on create:', err.message);
    }
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
