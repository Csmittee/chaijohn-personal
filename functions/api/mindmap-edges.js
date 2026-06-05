import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE   = 'MindMapEdges';

function flat(r) { return { id: r.id, ...r.fields }; }

// GET /api/mindmap-edges?from=nodeId
export async function onRequestGet(context) {
  const { env, request } = context;
  const url  = new URL(request.url);
  const from = url.searchParams.get('from');

  const filterByFormula = from ? `{from_id}='${from}'` : undefined;

  try {
    const res = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, { filterByFormula });
    return jsonResponse({ records: res.records.map(flat) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// POST /api/mindmap-edges
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { from_id, to_id, edge_type } = body;
  if (!from_id || !to_id || !edge_type) return errorResponse('from_id, to_id and edge_type are required');

  const fields = { from_id, to_id, edge_type };
  if (body.label    !== undefined) fields.label    = body.label;
  if (body.strength !== undefined) fields.strength = Number(body.strength) || 2;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
