import { updateRecord, deleteRecord, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const BUSINESS_BASE_ID_FALLBACK = 'appMBjlfYyVd8I7ML';
const TABLE = 'Diary';
const BLOGS_TABLE = 'Blogs';

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

  const fields = {};
  const allowed = ['date', 'title', 'content', 'entry_type', 'tags',
    'publish_to_web', 'published_url', 'connected_concept', 'cloudinary_image_url'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields[key] = body[key];
    }
  }

  if (Object.keys(fields).length === 0) {
    return errorResponse('No fields to update');
  }

  let record;
  try {
    record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, fields);
  } catch (err) {
    return errorResponse(err.message, 500);
  }

  // If publish_to_web becomes true and entry_type is Blog, push to business base
  if (body.publish_to_web === true && body.entry_type === 'Blog') {
    try {
      await createRecord(env.AIRTABLE_API_KEY, env.AIRTABLE_BUSINESS_BASE_ID || BUSINESS_BASE_ID_FALLBACK, BLOGS_TABLE, {
        title: body.title || record.fields.title || '',
        content: body.content || record.fields.content || '',
        tags: body.tags || record.fields.tags || '',
        date: body.date || record.fields.date || new Date().toISOString().split('T')[0],
        published_url: body.published_url || record.fields.published_url || ''
      });
    } catch (err) {
      // Log but do not fail — local record was already updated
      console.error('Failed to push to business Blogs table:', err.message);
    }
  }

  return jsonResponse({ record });
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
