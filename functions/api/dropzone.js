import { createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const QUEUE_TABLE = 'Drop_Zone_Queue';

async function callClaude(apiKey, cloudinaryUrl) {
  const prompt = `You are a data extraction assistant for a personal finance and diary app. Analyze this image and return ONLY a JSON object (no markdown, no explanation) with these fields: {"file_type": one of ["Receipt","Transfer slip","Product photo","Handwriting","Quote image","Other"], "extracted_text": "all visible text verbatim or empty string", "description": "one sentence describing what you see", "suggested_type": one of ["Transaction","Asset","Diary","Quote","Ignore"], "prefilled": {if Transaction: {date, type, amount, description, entity, note}, if Asset: {name, category, estimated_value, notes}, if Diary: {title, content, entry_type, tags}, if Quote: {text, author, source, mood_tag}, if Ignore: {}}}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: cloudinaryUrl }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    })
  });

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const rawText = data.content[0].text;

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { cloudinary_url, filename, mime_type } = body;
  if (!cloudinary_url) return errorResponse('cloudinary_url is required');

  const today = new Date().toISOString().split('T')[0];

  let aiResult = null;
  let aiError = null;

  try {
    aiResult = await callClaude(env.ANTHROPIC_API_KEY, cloudinary_url);
  } catch (err) {
    aiError = err.message;
    console.error('Claude vision error:', err.message);
  }

  const queueFields = {
    date_received: today,
    cloudinary_url,
    status: 'Pending'
  };

  if (aiResult) {
    queueFields.file_type = aiResult.file_type || 'Other';
    queueFields.ai_extracted_text = aiResult.extracted_text || '';
    queueFields.ai_description = aiResult.description || '';
    queueFields.ai_suggested_type = aiResult.suggested_type || 'Ignore';
    queueFields.ai_prefilled_json = JSON.stringify(aiResult.prefilled || {});
  } else {
    queueFields.file_type = 'Other';
    queueFields.ai_description = aiError ? `AI error: ${aiError}` : 'AI analysis not available';
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, QUEUE_TABLE, queueFields);
    return jsonResponse({ queue_id: record.id, ai_result: aiResult });
  } catch (err) {
    return errorResponse('Failed to save to queue: ' + err.message, 500);
  }
}
