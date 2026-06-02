import { listAllRecords, updateRecord, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID  = 'apphBGWfSPL45oSFd';
const PHASES   = 'ProjectPhases';
const PROJECTS = 'Projects';

// ── POST /api/setup/repair-phase-names ───────────────────────────────────────
// One-time repair: patches all ProjectPhases records with blank `name` field.
// Sets name to "{ProjectName} — {phase_name}" using the linked project's name.
export async function onRequestPost(context) {
  const { env } = context;
  try {
    const [phasesRes, projectsRes] = await Promise.all([
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, PHASES, {}),
      listAllRecords(env.AIRTABLE_API_KEY, BASE_ID, PROJECTS, {})
    ]);

    const projectById = {};
    (projectsRes.records || []).forEach(p => { projectById[p.id] = p.fields.name || ''; });

    const phases = (phasesRes.records || []);
    const toFix  = phases.filter(ph => !ph.fields.name || ph.fields.name.trim() === '');

    const results = [];
    for (const ph of toFix) {
      const linkedIds = ph.fields.project_id;
      const projId    = Array.isArray(linkedIds) ? linkedIds[0] : null;
      const projName  = projId ? (projectById[projId] || '') : '';
      const phaseName = ph.fields.phase_name || ph.fields.phase_code || '';
      const newName   = projName ? `${projName} — ${phaseName}` : phaseName;
      if (!newName) { results.push({ id: ph.id, skipped: true }); continue; }
      await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, PHASES, ph.id, { name: newName });
      results.push({ id: ph.id, name: newName });
    }

    return jsonResponse({ repaired: results.length, details: results });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
