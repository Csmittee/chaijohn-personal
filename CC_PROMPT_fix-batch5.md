# CC_PROMPT_fix-batch5.md
> Batch 5 — Transaction model simplification (root fix) + presale/project_funding wiring
> Branch: fix/batch5
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L098 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_fix-batch5.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `functions/api/transactions.js` — full file, both GET and POST handlers
3. `functions/api/expenses.js` — full file, how it filters
4. `functions/api/cashflow.js` — full file, how it filters
5. `functions/api/sales.js` — full file, how it filters
6. `public/assets/js/project-finance.injector.js` — presale save + Confirm Purchase handlers
7. `public/assets/js/sales.injector.js` — Projects lane + Asset Sales render

Read all 7 before writing a single line.

---

## THE ROOT PROBLEM (read carefully before touching anything)

The Transaction model has been over-complicated with `category_id` which conflicts with
`budget_id` and causes CC to send wrong fields, causing Airtable 422 errors.

The owner has confirmed the correct simplified model below. This is now the SINGLE SOURCE
OF TRUTH for all transaction logic. Every file must comply with it.

---

## CONFIRMED TRANSACTION MODEL — FINAL

### POST rules — what fields each transaction type sends:

| Transaction | type | source | budget_id | project_id | category_id |
|---|---|---|---|---|---|
| Personal expense | Expense | Manual | ✅ required | — | NEVER |
| Debt repayment | Expense | LiabilityPayment | — | — | NEVER |
| Project funding | Expense | project_funding | — | ✅ required | NEVER |
| Presale booking | Income | presale | — | ✅ required | NEVER |
| Cash In | Income | cash_in | — | — | NEVER |
| Collection sell | Income | collection | — | — | NEVER |
| Hard asset sell | Income | hard_asset_sale | — | — | NEVER |
| Business income | Income | M2.2 | — | — | NEVER |

**`category_id` is NEVER written on any new transaction going forward.**
Legacy records already in Airtable with category_id: leave them alone, read for display only.

### GET / view filter rules:

| View | Filter logic |
|---|---|
| Cashflow M2.1 | ALL transactions — no filter |
| Cash Out | type = Expense |
| Cash In | type = Income |
| Expenses M2.3 | type = Expense AND budget_id NOT empty |
| Sales M2.2 Active Business | business invoices (existing logic, unchanged) |
| Sales M2.2 Projects lane | type = Income AND source = 'presale' → grouped by project_id |
| Sales M2.2 Asset Sales | type = Income AND source IN ('collection', 'hard_asset_sale') |
| Sales M2.2 Manual Entries | type = Income AND source = 'Manual' AND project_id empty |

### Validation rules in POST handler:

```javascript
// Only rule: personal expense needs a budget
if (type === 'Expense'
    && source === 'Manual'
    && !body.budget_id) {
  return errorResponse('budget_id is required for personal expense transactions');
}
// Everything else: no budget_id required
// category_id: never write it, even if sent in body — ignore it silently
```

---

## FIX 1 — transactions.js: simplify POST, enforce model

**File:** `functions/api/transactions.js`

**Changes to POST handler:**

1. Replace the current over-constrained validation:
```javascript
// REMOVE THIS:
if (type === 'Expense' && !body.budget_id && body.source !== 'LiabilityPayment') {
  return errorResponse('budget_id is required for Expense transactions');
}

// REPLACE WITH:
if (type === 'Expense' && (!body.source || body.source === 'Manual') && !body.budget_id) {
  return errorResponse('budget_id is required for personal expense transactions');
}
```

2. Remove ALL category_id writing. Find this block and delete it entirely:
```javascript
if (body.category_id && type !== 'Expense') {
  fields.category_id = Array.isArray(body.category_id) ? body.category_id : [body.category_id];
}
```

3. Ensure `project_id` is accepted and saved as plain text (not array):
```javascript
if (body.project_id) fields.project_id = body.project_id; // plain string, not array
```

4. `source` field: just save as plain string. Do NOT call Meta API to patch options —
   that approach failed. Owner has manually added all required options in Airtable already.
   Remove the `patchSourceOptions()` function entirely if it exists.

**Changes to GET handler:**

The GET handler currently enriches records with category via budget → category path.
Keep this enrichment for legacy display. No changes needed to GET.

---

## FIX 2 — expenses.js: correct filter for M2.3

**File:** `functions/api/expenses.js`

M2.3 Expenses = personal expenses only = `type=Expense` AND `budget_id` not empty.
This naturally excludes project_funding (no budget_id) and LiabilityPayment (no budget_id).

Read the current filter logic. If it filters by `type=Expense` only (too broad), tighten it:

Use Airtable filterByFormula:
```
AND({type}='Expense', {budget_id}!='')
```

Or if fetching all and filtering in JS:
```javascript
records = records.filter(r =>
  r.fields.type === 'Expense' &&
  (r.fields.budget_id && r.fields.budget_id.length > 0)
);
```

Do NOT filter by source — the budget_id presence is the correct signal.

---

## FIX 3 — project-finance.injector.js: presale save + Confirm Purchase

**File:** `public/assets/js/project-finance.injector.js`

### Fix 3A — Presale save

Find the presale form save handler. Replace the POST body with ONLY:
```javascript
{
  type: 'Income',
  source: 'presale',
  project_id: projectId,        // plain string record ID of the project
  amount: Number(amountInput.value),
  date: dateInput.value,
  entity: entityInput.value,
  description: `Pre-sale — ${projectName}`,
  note: noteInput.value || ''
}
```

Remove: `category_id` from the POST body entirely.
Remove: any category lookup / init fetch for Pre-sale category.
The source='presale' is enough — no category_id needed.

### Fix 3B — Confirm Purchase (Budget Card)

Find the Confirm Purchase button click handler.
After the PATCH to update resource status to 'Purchased', add a POST to create the cashflow record:

```javascript
await fetch('/api/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'Expense',
    source: 'project_funding',
    project_id: projectId,          // the current expanded project's record ID
    amount: Number(resourceCost),   // read from the resource card data attribute
    date: new Date().toISOString().split('T')[0],
    entity: projectName,
    description: `Project funding — ${resourceName}`
    // NO budget_id — project_funding bypasses budget system
  })
});
```

Read the current Confirm button handler carefully to find the correct variable names
for projectId, projectName, resourceCost, resourceName — do not guess.

---

## FIX 4 — sales.injector.js: Projects lane filter

**File:** `public/assets/js/sales.injector.js`

The Projects lane already fetches `GET /api/transactions?source=presale` (from batch4).
Verify this is working after Fix 1. No changes expected here unless the fetch URL changed.

If the Projects lane is still empty after Fix 1 passes, check:
- Is `project_id` being stored correctly in Airtable after Fix 3A?
- Is the grouping by `project_id` matching actual record IDs from Projects table?

---

## FILES TO UPDATE AFTER THIS FIX — MANDATORY

These files define the standard every future CC session must follow.
CC MUST update all of them before closing this session:

### 1. RULES.md — append after current highest L-number:

```
## TRANSACTION MODEL (canonical — confirmed 2026-06-02)

L099  Transaction model is the single source of truth for all money flow. Never add complexity beyond this.
L100  category_id on Transactions: NEVER write on new records. Read legacy records for display only. Silently ignore if sent in POST body.
L101  POST validation rule: budget_id required ONLY when type=Expense AND source=Manual. All other sources bypass budget requirement.
L102  project_id on Transactions: plain text string (not array). Required for source=presale and source=project_funding.
L103  View filters by source: Expenses M2.3 = budget_id not empty. Projects lane M2.2 = source=presale. Asset Sales = source IN (collection, hard_asset_sale). Cashflow = everything.
L104  source field in Airtable Transactions is singleSelect. Do NOT attempt to patch options via Meta API — it requires schema admin permission. Owner manages allowed values in Airtable UI.
L105  Presale POST body: {type:Income, source:presale, project_id, amount, date, entity, description}. Nothing else.
L106  Project funding POST body: {type:Expense, source:project_funding, project_id, amount, date, entity, description}. No budget_id, no category_id.
```

### 2. CLAUDE.md — add Transaction Model section:

After the existing rules section, add:

```markdown
## TRANSACTION MODEL
See RULES.md L099–L106 for the full canonical model.
Short version:
- Cashflow = all transactions
- Expenses M2.3 = type=Expense AND budget_id not empty
- Sales M2.2 = type=Income grouped by source
- NEVER write category_id on new transactions
- source field = Airtable singleSelect (owner manages options)
```

### 3. PROJECT_STATE.md — update:
- Mark Batch 5 ✅ COMPLETE
- Add to CONFIRMED WORKING: presale save, project_funding cashflow
- Add to AIRTABLE NOTES: Transactions.source is singleSelect, owner manages options manually

### 4. Archive prompt:
Move `CC_PROMPT_fix-batch5.md` → `docs/prompts/`
Stamp: `✅ COMPLETE — [date] — Transaction model root fix, presale save, project_funding cashflow`

---

## DO NOT TOUCH

- `public/assets/js/cashflow.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/collection.injector.js`
- `public/assets/js/projects.injector.js`
- `public/assets/js/entry.injector.js`
- `public/assets/js/hard-assets.injector.js`
- `functions/api/hard-assets.js`
- `functions/api/categories.js`
- `functions/api/budgets.js`

---

## COMMIT ORDER

```
fix(transactions): simplify POST validation — budget_id only for Manual expense, remove category_id write
fix(expenses): tighten M2.3 filter to type=Expense AND budget_id not empty
fix(m24): project-finance.injector — presale POST removes category_id, Confirm Purchase creates project_funding tx
docs(rules): append L099–L106 transaction model canonical rules
docs(claude): add transaction model summary section
docs(state): update PROJECT_STATE after batch5
chore: archive CC_PROMPT_fix-batch5.md to docs/prompts/
```

Branch: `fix/batch5`
Merge to main after owner confirms:
- [ ] M2.4 presale save — no error, transaction appears in Airtable with source=presale
- [ ] M2.4 presale — appears in M2.1 Cashflow as income (green)
- [ ] M2.4 presale — appears in M2.2 Sales Projects lane
- [ ] M2.4 Confirm Purchase — transaction appears in M2.1 Cashflow as outflow (red)
- [ ] M2.4 Confirm Purchase — does NOT appear in M2.3 Expenses
- [ ] M2.3 Expenses — shows only personal expenses with budget (no project_funding, no LiabilityPayment without budget)
- [ ] No 422 errors anywhere in console
