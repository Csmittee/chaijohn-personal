import { jsonResponse, errorResponse } from '../_airtable.js';

const KV_KEY = 'active_strategy';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const val = await env.CHAIJOHN_KV.get(KV_KEY);
    if (!val) return jsonResponse({ active: false, status: null, ticket: null });
    const data = JSON.parse(val);
    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  try {
    await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(body));
    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
