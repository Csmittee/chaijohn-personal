import { listRecords, listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const PROJECTS   = 'Projects';
const PHASES     = 'ProjectPhases';
const MILESTONES = 'ProjectMilestones';
const TASKS      = 'ProjectTasks';
const RESOURCES  = 'ProjectResources';
const KV_KEY = 'projects_all_v1';
const KV_TTL = 300; // 5 minutes

function linkedId(f) { return Array.isArray(f) ? (f[0] || null) : (f || null); }
function flat(r)     { return { id: r.id, ...r.fields }; }

const PHASE_DEFS = [
  { code: 'DS', name: 'Design' },
  { code: 'PT', name: 'Prototyping' },
  { code: 'PD', name: 'Process dev' },
  { code: 'PV', name: 'Product develop' },
  { code: 'LA', name: 'Launch' }
];

const MILESTONE_DEFS = [
  { name: 'Design exit',      type: 'Design exit',     phase: 'DS' },
  { name: 'Prototype exit',   type: 'Prototype exit',  phase: 'PT' },
  { name: 'Process exit',     type: 'Process exit',    phase: 'PD' },
  { name: 'SOP exit',         type: 'SOP exit',        phase: 'PV' }
];

// ── GET /api/projects ─────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const url    = new URL(request.url);
  const typeF  = url.searchParams.get('type');
  const refresh = url.searchParams.get('refresh') === '1';

  // Cache only unfiltered full list
  const canCache = !typeF;

  if (canCache && !refresh && env.CHAIJOHN_KV) {
    try {
      const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
      if (cached) return jsonResponse({ records: cached, cached: true });
    } catch { /* KV miss — fall through */ }
  }

  try {
    let filter;
    if (typeF) filter = `{type}='${typeF}'`;

    const [projectsRes, tasksRes, resourcesRes] = await Promise.all([
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS,   { filterByFormula: filter, sort: [{ field: 'name', direction: 'asc' }] }),
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TASKS,      {}),
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES,  {})
    ]);

    const projects   = projectsRes.records.map(flat);
    const tasks      = tasksRes.records.map(flat);
    const resources  = resourcesRes.records.map(flat);

    const today = new Date().toISOString().split('T')[0];

    const enriched = projects.map(p => {
      const pid    = p.id;
      const ptasks = tasks.filter(t => {
        const tid = linkedId(t.project_id);
        return tid === pid;
      });
      const presoures = resources.filter(r => linkedId(r.project_id) === pid);

      const totalTasks   = ptasks.length;
      const delayedTasks = ptasks.filter(t => t.status === 'Delayed').length;
      const pendingTasks = ptasks.filter(t => t.status === 'Open' || t.status === 'In progress').length;
      const investmentTotal = presoures.reduce((s, r) => s + Number(r.cost || 0), 0);

      const laFuture = ptasks.filter(t => t.finish_by && t.finish_by >= today && t.status !== 'Done');
      const latestLA = laFuture.length ? laFuture.sort((a,b)=>b.finish_by.localeCompare(a.finish_by))[0].finish_by : null;
      const daysToLaunch = latestLA
        ? Math.ceil((new Date(latestLA) - new Date()) / 86400000)
        : null;

      return { ...p, total_tasks: totalTasks, delayed_tasks: delayedTasks, pending_tasks: pendingTasks, investment_total: investmentTotal, days_to_launch: daysToLaunch };
    });

    if (canCache && env.CHAIJOHN_KV) {
      await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(enriched), { expirationTtl: KV_TTL }).catch(() => {});
    }

    return jsonResponse({ records: enriched });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── POST /api/projects ────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { name } = body;
  if (!name) return errorResponse('name is required');

  try {
    const nameFilter = `LOWER({name})=LOWER("${name.replace(/"/g, '\\"')}")`;
    const existing = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, { filterByFormula: nameFilter });
    if (existing.records.length > 0) {
      return jsonResponse({ error: 'A project with this name already exists', existing_id: existing.records[0].id }, 409);
    }
  } catch { /* non-fatal */ }

  const fields = {
    name,
    type:                 body.type || 'Draft',
    sga_pct:              body.sga_pct !== undefined ? Number(body.sga_pct) : 10,
    finance_opened:       false,
    sales_forecast_sent:  false
  };
  if (body.idea)                    fields.idea                    = body.idea;
  if (body.customer_group)          fields.customer_group          = body.customer_group;
  if (body.problem_solved)          fields.problem_solved          = body.problem_solved;
  if (body.competitor_url)          fields.competitor_url          = body.competitor_url;
  if (body.current_phase)           fields.current_phase           = body.current_phase;
  if (body.life_goal_link)          fields.life_goal_link          = body.life_goal_link;
  if (body.idea_source_id)          fields.idea_source_id          = body.idea_source_id;
  if (body.repo_url)                fields.repo_url                = body.repo_url;
  if (body.target_revenue_monthly)  fields.target_revenue_monthly  = Number(body.target_revenue_monthly);
  if (body.notes)                   fields.notes                   = body.notes;
  fields.created_at = new Date().toISOString().split('T')[0];

  let project;
  try {
    project = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, fields);
  } catch (err) {
    return errorResponse(err.message, 500);
  }

  const pid = project.id;
  const warnings = [];

  const phaseMap = {};
  try {
    for (const ph of PHASE_DEFS) {
      const phRec = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, PHASES, {
        name:        `${name} — ${ph.name}`,
        project_id:  [pid],
        phase_code:  ph.code,
        phase_name:  ph.name,
        status:      'Not started'
      });
      phaseMap[ph.code] = phRec.id;
    }
  } catch (e) {
    console.error('Phase auto-create failed:', e.message);
    warnings.push('phases — run POST /api/setup/schema-projects to create ProjectPhases table');
  }

  try {
    for (const md of MILESTONE_DEFS) {
      await createRecord(env.AIRTABLE_API_KEY, BASE_ID, MILESTONES, {
        project_id:     [pid],
        phase_id:       phaseMap[md.phase] ? [phaseMap[md.phase]] : undefined,
        name:           md.name,
        milestone_type: md.type,
        status:         'Pending'
      });
    }
  } catch (e) {
    console.error('Milestone auto-create failed:', e.message);
    warnings.push('milestones');
  }

  if (Array.isArray(body.tasks) && body.tasks.length > 0) {
    try {
      for (const t of body.tasks) {
        const taskFields = {
          project_id:  [pid],
          title:       t.title,
          status:      'Open',
          assigned_to: t.assigned_to || 'Me',
          priority:    t.priority || 'Medium'
        };
        if (t.finish_by) taskFields.finish_by = t.finish_by;
        if (t.measure)   taskFields.measure   = t.measure;
        if (t.phase_code && phaseMap[t.phase_code]) taskFields.phase_id = [phaseMap[t.phase_code]];
        await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TASKS, taskFields);
      }
    } catch (e) {
      console.error('Task seed failed:', e.message);
      warnings.push('tasks');
    }
  }

  if (Array.isArray(body.resources) && body.resources.length > 0) {
    try {
      for (const r of body.resources) {
        if (!r.item) continue;
        await createRecord(env.AIRTABLE_API_KEY, BASE_ID, RESOURCES, {
          project_id:  [pid],
          item:        r.item,
          time_needed: r.time_needed || '',
          cost:        Number(r.cost || 0),
          status:      'Planned'
        });
      }
    } catch (e) {
      console.error('Resource seed failed:', e.message);
      warnings.push('resources');
    }
  }

  if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});

  return jsonResponse({
    record: { id: pid, ...project.fields },
    warnings: warnings.length ? warnings : undefined
  }, 201);
}
