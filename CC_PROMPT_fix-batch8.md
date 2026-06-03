# CC_PROMPT_fix-batch8.md
> Batch 8 — M3.4 task display, phase auto-dates from tasks, payback display fix, AI task auto-add, P&L 4.4 placeholder
> Branch: fix/batch8
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L115 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_fix-batch8.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/projects.injector.js` — full file, all sections
3. `functions/api/project-tasks.js` — POST handler, field list
4. `functions/api/projects.js` — GET list response shape (phases, tasks included?)
5. `functions/api/projects/[id].js` — GET detail response shape (tasks + phases)
6. `index.html` — sidebar nav structure (for 4.4 P&L placeholder link)

Read all 6 before writing a single line.

---

## FIX 1 — projects.injector.js: task display in focus view — table-row format with phase badge + collapsible + filter

**Current:** Tasks in focus view render as colored left-border divs stacked vertically, grouped loosely by phase label. Hard to scan, no filter, no collapse.

**New design — replace the entire task section in `renderFocusView()`:**

### Layout
Render tasks as a compact table with columns: `[ Phase badge | Task title | Finish by | Status dropdown ]`

```javascript
// Task section header with filter toggle
html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:0.75rem 0 0.35rem">
  <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em">TASKS</div>
  <div style="display:flex;gap:0.35rem">
    <button class="proj-task-filter" data-filter="all" style="font-size:0.65rem;padding:0.15rem 0.5rem;border:1px solid var(--border);border-radius:3px;background:var(--yellow);color:#0a0a10;cursor:pointer">All</button>
    <button class="proj-task-filter" data-filter="DS" style="...">DS</button>
    <button class="proj-task-filter" data-filter="PT" style="...">PT</button>
    <button class="proj-task-filter" data-filter="PD" style="...">PD</button>
    <button class="proj-task-filter" data-filter="PV" style="...">PV</button>
    <button class="proj-task-filter" data-filter="LA" style="...">LA</button>
  </div>
</div>`;
```

Phase color map (use existing phase colors from current code):
`DS=#6366f1, PT=#f59e0b, PD=#8b5cf6, PV=#f97316, LA=#22c55e`

### Task rows (per phase group, collapsible)
For each phase that has tasks, render a collapsible section header + task rows:

```
[▾ PT — Prototyping  (2 tasks)]
  [PT badge] Create the backend          | 2026-06-15 | [status dropdown]
  [PT badge] Test API endpoints          | 2026-06-20 | [status dropdown]
[▾ PD — Process dev  (1 task)]
  [PD badge] Create prototype machine    | —          | [status dropdown]
```

Section header style: `background:var(--bg-card); padding:0.3rem 0.5rem; cursor:pointer; display:flex; align-items:center; gap:0.5rem`

Task row style: `display:grid; grid-template-columns:56px 1fr 80px 110px; gap:0.4rem; align-items:center; padding:0.25rem 0.5rem; border-bottom:1px solid var(--border); font-size:0.78rem`

Phase badge in row: `<span style="font-size:0.62rem;padding:0.1rem 0.35rem;border-radius:3px;background:${phaseColor}22;color:${phaseColor};font-weight:700">${phase_code}</span>`

### Collapse toggle
Each phase section collapses/expands on header click. Store state in a module-level object `_taskSectionCollapsed = {}` keyed by `${projectId}_${phaseCode}`. Default: all expanded.

### Filter
Filter buttons above the table filter which phases are shown. Active filter button gets `background:var(--yellow);color:#0a0a10`. Default = All.
Store active filter in module-level `_taskFilter = {}` keyed by projectId. Default 'all'.

After rendering, bind all filter buttons and collapse toggles via event delegation on the task section container. On click, update state and re-render only the task section (not full focus view re-render).

### Status dropdown
Keep existing `.proj-status-sel` select with same PATCH on change logic — just move it into the new row layout.

---

## FIX 2 — projects.injector.js + API: phase auto-dates from task finish_by dates

**Logic:** When tasks have `finish_by` dates and a `phase_code`, each phase's exit date should auto-compute as:
`phase_exit = latest finish_by among all tasks in that phase + 3 days`

**Where to compute:** Client-side in `renderFocusView()` — no API change needed.

After fetching tasks from the detail API (`/api/projects/${projectId}`), compute phase exit dates:

```javascript
function computePhaseExits(tasks, phases) {
  const phaseLatest = {};
  tasks.forEach(t => {
    if (!t.finish_by || !t.phase_code) return;
    const d = new Date(t.finish_by);
    if (!phaseLatest[t.phase_code] || d > phaseLatest[t.phase_code]) {
      phaseLatest[t.phase_code] = d;
    }
  });
  // Return map: phase_code → exit date string (YYYY-MM-DD)
  const exits = {};
  Object.entries(phaseLatest).forEach(([code, d]) => {
    const exit = new Date(d);
    exit.setDate(exit.getDate() + 3);
    exits[code] = exit.toISOString().split('T')[0];
  });
  return exits;
}
```

Use this computed exits map to display the phase exit date in the phase pills at the top of the focus view.

**Phase pill display** (existing row of phase pills at top):
- If computed exit exists for that phase → show `exit · {date}` in small text below the pill label
- If no tasks with finish_by in that phase → show `exit · —`
- This replaces or supplements the existing exit milestone display

**Do NOT write back to Airtable** — this is display-only computation from task data. The owner can manually set official exit dates when phases are completed.

---

## FIX 3 — projects.injector.js: payback display fix

**Current:** `AVG PAYBACK 0.0 yr` in the M2.4 strip — rounds to 0.0 for small values.

**Fix location:** `project-finance.injector.js` — the strip summary computation.

Find where `avg_payback` is computed and displayed. Change:
- If payback < 1 year: display as months — `Math.round(payback * 12) + ' mo'`
- If payback >= 1 year: display as `payback.toFixed(1) + ' yr'`
- If payback === 0 or NaN or investment_total === 0: display `—`

Example: `payback = 0.08 yr` → displays `"1 mo"`. `payback = 1.4 yr` → displays `"1.4 yr"`.

Also fix the per-project P&L line in M2.4 expanded card: `0.0 yr payback` → same logic.

---

## FIX 4 — projects.injector.js: AI "Generate tasks" → auto-add to Airtable

**Current:** `runAiInquiry('tasks', drawer)` calls `/api/ai-chat`, gets text back, displays it in `#pd-ai-result` div. User has to manually copy and re-enter each task. There is NO auto-add button.

**Fix:** After AI returns the task list text, parse it and offer a "✚ Add all tasks" button.

### AI prompt format (update the prompt in `runAiInquiry`):
Change the `tasks` prompt to instruct the AI to return JSON only:

```javascript
tasks: `You are a project planning assistant. Generate a task list for this project.
Project name: ${drawerData.name}
Idea: ${drawerData.idea}
Phases: DS (Design), PT (Prototyping), PD (Process dev), PV (Product develop), LA (Launch)

Return ONLY a JSON array, no other text, no markdown:
[
  {"phase_code":"DS","title":"task title","measure":"how to know it's done","finish_by_days":14},
  ...
]
Generate 2-4 tasks per phase. finish_by_days = days from today to suggested finish date.`
```

### Parse and display:
After getting `res.reply`, attempt `JSON.parse()`:

```javascript
let parsed = null;
try { parsed = JSON.parse(res.reply); } catch { /* show raw text fallback */ }

if (parsed && Array.isArray(parsed)) {
  // Render as a readable table in #pd-ai-result
  let tableHtml = `<div style="font-size:0.72rem;margin-bottom:0.35rem;color:var(--text-dim)">${parsed.length} tasks generated</div>`;
  tableHtml += `<div style="display:grid;gap:0.2rem">`;
  parsed.forEach(t => {
    tableHtml += `<div style="display:grid;grid-template-columns:40px 1fr 60px;gap:0.3rem;font-size:0.72rem;padding:0.2rem 0;border-bottom:1px solid var(--border)">
      <span style="color:${phaseColors[t.phase_code]||'#888'};font-weight:700">${t.phase_code}</span>
      <span>${t.title}</span>
      <span style="color:var(--text-dim)">+${t.finish_by_days}d</span>
    </div>`;
  });
  tableHtml += `</div>`;
  tableHtml += `<button id="pd-ai-add-tasks" style="margin-top:0.5rem;width:100%;padding:0.35rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-size:0.78rem;font-weight:700">✚ Add ${parsed.length} tasks to project</button>`;
  resultEl.innerHTML = tableHtml;

  // Wire the add button
  drawer.querySelector('#pd-ai-add-tasks')?.addEventListener('click', async () => {
    const btn = drawer.querySelector('#pd-ai-add-tasks');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    const today = new Date();
    let successCount = 0;
    for (const t of parsed) {
      const finishDate = new Date(today);
      finishDate.setDate(today.getDate() + (t.finish_by_days || 14));
      try {
        await api('/api/project-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:        t.title,
            project_id:   drawerProjId,
            phase_code:   t.phase_code,
            measure:      t.measure || '',
            finish_by:    finishDate.toISOString().split('T')[0],
            assigned_to:  'Me',
            status:       'Open'
          })
        });
        successCount++;
      } catch (err) {
        console.error('Task add failed:', t.title, err.message);
      }
    }
    btn.textContent = `✓ ${successCount} tasks added`;
    btn.style.background = '#22c55e';
    // Reload tasks in focus view if visible
    await loadAll();
    if (selectedId === drawerProjId) renderFocusView(drawerProjId);
  });
} else {
  // Fallback: show raw text if JSON parse fails
  resultEl.style.whiteSpace = 'pre-wrap';
  resultEl.textContent = res.reply;
}
```

**Important:** The `drawerProjId` must be available in scope when the add button is clicked — confirm it is module-level and not reset between renders.

---

## FIX 5 — index.html + sidebar: 4.4 P&L Generator placeholder

**File:** `index.html`

Add a nav item for P&L Generator under the Tools section in the sidebar, between AI Advisor and Mind Map:

```html
<li>
  <a href="#" data-panel="pl-generator" class="nav-link">
    <span class="nav-icon">📊</span>
    <span class="nav-label">P&L Generator</span>
    <span style="font-size:0.6rem;padding:0.1rem 0.35rem;background:#333;color:#888;border-radius:3px;margin-left:auto">soon</span>
  </a>
</li>
```

Add a placeholder panel in the panel area:

```html
<div id="panel-pl-generator" class="panel" style="display:none">
  <div style="padding:1.5rem">
    <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem">P&L Generator</div>
    <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:1rem">// 12-month and 5-year P&L, Balance Sheet, Cashflow</div>
    <div style="border:1px dashed var(--border);border-radius:var(--radius);padding:2rem;text-align:center;color:var(--text-dim);font-size:0.85rem">
      Coming soon — 4.4 P&L Generator<br>
      <span style="font-size:0.72rem">Full financial modelling: revenue forecast, COGS, EBITDA, Balance Sheet, Cashflow export</span>
    </div>
  </div>
</div>
```

Wire it in the routing/panel-switch logic so clicking the nav link shows the panel correctly.

---

## DO NOT TOUCH

- `functions/api/sales.js`
- `functions/api/transactions.js`
- `public/assets/js/sales.injector.js`
- `public/assets/js/cashflow.injector.js`
- `public/assets/js/expenses.injector.js`
- `public/assets/js/collection.injector.js`
- `public/assets/js/hard-assets.injector.js`
- `public/assets/js/entry.injector.js`
- Any Airtable schema or setup endpoints

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — M3.4 task table view, phase auto-dates, payback display, AI task auto-add, 4.4 placeholder`

2. Append to RULES.md after L115:

```
L116  M3.4 task display in focus view: table-row format with columns [phase badge | title | finish_by | status].
      Grouped by phase with collapsible section headers. Phase filter buttons (All/DS/PT/PD/PV/LA) above table.
      Collapse state: _taskSectionCollapsed[projId_phaseCode]. Filter state: _taskFilter[projId].

L117  M3.4 phase exit dates: computed client-side from tasks.
      phase_exit = latest finish_by in that phase + 3 days.
      Display only — never write back to Airtable from this computation.
      Official exit dates set manually by owner when phase completes.

L118  Payback display: if < 1 year → show months (Math.round(payback*12) + ' mo').
      If >= 1 year → toFixed(1) + ' yr'. If 0/NaN/no investment → '—'.
      Applies to M2.4 strip AVG PAYBACK and per-project P&L line.

L119  AI generate tasks: prompt must request JSON array only (no markdown, no preamble).
      Parse with try/catch. On success → render task preview table + "Add N tasks" button.
      Button POSTs each task to /api/project-tasks with phase_code + finish_by computed
      from finish_by_days offset. On fallback (JSON parse fail) → show raw text.
      drawerProjId must be module-level — confirmed in scope at button click time.

L120  4.4 P&L Generator: nav item added under Tools with "soon" badge. Panel placeholder only.
      Full build is separate prompt (CC_PROMPT_feat-pl-generator.md).
```

3. Update PROJECT_STATE.md:
   - Mark Batch 8 ✅ COMPLETE
   - Add to CONFIRMED WORKING: M3.4 task table view ✅, phase auto-dates ✅, AI task auto-add ✅, payback display fix ✅, 4.4 placeholder ✅

4. Commit docs separately: `docs: RULES L116–L120, PROJECT_STATE batch8 complete`

---

## COMMIT ORDER

```
fix(m34): projects.injector.js — task focus view table-row format with phase badge, collapse, filter
fix(m34): projects.injector.js — phase exit dates computed from task finish_by dates (display only)
fix(m24): project-finance.injector.js — payback display: months when < 1yr, — when zero
fix(m34): projects.injector.js — AI generate tasks returns JSON, parse + auto-add button
feat(nav): index.html — 4.4 P&L Generator placeholder nav + panel
docs: RULES L116–L120, PROJECT_STATE batch8 complete
```

Branch: `fix/batch8`
Merge to main after owner confirms:

- [ ] M3.4 focus view — tasks show as table rows with phase badge column
- [ ] M3.4 focus view — tasks grouped by phase with collapsible section header
- [ ] M3.4 focus view — phase filter buttons (All/DS/PT/PD/PV/LA) work correctly
- [ ] M3.4 focus view — phase pills show auto-computed exit dates from task finish_by
- [ ] M3.4 drawer — AI "Generate tasks" button returns parsed task preview table
- [ ] M3.4 drawer — "Add N tasks" button POSTs tasks and shows ✓ confirmation
- [ ] M3.4 drawer — after tasks added, focus view reloads with new tasks visible
- [ ] M2.4 strip — AVG PAYBACK shows months (e.g. "1 mo") not "0.0 yr"
- [ ] M2.4 per-project — payback line shows months correctly
- [ ] Sidebar — P&L Generator nav item visible under Tools with "soon" badge
- [ ] Panel — clicking P&L Generator shows placeholder panel (no crash)
- [ ] RULES.md — L116–L120 appended
