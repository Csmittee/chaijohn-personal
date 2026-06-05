import { getRecord, updateRecord, deleteRecord, createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

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

// ── PATCH /api/daily-items/[id] ───────────────────────────────────────────────
export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Record ID required');

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const today = new Date().toISOString().split('T')[0];

  // Fetch current state to check pane + booked
  let current;
  try {
    current = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
  } catch (err) {
    return errorResponse(err.message, 404);
  }

  const currentFields = current.fields || {};
  const pane          = body.pane || currentFields.pane;
  const alreadyBooked = currentFields.booked === true;

  const fields = {};

  // Map allowed fields
  if (body.title           !== undefined) fields.title           = body.title;
  if (body.pane            !== undefined) fields.pane            = body.pane;
  if (body.amount          !== undefined) fields.amount          = Number(body.amount);
  if (body.force           !== undefined) fields.force           = Boolean(body.force);
  if (body.high_impact     !== undefined) fields.high_impact     = Boolean(body.high_impact);
  if (body.done            !== undefined) fields.done            = Boolean(body.done);
  if (body.date            !== undefined) fields.date            = body.date || null;
  if (body.budget_id       !== undefined) fields.budget_id       = body.budget_id || null;
  if (body.schedule_time   !== undefined) fields.schedule_time   = body.schedule_time || null;
  if (body.schedule_type   !== undefined) fields.schedule_type   = body.schedule_type || null;
  if (body.end_time        !== undefined) fields.end_time        = body.end_time || null;
  if (body.project_task_id !== undefined) fields.project_task_id = body.project_task_id || null;
  if (body.project_id      !== undefined) fields.project_id      = body.project_id || null;
  if (body.project_name    !== undefined) fields.project_name    = body.project_name || null;
  if (body.booked          !== undefined) fields.booked          = Boolean(body.booked);

  // When done=true is sent
  if (body.done === true) {
    fields.done_at = today;

    // BuyPay: book transaction if not already booked
    if (pane === 'BuyPay' && !alreadyBooked) {
      const itemData = { ...currentFields, ...body };
      try {
        await bookBuyPayTransaction(env.AIRTABLE_API_KEY, itemData, today);
        fields.booked = true;
      } catch (err) {
        console.error('BuyPay booking failed on PATCH done:', err.message);
      }
    }

    // Do pane with project_task_id: also mark project task Done
    if (pane === 'Do') {
      const projectTaskId = body.project_task_id || currentFields.project_task_id;
      if (projectTaskId) {
        try {
          await fetch(`/api/project-tasks/${projectTaskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Done' })
          });
        } catch (err) {
          console.error('Project task PATCH failed:', err.message);
        }
        // Direct Airtable update (self-call not available in Workers)
        try {
          await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, 'ProjectTasks', projectTaskId, { status: 'Done' });
        } catch (err) {
          console.error('ProjectTask direct update failed:', err.message);
        }
      }
    }
  }

  try {
    const updated = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, fields);
    return jsonResponse({ record: flat(updated) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── DELETE /api/daily-items/[id] ──────────────────────────────────────────────
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Record ID required');

  try {
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    return jsonResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
