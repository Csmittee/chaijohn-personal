# CC_PROMPT_fix9B2_module-fixes.md
> 9B follow-up — fix 4 module issues found in QA after sidebar migration
> Small targeted fixes only — no new features

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
- masterseed.md
- lessons_learned.md
- WORKFLOW_SKILL.md

Then read and execute: docs/prompts/CC_PROMPT_fix9B2_module-fixes.md
```

---

## OBJECTIVE

Fix 4 specific QA failures found after 9B migration merged to main.
These are targeted fixes only — read each injector fresh before touching.
Do NOT refactor, restructure, or improve anything not listed below.

Branch: `fix/9b-module-qa`

---

## READ FIRST

1. `masterseed.md` + `lessons_learned.md` + `WORKFLOW_SKILL.md`
2. `public/assets/js/cashflow.injector.js`
3. `public/assets/js/expenses.injector.js`
4. `public/assets/js/liabilities.injector.js`
5. `public/assets/js/entry.injector.js`
6. `public/index.html` — confirm how each injector is loaded

---

## FIX 1 — CASHFLOW: 3 issues

File: `public/assets/js/cashflow.injector.js`

**F1a — Period filter not toggling**
The 1M / 3M / 6M period buttons are not responding as a toggle group.
Fix: only one can be active at a time. Clicking an active button does
nothing. Clicking inactive button deactivates current, activates new,
and re-renders the chart with the new period range.

**F1b — Period range logic: future-bias 30/70**
Current logic shows equal past/future split. Correct rule:
- 1M: fixed frame — show calendar month (1st to last day of current month)
- 3M: 1 month back + 2 months forward from today
- 6M: 2 months back + 4 months forward from today
Today's position sits at the 30% mark from the left edge in all views.

**F1c — Missing list/card view toggle below main chart**
Add a view toggle below the balance forecast chart:
[List] [Card] — default List
List view: existing transaction rows (current style)
Card view: transaction mini-cards in a 2-col grid
  Each card: date · entity · category · amount (color: green=in, red=out)
Use existing `.tx-mini-card` style from dashboard if present,
otherwise create consistent with existing card styles.

Commit: `fix(cashflow): period toggle + 30/70 range + list/card view`

---

## FIX 2 — EXPENSES: 4 issues

File: `public/assets/js/expenses.injector.js`

**F2a — Chart order: swap pareto and trend**
Current order: Pareto first, Trend second.
Correct order: Trend chart first (left), Pareto second (right).
Swap the DOM order and any rendering sequence.

**F2b — Missing period selector for graphs**
Add period toggle above the dual chart zone:
[Current month] [Last 3M] [Last 6M] — default Current month
Both charts must re-render when period changes.
Current month = transactions in calendar month of today.
Last 3M = last 90 days.
Last 6M = last 180 days.

**F2c — Graphs overflow instead of responsive**
Both charts are overflowing their containers instead of fitting the
available width. Fix: each chart container must use `width: 100%`
with `min-width: 0` on the grid column. Canvas must respect container
width. Add `responsive: true, maintainAspectRatio: false` to both
Chart.js configs if not already set. Set explicit container heights
(e.g. 220px) so charts don't collapse.

**F2d — Missing list/card view toggle for expense cards**
Same pattern as F1c. Add below the dual chart zone:
[List] [Card] — default Card (existing mosaic budget card style)
List view: one row per budget — label | category | budget | actual | % | meter bar
Card view: existing mosaic cards (current default)

Commit: `fix(expenses): chart order + period selector + responsive + list/card view`

---

## FIX 3 — LIABILITIES: 2 issues

File: `public/assets/js/liabilities.injector.js`

**F3a — Chart order: swap trend and pareto**
Current order: Pareto (T3 bar) first, Trend second.
Correct order: Trend/accumulation chart first (left), T3 pareto second (right).
The trend chart shows: ceiling line (original loan total) + accumulated
interest area over time. This is the important story — it goes first.

**F3b — Graph zone not responsive**
Same fix as F2c. Both chart containers must be responsive width.
`responsive: true, maintainAspectRatio: false` + explicit container height.
No period toggle needed for liabilities — static view is correct.

Commit: `fix(liabilities): chart order swap + responsive graph zone`

---

## FIX 4 — ENTRY UTILITY: 2 issues

File: `public/assets/js/entry.injector.js`

**F4a — Bottom chart: toggle water or electricity, not both shown**
Currently both electricity and water charts show simultaneously.
Add a toggle above the chart: [Electricity] [Water] — default Electricity
Only the selected chart renders. Switching toggle destroys current
chart instance and renders the selected one.
Preserve all existing chart data and rendering logic — only add the
toggle and conditional render.

**F4b — High data record toggle to save space**
The utility entry list (last 12 months table + YoY charts) is always
fully expanded. Add a collapse toggle at the top of that section:
[▼ Show history] / [▲ Hide history] — default collapsed (hidden)
When collapsed: show only the summary line (latest month values).
When expanded: show full table + charts as currently built.
This saves vertical space on the entry drawer.

Commit: `fix(entry-utility): chart toggle water/electricity + history collapse`

---

## CONSTRAINTS

- Do NOT change any API files in `functions/api/`
- Do NOT change dashboard.injector.js
- Do NOT restructure any panel HTML in index.html
- Do NOT add new features beyond what is listed above
- Repo is source of truth — check existing styles before creating new ones

---

## AFTER ALL FIXES — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — 9B QA fixes: cashflow + expenses + liabilities + entry utility`

2. Update `masterseed.md`:
   - Mark Fix 9B2 ✅ COMPLETE
   - Update CURRENT STATE for each fixed module

3. Append new lessons to `lessons_learned.md` (next L after current highest)

4. Commit: `docs: update masterseed and lessons_learned after fix9B2`

List all files changed at end of response.

---

## COMMIT ORDER

```
fix(cashflow): period toggle + 30/70 range + list/card view
fix(expenses): chart order + period selector + responsive + list/card view
fix(liabilities): chart order swap + responsive graph zone
fix(entry-utility): chart toggle water/electricity + history collapse
docs: update masterseed and lessons_learned after fix9B2
```

Branch: `fix/9b-module-qa`
Merge to `main` after owner QA confirms all 4 modules pass.
