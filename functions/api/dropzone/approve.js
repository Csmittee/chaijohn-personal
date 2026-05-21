import { createRecord, updateRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const QUEUE_TABLE = 'Drop_Zone_Queue';

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { queue_id, suggested_type, fields: inputFields } = body;
  if (!queue_id || !suggested_type || !inputFields) {
    return errorResponse('queue_id, suggested_type, and fields are required');
  }

  const today = new Date().toISOString().split('T')[0];

  let targetTable;
  let recordFields = { ...inputFields };

  switch (suggested_type) {
    case 'Transaction':
      targetTable = 'Transactions';
      recordFields.source = recordFields.source || 'DropZone';
      // Ensure amount is a number
      if (recordFields.amount !== undefined) {
        recordFields.amount = Number(recordFields.amount);
      }
      if (recordFields.category_id && !Array.isArray(recordFields.category_id)) {
        recordFields.category_id = [recordFields.category_id];
      }
      break;

    case 'Asset':
      targetTable = 'Assets';
      if (recordFields.cost_price !== undefined) {
        recordFields.cost_price = Number(recordFields.cost_price);
      }
      if (recordFields.estimated_value !== undefined) {
        recordFields.estimated_value = Number(recordFields.estimated_value);
      }
      break;

    case 'Diary':
      targetTable = 'Diary';
      if (!recordFields.date) recordFields.date = today;
      break;

    case 'Quote':
      targetTable = 'Quotes';
      if (!recordFields.date_added) recordFields.date_added = today;
      if (recordFields.active === undefined) recordFields.active = true;
      break;

    default:
      return errorResponse(`Unsupported suggested_type: ${suggested_type}`);
  }

  let newRecord;
  try {
    newRecord = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, targetTable, recordFields);
  } catch (err) {
    return errorResponse(`Failed to create ${suggested_type} record: ${err.message}`, 500);
  }

  // Update Drop_Zone_Queue: mark as Approved with the new record ID
  try {
    await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, QUEUE_TABLE, queue_id, {
      status: 'Approved',
      approved_record_id: newRecord.id
    });
  } catch (err) {
    // Do not fail — the main record was already created
    console.error('Failed to update queue status:', err.message);
  }

  return jsonResponse({ ok: true, record_id: newRecord.id, suggested_type });
}
