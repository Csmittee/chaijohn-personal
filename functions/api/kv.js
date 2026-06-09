import { jsonResponse, errorResponse } from '../_airtable.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return errorResponse('key required', 400);
  try {
    const val = await env.CHAIJOHN_KV.get(key);
    return jsonResponse({ value: val });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  const { key, value } = body || {};
  if (!key) return errorResponse('key required', 400);
  try {
    if (value === null || value === undefined) {
      await env.CHAIJOHN_KV.delete(key);
    } else {
      await env.CHAIJOHN_KV.put(key, value);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
