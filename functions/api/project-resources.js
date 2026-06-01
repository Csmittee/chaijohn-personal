import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID   = 'apphBGWfSPL45oSFd';
const RESOURCES = 'ProjectResources';

function flat(r) { return { id: r.id, ...r.fields }; }

export async function onRequestGet(context) {
  const { env, request } = context;
  const url       = new URL(request.url);
  const projectId = url.searchParams.get('project_id');
  const filter    = projectId ? `FIND('${projectId}', ARRAYJOIN(project_id))` : undefined;
  try {
    const res = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES, { filterByFormula: filter, sort: [{ field: 'item', direction: 'asc' }] });
    return jsonResponse({ records: res.records.map(flat) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  if (!body.item || !body.project_id) return errorResponse('item and project_id are required');
  const fields = {
    project_id: [body.project_id],
    item:        body.item,
    time_needed: body.time_needed || '',
    cost:        Number(body.cost || 0),
    status:      body.status || 'Planned'
  };
  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
