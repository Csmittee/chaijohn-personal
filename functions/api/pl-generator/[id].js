import { jsonResponse, errorResponse } from '../../_airtable.js';

const KV_PREFIX = 'pl-generator:';

export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.CHAIJOHN_KV) return errorResponse('KV not configured', 500);

  const id = params.id;
  if (!id) return errorResponse('id required');

  try {
    const val = await env.CHAIJOHN_KV.get(KV_PREFIX + id, { type: 'json' });
    if (!val) return errorResponse('Not found', 404);
    return jsonResponse(val);
  } catch (err) {
    return errorResponse('Failed to fetch: ' + err.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  if (!env.CHAIJOHN_KV) return errorResponse('KV not configured', 500);

  const id = params.id;
  if (!id) return errorResponse('id required');

  try {
    await env.CHAIJOHN_KV.delete(KV_PREFIX + id);
    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse('Failed to delete: ' + err.message, 500);
  }
}
