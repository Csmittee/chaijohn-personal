import { getRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Assets';

function formatAmount(value) {
  const num = Number(value || 0);
  if (num >= 100) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return num.toString();
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { asset_id } = body;
  if (!asset_id) return errorResponse('asset_id is required');

  let asset;
  try {
    asset = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, asset_id);
  } catch (err) {
    return errorResponse('Failed to get asset: ' + err.message, 500);
  }

  const f = asset.fields;
  const imageUrl = f.cloudinary_image_url || '';
  const name = f.name || 'Asset';
  const price = formatAmount(f.estimated_value);
  const notes = f.notes || '';

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(imageUrl)}`;

  const igCaption = `${name}\n\n฿${price} — ${notes}\n\n#forsale #chaijohn #collection`;

  return jsonResponse({
    fb_url: fbUrl,
    ig_caption: igCaption,
    clipboard_caption: igCaption,
    asset_name: name,
    asset_image_url: imageUrl
  });
}
