import { getRecord, updateRecord, deleteRecord, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Assets';
const TX_TABLE = 'Transactions';

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const recordId = params.id;

  if (!recordId) return errorResponse('Record ID is required');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Special case: marking as Sold — also create an income transaction
  if (body.status === 'Sold' && body.sold_price && body.sold_date) {
    let assetRecord;
    try {
      assetRecord = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId);
    } catch (err) {
      return errorResponse('Failed to get asset record: ' + err.message, 500);
    }

    const assetName = assetRecord.fields.name || 'Unknown asset';

    const fields = {};
    const allowed = ['name', 'category', 'cost_price', 'estimated_value', 'date_acquired',
      'status', 'velocity', 'notes', 'cloudinary_image_url', 'sold_price', 'sold_date', 'sold_via'];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (['cost_price', 'estimated_value', 'sold_price'].includes(key)) {
          fields[key] = Number(body[key]);
        } else {
          fields[key] = body[key];
        }
      }
    }

    try {
      const [updatedAsset, txRecord] = await Promise.all([
        updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, fields),
        createRecord(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, {
          type: 'Income',
          amount: Number(body.sold_price),
          date: body.sold_date,
          description: 'Collection sale - ' + assetName,
          entity: body.sold_via || '',
          source: 'Manual'
        })
      ]);
      return jsonResponse({ record: updatedAsset, transaction: txRecord });
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  }

  // Regular update
  const fields = {};
  const allowed = ['name', 'category', 'cost_price', 'estimated_value', 'date_acquired',
    'status', 'velocity', 'notes', 'cloudinary_image_url', 'sold_price', 'sold_date', 'sold_via'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (['cost_price', 'estimated_value', 'sold_price'].includes(key)) {
        fields[key] = Number(body[key]);
      } else {
        fields[key] = body[key];
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    return errorResponse('No fields to update');
  }

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, fields);
    return jsonResponse({ record });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const recordId = params.id;

  if (!recordId) return errorResponse('Record ID is required');

  try {
    const result = await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId);
    return jsonResponse({ deleted: true, id: result.id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
