# CC_PROMPT_bugfix_qa-blockers.md
> ✅ COMPLETE — 2026-06-01 — bugfix: ProjectPhases 403, duplicate save guard, row harvest, panel placeholder, AI inquiry
> Fix 5 confirmed bugs. All root causes verified from live screenshots + index.html inspection.
> Do not re-investigate confirmed facts. Read source files, fix, commit.

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 5 rules (required always)
2. RULES.md         — compact lessons (required before every task)
3. PROJECT_STATE.md — phases, roadmap, file inventory (required for build sessions)

Then read and execute: docs/prompts/CC_PROMPT_bugfix_qa-blockers.md
```

---

## CONFIRMED FACTS — verified from source, do not re-investigate

**Airtable token:** Full permissions — data.records:read/write, schema.bases:read/write,
all bases. Token is NOT the cause of any bug. Never raise this again.

**Airtable tables present:** Categories, Assets, Diary, AI_Chats, Drop_Zone_Queue,
Quotes, Utilities, Liabilities, Transactions, Budgets, Liability_Payments,
Projects, ProjectMilestones, ProjectTasks, ProjectResources.
**ProjectPhases is MISSING** — confirmed absent.

**Cloudflare env vars:** All confirmed set. Do not question these.

**index.html — confirmed panel IDs (read the file, these are exact):**
- `id="panel-sales"` (line 789) — contains `<div class="coming-soon">sales — coming soon</div>`
- `id="panel-projects"` (line 838) — contains `<div class="coming-soon">projects — coming soon</div>`
- `id="panel-proj-assets"` (line 1182) — contains `<div class="coming-soon">project assets — coming soon</div>`

**index.html — confirmed script tags present (lines 1525-1527):**
```html
<script src="/assets/js/projects.injector.js" defer></script>
<script src="/assets/js/project-finance.injector.js" defer></script>
<script src="/assets/js/sales.injector.js" defer></script>
```
All three injector script tags ARE in index.html. Script loading is NOT the problem.

**What this means for Bug 4 (Sales panel):**
`sales.injector.js` is loaded. `#panel-sales` exists with correct ID.
The placeholder `<div class="coming-soon">` is still inside `#panel-sales`.
The injector is either:
A) Not clearing the panel div before rendering (appends after the placeholder), OR
B) Crashing silently before it renders (check for JS errors in sales.injector.js init)
Read `public/assets/js/sales.injector.js` and diagnose which.

**What this means for Bug 1 (M2.4 Finance Projects):**
`project-finance.injector.js` targets `#panel-projects` — correct per L062.
That panel also has a `.coming-soon` placeholder still in it.
Same diagnosis as Sales: injector loaded but placeholder not cleared.
Read `public/assets/js/project-finance.injector.js` and diagnose.

**Architecture — three completely separate things:**
- projects.injector.js → #panel-proj-assets = M3.4 operational management (tasks, phases)
- project-finance.injector.js → #panel-projects = M2.4 financial controller (budget cards)
- sales.injector.js → #panel-sales = M2.2 earn aggregator (business lanes, revenue)

---

## ROOT CAUSE CHAIN — confirmed, do not re-investigate

```
User fills Create Project form → clicks Save draft or Push Active
→ projects.js POST handler:
    Step 1: creates Project record in Airtable → SUCCEEDS ✅
    Step 2: auto-creates ProjectPhases records → FAILS ❌
            ProjectPhases table does not exist in Airtable
            Airtable returns 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND
            (403 = table not found, NOT a permissions error — token is full access)
    Step 3: error thrown → UI shows red "Airtable create error 403..."
            button stays frozen — user clicks again → another Project record created
→ Result: 13 identical duplicate records, all with 0 tasks / ฿0 (enrichment also fails)
```

---

## BUG 1 — ProjectPhases missing: fix schema + fix save resilience

### Part A — Fix `functions/api/setup/schema-projects.js`

Make fully idempotent with tableExists guard:

```javascript
async function tableExists(baseId, tableName, apiKey) {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const data = await res.json();
  return data.tables?.some(t => t.name === tableName);
}
```

Wrap every table creation:
```javascript
if (!await tableExists(baseId, 'ProjectPhases', apiKey)) {
  // create ProjectPhases — non-linked fields first
}
```

ProjectPhases — non-linked fields (Phase 1):
| Field | Type | Options |
|---|---|---|
| phase_code | singleSelect | DS, PT, PD, PV, LA |
| phase_name | singleLineText | |
| status | singleSelect | Not started, In progress, Complete |
| exit_checklist_complete | checkbox | |
| completed_at | date | |

Phase 2 (after both tables confirmed to exist):
Add `project_id` as multipleRecordLinks → Projects table.
Add 300ms delay between Meta API calls to avoid rate limiting.

### Part B — Fix `functions/api/projects.js` POST handler

Read fresh. Wrap ALL secondary auto-creates in individual try/catch.
Primary save (Project record) must ALWAYS succeed and return 201.
Secondary failures (phases, milestones, tasks) must log but never rethrow:

```javascript
// After successful project record creation (newProjectId confirmed):
const warnings = [];

try {
  await createProjectPhases(newProjectId);
} catch(e) {
  console.error('Phase auto-create failed:', e.message);
  warnings.push('phases');
}

try {
  await createProjectMilestones(newProjectId);
} catch(e) {
  console.error('Milestone auto-create failed:', e.message);
  warnings.push('milestones');
}

return new Response(JSON.stringify({
  ...newProject,
  warnings: warnings.length ? `Auto-create failed for: ${warnings.join(', ')} — run /api/setup/schema-projects` : null
}), { status: 201 });
```

### Part C — Fix GET enrichment in `functions/api/projects.js`

Wrap ALL ProjectPhases queries in try/catch — return empty array on failure:

```javascript
let phases = [];
try {
  phases = await listRecords('ProjectPhases', { filterByFormula: `{project_id} = '${id}'` });
} catch(e) {
  console.error('ProjectPhases unavailable:', e.message);
}
```

Same pattern in project-tasks.js and project-resources.js if they reference ProjectPhases.
GET /api/projects must return valid JSON even when ProjectPhases does not exist.

---

## BUG 2 — Duplicate saves: no UI guard, no server dedup

### Part A — isSubmitting guard in `public/assets/js/projects.injector.js`

```javascript
let isSubmitting = false;

async function handleSave(type) {
  if (isSubmitting) return;
  isSubmitting = true;
  const btn = type === 'draft' ? saveDraftBtn : pushActiveBtn;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await submitProject(type);
    closeDrawer();
    await refreshProjects();
  } catch(e) {
    showInlineError(e.message);
    btn.disabled = false;
    btn.textContent = originalText;
  } finally {
    isSubmitting = false;
  }
}
```

Match function and variable names to what actually exists in the file (L010).

### Part B — Server-side dedup in `functions/api/projects.js` POST

```javascript
const nameFilter = `LOWER({name}) = LOWER("${body.name.replace(/"/g, '\\"')}")`;
const existing = await listRecords('Projects', { filterByFormula: nameFilter });
if (existing.length > 0) {
  return new Response(JSON.stringify({
    error: 'A project with this name already exists',
    existing_id: existing[0].id
  }), { status: 409 });
}
```

Injector handles 409: show inline error, keep drawer open, do not create record.

---

## BUG 3 — Task and Resource rows reset on "+ Add"

In `public/assets/js/projects.injector.js`:

Read fresh. Find resource rows state array and render function.
Match querySelector selectors to ACTUAL rendered HTML attributes (L010).

```javascript
function harvestResourceRows() {
  const rows = document.querySelectorAll('.resource-row');
  resourceRows = Array.from(rows).map(row => ({
    item: row.querySelector('[data-field="item"]').value || '',
    cost: row.querySelector('[data-field="cost"]').value || '',
    status: row.querySelector('[data-field="status"]').value || 'Planned'
  }));
}

function harvestTaskRows() {
  const rows = document.querySelectorAll('.task-row');
  taskRows = Array.from(rows).map(row => ({
    title: row.querySelector('[data-field="title"]').value || '',
    finish_by: row.querySelector('[data-field="finish_by"]').value || '',
    assigned_to: row.querySelector('[data-field="assigned_to"]').value || 'Me',
    measure: row.querySelector('[data-field="measure"]').value || '',
    phase_code: row.querySelector('[data-field="phase_code"]').value || 'DS'
  }));
}
```

Call harvest before every add and before every save:
```javascript
addResourceBtn.addEventListener('click', () => {
  harvestResourceRows();
  resourceRows.push({ item: '', cost: '', status: 'Planned' });
  renderResourceRows();
});
```

Call both harvest functions at start of submitProject() before building payload.

---

## BUG 4 — Sales panel shows placeholder / Finance Projects shows placeholder

**Confirmed:** Script tags exist. Panel IDs match. Placeholder divs are still in HTML.
The injectors are loaded but not replacing the placeholder content.

**Fix process for BOTH `sales.injector.js` AND `project-finance.injector.js`:**

Read each file fresh. Find the init function that targets the panel.
Check: does init call `panel.innerHTML = ''` before rendering?
If not — the injector appends its content after the `.coming-soon` div.

Fix: clear the panel before rendering:
```javascript
const panel = document.getElementById('panel-sales'); // or panel-projects
panel.innerHTML = '';  // clear placeholder before injecting content
// then render normally
```

Also check: is the injector crashing silently on init?
Look for any uncaught errors in the boot sequence (failed fetch, null reference).
Wrap init in try/catch and log any error to console.

After fix:
- Finance → Sales: shows summary strip + lanes structure (empty lanes OK)
- Finance → Projects: shows boundary cards (empty OK if no finance_opened projects)

---

## BUG 5 — AI inquiry: "AI error: messages array is required"

Read `public/assets/js/projects.injector.js` fresh.
Find runAiInquiry function (L054i).
Read `functions/api/ai-chat.js` fresh — confirm exact field name it reads.

Fix payload to match what ai-chat.js actually expects:
```javascript
body: JSON.stringify({
  messages: [{ role: 'user', content: promptString }]
})
```

---

## DO NOT TOUCH

- functions/api/auth.js, functions/_middleware.js
- cashflow.injector.js, expenses.injector.js, liabilities-panel.injector.js,
  budget-panel.injector.js, entry.injector.js
- index.html panel IDs, sidebar nav links, routing logic
- The 401 errors on /api/assets, /api/categories on page load — pre-existing (L039)
- Duplicate Ploikong records — owner deletes manually in Airtable

---

## OWNER ACTIONS AFTER MERGE

1. `POST https://chaijohn-dashboard.pages.dev/api/setup/schema-projects`
   — creates missing ProjectPhases table
2. Delete 12 of 13 duplicate Ploikong records in Airtable (keep one)

---

## AFTER ALL FIXES — MANDATORY

1. Move prompt → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — bugfix: ProjectPhases 403, duplicate save guard, row harvest, panel placeholder, AI inquiry`

2. Update `PROJECT_STATE.md` — CURRENT STATE:
   - List confirmed working, note remaining owner actions

3. Append to `RULES.md` (next after L062g):
   - L063: 403 from Airtable on create = table does not exist, not permissions.
     Token is full access. Check table existence before concluding permissions issue.
   - L064: Secondary auto-creates (phases, milestones) must be individually
     wrapped in try/catch. Primary record save must always return 201.
   - L065: isSubmitting guard on all save buttons. Disable on first click,
     re-enable only on error. Prevents duplicates on slow Cloudflare cold start.
   - L066: POST dedup — case-insensitive name check, 409 before create.
   - L067: Harvest-before-add — read DOM → state before re-rendering rows.
   - L068: schema-projects must be idempotent — tableExists() on every table.
   - L069: AI chat payload — `{ messages: [{ role:'user', content:string }] }`.
   - L070: Panel init must call `panel.innerHTML = ''` before rendering to
     clear any placeholder content left in HTML. Never append to placeholder.

4. Commit: `docs: update PROJECT_STATE and RULES after qa-blocker fixes`

---

## COMMIT ORDER

```
fix(schema): schema-projects.js — idempotent tableExists, ProjectPhases creation
fix(api): projects.js — try/catch on auto-creates, 409 name dedup, graceful phase fetch
fix(m34): projects.injector.js — isSubmitting guard, harvest-before-add, AI inquiry payload
fix(m22): sales.injector.js — clear panel placeholder before render, fix silent init crash
fix(m24): project-finance.injector.js — clear panel placeholder before render
docs: update PROJECT_STATE and RULES after qa-blocker fixes
```

Branch: `fix/qa-blockers`
Merge to main after owner confirms:

- [ ] Save draft: shows "Saving…", saves once, no duplicate on repeated click
- [ ] Push Active: same guard
- [ ] Duplicate project name: shows error, drawer stays open
- [ ] + Add resource: existing row data preserved
- [ ] + Add task: existing row data preserved
- [ ] AI inquiry: returns AI response, not error message
- [ ] Finance → Sales: shows panel structure (not "coming soon")
- [ ] Finance → Projects: shows panel structure (not "coming soon")
- [ ] After owner runs schema-projects: project cards show real task/resource counts
