import { updateRecord, deleteRecord, jsonResponse, errorResponse } from '../../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Drop_Zone_Queue';

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
  const allowed = ['status', 'file_type', 'ai_extracted_text', 'ai_description',
    'ai_suggested_type', 'ai_prefilled_json', 'approved_record_id'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields[key] = body[key];
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
