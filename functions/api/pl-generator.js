import { jsonResponse, errorResponse } from '../_airtable.js';

const KV_PREFIX = 'pl-generator:';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.CHAIJOHN_KV) return errorResponse('KV not configured', 500);

  try {
    const list = await env.CHAIJOHN_KV.list({ prefix: KV_PREFIX });
    const metas = [];
    for (const key of list.keys) {
      const val = await env.CHAIJOHN_KV.get(key.name, { type: 'json' });
      if (val) {
        metas.push({
          id: val.id,
          name: val.name,
          version: val.version,
          created_at: val.created_at,
          period: val.period,
          review_note: val.review_note || ''
        });
      }
    }
    metas.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return jsonResponse({ versions: metas });
  } catch (err) {
    return errorResponse('Failed to list versions: ' + err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.CHAIJOHN_KV) return errorResponse('KV not configured', 500);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const id = body.id || `pl_${Date.now()}`;
  const key = KV_PREFIX + id;

  const record = {
    id,
    version: body.version || 'v1',
    name: body.name || 'Unnamed model',
    created_at: body.created_at || new Date().toISOString(),
    review_note: body.review_note || '',
    period: body.period || '12mo',
    inputs: body.inputs || {},
    outputs: body.outputs || {}
  };

  try {
    await env.CHAIJOHN_KV.put(key, JSON.stringify(record));
    return jsonResponse({ id: record.id, version: record.version });
  } catch (err) {
    return errorResponse('Failed to save: ' + err.message, 500);
  }
}
