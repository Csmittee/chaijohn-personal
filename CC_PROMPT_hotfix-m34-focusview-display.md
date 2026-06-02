# CC_PROMPT_hotfix-m34-focusview-display.md
> Hotfix — M3.4 focus view not rendering tasks/resources despite data in Airtable
> Data confirmed present in Airtable. Pure display/render bug.
> Branch: fix/hotfix-m34-focusview
> Merge to main after owner confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L087 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_hotfix-m34-focusview-display.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/projects.injector.js` — full file, focus on:
   - `renderFocusView(projectId)` function
   - `loadAll()` function — what data shape it builds
   - `allProjects` array — what fields each project object has after loadAll
3. `functions/api/projects.js` — GET handler, what fields are returned per project
4. `functions/api/projects/[id].js` — GET handler, full response shape including
   tasks array, resources array, phases array, milestones array

Read all 4 before writing a single line.

---

## CONFIRMED FACTS FROM AIRTABLE (owner verified)

**ProjectTasks table — 5 records confirmed:**
- Prepare code · finish_by 2026-06-30 · Me · Open · Medium
- Do marketing · finish_by 2026-07-10 · Me · Open · Medium
- Test with small guest · finish_by 2026-06-16 · Me · Open · Medium
- Create the backend · finish_by 2026-06-01 · Me · Open · Medium
- Create the prototype mac... · Me · Open · Medium
(first 3 = Ploikong, last 2 = Satu 1.0 — verify project_id links in API)

**ProjectResources table — 6 records confirmed:**
- Coding · 2 weeks · ฿20,000 · Planned · Ploikong
- Marketing · 1 week · ฿10,000 · Planned · Ploikong
- Prototype component · ฿30,000 · Planned · Satu 1.0
- Coding and testing · ฿20,000 · Planned · Satu 1.0
- Creation of prototype · ฿10,000 · Planned · Satu 1.0
- Marketing · ฿20,000 · Planned · Satu 1.0

**ProjectPhases — 10 records confirmed:** 5 per project, all linked correctly
**ProjectMilestones — 8 records confirmed:** phase_id shows "Unnamed record" — link broken

**Lane view shows:** Ploikong "3 tasks · ฿30,000", Satu 1.0 "2 tasks · ฿80,000"
These counts/amounts are WRONG — confirm correct values from API response.

---

## BUG 1 — Focus view shows empty tasks and resources despite data in Airtable

**File:** `public/assets/js/projects.injector.js`

**Diagnosis:** The focus view calls `/api/projects/:id` for full detail.
Read the actual response shape from `functions/api/projects/[id].js`.

Check these specific things:
1. Does the response return `tasks` at the top level, or nested under another key?
2. Are tasks already flattened `{ id, title, finish_by, ... }` or still `{ id, fields: {} }`?
3. Same questions for `resources` array
4. What is `project_id` field type in tasks/resources? Is it a string or array?
   (Airtable linked record fields return as arrays — `["recXXX"]` not `"recXXX"`)

**Fix `renderFocusView(projectId)`:**

After fetching `/api/projects/:id`, log the full response to console first
(add `console.log('focus detail:', JSON.stringify(detail).slice(0,500))`)
to confirm actual shape. Then render based on actual shape.

Tasks must render even when `phase_id` is null/missing — group by phase_code
if available, otherwise render flat list under "All tasks" heading.

Resources must render as a table: item · time_needed · cost · status.
Show totals row at bottom.

Never show empty section when data exists. If tasks.length > 0, always render them.

---

## BUG 2 — Lane view task/resource counts incorrect

**File:** `functions/api/projects.js` GET list handler

Lane view shows Ploikong "3 tasks · ฿30,000" (tasks correct, cost should be ฿30,000 ✅)
and Satu 1.0 "2 tasks · ฿80,000" (should be 3 tasks, ฿80,000).

Read the GET list handler. Check how tasks are filtered per project:
```javascript
const ptasks = tasks.filter(t => {
  const tid = linkedId(t.project_id);
  return tid === pid;
});
```

`project_id` in ProjectTasks is a linked record field — Airtable returns it as
`["recXXXX"]` (array). The `linkedId()` helper should handle this.

Check if `linkedId()` correctly extracts from both array and string formats.
If tasks are linked by project name string (not record ID), the filter by record ID fails.

**Fix:** Read actual ProjectTasks records from Airtable Meta API to see what
`project_id` field contains. If it's a text field with project name (e.g. "Ploikong"),
filter by name not by record ID:
```javascript
const ptasks = tasks.filter(t => t.project_id === p.name || linkedId(t.project_id) === pid);
```

---

## BUG 3 — ProjectMilestones phase_id shows "Unnamed record" (link broken)

**Confirmed from Airtable:** `phase_id` column shows "Unnamed record" for all 8 milestones.

This means milestones were created with a `phase_id` linked record reference that points to
a phase record with no `name` field value — the phase record exists but `name` is blank.

**Root cause:** `ProjectPhases` primary field is `name` (singleLineText per L071).
When phases are auto-created, the `name` field must be populated.
Read `functions/api/projects.js` POST handler — find the phase auto-creation block.
Check what value is set for the `name` field when creating phase records.

If `name` is being set to empty string or undefined, Airtable creates the record
with blank name — it appears as "Unnamed record" in linked field display.

**Fix in `functions/api/projects.js` POST handler:**
When auto-creating phases, set `name` to a meaningful value:
```javascript
name: `${projectName} — ${phaseDef.name}`
// e.g. "Ploikong — Design"
```

This also fixes milestone phase_id display and makes the phase timeline in
focus view show correct phase names.

**Also fix existing records:** After the code fix, owner will need to manually
update the 10 existing phase records in Airtable to add name values, OR
write a one-time repair endpoint. Recommend: add a repair endpoint
`POST /api/setup/repair-phase-names` that reads all ProjectPhases records
with blank name and patches them with `{projectName} — {phase_name}`.

---

## BUG 4 — M2.4 Budget Cards (resources) not showing in expanded view

**File:** `public/assets/js/project-finance.injector.js`

`loadProjectResources(projId)` calls `/api/projects/:id` and reads `res.resources`.

Now that we know resources ARE in Airtable, the issue is either:
1. The field name `res.resources` doesn't match the API response key, OR
2. Each resource object fields don't match what `resourceCardHtml(r)` expects

Read the actual API response from `functions/api/projects/[id].js`.
Find the exact key name for resources in the response.
Find the exact field names on each resource object.

Fix `resourceCardHtml(r)` to use correct field names from the actual API response.
Do NOT change the API — fix the injector render function only.

---

## BUG 5 — Edit drawer shows Resources 0 items / Tasks 0 defined on re-open

**File:** `public/assets/js/projects.injector.js`

When owner opens Edit for an existing project, the drawer should pre-populate
with existing tasks and resources from Airtable.

Read `openDrawer('edit', projectId)` — check if it fetches the project detail
from `/api/projects/:id` to pre-fill `drawerResources` and `drawerTasks` arrays
before rendering the drawer HTML.

If it only pre-fills the top-level project fields (name, revenue, sga_pct) but
does NOT fetch and pre-fill tasks/resources, the drawer always shows empty sections.

**Fix:** In `openDrawer('edit', projectId)`:
1. Fetch `/api/projects/:id` before opening drawer
2. Pre-fill `drawerResources` from `detail.resources` array
3. Pre-fill `drawerTasks` from `detail.tasks` array
4. Map field names to match drawer state shape:
   - resource: `{ item, time_needed, cost, status }`
   - task: `{ title, finish_by, assigned_to, measure, phase_code }`

Also fix: when Save changes (PATCH) is clicked for an edit session, after
saving the project fields, POST any NEW resources/tasks (those without an id)
to their respective APIs. Resources with existing ids should be PATCHed if changed.

---

## DO NOT TOUCH

- `public/assets/js/cashflow.injector.js`
- `public/assets/js/expenses.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/sales.injector.js` — just fixed, do not touch
- `public/assets/js/collection.injector.js` — just fixed, do not touch
- `public/assets/js/entry.injector.js`
- `functions/api/sales.js`
- `functions/api/transactions.js`

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — M3.4 focus view tasks/resources render, phase names, M2.4 budget cards`

2. Append to RULES.md (next L-number after L087):
   - ProjectTasks/Resources project_id linking: verify field type (linked record array
     vs text string) before filtering. Use both linkedId() and name match as fallback.
   - Phase auto-create: name field MUST be set to "{projectName} — {phaseName}".
     Blank name = "Unnamed record" in all linked displays.
   - Edit drawer must pre-fetch /api/projects/:id to pre-fill drawerResources +
     drawerTasks before rendering. Never open edit drawer with empty state.

3. Update PROJECT_STATE.md current state

4. Commit docs: `docs: update RULES and PROJECT_STATE after hotfix-m34-focusview`

---

## COMMIT ORDER

```
fix(api): projects.js — phase name field set correctly on auto-create
fix(api): setup/repair-phase-names endpoint — patch existing blank phase names
fix(m34): projects.injector.js — focus view renders tasks and resources from API detail
fix(m34): projects.injector.js — lane view task/resource count filter (linkedId + name fallback)
fix(m34): projects.injector.js — edit drawer pre-fetches and pre-fills tasks + resources
fix(m24): project-finance.injector.js — resourceCardHtml field names match API response
docs: update RULES and PROJECT_STATE after hotfix-m34-focusview
```

Branch: `fix/hotfix-m34-focusview`
Merge to main after owner confirms:
- [ ] M3.4 focus view shows all tasks (grouped by phase or flat list)
- [ ] M3.4 focus view shows all resources with costs and totals
- [ ] M3.4 Edit drawer pre-fills existing tasks and resources on open
- [ ] M3.4 lane view shows correct task counts per project
- [ ] M3.4 lane view shows correct investment total per project
- [ ] M2.4 expanded view shows Budget Cards (resources) for both projects
- [ ] Phase names in Airtable no longer show "Unnamed record"
- [ ] Owner runs POST /api/setup/repair-phase-names → confirms phases named correctly
