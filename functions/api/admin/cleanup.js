import { listRecords, deleteRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TX_TABLE = 'Transactions';

// GET /api/admin/cleanup — deletes test liability payment records
// Finds Transactions where entity = "Friend and Family" AND note contains "Test and must delete"
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const res = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, {
      filterByFormula: `AND({entity}='Friend and Family',FIND('Test and must delete',{note})>0)`,
      maxRecords: 100,
      fields: ['entity', 'note', 'amount', 'date']
    });

    const records = res.records || [];
    if (records.length === 0) {
      return jsonResponse({ deleted: 0, message: 'No test records found' });
    }

    const deleted = [];
    const errors = [];
    for (const r of records) {
      try {
        await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, r.id);
        deleted.push(r.id);
      } catch (err) {
        errors.push({ id: r.id, error: err.message });
      }
    }

    return jsonResponse({ deleted: deleted.length, ids: deleted, errors });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
