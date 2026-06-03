# CC_PROMPT_fix-batch8.md
✅ COMPLETE — 2026-06-03 — M3.4 focus view task table+filter+collapse, phase auto-exit dates, M2.4 payback months display, AI generate tasks JSON+add button, 4.4 P&L Generator placeholder, RULES L116–L120
> Batch 8 — M3.4 task table redesign, phase exits, payback fix, AI tasks JSON, P&L nav placeholder
> Branch: fix/batch8
> Merge to main after owner QA confirms checklist

---

## FIXES APPLIED

### FIX 1 — projects.injector.js: M3.4 focus view task table
- Table layout with grid: 56px phase badge | 1fr title | 80px date | 110px status select
- Filter buttons row: All / DS / PT / PD / PV / LA — `_taskFilter` module var
- Collapsible per-phase sections — `_taskSectionCollapsed[projId+'_'+pc]` state
- Shows done/total count in section header

### FIX 2 — projects.injector.js: phase auto-exit dates
- `computePhaseExits(tasks)` — latest finish_by per phase_code + 3 days
- Displayed in phase pills as small date label
- Client-side display only — no Airtable write

### FIX 3 — project-finance.injector.js: payback display months
- < 12 months → "N mo payback"
- >= 12 months → "N.N yr payback"
- Applied to per-card payback AND avg payback strip bubble

### FIX 4 — projects.injector.js: AI generate tasks → JSON
- Tasks prompt requests JSON array only (no markdown)
- Parsed with try/catch, strips ```json``` fences
- On success: shows task list preview + "Add N tasks" button
- Button POSTs each task to /api/project-tasks
- On parse fail: falls back to pre-wrap text display

### FIX 5 — index.html: 4.4 P&L Generator nav + panel
- Added nav item in Finance group after Liabilities with "soon" badge
- Added placeholder panel (panel-pl-gen) with centered coming soon message

### RULES L116–L120 appended to RULES.md
