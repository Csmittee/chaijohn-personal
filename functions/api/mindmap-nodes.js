import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'MindMapNodes';

function flat(r) { return { id: r.id, ...r.fields }; }

// GET /api/mindmap-nodes?type=Skill&status=Active
export async function onRequestGet(context) {
  const { env, request } = context;
  const url    = new URL(request.url);
  const type   = url.searchParams.get('type');
  const status = url.searchParams.get('status');

  const filters = [];
  if (type)   filters.push(`{node_type}='${type}'`);
  if (status) filters.push(`{status}='${status}'`);

  const filterByFormula = filters.length === 0 ? undefined
    : filters.length === 1 ? filters[0]
    : `AND(${filters.join(', ')})`;

  try {
    const res = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'node_type', direction: 'asc' }, { field: 'label', direction: 'asc' }]
    });
    return jsonResponse({ records: res.records.map(flat) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// POST /api/mindmap-nodes
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { label, node_type } = body;
  if (!label || !node_type) return errorResponse('label and node_type are required');

  const fields = { label, node_type };
  if (body.description !== undefined) fields.description = body.description;
  if (body.tags        !== undefined) fields.tags        = body.tags;
  if (body.context     !== undefined) fields.context     = body.context;
  if (body.status      !== undefined) fields.status      = body.status;
  if (body.url         !== undefined) fields.url         = body.url;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
