import { updateRecord, deleteRecord, listAllRecords, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID    = 'apphBGWfSPL45oSFd';
const TABLE      = 'MindMapNodes';
const EDGES_TABLE = 'MindMapEdges';

function flat(r) { return { id: r.id, ...r.fields }; }

// PATCH /api/mindmap-nodes/:id
export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Record ID required');

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const fields = {};
  if (body.label       !== undefined) fields.label       = body.label;
  if (body.node_type   !== undefined) fields.node_type   = body.node_type;
  if (body.description !== undefined) fields.description = body.description;
  if (body.tags        !== undefined) fields.tags        = body.tags;
  if (body.context     !== undefined) fields.context     = body.context;
  if (body.status      !== undefined) fields.status      = body.status;
  if (body.url         !== undefined) fields.url         = body.url;

  try {
    const updated = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, fields);
    return jsonResponse({ record: flat(updated) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// DELETE /api/mindmap-nodes/:id — cascade deletes all connected edges
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Record ID required');

  try {
    // Find all edges connected to this node
    const edgesRes = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, EDGES_TABLE, {
      filterByFormula: `OR({from_id}='${id}', {to_id}='${id}')`
    });
    // Delete all connected edges
    for (const edge of edgesRes.records) {
      await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, EDGES_TABLE, edge.id).catch(() => {});
    }
    // Delete the node
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    return jsonResponse({ deleted: true, edges_deleted: edgesRes.records.length });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
