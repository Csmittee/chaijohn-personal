import { createRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const AI_CHATS_TABLE = 'AI_Chats';

const SYSTEM_PROMPT_PREFIX = `You are a personal finance and business strategy advisor for a Thai entrepreneur based in Rayong, Thailand. You advise on cashflow management, debt reduction, collection asset sales, and business investment decisions. Always answer in English. Be direct, specific, and practical.
Current financial snapshot: `;

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // Sub-path: save session after chat completes
  if (url.pathname === '/api/ai-chat/save') {
    return handleSave(context);
  }

  // Main: stream Claude response
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { messages, session_id, context_json } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse('messages array is required');
  }

  const systemPrompt = SYSTEM_PROMPT_PREFIX + (context_json || '{}');

  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
        stream: true
      })
    });
  } catch (err) {
    return errorResponse('Claude API request failed: ' + err.message, 500);
  }

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return errorResponse(`Claude API error: ${errText}`, claudeRes.status);
  }

  // Pass the SSE stream directly through to the client
  return new Response(claudeRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

async function handleSave(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { session_id, messages_json, topic } = body;
  if (!session_id || !messages_json) {
    return errorResponse('session_id and messages_json are required');
  }

  const today = new Date().toISOString().split('T')[0];

  // Generate summary using Claude (non-streaming)
  let summary = '';
  try {
    const summaryRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Summarize this conversation in 2 sentences for a diary record. Focus on decisions made or insights reached. Messages: ${messages_json}`
        }]
      })
    });

    if (summaryRes.ok) {
      const summaryData = await summaryRes.json();
      summary = summaryData.content[0].text || '';
    }
  } catch (err) {
    console.error('Summary generation failed:', err.message);
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, AI_CHATS_TABLE, {
      session_id,
      date: today,
      topic: topic || 'General',
      messages_json,
      summary
    });
    return jsonResponse({ ok: true, record_id: record.id });
  } catch (err) {
    return errorResponse('Failed to save chat session: ' + err.message, 500);
  }
}
