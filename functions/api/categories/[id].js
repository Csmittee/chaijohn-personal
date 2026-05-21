import { updateRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Categories';

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
  const allowed = ['name', 'type', 'fixed_variable', 'budget_limit_monthly', 'period', 'active'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'budget_limit_monthly') {
        fields.budget_limit_monthly = Number(body.budget_limit_monthly);
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
