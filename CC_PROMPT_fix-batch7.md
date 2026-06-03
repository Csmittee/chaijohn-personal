# CC_PROMPT_fix-batch7.md
> Batch 7 — M2.2 asset dedup + summary strip, M2.2 card widths + list sections, M2.4 compact cards, M2.1 list sections, L110 doc
> Branch: fix/batch7
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L110 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_fix-batch7.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `functions/api/sales.js` — how asset_sales is built (Assets table + transaction merge)
3. `public/assets/js/sales.injector.js` — renderStrip(), renderLanes(), projectLaneCard(), assetSaleCard(), list view render
4. `public/assets/js/cashflow.injector.js` — renderListView() — for reference only on section pattern
5. `public/assets/js/project-finance.injector.js` — budget card render + presale record card render

Read all 5 before writing a single line.

---

## FIX 1 — functions/api/sales.js: asset_sales dedup (source of truth = Transactions only)

**Root cause diagnosed:** `asset_sales` is currently built from TWO sources:
1. The Collection/HardAssets table records (status=Sold)
2. Transactions with source IN (collection, hard_asset_sale)

This creates a duplicate card every time a sale is made — one from the Asset record, one from the Transaction. Jen carabiner appears twice because of this.

**Fix — rewrite asset_sales to use Transactions table ONLY:**

Remove the Assets table query from the sales.js personal section.
Replace with a single Transactions query:

```javascript
// Fetch all income transactions with source = collection or hard_asset_sale
const assetTxRes = await listRecords(AIRTABLE_API_KEY, CORE_BASE, TRANSACTIONS, {
  filterByFormula: `AND({type}='Income',OR({source}='collection',{source}='hard_asset_sale'))`,
  maxRecords: 500
});

const asset_sales = (assetTxRes.records || []).map(r => {
  const f = r.fields;
  return {
    tx_id:      r.id,
    name:       f.description || f.entity || '',
    category:   f.source === 'collection' ? 'Collection sale' : 'Asset sale',
    sold_price: Number(f.amount || 0),
    sold_date:  f.date || '',
    sold_via:   f.entity || '',
    cost_price: 0,           // transactions don't store cost — gain not shown
    image_url:  null,        // no image from transaction source — intentional
    gain:       0,
    source:     f.source || ''
  };
});
```

**Also add presale_total to the summary object** — it is not currently in `salesData.summary`:

After building the `projects` array (which already has `presale_total` per project), compute:
```javascript
const total_presale = projects.reduce((s, p) => s + (p.presale_total || 0), 0);
const total_collection = asset_sales
  .filter(a => a.source === 'collection')
  .reduce((s, a) => s + a.sold_price, 0);
const total_hard_asset = asset_sales
  .filter(a => a.source === 'hard_asset_sale')
  .reduce((s, a) => s + a.sold_price, 0);
```

Add these three fields to the `summary` object returned in the response:
`total_presale`, `total_collection`, `total_hard_asset`

---

## FIX 2 — sales.injector.js: add collection + presale totals to summary strip

**File:** `public/assets/js/sales.injector.js` — `renderStrip()` function

The strip currently only shows Active Business metrics. Add two more bubbles AFTER the existing ones:

```javascript
bubble('Presale Total', fmt(s.total_presale || 0), (s.total_presale || 0) > 0 ? '#22c55e' : null),
bubble('Asset Sales', fmt((s.total_collection || 0) + (s.total_hard_asset || 0)), ((s.total_collection || 0) + (s.total_hard_asset || 0)) > 0 ? '#d4af37' : null),
```

These are period-filtered totals matching the current selected period.

---

## FIX 3 — sales.injector.js: card view — constrain Projects lane card width

**File:** `public/assets/js/sales.injector.js` — `projectLaneCard()` function, card view branch

**Current:** The card view wrapper `<div>` has no max-width — stretches full panel width.

**Fix:** The Projects (presales) section in card view must render as a flex-wrap row of compact cards, same layout as Asset Sales cards.

Change the Projects section card view render in `renderLanes()`:

```javascript
// Replace the current forEach direct html += projectLaneCard(p) with:
html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.25rem 0">`;
projectsWithPresales.forEach(p => { html += projectLaneCard(p); });
html += `</div>`;
```

Inside `projectLaneCard()` card view branch, wrap the returned HTML in:
```
max-width:220px; min-width:160px; flex:0 0 auto;
background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:0.65rem;
```

This makes each project a compact card sitting side by side, consistent with `assetSaleCard()`.

---

## FIX 4 — sales.injector.js: list view — add collapsible section headers

**File:** `public/assets/js/sales.injector.js` — `renderLanes()` function, list view branch

**Current:** List view renders all rows flat — no section separation visible.

**Fix:** In list view, each section (ACTIVE BUSINESS, PROJECTS, PERSONAL → ASSET SALES, MANUAL ENTRIES) must have the same collapsible header that card view has. The `sectionHeader()` helper already exists and works in card view — apply it consistently in list view too.

Specifically in list view, the PERSONAL sub-sections (ASSET SALES, MANUAL ENTRIES) currently have no visual header. Add a styled sub-header row above the table for each:

```javascript
// Before the asset sales <table>, add:
html += `<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);padding:0.4rem 0 0.2rem;letter-spacing:0.04em;border-top:1px solid var(--border);margin-top:0.25rem">ASSET SALES</div>`;

// Before the manual entries table, add:
html += `<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);padding:0.4rem 0 0.2rem;letter-spacing:0.04em;border-top:1px solid var(--border);margin-top:0.25rem">MANUAL ENTRIES</div>`;
```

The top-level section headers (ACTIVE BUSINESS, PROJECTS, PERSONAL) already use `sectionHeader()` — keep those unchanged. Just add the sub-section labels inside PERSONAL for list view.

---

## FIX 5 — sales.injector.js: M2.1 cashflow list view — collapsible sections

**File:** `public/assets/js/cashflow.injector.js` — `renderListView()` function

**Current:** Flat sorted list of all transactions, no grouping.

**Fix:** Group transactions by source category with collapsible section headers, matching the card view sections. Three sections:

- **INCOME** — all type=Income transactions
- **EXPENSES** — all type=Expense transactions (excluding source=project_funding)
- **PROJECT FUNDING** — type=Expense AND source=project_funding

For each section, render:
1. A collapsible header row showing section name + total amount (color-coded: green for income, red for expenses/funding)
2. Transaction rows under it (same row format as current — date, label, entity, amount)
3. Toggle collapsed/expanded on header click — default expanded

Use a simple `_cfListCollapsed` object (module-scoped, initialized once) to track collapsed state per section key ('income', 'expense', 'project_funding').

Section header HTML pattern:
```javascript
function listSectionHeader(key, label, total, color) {
  const collapsed = _cfListCollapsed[key];
  return `<div data-cf-list-sec="${key}" style="display:flex;justify-content:space-between;align-items:center;
    padding:0.3rem 0.75rem;background:var(--bg-card);border-bottom:1px solid var(--border);
    cursor:pointer;user-select:none">
    <span style="font-size:0.72rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em">
      ${label} <span style="font-size:0.65rem;opacity:0.6">${collapsed ? '▶' : '▼'}</span>
    </span>
    <span style="font-size:0.78rem;font-weight:700;color:${color}">${total}</span>
  </div>`;
}
```

After rendering, bind click delegation on the list zone:
```javascript
zone.addEventListener('click', e => {
  const sec = e.target.closest('[data-cf-list-sec]');
  if (!sec) return;
  const key = sec.dataset.cfListSec;
  _cfListCollapsed[key] = !_cfListCollapsed[key];
  renderListView(zone);
});
```

Sort each section's rows newest-first. Cap total rows at 80 (applies across all sections combined).

---

## FIX 6 — project-finance.injector.js: compact budget + presale cards

**File:** `public/assets/js/project-finance.injector.js`

**Current:** Budget cards and presale record cards each stretch full panel width — only 1 per row.

**Fix:** Both card types must use compact inline sizing so multiple sit side by side.

**Budget card wrapper** — change to:
```
display:inline-flex; flex-direction:column;
min-width:160px; max-width:220px; width:auto;
vertical-align:top; margin:0.25rem;
background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:0.6rem 0.75rem;
```

**Presale record card wrapper** — same sizing:
```
display:inline-flex; flex-direction:column;
min-width:160px; max-width:220px; width:auto;
vertical-align:top; margin:0.25rem;
background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:0.6rem 0.75rem;
```

The containing section div for both must be:
```
display:flex; flex-wrap:wrap; gap:0.25rem; align-items:flex-start;
```

**Do NOT change** any data, any API calls, or any button/form logic — only the CSS sizing of the card wrappers and their parent flex container.

---

## FIX 7 — RULES.md: append L110 (only outstanding doc update from last session)

Append after L109:

```
L110  category_id field permanently deleted from Transactions table on 2026-06-03.
      Never recreate it. Transaction model uses type + source + budget_id + project_id only.
```

---

## DO NOT TOUCH

- `public/assets/js/expenses.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/collection.injector.js`
- `public/assets/js/projects.injector.js`
- `public/assets/js/entry.injector.js`
- `public/assets/js/hard-assets.injector.js`
- `functions/api/transactions.js`
- `functions/api/cashflow.js`
- Any other API file not listed in READ FIRST

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — M2.2 asset dedup, summary strip, card widths, list sections, M2.4 compact cards, M2.1 list sections, L110`

2. Append to RULES.md after L110:

```
L111  M2.2 asset_sales source of truth = Transactions table ONLY (source=collection or hard_asset_sale).
      Never read from Collection/HardAssets table records for M2.2 display — causes duplicate cards.
      Transactions do not store cost_price — gain is not shown in M2.2 Asset Sales (acceptable).

L112  M2.2 summary strip must include: total_presale (sum of all project presale totals) and
      total_collection + total_hard_asset (from asset_sales transactions). These fields come from
      /api/sales response summary object. Strip bubbles: Presale Total (green) + Asset Sales (gold).

L113  M2.2 Projects lane card view: each project card max-width:220px in a flex-wrap row.
      Never let project presale cards stretch full panel width — constrain same as assetSaleCard().

L114  M2.1 cashflow list view: group by section (INCOME / EXPENSES / PROJECT FUNDING) with
      collapsible headers + section totals. Collapsed state stored in _cfListCollapsed module var.
      Same pattern as card view sections. Default all expanded.

L115  M2.4 budget cards + presale record cards: max-width:220px, inline-flex, flex-wrap container.
      Multiple cards per row — same density as expense card layout. Width never full panel.
```

3. Update PROJECT_STATE.md:
   - Mark Batch 7 ✅ COMPLETE
   - Update CONFIRMED WORKING: M2.2 asset dedup ✅, M2.2 summary strip ✅, M2.1 list sections ✅, M2.4 compact cards ✅

4. Commit docs separately: `docs: RULES L110–L115, PROJECT_STATE batch7 complete`

---

## COMMIT ORDER

```
fix(sales-api): asset_sales from transactions only — remove Assets table source, add summary totals
fix(m22): sales.injector.js — summary strip presale + asset totals bubbles
fix(m22): sales.injector.js — projects lane card view compact flex-wrap cards
fix(m22): sales.injector.js — list view PERSONAL sub-section headers
fix(m21): cashflow.injector.js — list view collapsible section grouping
fix(m24): project-finance.injector.js — compact budget + presale record cards
docs: RULES L110–L115, PROJECT_STATE batch7 complete
```

Branch: `fix/batch7`
Merge to main after owner confirms:

- [ ] M2.2 Asset Sales — Jen carabiner appears ONCE only (not duplicated)
- [ ] M2.2 Asset Sales — no photo card (text-only, correct)
- [ ] M2.2 Summary strip — shows Presale Total + Asset Sales bubbles
- [ ] M2.2 Card view — Projects presale cards are compact side-by-side, not full width
- [ ] M2.2 List view — ASSET SALES + MANUAL ENTRIES sub-headers visible under PERSONAL
- [ ] M2.1 List view — INCOME / EXPENSES / PROJECT FUNDING sections with collapse toggle
- [ ] M2.4 — Budget cards sit side by side (multiple per row)
- [ ] M2.4 — Presale record cards sit side by side (multiple per row)
- [ ] RULES.md — L110 committed, L111–L115 appended
