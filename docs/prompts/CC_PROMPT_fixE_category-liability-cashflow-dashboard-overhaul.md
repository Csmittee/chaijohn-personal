✅ COMPLETE — 2026-05-24 — E1 category hierarchy + free-text group via Airtable Meta API, E2 entity autocomplete (datalist), E3 liability cashflow direction fixed (loan=Income, payment=Expense), E4 cashflow KV sync point, E5 in-vs-out view toggle, E6 period-aware budget meters + filter, E7 4-panel top-row layout with collapsible panels. All committed directly to main.

✅ STATUS: READY FOR CC EXECUTION

# CC_PROMPT_fixE — Category Hierarchy + Liability Cashflow Logic + Dashboard Overhaul + Cashflow Sync

New session. Ignore all previous context from other projects.
You are working on Chaijohn Personal Diary (CPD) at:
https://github.com/Csmittee/chaijohn-personal
Branch: main — commit directly to main, do NOT create a new branch.
If you must create a branch, merge it back to main before ending the session.

Before writing any code, read fresh from repo:
- masterseed.md
- lessons_learned.md
- functions/api/setup/schema.js
- functions/api/categories.js
- functions/api/transactions.js
- functions/api/debts.js
- public/assets/js/entry.injector.js
- public/assets/js/dashboard.injector.js
- public/entry.html
- public/dashboard.html
- public/assets/css/global.css

Summarize what you understand about each file before proceeding.
Execute all fix groups below IN ORDER. Commit after each group.

═══════════════════════════════════════════════════════
CRITICAL CONTEXT — READ BEFORE ANYTHING
═══════════════════════════════════════════════════════

PROBLEM DISCOVERED: The `group` field in the Categories Airtable table
is a singleSelect with FIXED choices seeded at schema creation time.
Airtable returns error 422 INVALID_MULTIPLE_CHOICE_OPTIONS when trying
to create a record with a group value not in the predefined choices list.

This means the current "Create Category" form is fundamentally broken —
users cannot create a category with a new group name.

CLARIFICATION ON HIERARCHY (owner's definition):
  Category = the GROUP label (Family, Car, Personal, Basic IT...)
             This is what the user calls a "category" in real life
  Sub-item  = the specific expense name under it (Coffee, Fuel, My AIS)
             This is what's stored as `name` in the Categories table

The current schema has this backwards in terms of UX labeling.
Do NOT rename Airtable fields — fix the UI labels and the create flow.

═══════════════════════════════════════════════════════
FIX E1 — CATEGORY CREATE: CORRECT HIERARCHY + FREE-TEXT GROUP
═══════════════════════════════════════════════════════
Files: public/entry.html + public/assets/js/entry.injector.js +
       functions/api/categories.js

PROBLEM: "Group" field is a singleSelect in Airtable — sending a new
value like "test" causes error 422. Also the form labels are confusing.

FIX — Two-part solution:

PART A — Fix the API to use Airtable field-update to add new group options:

In /api/categories.js POST handler:
  Before creating the record, check if `group` value already exists
  in Categories records. If not — call Airtable Meta API to add it
  as a new singleSelect choice:

  PATCH https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables/{CATEGORIES_TABLE_ID}/fields/{GROUP_FIELD_ID}
  Body: { options: { choices: [...existing_choices, { name: newGroupName }] } }

  Get field ID: fetch GET https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables
  Find Categories table → find `group` field → get its id
  Cache this in-memory for the request.
  After adding the choice, proceed with creating the category record.

  CATEGORIES_TABLE_ID and GROUP_FIELD_ID must be fetched from Airtable
  Meta API — do not hardcode them. Fetch once per request.

PART B — Fix the UI labels to match owner's mental model:

Rename form fields visually (do NOT change Airtable field names):
  "Name" field → label: "Expense / Income Item Name"
    Placeholder: "e.g. Dog food, My gym, Grab taxi"
  "Group" field → label: "Category (group it belongs to)"
    Placeholder: "e.g. Family, Personal, Car — type existing or new"
  Show hint text below group input:
    "Existing: Basic Living · Car · Personal · Basic IT · Bus IT · 
     Family · Business · Investment · Per-earn · Bus-earn"
  "Type" field → label: "Flow Type"
    Options: Expense / Earn / Investment / Loan
  Show "Expense Type" field only when Flow Type = Expense:
    FP-FV · FP-VV · VP-FV · VP-VV · Surprise
    Each option shows tooltip on hover (same as Fix D5 spec)

Change "Group (optional)" → remove "(optional)" — both fields required.

PART C — Fix the Transaction data entry dropdown:
  Current dropdown shows sub-items grouped by category (this is correct)
  No change needed to the dropdown structure
  Only ensure newly created categories appear after refresh

═══════════════════════════════════════════════════════
FIX E2 — ENTITY AUTOCOMPLETE ON TRANSACTION ENTRY
═══════════════════════════════════════════════════════
Files: public/entry.html + public/assets/js/entry.injector.js

The "Entity / Person / Platform" field currently is a plain text input.
Add autocomplete from past transaction entities.

On entry page load: fetch GET /api/transactions?limit=500
Extract all unique `entity` values from records (skip empty)
Sort by frequency (most used first)

Add HTML5 datalist to the entity input:
  <input list="entity-suggestions" id="entity" ...>
  <datalist id="entity-suggestions">
    <option value="Seven Eleven">
    <option value="Lotus">
    ...
  </datalist>

Refresh the datalist after each new transaction is saved.
Do not change any other part of the transaction form.

═══════════════════════════════════════════════════════
FIX E3 — LIABILITY CASHFLOW LOGIC (CRITICAL BUG)
═══════════════════════════════════════════════════════
Files: functions/api/debts.js + public/assets/js/entry.injector.js

CURRENT WRONG BEHAVIOR:
  Creating a new liability immediately creates a negative transaction
  (cash out). This is wrong — receiving a loan is Cash IN.
  Paying back a loan is Cash OUT.

CORRECT LOGIC:

  CREATE NEW LIABILITY (new debt/loan received):
    → Record in Liabilities table only (already done correctly)
    → ALSO create a Transaction record:
        date: today
        type: Income  ← Cash IN (money received)
        amount: loan_size
        category_id: find category named "Loan" or type="Loan" in Categories
        entity: creditor name
        description: "Loan received — [liability name]"
        source: "LiabilityPayment"
    → This correctly shows as green (cash in) on cashflow

  LOG A PAYMENT (paying back the loan):
    → Reduce current_balance in Liabilities (already done)
    → ALSO create a Transaction record:
        date: payment date
        type: Expense  ← Cash OUT (money leaving)
        amount: payment amount
        category_id: find category named "Loan" or type="Loan" in Categories
        entity: creditor name
        description: "Loan payment — [liability name]"
        source: "LiabilityPayment"
    → This correctly shows as red (cash out) on cashflow

HOW TO FIND THE LOAN CATEGORY:
  GET /api/categories?type=Loan → take first result's id
  If none found: create a transaction without category_id (use null)

Also DELETE the duplicate "Loan payment — Friend and Family" test records
that the owner created while testing. Find all Transactions where:
  entity = "Friend and Family" AND note contains "Test and must delete"
  Delete those records from Airtable.

═══════════════════════════════════════════════════════
FIX E4 — DASHBOARD: CASHFLOW BALANCE SYNC POINT
═══════════════════════════════════════════════════════
Files: public/dashboard.html + public/assets/js/dashboard.injector.js +
       functions/api/ (new endpoint needed)

Owner needs to manually sync their real bank balance to the dashboard
so the cashflow calculation anchors to truth, not just transaction history.

NEW AIRTABLE FIELD (add via Airtable Meta API, do not touch schema.js):
  Table: AI_Chats (repurpose — actually create a new lightweight approach)
  Better: use Cloudflare KV to store the sync point (simpler, no new table)
  Key: "cashflow_sync" 
  Value JSON: { amount: 126672, date: "2026-05-24", note: "Manual sync" }

NEW API ENDPOINT: functions/api/cashflow-sync.js
  GET → return current sync point from KV
  POST → save { amount, date, note } to KV key "cashflow_sync"

DASHBOARD UI — add "Sync Balance" button near T1 chart:
  Small button: "⚡ Sync Balance" — opens a small inline panel below button:
    Input: "Current bank balance ฿" (number)
    Input: "As of date" (date, default today)  
    Input: "Note (optional)" — why syncing, what changed
    Button: "Set as Starting Point"
    → POST /api/cashflow-sync → close panel → refresh T1 chart

T1 CHART CHANGE — use sync point as Y-axis starting value:
  If sync point exists:
    Starting balance = sync point amount
    Calculate running balance from sync date using transactions
    Balance line begins at sync point value on sync date
    Show "📍 Synced [date]" label on the chart at that point
  If no sync point: behavior unchanged (starts at 0)

Show last sync info below button:
  "Last sync: ฿126,672 on 24 May 2026 — [note]"

═══════════════════════════════════════════════════════
FIX E5 — DASHBOARD T1: CASHFLOW VIEW MODES
═══════════════════════════════════════════════════════
Files: public/assets/js/dashboard.injector.js + public/dashboard.html

Add view toggle above T1 chart (small, right-aligned):
  [📈 Net Flow]  [📊 In vs Out]
  Default: Net Flow (current behavior)

NET FLOW VIEW (current):
  Income bars (green, up) + Expense bars (red, down) + Balance line
  Y axis: positive above zero line, negative below
  No change to current rendering

IN vs OUT VIEW (new):
  Side-by-side bars per period: Income bar LEFT (green) | Expense bar RIGHT (red)
  Both bars go UP (positive Y only)
  No balance line in this view
  Easier to compare scale of income vs spending visually
  Y axis: 0 at bottom, max = highest of income or expense

Both views respect the time filter (1M / 3M / 6M / 12M).
Both views respect the forecast logic from Fix D3.

═══════════════════════════════════════════════════════
FIX E6 — DASHBOARD BUDGET METERS: PERIOD-AWARE DISPLAY
═══════════════════════════════════════════════════════
Files: public/assets/js/dashboard.injector.js

PROBLEM: Annual budgets show full ฿300,000 in a "Current Month" view,
making small monthly items look negligible by comparison.
Travel activities ฿300k annual budget showing 0% in May is noise.

FIX — Period normalization for monthly view:

Header now reads: "Budget Meters — Current Month" (unchanged)

For each budget in the meters list:
  If period = "Monthly": use amount as-is
  If period = "Annual": use amount ÷ 12 (monthly equivalent)
  If period = "3x-year": use amount ÷ 3 (per-occurrence view)
  If period = "One-time": only show if today is between start_date and end_date
                          use full amount (it's a specific commitment)
  If period = "Open-end": use amount as-is

Show period badge next to budget name:
  "Monthly" → no badge (default)
  "Annual ÷12" → small gray badge "Annual"
  "3x-year" → small gray badge "3x/yr"
  "One-time" → small amber badge "One-time"

Add filter toggle above meters:
  [All] [Monthly] [Annual] [One-time]
  Default: All
  When "Monthly" selected: show only period=Monthly budgets
  When "Annual" selected: show all non-monthly budgets (annual, 3x-year)
  When "One-time" selected: show only active one-time budgets

The By Group toggle from Fix 14 remains — works alongside period filter.

═══════════════════════════════════════════════════════
FIX E7 — DASHBOARD T1-T4 PANEL LAYOUT
═══════════════════════════════════════════════════════
Files: public/dashboard.html + public/assets/js/dashboard.injector.js +
       public/assets/css/global.css

CURRENT: T1, T2, T3 are in a top row. T4 (budget vs actual) renders
below the Budget Meters section — too far down, disconnected.

TARGET LAYOUT:
  Top panel row: T1 (cashflow) | T2 (pareto) | T3 (liabilities) | T4 (budget)
  All four panels same height, horizontally scrollable on mobile
  T1 takes slightly more width than T2/T3/T4 (ratio: 2:1:1:1)

  Desktop (>1200px): all four side by side, T1 wider
  Tablet (768-1200px): T1 full width top, T2+T3 side by side, T4 below T2+T3
  Mobile: stack vertically, each full width

Each panel has a chevron ▼ to collapse — when collapsed shows only title bar
This lets owner collapse T2/T3/T4 if only wanting to see cashflow.

T4 panel behavior when clicked (clickable title):
  Expands to show full Budget vs Actual chart inline
  (same chart from Fix D6 — bring it here instead of bottom of page)
  Remove T4 from bottom of page after moving it here

Do not change T1 cashflow chart behavior.
Do not change T2 pareto chart behavior.
Do not change T3 liabilities chart behavior.

═══════════════════════════════════════════════════════
COMMIT INSTRUCTIONS
═══════════════════════════════════════════════════════
Commit after each fix group with message:
  "fix(E1): category hierarchy + free-text group via Meta API"
  "fix(E2): entity autocomplete on transaction form"
  "fix(E3): liability cashflow logic — loan in = cash in, payment = cash out"
  "fix(E4): cashflow balance sync point via KV"
  "fix(E5): cashflow in-vs-out view toggle"
  "fix(E6): budget meters period-aware display + filter"
  "fix(E7): T1-T4 panel layout with T4 in top row"

Branch: main — commit directly. Do NOT create new branch.
If branch was created, merge to main before ending session.

After ALL fixes committed:
1. Move this file to docs/prompts/ stamped ✅ COMPLETE — [date]
2. Update masterseed.md — mark Fix E complete, update current state
3. Append new lessons to lessons_learned.md with next L-numbers
4. Commit: "docs: update masterseed and lessons_learned after fixE"

List all files created or changed at end of response.
