import { jsonResponse, errorResponse } from '../_airtable.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const val = await env.CHAIJOHN_KV.get('cashflow_sync');
    if (!val) return jsonResponse({ syncPoint: null });
    return jsonResponse({ syncPoint: JSON.parse(val) });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }
  const { amount, date, note } = body;
  if (amount === undefined || !date) return errorResponse('amount and date are required');
  const syncPoint = { amount: Number(amount), date, note: note || '' };
  try {
    await env.CHAIJOHN_KV.put('cashflow_sync', JSON.stringify(syncPoint));
    return jsonResponse({ syncPoint });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
