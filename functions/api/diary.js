import { listRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const BUSINESS_BASE_ID_FALLBACK = 'appMBjlfYyVd8I7ML';
const TABLE = 'Diary';
const BLOGS_TABLE = 'Blogs';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search');

  const filters = [];

  if (search) {
    filters.push(`OR(SEARCH('${search}', {title}), SEARCH('${search}', {content}), SEARCH('${search}', {tags}))`);
  }
  if (type) {
    filters.push(`{entry_type}='${type}'`);
  }

  const filterByFormula = filters.length === 0
    ? undefined
    : filters.length === 1
      ? filters[0]
      : `AND(${filters.join(', ')})`;

  try {
    const data = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TABLE, {
      filterByFormula,
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: 500
    });
    return jsonResponse({ records: data.records });
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

  const { title, content, date } = body;
  if (!title || !date) return errorResponse('title and date are required');

  const fields = { title, date };
  if (content) fields.content = content;
  if (body.entry_type) fields.entry_type = body.entry_type;
  if (body.tags) fields.tags = body.tags;
  if (body.publish_to_web !== undefined) fields.publish_to_web = body.publish_to_web;
  if (body.published_url) fields.published_url = body.published_url;
  if (body.connected_concept) fields.connected_concept = body.connected_concept;
  if (body.cloudinary_image_url) fields.cloudinary_image_url = body.cloudinary_image_url;

  let record;
  try {
    record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, fields);
  } catch (err) {
    return errorResponse(err.message, 500);
  }

  // If publish_to_web=true and entry_type="Blog", also push to business base
  if (body.publish_to_web === true && body.entry_type === 'Blog') {
    try {
      await createRecord(env.AIRTABLE_API_KEY, env.AIRTABLE_BUSINESS_BASE_ID || BUSINESS_BASE_ID_FALLBACK, BLOGS_TABLE, {
        title,
        content: content || '',
        tags: body.tags || '',
        date,
        published_url: body.published_url || ''
      });
    } catch (err) {
      // Log error but do not fail — diary entry was already saved
      console.error('Failed to push to business Blogs table:', err.message);
    }
  }

  return jsonResponse({ record }, 201);
}
