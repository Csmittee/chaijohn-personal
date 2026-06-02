# CC_PROMPT_fix-batch4.md
> Batch 4 — Presale 422 fix, cashflow source rules, M2.2 Projects lane, M2.2 list view, M3.3 delete
> Branch: fix/batch4
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L091 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_fix-batch4.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `functions/api/transactions.js` — full POST handler, all accepted fields, source field type
3. `functions/api/cashflow.js` — how it filters transactions for display
4. `functions/api/expenses.js` — how it filters transactions for M2.3
5. `public/assets/js/project-finance.injector.js` — presale form save logic
6. `public/assets/js/sales.injector.js` — Projects lane rendering, Asset Sales card/list view
7. `public/assets/js/hard-assets.injector.js` — card render + edit/sell modal

Read all 7 before writing a single line.

---

## CONFIRMED CASHFLOW ARCHITECTURE

This is the owner-confirmed rule. Every fix must respect it:

| Transaction | Cashflow M2.1 | Expense M2.3 | Sales M2.2 |
|---|---|---|---|
| Personal expense | ✅ out | ✅ | ❌ |
| Debt repayment (LiabilityPayment) | ✅ out | ✅ | ❌ |
| Project funding (Confirm purchase) | ✅ out | ❌ | ❌ |
| Presale booking | ✅ in | ❌ | ✅ Projects lane |
| Cash In (investor/windfall) | ✅ in | ❌ | ❌ |
| Business income | ✅ in | ❌ | ✅ Active Business |
| Collection sell | ✅ in | ❌ | ✅ Asset Sales |
| Hard asset sell | ✅ in | ❌ | ✅ Asset Sales |

**Key rule:**
- Cashflow = ALL transactions (no source filter — everything in and out)
- Expense M2.3 = type='Expense' AND source NOT IN ('project_funding')
- Sales M2.2 = type='Income' AND source IN ('presale','collection','hard_asset_sale') + business invoices

---

## BUG 1 — M2.4 Presale save: 422 INVALID_MULTIPLE_CHOICE_OPTIONS

**File:** `functions/api/transactions.js` POST handler
**File:** `public/assets/js/project-finance.injector.js` presale save

**Diagnosis:** The 422 error `INVALID_MULTIPLE_CHOICE_OPTIONS` means `source` field in the
Airtable Transactions table is a **single select field** — not plain text as the code assumes.
The value `'presale'` is not in the allowed options list.

**Fix — two parts:**

**Part 1 — Add missing source options to Airtable field via Meta API:**
In `functions/api/transactions.js` POST handler, before saving, check if `source` field
exists as a single select. If yes, ensure these values are valid options:
`presale`, `cash_in`, `hard_asset_sale`, `project_funding`, `collection`, `Manual`, `LiabilityPayment`, `M2.2`

Use the Airtable Meta API to update the field options once on startup:
- GET `https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables` to find Transactions table ID
- Find the `source` field
- If it is `singleSelect` type, PATCH the field to add missing options
- Cache this check in a module-level flag so it only runs once per cold start

**Part 2 — project-finance.injector.js presale save:**
After the 422 fix above, also verify the POST body being sent:
- `source` must be string `'presale'` (not array)
- `category_id` must be a record ID string wrapped in array: `[recXXXXXX]`
- `project_id` must be plain string (not array) — check how transactions.js handles it

If `project_id` is sent as a plain string and transactions.js doesn't accept it,
add `project_id` to the accepted fields in the POST handler.

---

## BUG 2 — M2.4 Confirm purchase → must hit Cashflow, NOT Expense

**File:** `public/assets/js/project-finance.injector.js` — Confirm button handler

When owner clicks "Confirm →" on a Budget Card (resource):
1. PATCH resource status to `Purchased` in Airtable ✅ (already done)
2. POST a transaction to Cashflow with:
```javascript
{
  type: 'Expense',
  source: 'project_funding',   // ← this source excludes it from M2.3 Expenses
  amount: resource.amount,
  date: today,
  entity: projectName,
  description: `Project funding — ${resource.name}`,
  // NO budget_id — project funding bypasses the budget system
}
```

**Fix in transactions.js POST handler:**
The current handler requires `budget_id` for all Expense transactions:
```javascript
if (type === 'Expense' && !body.budget_id && body.source !== 'LiabilityPayment') {
  return errorResponse('budget_id is required for Expense transactions');
}
```

Add `project_funding` to the exception list:
```javascript
if (type === 'Expense' && !body.budget_id
    && body.source !== 'LiabilityPayment'
    && body.source !== 'project_funding') {
  return errorResponse('budget_id is required for Expense transactions');
}
```

**Fix in expenses.js GET handler (M2.3 filter):**
Add filter to exclude `source='project_funding'` from the expense list:
```javascript
// Only return personal expenses — exclude project funding
records = records.filter(r => r.fields.source !== 'project_funding');
```

---

## BUG 3 — M2.2 Projects lane: show presale transactions, not forecast card

**File:** `public/assets/js/sales.injector.js` — Projects section render

**Current wrong behavior:** Shows one big card per project with ฿1M/mo forecast assumption
and a "Go to Project" button. This is NOT real revenue.

**Correct behavior:** Show list of actual presale transactions booked for each project.

**Fix — rewrite the Projects lane section:**

Fetch presale transactions: `GET /api/transactions?source=presale`
Group by `project_id`.

For each project that has presales:
```
PROJECT NAME                          Total: ฿X,XXX
────────────────────────────────────────────────────
[date]  [customer/entity]             ฿amount
[date]  [customer/entity]             ฿amount
```

If no presales exist for any project: show empty state
"No presale bookings yet — add from M2.4 Finance Projects"

Remove: the ฿1M/mo forecast card, the monthly_revenue display, the "Go to Project" button
from this lane. Projects lane = presale receipts only.

Card/list toggle: both card and list view must work using the same format as
Active Business section (not a unique layout).

---

## BUG 4 — M2.2 Asset Sales: list view inconsistency

**File:** `public/assets/js/sales.injector.js` — Asset Sales section list view render

**Current:** Card view uses photo cards (OK). List view uses a different layout than
other sections.

**Fix:** List view for Asset Sales must render identical row format to every other section:
```
[date]  [asset name / entity]  [source badge]  ฿amount
```

No photo in list view. Same row height, same columns as Active Business list view.
Card view keeps the photo card (no change needed there).

---

## BUG 5 — M3.3 Hard Assets: add Delete button + fix ghost card

**File:** `public/assets/js/hard-assets.injector.js`

**Issue A — Delete button missing:**
Each asset card needs a Delete button alongside Edit and Mark Sold.
On click: confirm dialog "Delete [asset name]? This cannot be undone."
On confirm: `DELETE /api/hard-assets/:id` → remove card from DOM.

**Issue B — Ghost "Unnamed" card:**
A record exists with blank `name`. This was created because the Add form
allowed save without a name.

Fix: add client-side validation — if `name` is empty or whitespace on Save,
show inline error "Asset name is required" and do NOT POST.

Also: in the card render, if `name` is blank/null, show a "Delete" button only
(no Edit, no Mark Sold) so owner can clean up ghost records easily.

---

## DO NOT TOUCH

- `public/assets/js/cashflow.injector.js`
- `public/assets/js/expenses.injector.js` — only add project_funding exclusion to API
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/collection.injector.js`
- `public/assets/js/projects.injector.js`
- `public/assets/js/entry.injector.js`
- `functions/api/hard-assets/[id].js` — already has DELETE, just wire UI

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — Presale 422 fix, project_funding cashflow, M2.2 Projects lane, list view, M3.3 delete`

2. Append to RULES.md (after L091):
   - source='project_funding' → Cashflow only, excluded from Expense M2.3
   - source='presale' → Cashflow + Sales M2.2 Projects lane only
   - Transactions source field in Airtable may be singleSelect — patch options via Meta API on init if needed
   - budget_id not required when source IN ('LiabilityPayment', 'project_funding')
   - M2.2 Projects lane = presale transactions grouped by project_id, not forecast cards

3. Update PROJECT_STATE.md:
   - Mark Batch 4 ✅ COMPLETE
   - Update CONFIRMED WORKING list

4. Commit docs: `docs: update RULES and PROJECT_STATE after batch4`

---

## COMMIT ORDER

```
fix(transactions): add project_funding source exception + patch Airtable singleSelect options
fix(m24): project-finance.injector.js — presale save 422 fix + Confirm creates project_funding tx
fix(expenses): exclude source=project_funding from M2.3 expense filter
fix(m22): sales.injector.js — Projects lane shows presale transactions, not forecast cards
fix(m22): sales.injector.js — Asset Sales list view matches standard row format
fix(m33): hard-assets.injector.js — Delete button + ghost card name validation
docs: update RULES and PROJECT_STATE after batch4
```

Branch: `fix/batch4`
Merge to main after owner confirms:
- [ ] M2.4 presale save — no more 422 error, transaction created
- [ ] M2.4 presale — appears in M2.1 Cashflow as income ✅
- [ ] M2.4 Confirm purchase — creates transaction, appears in M2.1 Cashflow as outflow
- [ ] M2.4 Confirm purchase — does NOT appear in M2.3 Expenses
- [ ] M2.2 Projects lane — shows presale transaction rows (not forecast card)
- [ ] M2.2 Asset Sales list view — same row format as other sections
- [ ] M3.3 Delete button on each card — works, removes card
- [ ] M3.3 Add form — blocks save if name is empty
- [ ] M3.3 Ghost "Unnamed" card — shows Delete-only, owner can clean up
