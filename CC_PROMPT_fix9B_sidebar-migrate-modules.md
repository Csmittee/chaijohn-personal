# CC_PROMPT_fix9B_sidebar-migrate-modules.md
> Part 2 of 3 — Migrate existing modules into the new sidebar shell
> Updated with owner decisions on all conflicts CC raised

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

Then read and execute: docs/prompts/CC_PROMPT_fix9B_sidebar-migrate-modules.md
```

---

## OWNER DECISIONS — READ BEFORE ANYTHING ELSE

These resolve all conflicts you raised. Do not re-ask.

**Dashboard role:**
The `#dashboard` panel is a LISTENING/OVERVIEW tool.
It shows: 4 top stat chips + mini live chart copies from each M2 +
Today Priority section (placeholder for now).
When owner clicks a chart or M2 summary, it navigates to that M2 panel.
The T1-T4 graph train does NOT live here anymore.

**M2 panels role:**
Each M2 child panel is an INTERACTIVE PLAYGROUND.
It owns its full chart + stat chips + card grid + entry controls.
This is where the owner solves problems.

**T1-T4 architecture decision → MOVE OUT:**
`dashboard.injector.js` is retired from the dashboard panel.
Each chart moves to its own M2 panel with a new dedicated injector.
New files: `dash-overview.injector.js`, `cashflow.injector.js`,
`expenses.injector.js`, `liabilities.injector.js`, `budget.injector.js`.
Zero changes to existing injector files — they are preserved as-is
for reference but no longer loaded on the dashboard panel.

**O1 sidebar light mode fix:**
Already done and pushed — skip, no re-work needed.

**Entry drawer:**
Centralized, lean, pinnable (can pin open) and hideable.
Separate LOG (quick add) from CREATE (new budget/category/liability).
Entry drawer is responsive to which M2 panel is currently active —
e.g. if owner is on Liabilities panel, drawer defaults to Liability tab.
Normal confirm dialog for all destructive actions EXCEPT budget delete
which requires typing the budget label to confirm.

**Navigation addition:**
Add M4.3 Time Management under TOOLS section in sidebar:
Route: `#time-mgmt`
Content: placeholder panel with 4 subsections:
  - My Tasks
  - My Inputs
  - Calendar Schedule
  - Today Goal

---

## OBJECTIVE

Complete the sidebar shell migration:
- Wire all M2 modules as self-contained interactive panels
- Build dashboard as a clean overview with live mini-charts
- Entry becomes a smart right-side drawer
- New injectors handle each panel independently

Branch: `feat/sidebar-shell` (continue from Phase 9a)

---

## READ FIRST

Before writing any code:
1. `masterseed.md` + `lessons_learned.md` + `WORKFLOW_SKILL.md`
2. `public/index.html` — Phase 9a shell (already has O1 fix)
3. `public/dashboard.html` — reference for existing HTML structure + IDs
4. `public/entry.html` — reference for all form HTML
5. `public/assets/js/dashboard.injector.js` — read all IDs + data fetching
6. `public/assets/js/entry.injector.js` — read all IDs + form logic
7. `public/assets/js/dropzone.js` — confirm self-contained
8. `public/assets/css/global.css` — existing tokens + card styles

---

## OUTCOMES

### O2 — Drop Zone global
Load `dropzone.js` in shell — confirmed self-contained, works immediately.
No changes to `dropzone.js`.

---

### O3 — Dashboard overview panel (#dashboard)

Create `public/assets/js/dash-overview.injector.js` (NEW FILE).
Load it in shell. Wire into `#panel-dashboard`.

**Panel structure:**

```
┌─────────────────────────────────────────────────┐
│ TOP STATS — 4 conclusion chips                  │
│ 1. Days to ฿0 cash (from cashflow forecast)     │
│ 2. Days to next expected earn                   │
│ 3. Project idea value / days to first sale  [placeholder] │
│ 4. Net value: total assets − total liabilities  │
├─────────────────────────────────────────────────┤
│ TODAY PRIORITY                   [placeholder]  │
│ "What needs my attention today?" — coming soon  │
├──────────┬──────────┬──────────┬────────────────┤
│ Cashflow │ Expenses │ Liabilities │ Budget       │
│ mini T1  │ mini T2  │ mini T3     │ mini T4      │
│ chart    │ chart    │ chart       │ chart        │
│ [→ Go]   │ [→ Go]   │ [→ Go]     │ [→ Go]       │
└──────────┴──────────┴────────────┴───────────────┘
```

Mini charts: small copies of the main M2 charts (same data, smaller canvas).
Each mini chart card has a "→" button that calls `navigate('cashflow')` etc.
Mini charts are read-only — no controls, no period toggles.
Data fetch: single shared fetch from `/api/transactions`, `/api/budgets`,
`/api/debts` (reuse same endpoints the existing injectors use).

---

### O4 — Entry right-side drawer (M2.7)

Embed all entry form HTML from `entry.html` into a drawer div in the shell.
Load `entry.injector.js` in shell.
Drawer: 480px wide, slides in from right, backdrop overlay.

**Smart tab defaulting:**
When drawer opens, default to the tab relevant to the active M2 panel:
- Active panel = `#cashflow` or `#expenses` → default to Transactions tab
- Active panel = `#liabilities` → default to Liabilities tab
- Active panel = `#budget` → default to Budgets tab
- Otherwise → default to Transactions tab

**Pin behaviour:**
Add a 📌 pin button in drawer header.
Pinned: drawer stays open when clicking outside (backdrop click ignored).
Unpinned (default): backdrop click closes drawer.
Pin state persists in localStorage: `chaijohn-drawer-pinned`.

**LOG vs CREATE separation:**
Inside each tab, keep the existing quick-add form at top (LOG).
Collapse the create form (new budget / new category / new liability)
behind a "＋ Create New" toggle — collapsed by default.
This reduces visual noise without removing functionality.

**Delete confirmation:**
Budget delete: must type the budget label exactly to confirm.
All other destructive actions: standard `confirm()` dialog is sufficient.

---

### O5 — M2 panels — independent injectors

Create one new injector file per M2 panel.
Each fetches its own data independently.
Each follows the anatomy: CONCLUSION ROW → MAIN GRAPH(S) → CARDS GRID.
Card baseline style: `.liab-content-card` — portrait ratio, not wide/flat.

**M2.1 Cashflow (#cashflow)**
New file: `public/assets/js/cashflow.injector.js`

Conclusion row:
- Days to ฿0 cash
- Total cash in (current period)
- Total cash out (current period)
- Current balance
- Next expected earn + days until due

Main graph: T1 cashflow chart (copy render logic from dashboard.injector.js)
Period toggle: 1M / 3M / 6M / 12M

Cards: transaction list as mini-cards (same style as existing T1 content)

---

**M2.3 Expenses (#expenses)**
New file: `public/assets/js/expenses.injector.js`

Conclusion row:
- Total spent vs total budgeted
- Budget remaining
- Number of budgets at 100%+ (locked)
- Debt payback to normal spending ratio

Main graph: T2 expense pareto (copy from dashboard.injector.js)
SIDE BY SIDE with a 6-month expense trend line chart (Chart.js line,
month-by-month total expense, same visual style as existing charts)

Cards: budget comparison cards (same style as existing T2 content)

---

**M2.5 Budget (#budget)**
New file: `public/assets/js/budget.injector.js`

Conclusion row:
- Total spending plan this month
- Total spending plan this 12 months
- Total earn booked
- Average monthly balance
- Hit/miss gap (planned vs actual variance)
- Count of budgets hit / missed
- Recommended adjustment (placeholder if not calculable)

Main graph: T4 budget vs actual chart (copy from dashboard.injector.js)
Period toggle: 1M / 3M / 6M / 12M

Cards: budget meter cards (same style as existing budget meters)

---

**M2.6 Liabilities (#liabilities)**
New file: `public/assets/js/liabilities.injector.js`

Conclusion row:
- Total debt value (sum current_balance)
- Total paid back (sum all payments)
- Payment backlog (overdue / behind schedule)
- Total monthly interest across all loans

Main graph: T3 liabilities bar chart (copy from dashboard.injector.js)
SIDE BY SIDE with an accumulation trend chart:
  - Line: total original loan ceiling over time
  - Stacked area: cumulative interest generated
  (Chart.js — same visual style as existing charts)

Cards: liability cards (existing `.liab-content-card` style)

---

**M2.2 Sales, M2.4 Projects (#sales, #projects):**
Styled placeholder — "Coming in Part 3"

---

### O6 — Sidebar nav addition

Add M4.3 Time Management to the sidebar under TOOLS:
```
M4.3  ⏱️  Time Mgmt    → #time-mgmt
```

`#panel-time-mgmt` content: 4 placeholder cards:
- My Tasks
- My Inputs
- Calendar Schedule
- Today Goal

---

### O7 — Old pages redirect

`public/dashboard.html` → meta redirect to `/#dashboard`
`public/entry.html` → meta redirect to `/#dashboard`

---

### O8 — Collection and AI panels

Wire `collection.injector.js` and `ai.injector.js` if they exist.
If not, styled placeholder.

---

## CONSTRAINTS

- Do NOT modify `dashboard.injector.js` or `entry.injector.js`
- Do NOT change any `functions/api/` files
- Do NOT break PIN auth or any CONFIRMED WORKING item in masterseed.md
- New injector files copy render logic from existing injectors as needed
- One injector per panel — no shared mega-bundle
- Repo is source of truth — if anything here conflicts with what you
  find in the repo, use the repo and note the deviation

---

## AFTER ALL OUTCOMES — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — [one line summary]`

2. Update `masterseed.md`:
   - Mark Phase 9b ✅ COMPLETE
   - Update CURRENT STATE
   - Update FILE INVENTORY (list all new injector files)
   - Update ROADMAP

3. Append new lessons to `lessons_learned.md` (next L after current highest):
   - New injector per panel pattern
   - Drawer smart-tab pattern
   - Any conflict resolutions

4. Commit: `docs: update masterseed and lessons_learned after phase9b`

List all files changed at end of response.

---

## COMMIT ORDER

```
feat(shell): Drop Zone wired globally                                ← O2
feat(shell): dash-overview panel — 4 stats + mini charts + priority ← O3
feat(shell): entry smart drawer — pin, tab default, log/create split ← O4
feat(shell): cashflow.injector — conclusion + T1 chart + cards       ← O5a
feat(shell): expenses.injector — conclusion + dual chart + cards     ← O5b
feat(shell): budget.injector — conclusion + T4 chart + meters        ← O5c
feat(shell): liabilities.injector — conclusion + dual chart + cards  ← O5d
feat(shell): time-mgmt panel placeholder + sidebar nav item          ← O6
feat(shell): old pages redirect to shell                             ← O7
feat(shell): collection + AI panels wired or placeholder             ← O8
docs: update masterseed and lessons_learned after phase9b
```

Branch: `feat/sidebar-shell`
Merge to `main` only after owner QA confirms all outcomes pass.
