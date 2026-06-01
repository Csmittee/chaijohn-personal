import { jsonResponse, errorResponse } from '../_airtable.js';

const META    = 'https://api.airtable.com/v0/meta/bases';
const BASE_ID = 'apphBGWfSPL45oSFd';
const delay   = ms => new Promise(r => setTimeout(r, ms));

async function createTable(apiKey, def) {
  const res = await fetch(`${META}/${BASE_ID}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(def)
  });
  if (res.status === 422 || res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const msg  = (body?.error?.message || body?.message || '').toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate') || res.status === 409)
      return { status: 'already_exists', name: def.name, id: null };
    return { status: 'error', name: def.name, error: JSON.stringify(body) };
  }
  if (!res.ok) return { status: 'error', name: def.name, error: await res.text() };
  const data = await res.json();
  return { status: 'created', name: def.name, id: data.id };
}

async function getTableIds(apiKey) {
  const res = await fetch(`${META}/${BASE_ID}/tables`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries((data.tables || []).map(t => [t.name, t.id]));
}

async function addField(apiKey, tableId, def) {
  const res = await fetch(`${META}/${BASE_ID}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(def)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = (body?.error?.message || '').toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate')) return { status: 'already_exists' };
    return { status: 'error', error: JSON.stringify(body) };
  }
  return { status: 'ok' };
}

export async function onRequestPost(context) {
  const { env } = context;
  const key     = env.AIRTABLE_API_KEY;
  const results = [];

  // Phase 1: Create tables without linked-record fields
  const r1 = await createTable(key, {
    name: 'Projects',
    fields: [
      { name: 'name',                    type: 'singleLineText' },
      { name: 'idea',                    type: 'multilineText' },
      { name: 'customer_group',          type: 'singleLineText' },
      { name: 'problem_solved',          type: 'multilineText' },
      { name: 'competitor_url',          type: 'url' },
      { name: 'type',                    type: 'singleSelect',  options: { choices: [{ name:'Active' },{ name:'Draft' },{ name:'Pause' }] } },
      { name: 'current_phase',           type: 'singleSelect',  options: { choices: [{ name:'DS' },{ name:'PT' },{ name:'PD' },{ name:'PV' },{ name:'LA' }] } },
      { name: 'life_goal_link',          type: 'singleLineText' },
      { name: 'idea_source_id',          type: 'singleLineText' },
      { name: 'repo_url',                type: 'url' },
      { name: 'sga_pct',                 type: 'number',        options: { precision: 1 } },
      { name: 'target_revenue_monthly',  type: 'currency',      options: { precision: 0, symbol: '฿' } },
      { name: 'investment_total',        type: 'currency',      options: { precision: 0, symbol: '฿' } },
      { name: 'payback_years',           type: 'number',        options: { precision: 2 } },
      { name: 'finance_opened',          type: 'checkbox',      options: { color: 'greenBright', icon: 'check' } },
      { name: 'sales_forecast_sent',     type: 'checkbox',      options: { color: 'tealBright',  icon: 'check' } },
      { name: 'created_at',              type: 'date',          options: { dateFormat: { name: 'iso' } } },
      { name: 'notes',                   type: 'multilineText' }
    ]
  });
  results.push(r1);
  await delay(300);

  const r2 = await createTable(key, {
    name: 'ProjectPhases',
    fields: [
      { name: 'phase_code',              type: 'singleSelect',  options: { choices: [{ name:'DS' },{ name:'PT' },{ name:'PD' },{ name:'PV' },{ name:'LA' }] } },
      { name: 'phase_name',              type: 'singleLineText' },
      { name: 'status',                  type: 'singleSelect',  options: { choices: [{ name:'Not started' },{ name:'In progress' },{ name:'Complete' }] } },
      { name: 'exit_checklist_complete', type: 'checkbox',      options: { color: 'greenBright', icon: 'check' } },
      { name: 'completed_at',            type: 'date',          options: { dateFormat: { name: 'iso' } } }
    ]
  });
  results.push(r2);
  await delay(300);

  const r3 = await createTable(key, {
    name: 'ProjectMilestones',
    fields: [
      { name: 'name',           type: 'singleLineText' },
      { name: 'milestone_type', type: 'singleSelect',  options: { choices: [{ name:'Design exit' },{ name:'Prototype exit' },{ name:'Process exit' },{ name:'SOP exit' },{ name:'Launch' }] } },
      { name: 'auto_date',      type: 'date',          options: { dateFormat: { name: 'iso' } } },
      { name: 'status',         type: 'singleSelect',  options: { choices: [{ name:'Pending' },{ name:'Reached' },{ name:'Blocked' }] } }
    ]
  });
  results.push(r3);
  await delay(300);

  const r4 = await createTable(key, {
    name: 'ProjectTasks',
    fields: [
      { name: 'title',        type: 'singleLineText' },
      { name: 'finish_by',    type: 'date',         options: { dateFormat: { name: 'iso' } } },
      { name: 'assigned_to', type: 'singleLineText' },
      { name: 'measure',      type: 'singleLineText' },
      { name: 'status',       type: 'singleSelect', options: { choices: [{ name:'Open' },{ name:'In progress' },{ name:'Done' },{ name:'Delayed' }] } },
      { name: 'priority',     type: 'singleSelect', options: { choices: [{ name:'High' },{ name:'Medium' },{ name:'Low' }] } },
      { name: 'dependency_active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
      { name: 'phase_code',   type: 'singleSelect', options: { choices: [{ name:'DS' },{ name:'PT' },{ name:'PD' },{ name:'PV' },{ name:'LA' }] } },
      { name: 'notes',        type: 'multilineText' }
    ]
  });
  results.push(r4);
  await delay(300);

  const r5 = await createTable(key, {
    name: 'ProjectResources',
    fields: [
      { name: 'item',        type: 'singleLineText' },
      { name: 'time_needed', type: 'singleLineText' },
      { name: 'cost',        type: 'currency',      options: { precision: 0, symbol: '฿' } },
      { name: 'status',      type: 'singleSelect',  options: { choices: [{ name:'Planned' },{ name:'Purchased' },{ name:'In use' }] } }
    ]
  });
  results.push(r5);
  await delay(300);

  // Phase 2: Add linked-record fields now that tables exist
  const ids = await getTableIds(key);
  const linkedResults = [];

  if (ids['Projects'] && ids['ProjectPhases']) {
    linkedResults.push(await addField(key, ids['ProjectPhases'], {
      name: 'project_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['Projects'] }
    }));
    await delay(200);
  }
  if (ids['Projects'] && ids['ProjectMilestones']) {
    linkedResults.push(await addField(key, ids['ProjectMilestones'], {
      name: 'project_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['Projects'] }
    }));
    await delay(200);
    linkedResults.push(await addField(key, ids['ProjectMilestones'], {
      name: 'phase_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['ProjectPhases'] }
    }));
    await delay(200);
  }
  if (ids['Projects'] && ids['ProjectTasks']) {
    linkedResults.push(await addField(key, ids['ProjectTasks'], {
      name: 'project_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['Projects'] }
    }));
    await delay(200);
    linkedResults.push(await addField(key, ids['ProjectTasks'], {
      name: 'phase_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['ProjectPhases'] }
    }));
    await delay(200);
    linkedResults.push(await addField(key, ids['ProjectTasks'], {
      name: 'depends_on_project_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['Projects'] }
    }));
    await delay(200);
  }
  if (ids['Projects'] && ids['ProjectResources']) {
    linkedResults.push(await addField(key, ids['ProjectResources'], {
      name: 'project_id', type: 'multipleRecordLinks',
      options: { linkedTableId: ids['Projects'] }
    }));
    await delay(200);
  }

  return jsonResponse({ tables: results, fields: linkedResults, tableIds: ids });
}
