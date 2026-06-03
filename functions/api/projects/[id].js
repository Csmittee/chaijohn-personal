import { listRecords, listAllRecords, getRecord, updateRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const KV_KEY = 'projects_all_v1';

async function ensureCheckboxFields(apiKey, baseId, tableNameToFind, fieldNames) {
  try {
    const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    const table = (meta.tables || []).find(t => t.name === tableNameToFind);
    if (!table) return;
    const existingFields = new Set((table.fields || []).map(f => f.name));
    for (const fieldName of fieldNames) {
      if (existingFields.has(fieldName)) continue;
      await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fieldName, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } })
      });
    }
  } catch (_) {}
}

const BASE_ID    = 'apphBGWfSPL45oSFd';
const PROJECTS   = 'Projects';
const PHASES     = 'ProjectPhases';
const MILESTONES = 'ProjectMilestones';
const TASKS      = 'ProjectTasks';
const RESOURCES  = 'ProjectResources';

function linkedId(f) { return Array.isArray(f) ? (f[0] || null) : (f || null); }
function flat(r)     { return { id: r.id, ...r.fields }; }

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  try {
    // Fetch project first — its name is required for the linked record filter.
    // ARRAYJOIN({project_id}) in Airtable formulas returns primary field values
    // (project names), NOT record IDs, so FIND(recordId, ARRAYJOIN) always fails.
    const projResult = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, id);
    if (!projResult) throw new Error('Project not found');
    const project = flat(projResult);

    const pName = (project.name || '').replace(/'/g, "\\'");
    const nameFilter = `ARRAYJOIN({project_id})='${pName}'`;

    const [phasesRes, milestonesRes, tasksRes, resourcesRes] = await Promise.allSettled([
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, PHASES,     { filterByFormula: nameFilter }),
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, MILESTONES, { filterByFormula: nameFilter }),
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TASKS,    { filterByFormula: nameFilter, sort: [{ field: 'finish_by', direction: 'asc' }] }),
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES,  { filterByFormula: nameFilter })
    ]);

    const phases     = phasesRes.status === 'fulfilled'     ? (phasesRes.value.records || []).map(flat)     : [];
    const milestones = milestonesRes.status === 'fulfilled' ? (milestonesRes.value.records || []).map(flat) : [];
    const tasks      = tasksRes.status === 'fulfilled'     ? (tasksRes.value.records || []).map(flat)     : [];
    const resources  = resourcesRes.status === 'fulfilled' ? (resourcesRes.value.records || []).map(flat) : [];

    // Compute task counts per phase
    const phaseMap = {};
    phases.forEach(ph => { phaseMap[ph.id] = ph; });

    // Auto-date milestones: latest finish_by of tasks in that phase
    const milestonesEnriched = milestones.map(ms => {
      const phId   = linkedId(ms.phase_id);
      const phCode = phId ? (phaseMap[phId]?.phase_code || null) : null;
      const phTasks = tasks.filter(t => linkedId(t.phase_id) === phId && t.finish_by);
      const autoDate = phTasks.length ? phTasks.sort((a,b)=>b.finish_by.localeCompare(a.finish_by))[0].finish_by : ms.auto_date || null;
      return { ...ms, auto_date: autoDate, phase_code: phCode };
    });

    // P&L summary
    const investmentTotal = resources.reduce((s,r) => s + Number(r.cost || 0), 0);
    const sga    = Number(project.sga_pct || 10) / 100;
    const revMo  = Number(project.target_revenue_monthly || 0);
    const netMo  = revMo * (1 - sga);
    const payback = netMo > 0 ? investmentTotal / netMo / 12 : null;

    return jsonResponse({ record: { ...project, investment_total_actual: investmentTotal, net_monthly: netMo, payback_years_calc: payback }, phases, milestones: milestonesEnriched, tasks, resources });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────
export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const id = params.id;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const fields = {};
  const allowed = ['name','idea','customer_group','problem_solved','competitor_url','type','current_phase',
    'life_goal_link','repo_url','sga_pct','target_revenue_monthly','investment_total','finance_opened',
    'sales_forecast_sent','notes'];
  allowed.forEach(k => { if (body[k] !== undefined) fields[k] = body[k]; });

  // Validate: sales_forecast_sent requires target_revenue_monthly
  if (body.sales_forecast_sent === true) {
    const existing = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, id);
    const rev = body.target_revenue_monthly ?? existing.fields.target_revenue_monthly;
    if (!rev || Number(rev) <= 0)
      return errorResponse('target_revenue_monthly must be set before sending to Sales', 422);
  }

  if (fields.sales_forecast_sent !== undefined || fields.finance_opened !== undefined) {
    await ensureCheckboxFields(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, ['sales_forecast_sent', 'finance_opened']);
  }

  try {
    const updated = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, id, fields);
    const result  = { ...updated.fields, id };

    // Signal UI to prompt "Open Finance?" when project goes Active
    let finance_ready = false;
    if (body.type === 'Active' && !body.finance_opened) {
      const existing = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, id);
      if (!existing.fields.finance_opened) finance_ready = true;
    }

    if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
    return jsonResponse({ record: result, finance_ready });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── DELETE /api/projects/:id — soft delete (set type=Draft) ──────────────────
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  try {
    await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, id, { type: 'Draft' });
    if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
    return jsonResponse({ ok: true, id, type: 'Draft' });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
