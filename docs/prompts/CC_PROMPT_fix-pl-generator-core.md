# CC_PROMPT_fix-pl-generator-core.md
> ✅ COMPLETE — fix/pl-generator-core — 2026-06-03
> Route pl-gen→pl-generator, panel ID fix, panelactivated, type=text inputs, project selector auto-load KV, resetForm/loadProjectModel, resizer getBoundingClientRect, RULES L133-L135
> Fix P&L Generator — panel ID mismatch, generate/chart, resizer, number inputs, project UX
> Branch: fix/pl-generator-core

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. PROJECT_STATE.md
4. public/assets/js/pl-generator.injector.js  ← READ FULL FILE BEFORE TOUCHING ANYTHING
5. functions/api/pl-generator.js

Then execute: CC_PROMPT_fix-pl-generator-core.md
Branch: fix/pl-generator-core
```

---

## ROOT CAUSE — READ THIS FIRST

The hotfix PR #57 changed:
- HTML panel div ID: `panel-pl-gen` → `panel-pl-generator`
- Nav route: `pl-gen` → `pl-generator`

But `pl-generator.injector.js` was NOT updated. It still has:
```js
function panel() { return document.getElementById('panel-pl-gen'); }   // ← WRONG ID
window.addEventListener('panelactivated', (e) => { if (e.detail === 'pl-gen') init(); }); // ← WRONG route
```

Because `panel()` returns `null`, `init()` exits immediately on every panel open.
**Nothing in the injector works at all** — Generate, resizer, events, all dead.
This is the root cause of every bug in this prompt. Fix this first.

---

## FILES TO MODIFY

1. `public/index.html` — ROUTES array fix (leak fix — do this first)
2. `public/assets/js/pl-generator.injector.js` — complete replacement

---

## FIX 0 — index.html ROUTES array (ROOT CAUSE OF PAGE LEAK — fix first)

**Why pages leak:** The router in index.html has:
```js
var ROUTES = [
  'dashboard','cashflow','sales','expenses','projects',
  'budget','liabilities','ideas','collection',
  'hard-assets','proj-assets','ai','mindmap','timemanagement','life','pl-gen'
];
```

`'pl-gen'` is in ROUTES but the nav item uses `data-route="pl-generator"`.
When user clicks P&L Generator, the router checks `ROUTES.includes('pl-generator')` → false → falls back to `'dashboard'`. Dashboard panel gets `active` class. This is what bleeds into every other page after navigation.

**Fix:** In index.html, find the ROUTES array and change `'pl-gen'` → `'pl-generator'`:

```js
// BEFORE:
var ROUTES = [
  'dashboard','cashflow','sales','expenses','projects',
  'budget','liabilities','ideas','collection',
  'hard-assets','proj-assets','ai','mindmap','timemanagement','life','pl-gen'
];

// AFTER:
var ROUTES = [
  'dashboard','cashflow','sales','expenses','projects',
  'budget','liabilities','ideas','collection',
  'hard-assets','proj-assets','ai','mindmap','timemanagement','life','pl-generator'
];
```

Also verify: `panel-pl-gen` div does NOT appear in index.html anymore (it was replaced by `panel-pl-generator` in PR #57). If `panel-pl-gen` still exists as a div — remove it entirely. Only `panel-pl-generator` should exist.

---

## FIX 1 — Panel ID + route mismatch (CRITICAL — fixes everything else too)

### Change `panel()` function:
```js
// BEFORE:
function panel() { return document.getElementById('panel-pl-gen'); }

// AFTER:
function panel() { return document.getElementById('panel-pl-generator'); }
```

### Change panelactivated listener (near bottom of file):
```js
// BEFORE:
window.addEventListener('panelactivated', (e) => {
  if (e.detail === 'pl-gen') init();
});
if (document.getElementById('panel-pl-gen') && document.getElementById('panel-pl-gen').classList.contains('active')) {
  init();
}

// AFTER:
window.addEventListener('panelactivated', (e) => {
  if (e.detail === 'pl-generator') init();
});
if (document.getElementById('panel-pl-generator')?.classList.contains('active')) {
  init();
}
```

### Also update @media print CSS inside renderPanel() string:
Find the print CSS that references `panel-pl-gen` and update:
```css
/* BEFORE */
#main > *:not(#panel-pl-gen) { display:none !important; }
#panel-pl-gen { all:unset !important; display:block !important; position:static !important; }

/* AFTER */
#main > *:not(#panel-pl-generator) { display:none !important; }
#panel-pl-generator { all:unset !important; display:block !important; position:static !important; }
```

---

## FIX 2 — Generate button: move into delegated listener

The Generate buttons (`#plg-gen-12`, `#plg-gen-5y`) are wired via `wireGenButtons()` which
uses direct `.onclick` binding on elements that may not yet exist when called.

**Remove** `wireGenButtons()` function entirely and all calls to it.

**Instead**, handle Generate inside the delegated click listener already on the panel:

In the `p.addEventListener('click', async (e) => {` block, ADD this case alongside the existing ones:

```js
// Generate buttons
if (e.target.id === 'plg-gen-12' || e.target.closest('#plg-gen-12')) { generate(12); return; }
if (e.target.id === 'plg-gen-5y' || e.target.closest('#plg-gen-5y')) { generate(60); return; }
```

This goes BEFORE the tab switching block so it fires reliably regardless of which tab is active.

---

## FIX 3 — Resizer: wire drag in init()

After PR #60, the resizer HTML div exists in `renderPanel()` output but the drag event wiring
may not be executing because `init()` was returning early (panel ID bug, now fixed by FIX 1).

After FIX 1 is applied, verify the resizer wiring exists in `init()`. It should look like:

```js
// Resizer drag
const resizer = p.querySelector('#plg-resizer');
if (resizer) {
  let dragging = false;
  resizer.addEventListener('mousedown', () => { dragging = true; document.body.style.cursor = 'col-resize'; });
  document.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    const sidebar = p.querySelector('#plg-sidebar');
    if (!sidebar) return;
    const panelRect = p.getBoundingClientRect();
    const newW = Math.min(480, Math.max(220, ev.clientX - panelRect.left));
    sidebar.style.width = newW + 'px';
    sidebar.style.flexShrink = '0';
  });
  document.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
}
```

If this block is missing from `init()` — add it. If it exists but uses `_sidebarW` variable
instead of directly setting sidebar width — rewrite it to the simpler direct-width version above.

The resizer div in `renderPanel()` HTML must be:
```html
<div id="plg-resizer" style="width:4px;background:var(--border);cursor:col-resize;flex-shrink:0;hover:background:var(--yellow);transition:background 0.15s"></div>
```
Placed between `#plg-sidebar` and the output div.

---

## FIX 4 — Number inputs: remove spinners globally

Every `<input type="number"` in the entire injector file must have spinner arrows removed.

**Rule going forward (add to RULES.md as L133):**
> All numeric data entry inputs use `type="text" inputmode="numeric" pattern="[0-9.]*"`
> instead of `type="number"`. Never use `type="number"` — browser spinners waste space
> and are not needed. User types values directly. Apply to ALL injectors.

**In this file:** Find every `type="number"` and replace with `type="text" inputmode="numeric" pattern="[0-9.]*"`.

Also add this CSS in the `<style>` block inside `renderPanel()`:
```css
input[type=text] { -webkit-appearance:none; appearance:none; }
```

This is a global rule — apply it throughout the entire injector, including:
- Revenue tab: units_mo, sale_price, revenue_mo, probability
- Costs tab: all variable/semi/fixed/SG&A amount inputs
- Assets tab: startup_cost, dep_years, all asset value/years fields, WC fields
- Funding tab: all fund amount fields, loan_rate, loan_term_mo

---

## FIX 5 — Project selector UX redesign

### Current (broken) behaviour:
- Dropdown top-right with no feedback when project selected
- No panel title update
- "Archive" + "New model" buttons scattered

### New behaviour:

**Header layout** — replace the current `#plg-header` content with:

```
LEFT SIDE:
  - Line 1: "P&L Generator" (bold, 0.95rem) — always static
  - Line 2 (subtitle): If no project selected → "// financial modelling · 12-month · 5-year"
              If project selected → "// [ProjectName]" (yellow, 0.72rem)

RIGHT SIDE (row of controls):
  - Project selector <select> — shows "No project" or project names from _projects
  - "📂 Archive" button
  - "+ New model" button (yellow)
```

When user changes the project selector:
1. Update the subtitle line immediately to show `// [SelectedProjectName]` in yellow
2. Auto-load KV model for that project (key: `pl-generator:proj_[project_id]`) if it exists
3. If KV model found: restore inputs + computed state silently (no alert)
4. If no KV model found: clear form to blank state (new model for this project)

**KV key for project models**: `pl-generator:proj_${projectId}` — one per project, always overwritten on Save.

**Save button behaviour** (update existing save function):
- If a project is selected: KV key = `pl-generator:proj_${projectId}` (overwrites)
- If no project selected: KV key = `pl-generator:${Date.now()}` (versioned, legacy behaviour)
- After save: show "✓ Saved" in status div for 2s

**Load on project change** — add handler in the delegated change listener:
```js
if (e.target.id === 'plg-project-sel') {
  const projectId = e.target.value;
  const projectName = e.target.options[e.target.selectedIndex].text;
  // Update subtitle
  const sub = p.querySelector('#plg-subtitle');
  if (sub) sub.textContent = projectId ? `// ${projectName}` : '// financial modelling · 12-month · 5-year';
  if (sub) sub.style.color = projectId ? 'var(--yellow)' : 'var(--text-dim)';
  // Auto-load KV model for this project
  if (projectId) {
    loadProjectModel(projectId);
  } else {
    resetForm();
  }
  return;
}
```

Add `loadProjectModel(projectId)` function:
```js
async function loadProjectModel(projectId) {
  try {
    const r = await fetch(`/api/pl-generator/proj_${projectId}`, { credentials: 'same-origin' });
    if (!r.ok) { resetForm(); return; } // no model yet — blank slate
    const saved = await r.json();
    _computed = saved.outputs || null;
    _activePeriod = saved.period || '12mo';
    _savedVersion = parseInt((saved.version || 'v1').replace('v', ''), 10) || 1;
    if (saved.inputs) {
      if (saved.inputs.var_items) _varItems = saved.inputs.var_items;
      if (saved.inputs.semi_items) _semiItems = saved.inputs.semi_items;
      if (saved.inputs.fixed_items) _fixedItems = saved.inputs.fixed_items;
      if (saved.inputs.asset_items) _assetItems = saved.inputs.asset_items;
      if (saved.inputs.fund_items) _fundItems = saved.inputs.fund_items;
    }
    const pSel = $('plg-project-sel');
    const currentProject = pSel ? pSel.value : '';
    p.innerHTML = renderPanel(saved.inputs);
    // Restore project selector value
    const newSel = $('plg-project-sel');
    if (newSel && currentProject) newSel.value = currentProject;
    if (_computed && _computed.pl) renderChart(_computed, _activePeriod);
  } catch { resetForm(); }
}
```

Add `resetForm()` function:
```js
function resetForm() {
  _computed = null;
  _activePeriod = '12mo';
  _savedVersion = 0;
  _varItems = [];
  _semiItems = [
    { desc: 'Office staff', amt: '', freq: 'Monthly' },
    { desc: 'Packaging', amt: '', freq: 'Monthly' },
    { desc: 'Accountant', amt: '', freq: 'Monthly' }
  ];
  _fixedItems = [
    { cat: 'Office labor', amt: '', freq: 'Monthly' }, { cat: 'Utility', amt: '', freq: 'Monthly' },
    { cat: 'Rental', amt: '', freq: 'Monthly' }, { cat: 'IT/Software', amt: '', freq: 'Monthly' },
    { cat: 'Maintenance', amt: '', freq: 'Monthly' }, { cat: 'Insurance', amt: '', freq: 'Monthly' },
    { cat: 'Marketing', amt: '', freq: 'Monthly' }, { cat: 'Services', amt: '', freq: 'Monthly' }
  ];
  _assetItems = [];
  _fundItems = [{ src: 'Owner equity', amt: '', type: 'Equity' }, { src: 'Bank loan', amt: '', type: 'Loan' }];
  const pSel = $('plg-project-sel');
  const currentProject = pSel ? pSel.value : '';
  p.innerHTML = renderPanel();
  const newSel = $('plg-project-sel');
  if (newSel && currentProject) newSel.value = currentProject;
}
```

---

## AFTER ALL FIXES — MANDATORY

1. Archive prompt to `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-core — [date]`

2. Add to RULES.md:
```
L133  Data entry inputs: NEVER use type="number". Always use type="text" inputmode="numeric" pattern="[0-9.]*".
      Browser spinners waste space and are never needed. User types values directly.
      Apply to all existing and future injectors. No exceptions unless explicitly specified.

L134  P&L Generator panel ID is panel-pl-generator, route is pl-generator (confirmed after hotfix PR #57).
      Injector panelactivated listener must use e.detail === 'pl-generator'.
      panel() function must return document.getElementById('panel-pl-generator').

L135  P&L Generator KV storage — one model per project:
      Key: pl-generator:proj_{projectId} — always overwrite on Save (not versioned).
      Selecting a project in dropdown auto-loads KV model for that project if exists.
      No project selected: versioned key pl-generator:{timestamp}.
      PDF/ODS export any time — these do NOT save to KV, they are one-off exports only.
      R2 bucket not configured — KV only for all P&L storage.
```

3. Update PROJECT_STATE.md — note fix/pl-generator-core applied, M4.4 functional

4. Commit in this order:
```
fix(pl-generator): panel ID pl-gen→pl-generator, route mismatch — fixes init/generate/resizer
fix(pl-generator): number inputs type=text no spinners, delegated generate handler
fix(pl-generator): project selector auto-load KV model, subtitle shows project name
docs: RULES L133-L135, PROJECT_STATE fix-pl-generator-core
```

Branch: `fix/pl-generator-core`
Merge to main after all QA items pass.

---

## QA CHECKLIST

- [ ] **Leak test**: Navigate to Dashboard → Cash Flow → Sales → P&L Generator → back to Dashboard. No P&L content bleeds into any other panel
- [ ] Click P&L Generator in nav → panel opens, Revenue tab visible, subtitle shows `// financial modelling`
- [ ] Number inputs have NO spinner arrows (no up/down buttons on any input)
- [ ] Drag resizer handle between sidebar and output → width adjusts live (min 220px / max 480px)
- [ ] Fill Revenue tab: units + price → revenue/mo auto-shows. Click "12mo" Generate → KPI strip populates, chart renders, P&L table fills
- [ ] Click "5yr" → chart and table switch to 5-year view
- [ ] Balance Sheet and Cashflow output tabs render after Generate
- [ ] Project selector dropdown: shows "No project", "Ploikong", "Satu 1.0" (from /api/projects)
- [ ] Select "Ploikong" → subtitle changes to `// Ploikong` in yellow
- [ ] If no saved model for Ploikong: form is blank (ready to fill)
- [ ] Fill data + click Save → status shows "✓ Saved"
- [ ] Switch to another project then back to Ploikong → data reloads from KV
- [ ] PDF button → print dialog opens
- [ ] ODS button → file downloads
- [ ] No console errors on any of the above
