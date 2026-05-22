import { listRecords, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Liability_Payments';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const liabilityId = url.searchParams.get('liability_id');
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);

  let filterByFormula;
  if (liabilityId) {
    filterByFormula = `FIND('${liabilityId}', ARRAYJOIN({liability_id}))>0`;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: Math.min(limit, 500)
    });
    return jsonResponse({ records: data.records });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
