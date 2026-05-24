import { createRecord, jsonResponse, errorResponse } from '../_airtable.js';

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
          { type: 'image', source: { type: 'url', url: cloudinaryUrl } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rawText = data.content[0].text;
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

async function callClaudeText(apiKey, textContent, filename) {
  const systemPrompt = `You are a personal diary assistant. The user dropped a text file.
Classify it and extract structured data.
Return JSON only (no markdown, no explanation):
{
  "suggested_type": "one of [Diary, Quote, Transaction, Idea, Project]",
  "title": "string (max 80 chars)",
  "content": "string (full text, cleaned)",
  "tags": ["array", "of", "strings", "max 5"],
  "entry_type": "for Diary/Idea/Project only — one of [Story, Idea, Blog, Project, Skill]",
  "author": "for Quote only — string or null",
  "amount": "for Transaction only — number or null",
  "entity": "for Transaction only — string or null"
}`;

  const userMsg = `File: ${filename}\n\nContent:\n${textContent.slice(0, 8000)}`;

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
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rawText = data.content[0].text;
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

  const { cloudinary_url, filename, mime_type, text_content } = body;

  if (!cloudinary_url && !text_content) {
    return errorResponse('cloudinary_url or text_content is required');
  }

  const today = new Date().toISOString().split('T')[0];
  const isText = !!text_content;

  let aiRaw = null;
  let aiError = null;

  try {
    if (isText) {
      aiRaw = await callClaudeText(env.ANTHROPIC_API_KEY, text_content, filename || 'file.txt');
    } else {
      aiRaw = await callClaude(env.ANTHROPIC_API_KEY, cloudinary_url);
    }
  } catch (err) {
    aiError = err.message;
    console.error('Claude AI error:', err.message);
  }

  const queueFields = { date_received: today, status: 'Pending' };
  if (cloudinary_url) queueFields.cloudinary_url = cloudinary_url;

  let aiResult = null;

  if (isText) {
    if (aiRaw) {
      const prefilled = {
        title:      aiRaw.title   || '',
        content:    aiRaw.content || text_content,
        tags:       Array.isArray(aiRaw.tags) ? aiRaw.tags.join(', ') : (aiRaw.tags || '')
      };
      if (aiRaw.entry_type) prefilled.entry_type = aiRaw.entry_type;
      if (aiRaw.author)     prefilled.author     = aiRaw.author;
      if (aiRaw.amount)     prefilled.amount     = aiRaw.amount;
      if (aiRaw.entity)     prefilled.entity     = aiRaw.entity;

      queueFields.file_type          = 'Text';
      queueFields.ai_extracted_text  = text_content.slice(0, 2000);
      queueFields.ai_description     = aiRaw.title || 'Text file';
      queueFields.ai_suggested_type  = aiRaw.suggested_type || 'Diary';
      queueFields.ai_prefilled_json  = JSON.stringify(prefilled);

      aiResult = {
        suggested_type: aiRaw.suggested_type || 'Diary',
        description:    aiRaw.title || 'Text file analyzed',
        prefilled
      };
    } else {
      queueFields.file_type     = 'Text';
      queueFields.ai_description = aiError ? `AI error: ${aiError}` : 'AI analysis not available';
    }
  } else {
    if (aiRaw) {
      queueFields.file_type          = aiRaw.file_type || 'Other';
      queueFields.ai_extracted_text  = aiRaw.extracted_text || '';
      queueFields.ai_description     = aiRaw.description || '';
      queueFields.ai_suggested_type  = aiRaw.suggested_type || 'Ignore';
      queueFields.ai_prefilled_json  = JSON.stringify(aiRaw.prefilled || {});
      aiResult = aiRaw;
    } else {
      queueFields.file_type     = 'Other';
      queueFields.ai_description = aiError ? `AI error: ${aiError}` : 'AI analysis not available';
    }
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, QUEUE_TABLE, queueFields);
    return jsonResponse({ queue_id: record.id, ai_result: aiResult });
  } catch (err) {
    return errorResponse('Failed to save to queue: ' + err.message, 500);
  }
}
