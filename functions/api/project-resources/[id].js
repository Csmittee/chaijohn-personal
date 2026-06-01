import { updateRecord, deleteRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID   = 'apphBGWfSPL45oSFd';
const RESOURCES = 'ProjectResources';

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const id = params.id;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  const fields = {};
  ['item','time_needed','cost','status'].forEach(k => { if (body[k] !== undefined) fields[k] = body[k]; });
  if (fields.cost !== undefined) fields.cost = Number(fields.cost);
  try {
    const updated = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES, id, fields);
    return jsonResponse({ record: { id, ...updated.fields } });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  try {
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES, id);
    return jsonResponse({ ok: true, id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
