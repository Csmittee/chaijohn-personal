import { updateRecord, deleteRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Transactions';

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const recordId = params.id;

  if (!recordId) return errorResponse('Record ID is required');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const fields = {};
  const allowed = ['date', 'type', 'amount', 'entity', 'description', 'note',
    'fixed_variable', 'period', 'source', 'budget_id', 'category_id'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'amount') {
        fields.amount = Number(body.amount);
      } else if (key === 'budget_id') {
        // G1: accept budget_id as linked record array; never overwrite category_id
        fields.budget_id = Array.isArray(body.budget_id) ? body.budget_id : [body.budget_id];
      } else if (key === 'category_id') {
        // Only update category_id for non-expense (earn/income) records
        fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
      } else {
        fields[key] = body[key];
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    return errorResponse('No fields to update');
  }

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, fields);
    return jsonResponse({ record });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const recordId = params.id;

  if (!recordId) return errorResponse('Record ID is required');

  try {
    const result = await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId);
    return jsonResponse({ deleted: true, id: result.id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
