const AIRTABLE_BASE = 'https://api.airtable.com/v0';
async function getRecord(apiKey, baseId, tableName, recordId) {
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Airtable get error ${res.status}: ${await res.text()}`);
  return res.json();
}
async function createRecord(apiKey, baseId, tableName, fields) {
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ records: [{ fields }] }) });
  if (!res.ok) throw new Error(`Airtable create error ${res.status}: ${await res.text()}`);
  return (await res.json()).records[0];
}
function jsonResponse(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function errorResponse(msg, status = 400) { return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } }); }

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Assets';
const QUEUE_TABLE = 'Drop_Zone_Queue';

export async function onRequestPost(context) {
  const { env, params } = context;
  const assetId = params.id;

  if (!assetId) return errorResponse('Asset ID is required');

  let asset;
  try {
    asset = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, assetId);
  } catch (err) {
    return errorResponse('Failed to get asset: ' + err.message, 500);
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    await createRecord(env.AIRTABLE_API_KEY, BASE_ID, QUEUE_TABLE, {
      date_received: today,
      file_type: 'Other',
      ai_description: 'Ploikong sync request for: ' + (asset.fields.name || assetId),
      status: 'Pending'
    });
  } catch (err) {
    return errorResponse('Failed to log sync request: ' + err.message, 500);
  }

  return jsonResponse({ ok: true, message: 'Logged for Ploikong sync — available in v2' });
}
