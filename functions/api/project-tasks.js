import { listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const BASE_ID    = 'apphBGWfSPL45oSFd';
const TASKS      = 'ProjectTasks';
const PHASES     = 'ProjectPhases';
const MILESTONES = 'ProjectMilestones';
const PROJECTS   = 'Projects';

function linkedId(f) { return Array.isArray(f) ? (f[0] || null) : (f || null); }
function flat(r)     { return { id: r.id, ...r.fields }; }

// ── GET /api/project-tasks?project_id=X ──────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const url       = new URL(request.url);
  const projectId = url.searchParams.get('project_id');
  const dueToday  = url.searchParams.get('due_today') === 'true';

  const today = new Date().toISOString().split('T')[0];
  let filter;
  if (dueToday) {
    filter = `AND(NOT({status}='Done'), {finish_by}<='${today}')`;
  } else if (projectId) {
    filter = `FIND('${projectId}', ARRAYJOIN(project_id))`;
  }

  try {
    const res = await listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, TASKS, {
      filterByFormula: filter,
      sort: [{ field: 'finish_by', direction: 'asc' }]
    });
    const tasks = res.records.map(flat);
    return jsonResponse({ records: tasks });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── POST /api/project-tasks ───────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { title, project_id } = body;
  if (!title || !project_id) return errorResponse('title and project_id are required');

  const fields = {
    title,
    project_id:   [project_id],
    status:       'Open',
    assigned_to:  body.assigned_to || 'Me',
    priority:     body.priority    || 'Medium'
  };
  if (body.finish_by)   fields.finish_by   = body.finish_by;
  if (body.measure)     fields.measure     = body.measure;
  if (body.notes)       fields.notes       = body.notes;
  if (body.phase_code)  fields.phase_code  = body.phase_code;
  if (body.phase_id)    fields.phase_id    = [body.phase_id];
  if (body.depends_on_project_id) {
    fields.depends_on_project_id = [body.depends_on_project_id];
    fields.dependency_active     = true;
  }

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TASKS, fields);
    return jsonResponse({ record: flat(record) }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
