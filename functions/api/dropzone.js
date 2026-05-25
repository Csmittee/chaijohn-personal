import { createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const QUEUE_TABLE = 'Drop_Zone_Queue';

function buildImagePrompt(hintType, hintSubtype, today) {
  const key = hintSubtype ? `${hintType}_${hintSubtype}` : hintType;
  const prompts = {
    Transaction_Expense: `Extract expense data from this receipt or bill. Return ONLY valid JSON:
{"suggested_type":"Transaction","description":"one sentence about the receipt","prefilled":{"date":"${today}","type":"Expense","amount":0,"description":"items purchased or service","entity":"merchant or store name"}}
Rules: amount = total as a number, date in YYYY-MM-DD, entity = shop name, description = what was bought.`,

    Transaction_Income: `Extract income or payment-received data from this document. Return ONLY valid JSON:
{"suggested_type":"Transaction","description":"one sentence about the payment","prefilled":{"date":"${today}","type":"Income","amount":0,"description":"what the income is for","entity":"payer or source name"}}`,

    Transaction: `Extract financial data from this receipt or document. Return ONLY valid JSON:
{"suggested_type":"Transaction","description":"one sentence","prefilled":{"date":"${today}","type":"Expense","amount":0,"description":"what it is for","entity":"merchant or payer name"}}`,

    Quote: `Extract the quote text, author, and source from this image. Return ONLY valid JSON:
{"suggested_type":"Quote","description":"one sentence about the quote","prefilled":{"text":"full quote verbatim","author":"who said it or empty","source":"book or speech or empty","mood_tag":"Motivational"}}`,

    Asset: `Identify this item as a collectible or asset. Return ONLY valid JSON:
{"suggested_type":"Asset","description":"one sentence about the item","prefilled":{"name":"item name","category":"Other","estimated_value":0,"notes":"any details"}}`,

    Diary_Story: `Read this image and extract a diary story. Return ONLY valid JSON:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"entry title","content":"full extracted text","entry_type":"Story","tags":""}}`,

    Diary_Idea: `Read this image and extract an idea note. Return ONLY valid JSON:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"idea title","content":"full extracted content","entry_type":"Idea","tags":""}}`,

    Diary_Blog: `Read this image and extract a blog post draft. Return ONLY valid JSON:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"blog title","content":"full extracted content","entry_type":"Blog","tags":""}}`,

    Diary_Project: `Read this image and extract a project note or plan. Return ONLY valid JSON:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"project title","content":"full extracted content","entry_type":"Project","tags":""}}`,

    Diary: `Read this image and extract the content as a diary entry. Return ONLY valid JSON:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"entry title","content":"full extracted content","entry_type":"Story","tags":""}}`
  };

  return prompts[key] || prompts[hintType] || prompts.Transaction_Expense;
}

function buildTextPrompt(hintType, hintSubtype) {
  const key = hintSubtype ? `${hintType}_${hintSubtype}` : hintType;
  const systemPrompts = {
    Transaction_Expense: `Extract expense data from this text. Return JSON only:
{"suggested_type":"Transaction","description":"one sentence","prefilled":{"date":"YYYY-MM-DD","type":"Expense","amount":0,"description":"what it was for","entity":"merchant name"}}`,

    Transaction_Income: `Extract income or payment-received data from this text. Return JSON only:
{"suggested_type":"Transaction","description":"one sentence","prefilled":{"date":"YYYY-MM-DD","type":"Income","amount":0,"description":"what the income is for","entity":"payer or source name"}}`,

    Transaction: `Extract financial transaction data from this text. Return JSON only (no markdown):
{"suggested_type":"Transaction","description":"one sentence","prefilled":{"date":"YYYY-MM-DD","type":"Expense","amount":0,"description":"what it was for","entity":"merchant name"}}`,

    Quote: `Extract the quote, author, and source from this text. Return JSON only:
{"suggested_type":"Quote","description":"one sentence","prefilled":{"text":"full quote","author":"author or empty","source":"source or empty","mood_tag":"Motivational"}}`,

    Asset: `Extract asset details from this text. Return JSON only:
{"suggested_type":"Asset","description":"one sentence","prefilled":{"name":"item name","category":"Other","estimated_value":0,"notes":"details"}}`,

    Story: `Extract a personal diary story from this text. Return JSON only:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"title","content":"full content","entry_type":"Story","tags":""}}`,

    Idea: `Extract an idea note from this text. Return JSON only:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"idea title","content":"full content","entry_type":"Idea","tags":""}}`,

    Blog: `Extract a blog post draft from this text. Return JSON only:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"blog title","content":"full content","entry_type":"Blog","tags":""}}`,

    Project: `Extract a project note or plan from this text. Return JSON only:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"project title","content":"full content","entry_type":"Project","tags":""}}`,

    Diary: `Extract a diary entry from this text. Return JSON only:
{"suggested_type":"Diary","description":"one sentence summary","prefilled":{"title":"title","content":"full content","entry_type":"Story","tags":""}}`
  };

  return systemPrompts[key] || systemPrompts[hintType] || systemPrompts.Diary;
}

async function callClaude(apiKey, cloudinaryUrl, hintType, hintSubtype, today) {
  const prompt = buildImagePrompt(hintType || 'Transaction', hintSubtype || null, today);

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

async function callClaudeText(apiKey, textContent, filename, hintType, hintSubtype) {
  const systemPrompt = buildTextPrompt(hintType || 'Diary', hintSubtype || null);
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

  const { cloudinary_url, filename, mime_type, text_content, hint_type, hint_subtype } = body;

  if (!cloudinary_url && !text_content) {
    return errorResponse('cloudinary_url or text_content is required');
  }

  const today = new Date().toISOString().split('T')[0];
  const isText = !!text_content;

  let aiRaw = null;
  let aiError = null;

  try {
    if (isText) {
      aiRaw = await callClaudeText(env.ANTHROPIC_API_KEY, text_content, filename || 'file.txt', hint_type, hint_subtype);
    } else {
      aiRaw = await callClaude(env.ANTHROPIC_API_KEY, cloudinary_url, hint_type, hint_subtype, today);
    }
  } catch (err) {
    aiError = err.message;
    console.error('Claude AI error:', err.message);
  }

  const queueFields = { date_received: today, status: 'Pending' };
  if (cloudinary_url) queueFields.cloudinary_url = cloudinary_url;
  if (hint_type) queueFields.ai_suggested_type = hint_type;

  let aiResult = null;

  if (isText) {
    if (aiRaw) {
      const prefilled = {
        title:      aiRaw.title   || aiRaw.prefilled?.title   || '',
        content:    aiRaw.content || aiRaw.prefilled?.content || text_content,
        tags:       Array.isArray(aiRaw.tags) ? aiRaw.tags.join(', ') : (aiRaw.tags || '')
      };
      if (aiRaw.entry_type || aiRaw.prefilled?.entry_type) prefilled.entry_type = aiRaw.entry_type || aiRaw.prefilled?.entry_type;
      if (aiRaw.author     || aiRaw.prefilled?.author)     prefilled.author     = aiRaw.author     || aiRaw.prefilled?.author;
      if (aiRaw.text       || aiRaw.prefilled?.text)       prefilled.text       = aiRaw.text       || aiRaw.prefilled?.text;
      if (aiRaw.amount     || aiRaw.prefilled?.amount)     prefilled.amount     = aiRaw.amount     || aiRaw.prefilled?.amount;
      if (aiRaw.entity     || aiRaw.prefilled?.entity)     prefilled.entity     = aiRaw.entity     || aiRaw.prefilled?.entity;

      const suggestedType = aiRaw.suggested_type || hint_type || 'Diary';
      queueFields.file_type         = 'Text';
      queueFields.ai_extracted_text = text_content.slice(0, 2000);
      queueFields.ai_description    = aiRaw.description || aiRaw.title || 'Text file';
      queueFields.ai_suggested_type = suggestedType;
      queueFields.ai_prefilled_json = JSON.stringify(prefilled);

      aiResult = { suggested_type: suggestedType, description: aiRaw.description || aiRaw.title || 'Text file analyzed', prefilled };
    } else {
      queueFields.file_type     = 'Text';
      queueFields.ai_description = aiError ? `AI error: ${aiError}` : 'AI analysis not available';
      aiResult = { suggested_type: hint_type || 'Diary', description: 'Could not analyze — please fill manually', prefilled: {} };
    }
  } else {
    if (aiRaw) {
      const prefilled     = aiRaw.prefilled || {};
      const suggestedType = aiRaw.suggested_type || hint_type || 'Transaction';
      // User's explicit Expense/Income choice overrides AI guess
      if (hint_type === 'Transaction' && (hint_subtype === 'Expense' || hint_subtype === 'Income')) {
        prefilled.type = hint_subtype;
      }
      queueFields.file_type         = aiRaw.file_type || 'Image';
      queueFields.ai_extracted_text = aiRaw.extracted_text || '';
      queueFields.ai_description    = aiRaw.description || '';
      queueFields.ai_suggested_type = suggestedType;
      queueFields.ai_prefilled_json = JSON.stringify(prefilled);
      aiResult = { suggested_type: suggestedType, description: aiRaw.description || '', prefilled };
    } else {
      queueFields.file_type     = 'Image';
      queueFields.ai_description = aiError ? `AI error: ${aiError}` : 'AI analysis not available';
      aiResult = { suggested_type: hint_type || 'Transaction', description: 'Could not analyze — please fill manually', prefilled: {} };
    }
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, QUEUE_TABLE, queueFields);
    return jsonResponse({ queue_id: record.id, ai_result: aiResult });
  } catch (err) {
    return errorResponse('Failed to save to queue: ' + err.message, 500);
  }
}
