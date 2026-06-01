import { listRecords, getRecord, updateRecord, deleteRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID    = 'apphBGWfSPL45oSFd';
const TASKS      = 'ProjectTasks';
const PHASES     = 'ProjectPhases';
const MILESTONES = 'ProjectMilestones';

function linkedId(f) { return Array.isArray(f) ? (f[0] || null) : (f || null); }
function flat(r)     { return { id: r.id, ...r.fields }; }

// ── PATCH /api/project-tasks/:id ─────────────────────────────────────────────
export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const id = params.id;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const fields = {};
  const allowed = ['title','finish_by','assigned_to','measure','status','priority','notes','phase_code','phase_id','dependency_active'];
  allowed.forEach(k => { if (body[k] !== undefined) fields[k] = body[k]; });
  if (body.phase_id) fields.phase_id = [body.phase_id];
  if (body.depends_on_project_id) {
    fields.depends_on_project_id = [body.depends_on_project_id];
    fields.dependency_active = true;
  }

  try {
    const updated  = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TASKS, id, fields);
    const task     = flat(updated);
    let phaseCompleted = false;

    // When task goes Done: check if all tasks in same phase are done
    if (body.status === 'Done') {
      const phaseId = linkedId(task.phase_id);
      if (phaseId) {
        const phaseTasks = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, TASKS, {
          filterByFormula: `FIND('${phaseId}', ARRAYJOIN(phase_id))`
        });
        const allDone = phaseTasks.records.every(t => t.fields.status === 'Done');
        if (allDone) {
          const today = new Date().toISOString().split('T')[0];
          await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, PHASES, phaseId, { status: 'Complete', completed_at: today });

          // Auto-mark corresponding milestone as Reached
          const msRes = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, MILESTONES, {
            filterByFormula: `FIND('${phaseId}', ARRAYJOIN(phase_id))`
          });
          for (const ms of msRes.records) {
            if (ms.fields.status !== 'Reached') {
              await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, MILESTONES, ms.id, { status: 'Reached', auto_date: today });
            }
          }
          phaseCompleted = true;
        }
      }

      // Clear dependency_active on tasks that depend on this task
      // (self-referencing dependency is stored as a note — not a linked field due to Airtable limitation)
      // Future enhancement: when depends_on_task_id is added, clear it here
    }

    return jsonResponse({ record: task, phase_completed: phaseCompleted });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

// ── DELETE /api/project-tasks/:id ─────────────────────────────────────────────
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  try {
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TASKS, id);
    return jsonResponse({ ok: true, id });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
