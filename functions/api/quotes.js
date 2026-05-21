import { listRecords, createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Quotes';
const PAGE_SIZE = 50;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const offset = url.searchParams.get('offset') || undefined;

  // Use provided offset param or compute from page (Airtable offsets are opaque strings,
  // so we support passing offset directly from a previous response)
  const airtableParams = {
    pageSize: PAGE_SIZE,
    sort: [{ field: 'date_added', direction: 'desc' }]
  };

  if (offset) {
    airtableParams.offset = offset;
  }

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, airtableParams);
    return jsonResponse({
      records: data.records,
      offset: data.offset || null,
      hasMore: !!data.offset
    });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { text } = body;
  if (!text) return errorResponse('text is required');

  const today = new Date().toISOString().split('T')[0];

  const fields = {
    text,
    active: body.active !== undefined ? body.active : true,
    date_added: body.date_added || today
  };

  if (body.author) fields.author = body.author;
  if (body.source) fields.source = body.source;
  if (body.mood_tag) fields.mood_tag = body.mood_tag;
  if (body.cloudinary_image_url) fields.cloudinary_image_url = body.cloudinary_image_url;

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
