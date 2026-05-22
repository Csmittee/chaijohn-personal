import { jsonResponse, errorResponse } from '../_airtable.js';

const META = 'https://api.airtable.com/v0/meta/bases';
const BASE_ID = 'apphBGWfSPL45oSFd';

const DESIRED_CHOICES = ['Story', 'Idea', 'Blog', 'Project', 'Skill'];
const REMOVE_CHOICES  = ['Finance note'];

export async function onRequestPost(context) {
  const { env } = context;
  const apiKey = env.AIRTABLE_API_KEY;
  if (!apiKey) return errorResponse('AIRTABLE_API_KEY not set', 500);

  // 1. Fetch Diary table schema
  const tablesRes = await fetch(`${META}/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!tablesRes.ok) return errorResponse(`Failed to list tables: ${tablesRes.status}`, 500);
  const tablesData = await tablesRes.json();

  const diaryTable = (tablesData.tables || []).find(t => t.name === 'Diary');
  if (!diaryTable) return errorResponse('Diary table not found', 404);

  const entryTypeField = (diaryTable.fields || []).find(f => f.name === 'entry_type');
  if (!entryTypeField) return errorResponse('entry_type field not found', 404);

  const currentChoices = entryTypeField.options?.choices || [];

  // 2. Build updated choices: keep existing IDs, remove unwanted, add missing
  const newChoices = [];
  currentChoices.forEach(c => {
    if (REMOVE_CHOICES.includes(c.name)) return;
    newChoices.push({ id: c.id, name: c.name });
  });
  const existing = newChoices.map(c => c.name);
  DESIRED_CHOICES.forEach(name => {
    if (!existing.includes(name)) newChoices.push({ name });
  });

  // 3. Patch field
  const patchRes = await fetch(
    `${META}/${BASE_ID}/tables/${diaryTable.id}/fields/${entryTypeField.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: { choices: newChoices } })
    }
  );
  if (!patchRes.ok) {
    const err = await patchRes.text();
    return errorResponse(`Failed to update field: ${err}`, 500);
  }

  const result = await patchRes.json();
  return jsonResponse({ ok: true, choices: result.options?.choices?.map(c => c.name) });
}
