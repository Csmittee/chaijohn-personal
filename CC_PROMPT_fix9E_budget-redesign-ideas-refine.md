# CC_PROMPT_fix9E_budget-redesign-ideas-refine.md
> Phase 9E — Budget panel full redesign + Ideas/Blog panel refinement
> Two distinct modules, one session

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

Then read and execute: docs/prompts/CC_PROMPT_fix9E_budget-redesign-ideas-refine.md
```

---

## OBJECTIVE

Two modules in one session:

**E1 — Budget panel:** Full redesign from placeholder to working
12-month planning grid with view mode and edit mode.

**E2 — Ideas/Blog panel:** Refinements to the existing diary.injector.js
wired into the new sidebar shell. Fine-tune UX, add Memo type,
add stats cards, thumbnail display, distribution buttons.

Read all relevant source files before writing a single line.
Both modules exist in some form — understand what's there before
deciding what to change.

Branch: `feat/9e-budget-ideas`

---

## READ FIRST

1. `masterseed.md` + `lessons_learned.md` + `WORKFLOW_SKILL.md`
2. `public/assets/js/budget.injector.js` — current budget panel state
3. `public/assets/js/dashboard.injector.js` — existing T4 budget logic
4. `public/assets/js/diary.injector.js` — full read required
5. `public/index.html` — how both panels are wired in the shell
6. `functions/api/budgets.js` — current budget API
7. `functions/api/diary.js` — current diary API
8. Current Airtable budget table fields — confirm before adding anything

Summarize what each injector currently does before writing code.

---

## MODULE E1 — BUDGET PANEL REDESIGN

### Context
The budget panel currently shows a T4 chart placeholder and budget meter
cards. Replace this with a proper 12-month planning grid that gives the
owner a full annual financial picture in one view.

### E1-O1 — Conclusion row (top stat chips)

4 chips always visible at top:
- **Total earn BG** — sum of all earn-type budget amounts (annual plan)
- **Total spending BG** — sum of all expense-type budget amounts (annual plan)
- **Target gap** — earn BG minus spending BG, shown as +฿X or -฿X
  Color: green if positive, red if negative
- **Hit or Miss** — count of budgets where actual YTD is within plan
  vs over plan. Format: "X on track · Y over limit"

### E1-O2 — Main graph: 12-month bar chart

Bar chart showing 12 months of the selected year.
Two datasets: Budget (planned) bars + Actual bars side by side per month.
Future months show budget bar only (actual = 0 or null).
X-axis: Jan → Dec. Y-axis: ฿ amount.
Same Chart.js style as existing T4 chart in dashboard.injector.js —
copy the render logic, do not reinvent.

Later enhancement (placeholder comment in code):
`// TODO: compare to last year mode — overlay previous year actuals`

### E1-O3 — Filter lane (above grid)

```
[Toggle: Budget | Actual | Gap]    [Mode: View | Edit]    [Period: Standard | Range]
```

**Toggle Budget/Actual/Gap:**
- Budget: show planned amounts in grid cells
- Actual: show actual spend/earn in grid cells
- Gap: show variance (budget minus actual) per cell
  Green = under budget, Red = over budget

**Mode View/Edit:**
- View: grid is read-only, cells display values
- Edit: cells become inline inputs — owner can type directly
  In edit mode, changes are batched — one Submit button at bottom
  submits all changes in a single Airtable API call (not one per cell)
  This is critical for performance and API rate limits.
  Also in edit mode: "Manual override actual" — if a cell has no
  transaction data, owner can type the actual value directly.
  These manual entries are flagged with a small ⚑ indicator.
  Flag stored as a boolean field on the budget record or as a
  separate override table — CC decides based on what's cleanest.

**Period Standard/Range:**
- Standard: Jan → Dec of selected year (default current year)
  Year selector: [2025] [2026] dropdown
- Range: show date pickers for custom start → end date
  Grid adjusts to show only months in the selected range

### E1-O4 — The 12-month grid

Layout: spreadsheet-style grid.
Left column = row labels (fixed, does not scroll).
Header row = 12 month columns (Jan → Dec) + Total column.
Horizontal scroll if viewport too narrow.

**Row structure (vertical flow):**

```
─── EARN ───────────────────────────────────────────
  [Earn source rows — from Sale menu later]
  Earn 1 (placeholder — "from Sales module")
  Earn 2 (placeholder — "from Sales module")
  [Any existing Earn-type budget items]
  TOTAL EARN ROW (bold, auto-sum)

─── EXPENSES ────────────────────────────────────────
  [One row per active Expense-type budget item]
  Grouped by category_group (collapsible group header)
  TOTAL EXPENSES ROW (bold, auto-sum)

─── DEBT PAYBACK ────────────────────────────────────
  [One row per active liability — monthly_payment as budget]
  Interest column shown separately if available
  TOTAL DEBT ROW (bold, auto-sum)

─── PROJECT FUNDING ──────────────────────────────────
  [One row per active project with finance_opened=true]
  Pulled from Projects table (when M3.4 is built)
  For now: placeholder row "No active project funding"
  TOTAL PROJECT ROW (bold, auto-sum)

─── GAP ──────────────────────────────────────────────
  GAP = Total Earn − Total Expenses − Total Debt − Total Projects
  Color: green if positive, red if negative
  Show per month + annual total

─── ANALYSIS ─────────────────────────────────────────
  Gap % of Earn = Gap / Total Earn × 100
  Income Tax Provision (Thai rule):
    Use progressive Thai personal income tax brackets:
    0–150k = 0%, 150k–300k = 5%, 300k–500k = 10%,
    500k–750k = 15%, 750k–1M = 20%, 1M–2M = 25%,
    2M–5M = 30%, >5M = 35%
    Apply to annual earn total, show monthly provision amount
  Net after tax = Gap − Tax provision
  Show per month + annual total
```

**Grid cell behavior:**
- View mode: display value formatted as ฿X,XXX
- Edit mode: click cell → becomes `<input type="number">`
  Tab moves to next cell. Enter confirms.
  Changed cells highlight with a yellow border until submitted.
- Submit batch button: appears at bottom in edit mode only
  "Submit X changes" — single API call with all changes
  On success: re-render grid, exit edit mode
  On error: show which cells failed, keep edit mode open

**Collapsible group rows:**
Each category group (Basic Living, Family, etc.) has a collapse toggle.
Collapsed: shows only the group total row.
Expanded: shows all individual budget rows in that group.
Default: all expanded.

### E1-O5 — Wiring

File: `public/assets/js/budget.injector.js`
Replace the current placeholder content entirely.
Load from existing `/api/budgets` and `/api/transactions` endpoints.
Do NOT change the API files — work with existing data shape.
Cross-reference with `dashboard.injector.js` for the budget/transaction
data fetching pattern — use the same approach.

Commit: `feat(budget): 12-month planning grid — view + edit mode + Thai tax provision`

---

## MODULE E2 — IDEAS/BLOG PANEL REFINEMENTS

### Context
The diary.injector.js already exists and works well (99% functional).
The Ideas panel in the sidebar shell (`#panel-ideas`) should wire this
injector with targeted UX improvements.
Do NOT rewrite diary.injector.js — make surgical additions only.

Read diary.injector.js fully before touching anything.

### E2-O1 — Add Memo as a new entry type

Current types: Story · Idea · Blog · Project · Skill
Add: **Memo** — short operational note, not for publishing

In diary.injector.js:
- Add 'Memo' to the type filter chips
- Add 'Memo' to the entry-type select dropdown
- Memo entries: no blog section, no publish toggle, no push buttons
  Just title + content + tags + date. Quick capture.
- Color for Memo type chips: gray (neutral, operational)

In Airtable: add 'Memo' to the entry_type field choices via the
existing `ensureDiaryTypes()` function or direct schema API call.
Check how existing types were added and follow the same pattern.

Commit: `feat(ideas): add Memo entry type`

### E2-O2 — Stats cards per content type (top of panel)

Above the left-pane entry list, add a row of stat chips:
One chip per type: Idea · Blog · Story · Quote · Memo
Each chip shows: type name + count of entries of that type
Clicking a chip filters the list to that type (same as type filter chips).
Active chip highlighted. Click again to deactivate (show all).

This replaces the need for a separate filter row — the stats chips
ARE the filter.

Commit: `feat(ideas): stats cards per content type as filter`

### E2-O3 — Thumbnail display in entry list

If an entry has a `cloudinary_image_url`, show a small thumbnail
(40×40px, object-fit cover, border-radius 4px) on the left side
of the entry list item.
If no image: show the type color dot (existing behavior).
Do not change the entry card layout significantly — just prepend
the thumbnail where the dot currently sits.

Commit: `feat(ideas): thumbnail in entry list`

### E2-O4 — Filter and search improvements

Current: search input + type filter chips as separate rows.
New: combine into one filter bar:
- Search input (existing, keep as-is)
- Type filter: move to a compact dropdown [Type ▾] instead of chip row
  Options: All · Idea · Blog · Story · Quote · Memo · Skill · Project
- Pin toggle: [📌 Pinned only] — shows only entries where a
  `pinned` boolean field is true. If field doesn't exist in Airtable,
  add it via schema API (same pattern as other field additions).
  Pin button appears on each entry card (icon only, toggles the field).

Keep: search input, existing filter logic.
Remove: the old type filter chip row (replaced by dropdown + stats cards).

Commit: `feat(ideas): filter bar with type dropdown + pin toggle`

### E2-O5 — Distribution buttons

For each entry in the list and in the editor toolbar, add
distribution action buttons. Show as icon-only buttons with hover
tooltip. Place after existing save/edit buttons.

**Push to website** (existing — keep as-is for Blog type):
Existing publish_to_web toggle + blog push logic — do not change.
Just ensure it's still visible and working.

**Push to social media** (placeholder):
Button: ti-brand-instagram icon
On click: show placeholder modal "Social push coming in Phase 9F"
Do not implement — placeholder only.

**Push to project** (placeholder):
Button: ti-rocket icon
On click: show placeholder modal "Select project coming in Phase 9F"
Do not implement — placeholder only.

Only show distribution buttons for: Blog · Idea · Story types.
Hide for: Memo · Quote · Skill · Project types.

Commit: `feat(ideas): distribution buttons — web live, social+project placeholders`

### E2-O6 — AI assist output pane improvements

Current: AI assist modal shows result with Keep/Replace/Append/Undo.
Improvements:
- Move AI output from a modal to a bottom pane inside the editor area
  (below the content textarea, above the toolbar buttons)
- Pane shows: AI result text + 3 buttons: [Replace] [Append] [Undo]
  [Replace]: replaces content field with AI result (existing logic)
  [Append]: appends AI result below current content (existing logic)
  [Undo]: restores previous content (existing logic)
- Pane is hidden by default, slides up when AI returns a result
- AI assist buttons remain in the toolbar (existing positions)
- If the modal approach is deeply embedded in the injector,
  CC may keep it as-is and add the pane as an alternative view —
  owner preference, CC decides what's cleanest given the code

Commit: `feat(ideas): AI assist output as bottom pane`

---

## CONSTRAINTS

- Do NOT change `functions/api/diary.js` logic
- Do NOT change `functions/api/budgets.js` logic
- Do NOT change `functions/api/transactions.js` logic
- Do NOT change dashboard.injector.js
- Do NOT change entry.injector.js
- Budget grid edit mode: batch submit only — never one Airtable call per cell
- Diary changes: surgical only — do not rewrite diary.injector.js
- Repo is source of truth on all existing patterns

---

## AFTER ALL OUTCOMES — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — Budget 12mo grid + Ideas/Blog Memo + stats + thumbnails + AI pane`

2. Update `masterseed.md`:
   - Mark Phase 9E ✅ COMPLETE
   - Update CURRENT STATE for budget and ideas panels
   - Update FILE INVENTORY if any new files created
   - Update ROADMAP: note 9F as next (social push + project push)

3. Append new lessons to `lessons_learned.md` (next L after current highest):
   - Batch Airtable update pattern for grid edit mode
   - Thai tax bracket calculation approach
   - Any diary.injector.js surgical pattern lessons

4. Commit: `docs: update masterseed and lessons_learned after phase9e`

List all files changed at end of response.

---

## COMMIT ORDER

```
feat(budget): 12-month planning grid — view + edit mode + Thai tax provision  ← E1
feat(ideas): add Memo entry type                                                ← E2-O1
feat(ideas): stats cards per content type as filter                             ← E2-O2
feat(ideas): thumbnail in entry list                                            ← E2-O3
feat(ideas): filter bar with type dropdown + pin toggle                         ← E2-O4
feat(ideas): distribution buttons — web live, social+project placeholders       ← E2-O5
feat(ideas): AI assist output as bottom pane                                    ← E2-O6
docs: update masterseed and lessons_learned after phase9e
```

Branch: `feat/9e-budget-ideas`
Merge to `main` after owner QA confirms both modules pass.
Debug session: owner works directly with Chat for any failures.
