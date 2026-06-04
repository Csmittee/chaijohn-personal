# CC_PROMPT_fix-budget-panel.md
> Branch: fix/budget-panel
> Files: budget-panel.injector.js only (no API changes needed)
> Merge to main after owner QA

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-budget.md
4. public/assets/js/budget-panel.injector.js  ← full file, every line

Then execute this prompt.
```

---

## CONTEXT

The budget spreadsheet panel (M2.5) has 4 bugs to fix.
All fixes are in `budget-panel.injector.js` only.
No API changes. No Airtable schema changes.

---

## FIX 1 — January always missing from grid

**Observed:** Jan 2026 data exists in Airtable but never appears in the spreadsheet.

**Cause:** When `graphPeriod` is 'rolling', `monthKeys` starts from current month − 11.
If custom start is set past January, Jan is excluded.

**Fix:** When `graphPeriod === 'fy'` (financial year), always render Jan–Dec of current year.
The FY view is what the owner uses for the budget spreadsheet.
Make FY the default `graphPeriod` on panel init (not rolling).

**Required outcome:** Jan column always visible when in FY view.

---

## FIX 2 — Actual expense save adds new row instead of replacing

**Observed:** Every save of an actual expense cell creates a new Airtable transaction.
The cell then shows the SUM of all records for that budget+month — wrong.

**Root cause in code:** `saveBatchChanges()` always POSTs new transaction.
No check if one already exists for that budget_id + month.

**Fix — two steps:**

**Step A — computeMaps() dedup:**
When building `spendByBudgetMonth`, if multiple transactions exist for the same
budget_id + YYYY-MM, only use the MOST RECENT one (by date, then by record order).
Do NOT sum them. Replace, not accumulate.

```javascript
// For each budget_id + month: keep only the latest transaction amount
// Latest = highest date string (ISO sort), or last in array if same date
```

**Step B — saveBatchChanges() for actual kind:**
Before POSTing a new transaction, search `txData` (already loaded in memory)
for an existing transaction matching `budget_id === e.id` AND `date.slice(0,7) === e.monthKey`.

- If found → PATCH `/api/transactions/${existingTx.id}` with `{ amount: e.newVal }`
- If not found → POST `/api/transactions` as before

No new API endpoint needed. `txData` is already in module scope.

**Required outcome:** Editing a cell and saving replaces the value, never adds a duplicate row.

---

## FIX 3 — Budget/mo field overrides individual month edits

**Current broken behaviour:**
- Owner edits a single month cell (e.g. June = 500)
- Also has Budget/mo field showing 1200
- On save, Budget/mo PATCH overwrites all months back to 1200

**New rule — simple priority system:**

When rendering each month cell in the grid, pick the budget amount using this logic:

```
For each budget row + each month:
  Find all budget records with same label + same category_id
  that cover this month (start_date <= month <= end_date)
  
  Pick the one with the SHORTEST date range (most specific)
  → use its amount as the budget for this month

If only one record exists → use it (current behaviour, unchanged)
```

**When owner saves a per-month budget cell:**
- Do NOT PATCH the existing budget record
- POST a new budget record:
  ```
  label:      same as original
  category_id: same as original  
  amount:     e.newVal (as monthly amount, convert to period if needed)
  start_date: e.monthKey + '-01'
  end_date:   last day of e.monthKey
  period:     'Monthly'
  active:     true
  ```
- The original spanning record stays untouched

**When owner saves Budget/mo field (the first column):**
- PATCH the base record only (current behaviour — keep as-is)
- Do NOT touch any per-month override records

**Required outcome:**
- June override = 500 → base record untouched, new single-month record created
- Grid renders June = 500, all other months = base record amount
- Budget/mo column shows base record amount (unchanged)

---

## FIX 4 — Earn row must be read-only, fed from sales total

**Observed:** Earn row at top of grid is editable. Owner can type values and save
transactions — this is wrong. Earn is already tracked in M2.2.

**Fix:**
- Earn rows are ALWAYS read-only — no input fields, no edit mode for them
- Remove earn rows from `pendingChanges` logic entirely
- In `computeMaps()`, keep earning `earnByBudgetMonth` populated from `txData` as now
  (actual income transactions) — this is correct for the ACTUAL column
- For the BUDGET column of earn rows: show the `mbr()` amount from the budget record
  as a grey reference value — no editing

**If sales summary is available in module scope** (from a separate `/api/sales` fetch):
  Show total earn per month from sales summary instead of transaction sum.
  If not available, keep showing from txData — acceptable fallback.

**Required outcome:**
- Earn rows never show input fields even when Edit Mode is ON
- Earn rows show actual income from transactions (read display only)
- Pending bar never counts earn changes

---

## PERMANENT RULES — add to .claude/rules/RULES-budget.md

```
L149  Budget grid month priority: when multiple budget records share same label+category
      and cover the same month, render the one with the shortest date range (most specific).
      Spanning base record = default. Single-month override = takes priority for that month only.

L150  Budget per-month override: saving a single month cell POSTs a NEW budget record
      with start_date = end_date = that month. Never PATCHes the base record.
      Base record is permanent — only Budget/mo column PATCH touches it.

L151  Actual expense cell save: check txData in memory for existing tx with same
      budget_id + month before POSTing. If found → PATCH existing. Never create duplicates.

L152  Earn rows in budget grid are always read-only. No inputs in edit mode.
      Earn is owned by M2.2 — budget panel is display only for earn section.

L153  Budget panel default period = FY (financial year Jan–Dec). Never default to rolling.
      FY ensures Jan is always visible.
```

---

## AFTER FIX — MANDATORY

1. Move this prompt to `docs/prompts/` stamped ✅ COMPLETE
2. Append L149–L153 to `.claude/rules/RULES-budget.md`
3. Update PROJECT_STATE.md build phases:
   ```
   | fix/budget-panel | Budget grid: Jan fix, dedup actual save, per-month override priority, earn read-only, L149–L153 | ✅ COMPLETE |
   ```
4. Commit: `fix(budget): Jan visibility, dedup saves, per-month priority, earn read-only`
5. Merge to main
