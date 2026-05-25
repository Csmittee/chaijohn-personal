# CC_PROMPT_fixG_transaction-budget-link

Before writing any code, read fresh from repo:
- masterseed.md
- lessons_learned.md
- functions/api/transactions.js
- functions/api/transactions/[id].js (if exists)
- functions/api/budgets.js
- functions/api/categories.js
- public/assets/js/entry.injector.js
- public/entry.html

Summarize what you understand about each file before proceeding.
Branch: main — commit directly. Merge to main before ending session.

═══════════════════════════════════════════════════════
CONTEXT — DATA MODEL CHANGE (read carefully)
═══════════════════════════════════════════════════════

The Transactions Airtable table now has TWO link fields:
  - `category_id` — OLD field, links to Categories table
                    Keep in Airtable, never delete, never write to it again
                    Read it only for legacy display of old records
  - `budget_id`   — NEW field, links to Budgets table
                    This is the new source of truth for expense transactions

BOOKING RULES going forward:
  Expense transaction → MUST have budget_id (selected from Budgets)
  Earn transaction    → budget_id is null, category_id optional (Earn-type only)
  Liability payment   → created by debts.js, neither field needed

CATEGORY STILL MATTERS but indirectly:
  To know what category an expense belongs to:
  Transaction → budget_id → Budget.category_id → Category.name/group
  Never Transaction → category_id directly for new records

═══════════════════════════════════════════════════════
FIX G1 — API: Read budget_id in transaction endpoints
═══════════════════════════════════════════════════════
File: functions/api/transactions.js
      functions/api/transactions/[id].js

CHANGES:

GET /api/transactions:
  When returning records, include budget_id field in the response.
  Also resolve the budget label and its linked category for display:
    For each record, if budget_id exists:
      - Include budget_label (from Budget.label)
      - Include category_name (from Budget → Category.name)
      - Include category_group (from Budget → Category.group)
    If only legacy category_id exists (no budget_id):
      - Resolve category_name from category_id as before (legacy fallback)
      - Mark as legacy: true in the response

POST /api/transactions:
  Accept budget_id in request body (array with one record ID, Airtable format)
  When type = 'Expense': require budget_id, return 400 if missing
  When type = 'Income'/'Earn': budget_id is optional, ignore if not sent
  Stop writing to category_id field entirely for new records
  
  To get category for cashflow calculation when budget_id is present:
    Fetch the Budget record to get its category_id
    Use that category for any category-based logic

PATCH /api/transactions/[id].js:
  Accept budget_id in request body
  Update budget_id field in Airtable if provided
  Never overwrite category_id

═══════════════════════════════════════════════════════
FIX G2 — API: Budget endpoint returns category group
═══════════════════════════════════════════════════════
File: functions/api/budgets.js

GET /api/budgets must return:
  - All budget fields as now
  - PLUS: category_group (from linked Category.group)
  - PLUS: category_name (from linked Category.name)
  - PLUS: category_type (from linked Category.type)

This allows the frontend to group budgets by B-level group
without a separate categories fetch.

To get linked category data:
  Each budget record has category_id as a linked record array
  Fetch categories in a separate Airtable call using the IDs
  or use Airtable formula field if already set up

Return only budgets where linked category type = 'Expense'
when query param ?expense_only=true is passed.

═══════════════════════════════════════════════════════
FIX G3 — UI: Transaction expense dropdown → Budget list
═══════════════════════════════════════════════════════
File: public/assets/js/entry.injector.js

CURRENT: expense category dropdown fetches from /api/categories
TARGET: expense budget dropdown fetches from /api/budgets?expense_only=true&active_only=true

CHANGE in loadCategories() / populateCategoryDropdowns():
  For the expense transaction dropdown (id="tx-category"):
    Fetch /api/budgets?expense_only=true&active_only=true
    Group results by category_group (B level)
    Render as optgroup per group, option per budget:
      <optgroup label="Basic Living">
        <option value="{budget_record_id}">Food restaurant — ฿8,000/mo</option>
        <option value="{budget_record_id}">Food super — ฿5,000/mo</option>
      </optgroup>
      <optgroup label="Car">
        <option value="{budget_record_id}">Fuel — ฿5,000/mo</option>
      </optgroup>

  Option display format: "{budget.label} — {fmt(budget.amount)}/{period_short}"
  period_short: Monthly→mo, Annual→yr, One-time→once, 3x-year→3x/yr

  On selection: store the budget record ID as the selected value
  On save transaction: send as budget_id: [selectedBudgetRecordId]
  Do NOT send category_id for new expense transactions

For EARN type dropdown (id="tx-category" when type=Income):
  Keep fetching from /api/categories but filter: type='Earn' only
  Store as category_id (legacy field, Earn type still uses it)
  Do not require budget_id for Earn

RENAME the label "Category" → "Budget" when type = Expense
RENAME the label "Category" → "Income Source" when type = Earn/Income

UPDATE the budget bar (updateBudgetBar):
  Now receives budget record ID instead of category ID
  Find matching budget directly by ID (no category lookup needed)
  Display: "{budget.label} — {fmt(spent)} spent / {fmt(budget.amount)} budget ({p}%)"

═══════════════════════════════════════════════════════
FIX G4 — UI: Transaction list display uses budget_id
═══════════════════════════════════════════════════════
File: public/assets/js/entry.injector.js

In loadTransactions() and renderTransactionRow():

For records with budget_id:
  Show: category_group + " — " + budget_label
  Example: "Basic Living — Food restaurant"

For legacy records with only category_id (no budget_id):
  Show as before using category name/group
  Add small gray "(legacy)" tag so owner knows

For Earn records:
  Show: earn category name if present, else "Income"

For Liability payment records (source = 'LiabilityPayment'):
  Show: "Loan — " + entity name
  Never show budget or category for these

═══════════════════════════════════════════════════════
FIX G5 — UI: Budget creation enforces unique label
═══════════════════════════════════════════════════════
File: public/assets/js/entry.injector.js
      functions/api/budgets.js

PART A — API validation:
In POST /api/budgets:
  Before creating, fetch existing budgets with same label:
    GET /api/budgets with filterByFormula: {label}="{newLabel}"
  If any exist with same label AND same category_id AND overlapping dates:
    Return 400: { error: "Budget label already exists for this item in this period" }
  Label uniqueness rule: same label + same category = never allowed regardless of dates
  Different category = allowed (e.g. two items both named "Monthly" is fine)

PART B — UI feedback:
  Show inline error below label field if API returns 400
  Do not clear the form on error — let user correct the label

═══════════════════════════════════════════════════════
FIX G6 — UI: Budget creation category dropdown = Expense only
═══════════════════════════════════════════════════════
File: public/assets/js/entry.injector.js

In the Create Budget form (renderBudgetCreateForm or equivalent):
  Category dropdown (id="budget-category"):
    Filter to show ONLY categories where type = 'Expense'
    Group by B-level group same as before
    Do not show Earn, Loan, Investment categories here

  Rename section header from "Create Budget" to "Add Budget Item"

═══════════════════════════════════════════════════════
FIX G7 — Dashboard: resolve category via budget_id
═══════════════════════════════════════════════════════
File: public/assets/js/dashboard.injector.js

CURRENT: dashboard resolves category from transaction.category_id directly
TARGET: for transactions with budget_id, resolve via budget

In loadAll():
  Budgets are already fetched. Build a lookup map:
    const budgetMap = {};
    budgets.forEach(b => { budgetMap[b.id] = b; });

In any place that does:
    const catId = linkedId(t.category_id)
Change to:
    const budgetId = linkedId(t.budget_id);
    const budget = budgetMap[budgetId];
    const catId = budget ? linkedId(budget.category_id) : linkedId(t.category_id);
    // ^ falls back to legacy category_id if no budget_id

This single change fixes T2 pareto, budget meters, alert chips —
all of which group by category. No other logic changes needed.

═══════════════════════════════════════════════════════
COMMIT INSTRUCTIONS
═══════════════════════════════════════════════════════
Commit after each fix group:
  "fix(G1): transactions API reads/writes budget_id"
  "fix(G2): budgets API returns category group and name"
  "fix(G3-G4): transaction dropdown uses budget list, display updated"
  "fix(G5-G6): budget creation unique label + expense-only category"
  "fix(G7): dashboard resolves category via budget_id"

Branch: main — commit directly.
Do NOT create a new branch. If created, merge to main before ending.

After all fixes:
1. Move this file to docs/prompts/ stamped ✅ COMPLETE
2. Update masterseed.md — note budget_id field is now source of truth
   for expense transactions, category_id is legacy read-only
3. Append new lessons to lessons_learned.md (after L024)
   Key lesson: Transaction links to Budget, not Category directly.
   Budget is the gate for all expense bookings.
4. Commit: "docs: update after fixG"

List all files changed at end of response.
