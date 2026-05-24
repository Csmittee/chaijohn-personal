# ✅ COMPLETE — archived 2026-05-24

Before writing any code, read these files:
/docs/LESSONS.md, /docs/DECISIONS.md, /docs/PROGRESS.md
Summarize what you understand before proceeding.

SCOPE FOR THIS SESSION: Fix 19 and Fix 22 only.
Do not touch any other file.

─────────────────────────────────────────────
FIX 19 — LIABILITIES: EXPANDABLE ROW WITH 
          EDIT + BALANCE BAR + PAYMENT HISTORY
─────────────────────────────────────────────
Files: entry.html + entry.injector.js + 
       functions/api/debts.js +
       functions/api/debts/[id]/history.js (new file)

In the active debts summary table, each row is currently 
display-only. Make each row clickable to expand an inline 
detail panel below it containing three sections:

SECTION A — EDIT FIELDS:
  All Debts fields as editable inputs, pre-filled:
    Creditor name, Creditor type (select),
    Original amount ฿, Current balance ฿,
    Interest rate %, Monthly payment ฿,
    Due date, Notes
  Save button → PATCH /api/debts/{id} → collapse → 
                refresh table row values
  Only one row expanded at a time.

SECTION B — BALANCE COMPARISON BAR:
  Two stacked horizontal bars:
    Row 1: "Original loan"  [████████████████████] ฿X
    Row 2: "Current balance"[████████░░░░░░░░░░░░] ฿Y
  Bar widths: original = 100% reference width.
              current = (current_balance / original_amount) × 100%
  Colors: original bar = gray (#64748b)
          current bar = blue (var(--color-primary))
          empty portion = transparent with dashed border
  Below bars: "฿Z paid back (N%)" in green text
  If current_balance = 0: show "✅ Fully paid" instead

SECTION C — PAYMENT HISTORY:
  Fetch GET /api/debts/{id}/history
  Display list: date | ฿amount paid | note
  Sorted newest first, show last 10
  If more than 10: "Show all X payments" link expands the rest
  If no history: "No payments recorded yet"

Create new endpoint: functions/api/debts/[id]/history.js
  Method: GET
  Query Transactions table in Airtable where:
    entity field = this debt's creditor_name
    type = Expense
  Sort by date descending
  Return array of {date, amount, note}

─────────────────────────────────────────────
FIX 22 — BUDGETS: GROUP VIEW + CARD/ROW TOGGLE
─────────────────────────────────────────────
Files: entry.html + entry.injector.js

Above the Active Budgets list add a control bar 
(two toggle groups, inline, right-aligned):

Left toggle — View mode:
  [≡ Row] [⊞ Card]
  Default: Row (current list behavior)

Right toggle — Group by:
  [All] [By Category]
  Default: All

─── ROW VIEW (default, current behavior) ───
No change to existing row layout.
Edit pencil from Fix 21 remains.

─── CARD VIEW ───
Grid: 2 columns desktop, 1 column mobile
Each card:
  Top right: ✏️ edit button (same Fix 21 logic)
  Budget name (bold)
  Category badge + Period badge (small, colored)
  Large progress bar (full card width)
    Green if under 80%, amber 80-100%, red over 100%
  ฿X spent / ฿Y budget
  % used (large number, right-aligned)

─── GROUP BY CATEGORY ───
Works in both Row and Card view modes.

Category groups:
  Car | Family | Basic IT | Bus IT | Personal | 
  Business | Investment | Other

Each group renders as:
  Header row (clickable to collapse/expand):
    Group name | X budgets | 
    Total ฿ budgeted | Total ฿ spent | Group % bar
  Chevron ▼/▲ on right
  Budgets inside the group in current view mode (row or card)

"Collapse all" / "Expand all" text links 
in the control bar, far right.

Default: all groups expanded.

Category → group mapping logic:
  Read category name from the linked Categories record.
  Match by keyword:
    Car → Car
    Family/Child/School → Family  
    AIS/fiber/internet/Basic IT → Basic IT
    Anthropic/Claude/Bus IT/business IT → Bus IT
    Personal/Coffee/Cigarette/Food → Personal
    Business/Investment → Business or Investment
    anything else → Other

Do not touch: dashboard files, diary, collection,
ai-advisor, schema.js, auth files, Drop Zone,
liabilities form logic from Fix 18/19.

Push to branch: claude/build-chaijohn-dashboard-6LTTy
List all files changed at the end.