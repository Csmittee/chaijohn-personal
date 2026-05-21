import { getRecord, createRecord, jsonResponse, errorResponse } from '../../../../_airtable.js';

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
