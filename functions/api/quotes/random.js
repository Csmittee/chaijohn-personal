import { listRecords, jsonResponse, errorResponse } from '../../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Quotes';

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula: `{active}=TRUE()`,
      maxRecords: 500
    });

    const records = data.records || [];
    if (records.length === 0) {
      return jsonResponse({ record: null });
    }

    const randomIndex = Math.floor(Math.random() * records.length);
    return jsonResponse({ record: records[randomIndex] });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
