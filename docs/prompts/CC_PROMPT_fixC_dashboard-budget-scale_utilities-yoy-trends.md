✅ COMPLETE — 2026-05-24 — Fix 14 (budget meter proportional scale + group view), Fix 15-17 (Utilities YoY charts, FT note field, import script v2). Executed on feature branch claude/adoring-goodall-oCcbS, merged to main 2026-05-24.

Before writing any code, read these files:
/docs/LESSONS.md, /docs/DECISIONS.md, /docs/PROGRESS.md
Summarize what you understand before proceeding.

SCOPE FOR THIS SESSION: Fix 14, Fix 15, Fix 16, Fix 17.

─────────────────────────────────────────────
FIX 14 — DASHBOARD: BUDGET METER SCALE + GROUP VIEW
─────────────────────────────────────────────
Files: dashboard.html + dashboard.injector.js

Current budget meters are uniform-width bars. Replace with 
proportional scale + group view toggle.

PROPORTIONAL SCALE:
  Find the largest budget amount in the list = reference (100% width)
  Each budget bar container width = 
    (this_budget_amount / max_budget_amount) × 100%
  The spent fill inside = (spent / budget_amount) × 100% of bar width
  This means a ฿50,000 budget bar is physically wider than ฿900 bar
  Show ฿ amount label at end of each bar
  Effect: visually shows relative impact like a stock treemap

GROUP VIEW TOGGLE:
  Add toggle above meters: "All budgets" | "By category group"
  Default: "All budgets"

  Groups: Family | Basic Living | Car | Personal | 
          Basic IT | Bus IT | Business | Investment

  In group view: one row per group showing:
    Group name | total ฿ budgeted | total ฿ spent | 
    group-level progress bar | group % used
  Color rules same as individual: green/amber/red
  Click group row → expands to show individual budgets inside
  Individual budgets inside use same proportional scale

Do not touch T1, T2, T3 charts, Risk Simulator, 
Solution Playroom, Alert chips.

─────────────────────────────────────────────
FIX 15 — UTILITIES: YEAR-OVER-YEAR TREND CHARTS
─────────────────────────────────────────────
Files: entry.html + entry.injector.js

Add four Chart.js line charts below the existing 12-month table.
Fetch all Utilities records (not just last 12 months) for chart data.

Chart A — Electricity units used:
  X axis: Jan → Dec (always fixed 12 months)
  One line per year in the data (e.g. 2023, 2024, 2025, 2026)
  Each year = distinct color from this palette:
    2023=#6366f1, 2024=#22c55e, 2025=#f59e0b, 2026=#3b82f6
  Points: monthly values. Missing months = gap in line (no zero fill)
  
Year range slider below charts:
  Range input: min = earliest year in data, max = current year
  Two handles (from/to year) — shows/hides year lines accordingly
  Label: "Showing YYYY – YYYY"

Chart B — Electricity charge ฿: same structure as A
Chart C — Water units used: same structure as A  
Chart D — Water charge ฿: same structure as A

Layout:
  Desktop: Chart A + Chart B side by side (50% each)
           Chart C + Chart D side by side below
  Mobile: all four stacked vertically

─────────────────────────────────────────────
FIX 16 — UTILITIES: FT NOTE FIELD
─────────────────────────────────────────────
Files: entry.html + entry.injector.js + 
       functions/api/utilities.js

Add ft_note field to Airtable Utilities table:
  Call Airtable field-create API to add field if not present:
    name: "ft_note", type: "multilineText"
  Do this inside a try/catch — skip silently if field exists.
  Add this check to the utilities GET handler on first call.

Add to the monthly utilities form:
  Label: "FT Note (factor / technical)"
  Element: textarea, 2 rows
  Placeholder: "e.g. Rate changed 3.50→4.20 baht/unit, 
  meter replaced, estimated reading"
  Positioned below the Water section, above Save button

Update /api/utilities.js:
  Include ft_note in both GET (read) and POST/PATCH (write)

In the 12-month history table:
  Add column "FT" (last column)
  If ft_note exists for that month: show 📝 icon
  Click/tap icon → shows note in a small tooltip or 
  inline expand below the row
  If no note: empty cell

─────────────────────────────────────────────
FIX 17 — UTILITIES IMPORT SCRIPT
─────────────────────────────────────────────
Create new file: /scripts/import-utilities-v2.js

This is a standalone Node.js script. It does NOT run on 
Cloudflare — it runs locally once to import historical data.

Dependencies: xlsx, dotenv (add to package.json devDependencies)

Script logic:
  1. Load .env from project root: AIRTABLE_API_KEY, 
     AIRTABLE_BASE_ID
  2. Read file: My_house_Expense_control_tracking_x_8_24.xlsx
     using xlsx package
  3. Find electricity data:
     Look for sheet named "Electric" or first sheet with 
     columns containing "unit" and "charge" keywords
  4. Find water data:
     Look for sheet named "Water" or sheet with water columns
  5. Parse each row:
     Extract: year, month (1-12), units, charge
     Build date: YYYY-MM-01 format
  6. Fetch existing Utilities records from Airtable
     Build a map: {YYYY-MM → record_id}
  7. For each parsed row:
     If month exists in map → PATCH that record (update)
     If not → collect for batch create
  8. Batch create new records (10 per POST, Airtable limit)
  9. Print summary:
     "Created: X | Updated: Y | Skipped (empty): Z"

At bottom of file, add comment block:
  // HOW TO RUN:
  // 1. npm install xlsx dotenv
  // 2. Create .env file in project root with:
  //    AIRTABLE_API_KEY=your_key_here
  //    AIRTABLE_BASE_ID=apphBGWfSPL45oSFd
  // 3. Place Excel file in project root, same name as above
  // 4. node scripts/import-utilities-v2.js

Do not touch: dashboard files, diary, collection,
ai-advisor, schema.js, auth files, Drop Zone,
any entry page logic outside utilities section.

Push to branch: claude/build-chaijohn-dashboard-6LTTy
List all files changed at the end.