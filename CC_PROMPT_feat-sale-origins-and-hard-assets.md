# CC_PROMPT_feat-sale-origins-and-hard-assets.md
> P2 — Sale origins architecture + M3.3 Hard Assets + UX polish
> Branch: feat/p2-sale-origins-hard-assets
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L090 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_feat-sale-origins-and-hard-assets.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/entry.injector.js` — full file, understand EARN/EXPENSE tabs + category logic
3. `public/assets/js/collection.injector.js` — Sell modal + transaction POST
4. `public/assets/js/project-finance.injector.js` — expanded view layout + presale section
5. `public/assets/js/projects.injector.js` — focus view task/resource rendering + lane view
6. `public/index.html` — find #panel-hard-assets and any existing Hard Assets wiring
7. `functions/api/transactions.js` — POST handler, all accepted fields
8. `functions/api/assets.js` — Assets table schema (for Hard Assets model reference)
9. `functions/api/categories.js` — category list shape

Read all 9 before writing a single line.

---

## CONFIRMED FACTS

- Entry drawer EARN tab currently has: Bus-earn categories (Pilates I-Flex, Ploikong sale,
  Pre-sale, Satu Sale) + Per-earn categories (Collection sale, Old stocks sale, Stock earn)
- Collection Sell now correctly sets source='collection' + category_id ✅
- M2.4 presale section shows empty state "No presales yet" ✅ — correct, no presales created
- 2 Active projects: Ploikong (฿1M/mo, ฿30,000 resources) + Satu 1.0 (฿300k/mo, ฿80,000 resources)
- Hard Assets panel: `#panel-hard-assets` — check index.html for existing wiring
- Assets table exists in Airtable (used by Collection) — Hard Assets needs separate table or type filter

---

## PART A — Entry drawer: Expense only (remove EARN tab)

**File:** `public/assets/js/entry.injector.js`

**Owner decision:** All income has a specific origin point. Entry drawer should only handle Expenses.
EARN tab creates ambiguous manual income that bypasses proper sale tracking.

**Fix:**
1. Remove the EARN / EXPENSE toggle buttons from the entry drawer UI
2. Default the drawer to Expense mode always
3. Remove all EARN-specific rendering (income source dropdown, category_id for earn, presale project row)
4. Keep: amount, description, entity, date, note, budget dropdown (expense categories only)
5. Keep: the presale project row logic is now handled in M2.4 directly (Part C)

**Do NOT remove** the Pre-sale category from Airtable — it's still used by M2.4 presale flow.

---

## PART B — M3.2 Collection Sell: enforce sale origin + show in M2.2

Already fixed in batch3 (source='collection' + category_id). ✅
No changes needed here.

---

## PART C — M2.4 Presale creation form inside Projects lane

**File:** `public/assets/js/project-finance.injector.js`

Currently the Presale Records section shows empty state:
"No presales yet — use Entry → EARN → Pre-sale to record one"

Since we're removing EARN from Entry drawer (Part A), presale entry must move here.

**Replace the empty state with a mini inline form:**

```
PRESALE RECORDS
[+ Add presale]  ← button that expands inline form

Inline form (on click):
  Amount (฿): [input]
  Date: [date input, default today]
  Customer / Entity: [text input]
  Note (optional): [text input]
  [Save presale]  [Cancel]
```

On Save:
POST `/api/transactions` with:
```javascript
{
  type: 'Income',
  source: 'presale',
  project_id: projectId,  // the expanded project's ID
  category_id: [presaleCategoryId],  // look up 'Pre-sale' category at init
  amount: Number(amount),
  date: date,
  entity: customer,
  note: note,
  description: `Pre-sale — ${projectName}`
}
```

After save: reload presale records for this project, re-render section.
On success: show green "Saved!" message, collapse form.

Fetch presale category ID at init: GET `/api/categories`, find name='Pre-sale'.
Cache in module scope. If not found: create it via POST `/api/categories` with
`{ name: 'Pre-sale', group: 'Bus-earn', type: 'Earn', active: true }`.

---

## PART D — Angel / Cash In: one-time cashflow entry

**File:** `public/assets/js/entry.injector.js`

Angel cash in = a one-time real cash event (investor, personal injection, windfall).
It impacts Cashflow only — not Sales, not a recurring category.

**Add a new tab to the Entry drawer:** `Cash In`
(alongside Transactions, Utilities, Liabilities, Budgets)

**Cash In tab form:**
```
Amount (฿): [input]
Date: [date input, default today]
Source / From: [text — e.g. "Personal savings", "K.Nok investment"]
Note (optional): [text]
[Save Cash In]
```

On Save:
POST `/api/transactions` with:
```javascript
{
  type: 'Income',
  source: 'cash_in',
  amount: Number(amount),
  date: date,
  entity: source,
  note: note,
  description: 'Cash injection'
}
```

This appears in M2.1 Cashflow as a positive income event (all Transactions appear there).
It does NOT appear in M2.2 Sales (sales.js filters by source — cash_in is excluded).

---

## PART E — M3.3 Hard Assets: new module

**Panel:** `#panel-hard-assets` (route: `hard-assets`) — check index.html for existing div

Hard Assets = physical property, vehicles, valuable equipment the owner owns.
NOT the same as Collection (knives, vices, plants, dolls).
Hard Assets = property, vehicles, machinery, land, major equipment.

### New Airtable table: HardAssets

Check if it already exists. If not, create via Meta API:
```javascript
{
  name: 'HardAssets',
  fields: [
    { name: 'name', type: 'singleLineText' },          // primary — asset name
    { name: 'category', type: 'singleLineText' },       // Property / Vehicle / Equipment / Other
    { name: 'purchase_date', type: 'date' },
    { name: 'purchase_price', type: 'number' },
    { name: 'current_value', type: 'number' },
    { name: 'location', type: 'singleLineText' },
    { name: 'notes', type: 'multilineText' },
    { name: 'status', type: 'singleLineText' },         // Active / Sold / Disposed
    { name: 'sold_price', type: 'number' },
    { name: 'sold_date', type: 'date' },
    { name: 'image_url', type: 'singleLineText' }
  ]
}
```

### New API: `functions/api/hard-assets.js`

GET: list all HardAssets, sorted by current_value desc
POST: create new asset record
Response shape: `{ records: [] }` with flattened fields (L082)

### New API: `functions/api/hard-assets/[id].js`

GET: single asset detail
PATCH: update asset (including mark sold)
DELETE: soft delete (status → Disposed)

### New injector: `public/assets/js/hard-assets.injector.js`

Panel anatomy:
```
┌─────────────────────────────────────────┐
│ SUMMARY STRIP (sticky)                  │
│ Total assets · Total value · Sold value │
├─────────────────────────────────────────┤
│ [+ Add Asset]  [Filter: All/Property/   │
│                Vehicle/Equipment]       │
├─────────────────────────────────────────┤
│ ASSET CARDS (scrollable)                │
│ ┌──────────────────────────────────┐    │
│ │ [category badge]  [status badge] │    │
│ │ Asset name                       │    │
│ │ Purchase: ฿XXX · Value: ฿XXX     │    │
│ │ +XX% vs cost                     │    │
│ │ Location: Rayong                 │    │
│ │ [Edit]  [Mark Sold]              │    │
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

Mark Sold modal (same pattern as Collection):
```
Sold Price (฿): [input]
Sold Date: [date]
Sold To / Via: [text]
[Confirm Sale]
```

On Confirm Sale:
1. PATCH `/api/hard-assets/:id` with `{ status: 'Sold', sold_price, sold_date }`
2. POST `/api/transactions` with:
   ```javascript
   {
     type: 'Income',
     source: 'hard_asset_sale',
     amount: sold_price,
     date: sold_date,
     entity: sold_to,
     description: `Hard asset sale — ${assetName}`,
     category_id: [hardAssetSaleCategoryId]
   }
   ```
3. Look up or create 'Hard asset sale' category (Per-earn group) at init

Add Asset drawer: simple form matching the table fields above.

### Wire in index.html

Add `<script src="/assets/js/hard-assets.injector.js"></script>` before closing `</body>`.
Confirm `#panel-hard-assets` div exists — if not, add it following the same panel pattern.

---

## PART F — UX Polish (M3.4)

**File:** `public/assets/js/projects.injector.js`

### F1 — Focus view task layout (full-width list)

Current: tasks render in a narrow card column with huge empty space to the right.
Fix: render tasks as full-width rows, one per line:

```
[phase color bar] Task title          finish_by    who    status dropdown
[phase color bar] Task title          finish_by    who    status dropdown
```

Each row: `display:flex`, width 100%, columns: phase indicator (4px colored left border) +
title (flex:1) + date (120px) + who (80px) + status select (100px).

### F2 — Lane view task markers + phase exit labels

Current: lane bar shows only one green milestone diamond.
Fix: along each project's lane bar, show:

- **Task dots**: small circles at each task's `finish_by` week position
  Label on hover: "T1: [task title]"
  Color: yellow if Open, green if Done, red if Delayed
- **Phase exit gates**: small vertical tick marks at milestone `auto_date` positions
  Label: "DS✓", "PT✓", "PD✓", "PV✓" — show in dim color if Pending, bright if Complete

Keep the existing green triangle for launch date.

### F3 — Repair phase names endpoint path

**File:** `functions/api/setup/repair-phase-names.js`

Check if this file exists and what method it exports.
If it only exports `onRequestGet`, add `onRequestPost` that does the same repair logic.
This fixes the 405 error when calling POST from browser console.

---

## DO NOT TOUCH

- `public/assets/js/cashflow.injector.js`
- `public/assets/js/expenses.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/sales.injector.js`
- `public/assets/js/collection.injector.js`
- `public/assets/js/project-finance.injector.js` — only add presale form (Part C)
- `functions/api/sales.js` — already correct
- `functions/api/transactions.js` — already correct

---

## AFTER ALL PARTS — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — Entry expense-only, M2.4 presale form, Cash In tab, M3.3 Hard Assets, M3.4 UX polish`

2. Append to RULES.md (next L-number after L090):
   - Entry drawer = Expense only. All income has enforced origin (collection/presale/cash_in/business)
   - Presale entry lives in M2.4 expanded view, not Entry drawer
   - Cash In = source='cash_in', appears in Cashflow only, excluded from Sales
   - Hard asset sale = source='hard_asset_sale', category='Hard asset sale' (Per-earn)
   - HardAssets table pattern: same as Assets but for property/vehicles/equipment

3. Update PROJECT_STATE.md:
   - Mark P2 ✅ COMPLETE
   - Add HardAssets table to AIRTABLE TABLES section
   - Add hard-assets.injector.js + API files to FILE INVENTORY
   - Update CONFIRMED WORKING list
   - Update ROADMAP: next = Fix 9F Time Management

4. Commit docs: `docs: update RULES and PROJECT_STATE after p2`

---

## COMMIT ORDER

```
feat(entry): entry.injector.js — remove EARN tab, expense-only mode, add Cash In tab
feat(m24): project-finance.injector.js — inline presale creation form in expanded view
feat(schema): HardAssets Airtable table creation
feat(api): hard-assets.js — GET list + POST create
feat(api): hard-assets/[id].js — GET detail + PATCH + DELETE
feat(m33): hard-assets.injector.js — full panel, cards, add drawer, sell modal
feat(m33): wire #panel-hard-assets in index.html
fix(m34): projects.injector.js — focus view full-width task rows
fix(m34): projects.injector.js — lane view task dots + phase exit gates
fix(api): setup/repair-phase-names.js — add onRequestPost handler
docs: update RULES and PROJECT_STATE after p2
```

Branch: `feat/p2-sale-origins-hard-assets`
Merge to main after owner confirms:
- [ ] Entry drawer shows Expense only (no EARN tab)
- [ ] Entry drawer has new Cash In tab
- [ ] Cash In saves to Transactions with source='cash_in', appears in Cashflow
- [ ] M2.4 expanded view has inline presale form — save creates Transaction
- [ ] M3.3 Hard Assets panel loads with summary strip + add button
- [ ] Add Hard Asset → saves to Airtable → card appears
- [ ] Mark Sold → updates status + creates Transaction → appears in M2.2 Personal Asset Sales
- [ ] M3.4 focus view tasks render as full-width rows
- [ ] M3.4 lane view shows task dots at finish_by positions
- [ ] POST /api/setup/repair-phase-names → returns success (no 405)
