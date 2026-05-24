import { listRecords, jsonResponse, errorResponse } from '../../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const PAYMENTS_TABLE = 'Liability_Payments';

export async function onRequestGet(context) {
  const { env, params } = context;
  const liabId = params.id;
  if (!liabId) return errorResponse('Liability ID required');

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, PAYMENTS_TABLE, {
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: 500
    });

    const payments = (data.records || [])
      .filter(r => {
        const ids = r.fields.liability_id || [];
        return ids.includes(liabId);
      })
      .map(r => ({
        date:   r.fields.date || '',
        amount: r.fields.total_payment || 0,
        note:   r.fields.notes || ''
      }));

    return jsonResponse({ payments });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
