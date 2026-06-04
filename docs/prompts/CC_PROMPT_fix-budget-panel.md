# CC_PROMPT_fix-budget-panel.md
> ✅ COMPLETE — fix/budget-panel — 2026-06-04 — Budget grid: Jan visibility, dedup actual save, per-month override priority, earn read-only
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

**Step B — saveBatchChanges() for actual kind:**
Before POSTing a new transaction, search `txData` (already loaded in memory)
for an existing transaction matching `budget_id === e.id` AND `date.slice(0,7) === e.monthKey`.

- If found → PATCH `/api/transactions/${existingTx.id}` with `{ amount: e.newVal }`
- If not found → POST `/api/transactions` as before

No new API endpoint needed. `txData` is already in module scope.

**Required outcome:** Editing a cell and saving replaces the value, never adds a duplicate row.

---

## FIX 3 — Budget/mo field overrides individual month edits

**New rule — simple priority system:**
For each budget row + each month: pick the budget record with the SHORTEST date range.
Single-month override = most specific = takes priority.

When owner saves a per-month budget cell:
- POST a new budget record with start_date = end_date = that month.
- The original spanning record stays untouched.

When owner saves Budget/mo field (the first column):
- PATCH the base record only.

---

## FIX 4 — Earn row must be read-only, fed from sales total

- Earn rows are ALWAYS read-only — no input fields, no edit mode for them
- Remove earn rows from `pendingChanges` logic entirely
- Earn rows show actual income from transactions (read display only)
- Pending bar never counts earn changes

---

## PERMANENT RULES — added to .claude/rules/RULES-budget.md

L149–L153 appended.
