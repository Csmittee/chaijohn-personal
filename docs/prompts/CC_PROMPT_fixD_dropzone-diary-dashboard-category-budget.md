# ✅ COMPLETE — archived 2026-05-24

# CC_PROMPT_fixD — Dropzone Rethink + Diary AI Undo + Dashboard Forecast + Category Create + Budget Forecast Panel

Before writing any code, read fresh from repo:
- masterseed.md
- lessons_learned.md
- public/assets/js/diary.injector.js
- public/assets/js/dashboard.injector.js
- public/assets/js/entry.injector.js
- public/dashboard.html
- public/entry.html
- public/diary.html
- functions/api/dropzone.js
- functions/api/categories.js
- functions/api/budgets.js
- functions/api/transactions.js
- public/assets/css/global.css

Summarize what you understand about each file before proceeding.
This prompt contains 6 fix groups. Execute all of them.

═══════════════════════════════════════════════════════
FIX D1 — DROP ZONE: ACCEPT TEXT FILES + RETHINK ROUTING
═══════════════════════════════════════════════════════
Files: public/assets/js/dropzone.js + functions/api/dropzone.js

PROBLEM: Drop Zone currently errors on non-image files. It
should accept text content and route it intelligently.

ACCEPTED FILE TYPES (update the drop handler):
  Images:   image/* → existing vision OCR flow (unchanged)
  PDF:      application/pdf → existing flow (unchanged)
  Text/MD:  text/plain, text/markdown, .md, .txt →
            NEW: read file content as text, skip Cloudinary upload,
            send text directly to AI for classification
  No other types — show "File type not supported" for anything else

TEXT FILE FLOW (new):
  1. Read file content using FileReader.readAsText()
  2. POST /api/dropzone with:
       { text_content: "...", filename: "...", mime_type: "text/plain" }
     (no cloudinary_url for text files)
  3. Server sends text_content to Claude with this system prompt:
     "You are a personal diary assistant. The user dropped a text file.
      Classify it and extract structured data.
      Return JSON only:
      {
        suggested_type: one of [Diary, Quote, Transaction, Idea, Project],
        title: string (max 80 chars),
        content: string (full text, cleaned),
        tags: array of strings (max 5),
        entry_type: for Diary only — one of [Story, Idea, Blog, Project, Skill],
        author: for Quote only,
        amount: for Transaction only,
        entity: for Transaction only
      }"
  4. Show result card in Drop Zone panel same as image results
  5. Approve flow: routes to correct Airtable table based on suggested_type

UPDATE /api/dropzone.js:
  Accept text_content in POST body (alongside or instead of cloudinary_url)
  If text_content present: skip Cloudinary, send text to Claude directly
  Return same ai_result structure as image flow
  Store in Drop_Zone_Queue with mime_type='text/plain', cloudinary_url=null

Do NOT break existing image/PDF flow.

═══════════════════════════════════════════════════════
FIX D2 — DIARY AI ASSIST: UNDO BEFORE APPLY
═══════════════════════════════════════════════════════
File: public/assets/js/diary.injector.js + public/diary.html

PROBLEM: When AI assist rewrites the content, it replaces the
textarea immediately with no way to undo. If user closes without
saving, the original is lost.

FIX — Two-step apply with undo:

STEP 1: When AI returns a response, do NOT replace textarea yet.
  Show the AI result in a comparison panel below the textarea:
    ┌─────────────────────────────────────────────────┐
    │ ✨ AI Suggestion                         [✕ Dismiss] │
    │ ─────────────────────────────────────────────── │
    │ [AI response text shown here, scrollable, read-only] │
    │                                                 │
    │ [↩ Keep Original]  [✓ Apply & Replace]  [⊕ Append] │
    └─────────────────────────────────────────────────┘

STEP 2: User chooses:
  "Keep Original" → dismiss panel, textarea unchanged
  "Apply & Replace" → replace textarea content with AI text,
                      store previous content in memory variable
                      (previousContent), show small "↩ Undo" 
                      button near toolbar
  "Append" → add AI text at end of existing content with 
              a separator line "---"

UNDO button (shown only after Apply & Replace):
  Click → restores textarea to previousContent
  Disappears after user saves or creates new entry
  Only one level of undo needed

Do not change how AI assist is triggered or streamed.
Do not touch entry list, save logic, or blog section.

═══════════════════════════════════════════════════════
FIX D3 — DASHBOARD CASHFLOW: SLIDING TIME AXIS + FORECAST
═══════════════════════════════════════════════════════
File: public/assets/js/dashboard.injector.js + public/dashboard.html

PROBLEM: Time filters (1M/3M/6M/12M) only show past data,
right-aligned. No future visibility. No forecast.

FIX — Centered time window with right-side forecast:

TIME AXIS BEHAVIOR:
  The selected period (e.g. "1 month") = total window
  Split: left half = past, right half = future (forecast)
  Example for "1 Month" filter selected on May 24:
    X axis: May 10 → May 24 (past, 14 days) | May 24 → Jun 7 (future, 14 days)
  "Today" marker: vertical dashed line at center of chart

PAST BARS: actual transactions from Airtable (unchanged)

FUTURE FORECAST BARS (right side of today line):
  For each future day/period, calculate:

  FP-FV expenses (fixed period, fixed value):
    → Known recurring items: include at exact due date if known,
      else spread evenly across month
    → Source: Categories with expense_type = 'FP-FV' 
      that have a matching active Budget
    → Value = budget amount ÷ days in period

  FP-VV expenses (fixed period, variable value):
    → Use last 3 months average for that category
    → Spread remaining budget evenly across remaining days

  VP types + unplanned:
    → Use last 3 months daily average
    → Show as lighter opacity bar (estimated)

  Income forecast:
    → Use last 3 months average income per period
    → Show as lighter green

VISUAL DISTINCTION:
  Past bars: full opacity (current behavior)
  Future bars: 40% opacity with hatched pattern or dashed border
  Balance line: extends into future as dotted line
  "Forecast" label appears above future section

TOOLTIP on future bars:
  "Estimated — based on budget / 3-month average"

Do not break existing past data rendering.
Do not touch T2, T3, or other dashboard panels.

═══════════════════════════════════════════════════════
FIX D4 — DASHBOARD ALERT BUBBLES: SMARTER CONTENT
═══════════════════════════════════════════════════════
File: public/assets/js/dashboard.injector.js

PROBLEM: Alert chips show everything red. Need priority logic.

ALERT TYPES AND RULES:

RED alerts (critical):
  - Any budget category over 100% spent this month
    Label: "⚠ [name] over budget (X%)"
  - Any liability with current_balance > 0 AND monthly_payment > 0
    AND no payment recorded this month
    Label: "💳 [name] payment due ฿X"

AMBER alerts (watch):
  - Any budget category 80–100% spent this month
    Label: "〜 [name] at X% of budget"

BLUE chips (info, not alerts):
  - Total liability balance summary
    Label: "🏦 Total debt ฿X across N loans"

DISPLAY RULES:
  Red first, then amber, then blue
  Max 6 chips visible — if more, show "+N more" chip that expands
  Each chip is dismissible for current session (reappears on reload)
  No chip for liabilities that have current_balance = 0

Do not touch chart code.

═══════════════════════════════════════════════════════
FIX D5 — ENTRY: CATEGORY CREATE + EXPENSE TYPE
═══════════════════════════════════════════════════════
Files: public/entry.html + public/assets/js/entry.injector.js +
       functions/api/categories.js

PROBLEM: User can only create budgets tied to existing categories.
Cannot create new categories or sub-categories from entry page.
Cannot set expense_type when creating.

FIX — Add "Create New Category" section to the Budget tab
(place it above the Create Budget form):

CREATE NEW CATEGORY FORM:
  Title: "New Category"
  Fields:
    Name (text input, required)
    Group (select — same groups as seeded: Basic Living / Car / 
           Family / Personal / Basic IT / Bus IT / Business / 
           Per-earn / Bus-earn / Investment / Other)
    Type (select: Expense / Earn / Investment / Loan)
    Expense Type (select, shown only when Type=Expense):
      FP-FV — Fixed period, fixed value (e.g. subscriptions)
      FP-VV — Fixed period, variable value (e.g. food)
      VP-FV — Variable period, fixed value
      VP-VV — Variable period, variable value
      Surprise — Unexpected, no pattern
    Cash Flow (auto-set: Expense/Investment/Loan → Cash Out,
               Earn → Cash In — not shown to user)
    Is Business (checkbox)
    Active (checkbox, default checked)
  
  Save button → POST /api/categories → show success → 
                refresh category dropdown in Budget create form

Add tooltip on Expense Type labels:
  FP-FV: "Repeats every period, same amount (e.g. Netflix, AIS)"
  FP-VV: "Repeats every period, amount varies (e.g. food, fuel)"
  VP-FV: "Irregular timing, fixed amount when it occurs"
  VP-VV: "Irregular timing, amount varies (e.g. travel)"
  Surprise: "Cannot plan for it (e.g. medical, emergency)"

Add POST handler to /api/categories.js if not already present:
  Accept: {name, group, type, expense_type, cash_flow, 
           is_business, active}
  Create Airtable Categories record
  Return created record

═══════════════════════════════════════════════════════
FIX D6 — ENTRY: ONE-TIME BUDGET + DASHBOARD BUDGET PANEL
═══════════════════════════════════════════════════════
Files: public/entry.html + public/assets/js/entry.injector.js +
       public/dashboard.html + public/assets/js/dashboard.injector.js +
       functions/api/budgets.js

PART A — ONE-TIME BUDGET VISIBILITY RULE:

In Create Budget form, when Period = "One-time":
  Show: Start Date (required) + End Date (required)
  Show info note: 
    "One-time budget only appears in Entry and Dashboard 
     during its active date range. Visible in search always."

In Active Budgets list (entry page):
  One-time budgets with end_date in the past: hide from default list
  Add toggle: [Active] [All incl. past] — default Active
  In Active view: only show one-time budgets where today is 
    between start_date and end_date

In Budget fetch (/api/budgets.js GET):
  Add query param: ?period=one-time&active_only=true
  Filter: start_date <= today <= end_date for one-time budgets
  Regular budgets: show if active=true regardless of dates

PART B — DASHBOARD BUDGET COMPARISON PANEL (new panel):

Add a 4th horizontal panel to the dashboard top section,
after T3 (Liabilities). Collapsible — default collapsed.
Toggle button: "📊 Budget vs Actual" — clicking slides panel open,
same horizontal height as other panels.

Panel title: "Budget vs Actual"
Time selector: [This Month] [3 Months] [6 Months] [12 Months]

Chart type: Combo — bars + line
  Bars (grouped per period):
    Blue bar = Budget amount for that period
    Green/Red bar = Actual spend for that period
      Green if actual < budget, Red if over
  Line:
    Orange line = Running budget total (cumulative)
    Purple line = Running actual total (cumulative)

X axis: months (Jan, Feb, Mar... or rolling periods)
Y axis: ฿ amount

One-time budgets:
  Appear only in their active month's bar
  Do not contribute to other months

Below chart: summary row
  "Total budgeted: ฿X | Total spent: ฿Y | 
   Variance: ฿Z (N% under/over)"

Do not change T1, T2, T3 panels.
Do not break existing budget list logic from Fix 21/22.

═══════════════════════════════════════════════════════
COMMIT INSTRUCTIONS
═══════════════════════════════════════════════════════
Push to main branch (workflow now uses main, not CC branch).
Use descriptive commit message:
  "fix(D1-D6): dropzone text files, diary AI undo, dashboard 
   forecast + alerts, category create, budget one-time + panel"

After committing:
1. Move this file to docs/prompts/ stamped ✅ COMPLETE
2. Update masterseed.md — mark Fix D complete, update file inventory
3. Append new lessons to lessons_learned.md with next L-numbers
4. Commit docs separately: "docs: update after fixD"

List all files changed at the end of your response.
