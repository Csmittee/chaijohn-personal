# CC_PROMPT_feat-pl-generator.md
> ✅ COMPLETE — 2026-06-03 — 4.4 P&L Generator: full build, CHAIJOHN_KV storage, PDF/ODS export, archive view
> Feature: 4.4 P&L Generator — standalone financial modelling tool
> Branch: feat/pl-generator
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L120 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_feat-pl-generator.md
```

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/expenses.injector.js` — for global CSS variable patterns (--bg-page, --bg-card, --bg-raised, --border, --text, --text-dim, --yellow, --radius, var(--radius))
3. `public/assets/css/global.css` or equivalent — confirm all CSS variable names used in other injectors
4. `index.html` — find `panel-pl-generator` placeholder div (added in batch8) — replace its contents
5. `functions/api/sales.js` — read how R2 is NOT used there (confirm R2 pattern from another file that uses it, e.g. `functions/api/diary.js` or `functions/api/upload-image.js`)

Read all 5 before writing a single line.

---

## CRITICAL — PROJECT STATE ALIGNMENT (read before building anything)

### Project states in CHAIJOHN OS:
| State | Trigger | Frame color | M2.4 visible? | P&L Generator access? |
|---|---|---|---|---|
| Draft | "Save draft" button in create modal | Grey, M3.4 only | No | ✅ Yes |
| Active | "Update + Active" button in modal | Grey frame in M3.4 | No | ✅ Yes |
| Active + In Sales | "✓ In Sales" button inside project focus card | Green frame in M3.4 | ✅ Yes (M2.4) | ✅ Yes |

### P&L Generator access rule:
- P&L Generator is accessible for projects in ANY state (Draft, Active, Active+InSales)
- When opened from a project context, it pre-fills: startup_cost (from project resources total), revenue/mo (from project target_revenue_monthly), project name, SG&A %
- Pre-fill is READ ONLY from `/api/projects/:id` — no writes back to project record
- User can override any pre-filled value in the input fields

### Nav placement fix:
- P&L Generator nav item MUST be under **Tools** section in sidebar, NOT under Finance
- Panel ID must be `panel-pl-generator` (matching batch8 placeholder)
- Read `index.html` carefully — find the existing placeholder panel and the Tools nav section
- The placeholder panel may currently have incorrect content injected — clear it completely and replace with the new injector content

### How P&L Generator is opened:
1. From sidebar nav (Tools → P&L Generator) — opens blank model, user selects project from dropdown
2. Future: from M3.4 project card "Open Finance" button passing `?project=ID` — pre-fills from that project
For now: implement option 1 only. Add a project selector dropdown at top of the form: "Link to project (optional)" — fetches `/api/projects` list, user picks one, pre-fills fields.

---

## ARCHITECTURE — STANDALONE, NO AIRTABLE

This module is 100% standalone:
- **Input**: user data entry in the panel UI
- **Storage**: Cloudflare R2 bucket (existing `chaijohn-assets` bucket or equivalent — check env var name from existing R2 usage)
- **No Airtable reads or writes**
- **No existing injector modified** (except replacing placeholder content in index.html panel div)
- **New files only**:
  - `public/assets/js/pl-generator.injector.js`
  - `functions/api/pl-generator.js` — GET list + POST save
  - `functions/api/pl-generator/[id].js` — GET single version

The startup cost field is manually entered by the user — do NOT auto-pull from M3.4 project resources (too complex for standalone; user references their project and enters the number).

---

## PANEL ANATOMY — follows global app standard

```
┌─────────────────────────────────────────────────────┐
│  TOP: Stats strip (5 KPI bubbles)                   │
├─────────────────────────────────────────────────────┤
│  MID: Chart area (revenue vs cost bars, BEP line)   │
├───────────────────┬─────────────────────────────────┤
│  LEFT: Data entry │  RIGHT: Output table            │
│  sidebar (tabs)   │  (P&L / Balance sheet /         │
│                   │   Cashflow) — switches by tab   │
└───────────────────┴─────────────────────────────────┘
```

---

## UI LAYOUT SPEC

### Panel header (follows app standard)
```html
<div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
  <div>
    <div style="font-size:0.95rem;font-weight:700">P&L Generator</div>
    <div style="font-size:0.72rem;color:var(--text-dim)">// financial modelling · 12-month · 5-year</div>
  </div>
  <div style="display:flex;gap:0.4rem">
    <button id="plg-archive-btn" style="font-size:0.72rem;padding:0.25rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-dim);cursor:pointer">📂 Archive</button>
    <button id="plg-new-btn" style="font-size:0.72rem;padding:0.25rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--yellow);color:#0a0a10;cursor:pointer;font-weight:700">+ New model</button>
  </div>
</div>
```

### KPI strip (top, always visible)
5 bubbles in a row using app standard pill style:
`Gross margin % | EBITDA % | Break-even month | Payback | Burn rate ฿/mo`

Each bubble: `background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:0.3rem 0.75rem`
Label: `font-size:0.62rem; color:var(--text-dim); letter-spacing:0.04em`
Value: `font-size:0.95rem; font-weight:700` — NOT oversized, readable but compact
Default value: `—`

### Chart area (mid)
Height: `120px` max. Canvas element for bar chart (use Chart.js — already available in the project).
12 grouped bars: Revenue (blue before BEP, green after) + Cost (red). BEP vertical line annotation.
Period toggle above chart: `[12 mo] [5 yr]` — small pill buttons, font-size 0.68rem.
Chart only renders after "Generate" is clicked. Before that: dashed placeholder border with "Generate to see chart" text.

### Main body (below chart): two-column grid
`display:grid; grid-template-columns:280px 1fr; gap:0; border-top:1px solid var(--border)`

Left = data entry sidebar. Right = output area with 3 view tabs (P&L / Balance sheet / Cashflow).

---

## LEFT SIDEBAR — DATA ENTRY

4 tabs across the top of the sidebar:
`Revenue | Costs | Assets | Funding`
Tab style: same as existing panel sub-tabs in the app — small font (0.68rem), border-bottom active indicator.

All input fields follow global standard:
```css
font-size:0.78rem; padding:0.25rem 0.45rem;
background:var(--bg-page); border:1px solid var(--border);
border-radius:var(--radius); color:var(--text); width:100%
```
Label above each field: `font-size:0.65rem; color:var(--text-dim); margin-bottom:2px`
Section headers within tab: `font-size:0.65rem; font-weight:700; color:var(--text-dim); letter-spacing:0.05em; text-transform:uppercase; padding:0.4rem 0 0.2rem; border-top:1px solid var(--border); margin-top:0.4rem`
Row gap between fields: `0.4rem`
Two-column rows: `display:grid; grid-template-columns:1fr 1fr; gap:0.4rem`

### TAB 1: Revenue

**Forecast setup section:**
- Start period: `<input type="month">` — compact, width fits column
- Input mode: `<select>` — options: "Units × price" / "Revenue direct"
- Units/mo: number input (shown only when mode = Units × price)
- Sale price (฿): number input (shown only when mode = Units × price)
- Revenue/mo: number input — auto-calculated and shown as readonly green value when units+price filled; editable when mode = Revenue direct. Show auto-badge `auto` next to label when computed.
- Probability %: number, default 70
- Growth mode: select — "Conservative" / "Aggressive"

**Capacity section** (collapsible, default collapsed):
- Shifts/day, Days/week, Weeks/month — 3-col row, all number inputs, optional

### TAB 2: Costs

**Variable costs section:**
Label: "per unit or % of sale"
- Direct material: number, placeholder "฿ / unit"
- Labor: number, placeholder "฿ / unit"
- Freight inbound: text input, placeholder "฿ or % COGS" — detect % if ends with %
- Freight outbound: text input, placeholder "฿ or % sale"
- Open list for additional variable items: each row = [item name input | value input | type select (per unit / % sale / % COGS)] + delete ✕ button
- "+ Add variable item" link

**Semi-fixed costs section:**
Open list — each row = [description input | amount number | frequency select (Monthly / Annual / Per unit / Per billing / Per X vol / Per X hrs)] + ✕
Pre-seeded rows (empty values, user fills): Office staff, Packaging, Accountant
"+ Add item" link

**Fixed costs section:**
Pre-seeded category rows (user fills monthly amount + can change frequency):
Office labor | Utility | Rental | IT/Software | Maintenance | Insurance | Marketing | Services
Each row: `[category label (fixed width 90px) | amount number input | frequency select]`
"+ Add custom category" link at bottom

**SG&A sub-section** (within fixed costs, separated by small header):
Loyalty (% sale) | Owner fund (฿/mo) | License (฿/yr) | Other SG&A (฿/mo)

### TAB 3: Assets

**Startup cost section:**
- Single field: Startup cost (฿) — user enters manually, references their M3.4 project
- Helper text below: `font-size:0.62rem; color:var(--text-dim)` — "Enter total from your project resources"
- Depreciation years for startup cost: number, default 3
- Depreciation start: display only — "= sale start month (auto)"

**Fixed assets section:**
Open list — each row = [asset name | value ฿ | depreciation years | ✕]
"+ Add asset" link

**Working capital section** (collapsible):
- Receivable days (default 30) | Payable days (default 45) — 2-col row
- Inventory days (default 15) | Cash buffer ฿ — 2-col row

### TAB 4: Funding

**Fund need section:**
- Total fund required ฿: number, with "auto" badge showing computed burn × runway
- Runway target months: number, default 6
- Buffer %: number, default 20

**Funding sources section:**
Open list — each row = [source name | amount ฿ | type select (Equity / Loan / Grant / Presale)] + ✕
Pre-seeded: Owner equity, Bank loan
"+ Add source" link

**Loan terms section** (collapsible, only relevant if loan source present):
- Interest rate %, Term months — 2-col row
- Repayment start: select (Month 1 / Month 4 grace / After break-even)

**Pre-generate note section:**
```html
<div style="margin-top:0.75rem;padding:0.5rem;background:var(--bg-raised);border-radius:var(--radius)">
  <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.25rem">NOTE FOR REVIEWER (optional)</div>
  <textarea id="plg-review-note" rows="2" placeholder="Add context, assumptions, or instructions for anyone reviewing this model…"
    style="width:100%;font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;box-sizing:border-box"></textarea>
  <div style="font-size:0.62rem;color:var(--text-dim);margin-top:0.2rem">Appears as header in PDF export</div>
</div>
```

**Generate buttons:**
```html
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-top:0.75rem;padding-top:0.5rem;border-top:1px solid var(--border)">
  <button id="plg-gen-12" style="font-size:0.75rem;padding:0.35rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">12 months</button>
  <button id="plg-gen-5y" style="font-size:0.75rem;padding:0.35rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;cursor:pointer;font-weight:700">5 years</button>
</div>
```

---

## RIGHT OUTPUT AREA

### Output tabs (P&L / Balance sheet / Cashflow)
Tab row at top of output area:
`font-size:0.68rem; padding:0.25rem 0.6rem` — same style as sidebar tabs, horizontal row.

### P&L VIEW

Period toggle: `[12 mo] [5 yr]` — pill buttons, font-size 0.68rem, top-right of section.
Column filter: show M1, M2, M3, M6, M9, M12 for 12-month view. Y1, Y2, Y3, Y5 for 5-year view.

Table font-size: `0.72rem` — NOT larger.
Column widths: first column (label) ~38%, numeric columns equal-width remainder.
Number values: `font-variant-numeric:tabular-nums; text-align:right`
Amount formatting: Thai baht with commas — `฿1,234,567` — no decimals for whole numbers.
Percent values: one decimal — `42.3%`

Row structure:
```
Revenue                        ฿xxx  ฿xxx  ฿xxx  ฿xxx  ฿xxx  ฿xxx
  Direct material (dim, indent)
  Labor (dim, indent)
  Freight (dim, indent)
  Other variable (dim, indent)
━━ Gross profit (subtotal, bold bg:var(--bg-card))
  Semi-fixed (dim, indent)
  Fixed costs (dim, indent)
  Depreciation (dim, indent)
  SG&A (dim, indent)
━━ EBITDA (subtotal, bold)
  Interest (dim)
  Tax est. (dim)
━━ Net profit (total, bold, green/red by sign)
──────────────────────────────────────────
Gross margin %  (dim row, no ฿ sign)
Net margin %
ROI %
```

Subtotal rows: `background:var(--bg-card); font-weight:700`
Total rows: `font-weight:700; font-size:0.78rem`
Positive values in total rows: `color:#22c55e`
Negative values in total rows: `color:#ef4444`
Dim/indent rows: `color:var(--text-dim); padding-left:1rem`

### BALANCE SHEET VIEW

Period selector: pill buttons M6 / M12 / Y3 / Y5 — font-size 0.68rem.
Two-column layout: Assets left, Liabilities + Equity right.
Each column is a simple label+value list — `font-size:0.72rem`.
Sub-section headers (Current / Non-current): `font-size:0.62rem; font-weight:700; color:var(--text-dim); letter-spacing:0.04em`
Total rows: bold, border-top line.
Balance check line below both columns: `font-size:0.68rem; color:var(--text-dim)` showing "Assets = Liabilities + Equity · ✓ balanced" or "⚠ imbalance ฿xxx" in red.

### CASHFLOW VIEW

Period: Monthly or Cumulative toggle — pill buttons.
Horizontal bar per month: two segments — cash in (green) and cash out (red) — as percentage of max value.
Month labels: `font-size:0.65rem; width:28px; flex-shrink:0`
Net value right: `font-size:0.65rem; width:60px; text-align:right`
BEP month row: highlight with a subtle `background:rgba(34,197,94,0.08)` and "BEP ✓" label.
Summary row below bars: 3 totals — Total inflow, Total outflow, Net position.

---

## CALCULATION ENGINE — `computePL(inputs, months)`

All computation happens client-side in `pl-generator.injector.js`. No server-side calculation.

Function signature: `computePL(inputs, periods)` where periods = 12 or 60 (5 years).

Returns object:
```javascript
{
  pl: [...],        // array of period objects with all line items
  bs: [...],        // balance sheet snapshots at key periods
  cf: [...],        // cashflow per period
  kpis: {           // for strip display
    gross_margin_pct,
    ebitda_pct,
    breakeven_month,
    payback_months,
    burn_rate
  }
}
```

### Revenue per period:
- Base revenue = units × price (or direct input)
- Apply probability factor
- Growth: conservative = +3% per month; aggressive = +8% per month with plateau at month 9
- For 5yr: compound annually after year 1

### COGS:
- Direct material + labor = per-unit cost × units
- Freight: parse % or fixed amount per period
- Other variable items: same logic

### Gross profit = Revenue − COGS

### Semi-fixed: sum all items, convert to monthly (annual ÷ 12, per-unit × units, etc.)

### Fixed costs: sum all categories monthly (annual ÷ 12)

### Depreciation:
- Startup cost: straight-line over depreciation years, starts at period 1
- Each fixed asset: straight-line over its depreciation years, starts at period 1

### SG&A: loyalty % of revenue + fixed monthly items + license annual ÷ 12

### EBITDA = Gross profit − Semi-fixed − Fixed − Depreciation − SG&A

### Interest: monthly = (loan_amount × interest_rate / 100) / 12, starting at repayment_start month

### Tax: estimate 20% of positive EBIT (zero if negative)

### Net profit = EBITDA − Interest − Tax

### KPIs:
- Gross margin % = (Gross profit / Revenue) × 100, averaged over profitable months
- EBITDA % = (EBITDA / Revenue) × 100, averaged over profitable months
- Break-even month = first month where cumulative net profit turns positive
- Payback months = startup_cost / avg_monthly_net_profit (after BEP)
- Burn rate = avg monthly total costs before revenue starts (pre-revenue months)

### Balance sheet construction (at key periods):
Assets:
- Cash = starting fund + cumulative net cashflow
- AR = revenue × (receivable_days / 30)
- Inventory = COGS × (inventory_days / 30)
- Fixed assets cost = sum of all asset values + startup cost
- Accumulated depreciation = depreciation × periods elapsed
- Net fixed assets = cost − accumulated depreciation

Liabilities:
- AP = COGS × (payable_days / 30)
- Loan balance = loan_amount − principal_repaid_to_date
- Accrued expenses = fixed_monthly_total

Equity:
- Owner capital = equity_funding_total
- Retained earnings = cumulative net profit

---

## SAVE & VERSIONING — Cloudflare R2

### Data format saved to R2:
```javascript
{
  id: `pl_${Date.now()}`,
  version: 'v1',              // auto-increment: check existing versions for same name
  name: inputs.model_name || 'Unnamed model',
  created_at: ISO string,
  review_note: inputs.review_note || '',
  period: '12mo' or '5yr',
  inputs: { ...all input fields },
  outputs: { pl, bs, cf, kpis }
}
```

R2 key: `pl-generator/${id}.json`

### API endpoints:

**`functions/api/pl-generator.js`**
- `GET /api/pl-generator` — list all saved versions (read R2 keys with prefix `pl-generator/`, return metadata array sorted newest first: id, name, version, created_at, period, review_note)
- `POST /api/pl-generator` — save new version (body = full data object above), write to R2, return `{ id, version }`

**`functions/api/pl-generator/[id].js`**
- `GET /api/pl-generator/:id` — fetch single saved version from R2, return full object

Use `env.ASSETS` or the existing R2 binding name — check what other files use (e.g. `env.R2_BUCKET` or `env.chaijohn_assets`). Match exactly.

### Save flow in UI:
Save bar always visible at bottom of panel:
```
[Model name input] [Assumption / version note input] [auto version tag] | [Save] [ODS] [PDF]
```
- Model name: text input, saved with the version
- Assumption note: text input (short — for version differentiation like "conservative assumptions" or "v2 higher growth")
- Version tag: auto — `v1`, `v2`, etc. shown as readonly badge
- On Save: POST to `/api/pl-generator`, show success badge "✓ Saved as v{n}"

---

## ARCHIVE VIEW

Triggered by "📂 Archive" button in panel header. Replaces main panel content (or slides in as overlay).

Layout:
- Search input at top: `font-size:0.78rem` — filters by model name or note
- Period filter pills: All / 12mo / 5yr
- List of saved versions as compact rows:
  ```
  [model name bold]  v2 · 12mo · 3 Jun 2026          [Load] [Delete]
  conservative assumptions
  ```
  Row: `display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--border); font-size:0.78rem`
  Version badge: `font-size:0.62rem; background:var(--bg-card); border:1px solid var(--border); padding:0.1rem 0.35rem; border-radius:3px`
  Review note (if present): `font-size:0.65rem; color:var(--text-dim)` on second line
  Load button: restores inputs + outputs into the panel — user can re-generate or export
  Delete button: `color:#ef4444` — soft delete (remove from R2)
- "← Back" button returns to model view

---

## EXPORT

### PDF export:
Use `window.print()` with a dedicated `@media print` CSS class that shows only the output area.
Before printing:
1. Inject a header div (shown only in print) containing:
   - Model name + version
   - Generated date
   - Period (12mo / 5yr)
   - Review note (if present) — `font-size:0.82rem; font-style:italic; color:#555; border-left:3px solid #ccc; padding-left:8px`
2. Call `window.print()`
3. Remove the injected header after print dialog closes

Print-specific CSS (`@media print`):
- Hide sidebar nav, panel header, save bar, data entry sidebar, archive view
- Show only: review header + KPI strip + chart + output table
- Font sizes scale up slightly for readability: table font 0.85rem
- Page break before Balance sheet and Cashflow sections

### ODS export (LibreOffice spreadsheet):
Use SheetJS (`XLSX` global — already available or import from CDN `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`).

Create workbook with 3 sheets:
1. `P&L` — full monthly table (all rows, all periods)
2. `Balance Sheet` — key period snapshots
3. `Cashflow` — monthly in/out/net

Write as ODS format: `XLSX.writeFile(wb, 'pl-model-v1.ods', { bookType: 'ods' })`

Include review note as a comment in cell A1 of the P&L sheet if present.

---

## CSS — GLOBAL STANDARD COMPLIANCE

Use ONLY these CSS variables (confirmed from other injectors):
- `var(--bg-page)` — page background
- `var(--bg-card)` — card surfaces
- `var(--bg-raised)` — raised surfaces / drawer backgrounds
- `var(--border)` — border color
- `var(--text)` — primary text
- `var(--text-dim)` — secondary/muted text
- `var(--yellow)` — primary accent (CTA buttons)
- `var(--radius)` — border radius
- `#22c55e` — positive/green values
- `#ef4444` — negative/red values

Do NOT use Tailwind classes, CDN UI libraries, or CSS variables not confirmed above.
Do NOT use inline gradients or box-shadows beyond `box-shadow:-4px 0 24px rgba(0,0,0,0.2)` (drawer style).

Font sizes — hierarchy (match app standard):
- Panel title: `0.95rem` bold
- Sub-label: `0.72rem`
- Section headers: `0.65rem` uppercase letter-spaced
- Input fields: `0.78rem`
- Table data: `0.72rem`
- KPI values: `0.95rem` bold (NOT 1.5rem+)
- Tiny labels/badges: `0.62rem`

---

## DO NOT TOUCH

- Any existing `*.injector.js` file
- Any existing `functions/api/*.js` file
- `functions/api/projects.js`, `project-tasks.js`, `sales.js`, `transactions.js`
- Any Airtable table or schema
- `index.html` panel routing logic — only replace inner content of `#panel-pl-generator`

---

## FILE STRUCTURE — NEW FILES ONLY

```
public/assets/js/pl-generator.injector.js   ← full UI + computation engine
functions/api/pl-generator.js               ← GET list + POST save (R2)
functions/api/pl-generator/[id].js          ← GET single version (R2)
```

Wire `pl-generator.injector.js` in `index.html` with a `<script src="...">` tag alongside other injectors.
The injector must self-init when `#panel-pl-generator` becomes visible (same pattern as other injectors — listen for panel activation or call init on nav click).

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — 4.4 P&L Generator: full build, R2 storage, PDF/ODS export, archive view`

2. Append to RULES.md after L120:

```
L126  P&L Generator project state alignment:
      Accessible for projects in any state (Draft / Active / Active+InSales).
      Pre-fills startup_cost from project resources total, revenue_monthly from project target field.
      Pre-fill via GET /api/projects/:id — read only, never writes back to project record.
      Nav placement: Tools section only. Panel ID: panel-pl-generator.

L127  Project state definitions (canonical):
      Draft = saved but not activated. Grey frame. M3.4 only. No M2.4 connection.
      Active = "Update + Active" triggered. Grey frame. M3.4 only. No M2.4 connection.
      Active+InSales = "✓ In Sales" triggered from focus card. Green frame. Visible in M2.4.
      P&L Generator available at all 3 states.
      No Airtable reads or writes — data stored in Cloudflare R2 as JSON.
      R2 key prefix: pl-generator/{id}.json
      API: GET /api/pl-generator (list), POST /api/pl-generator (save), GET /api/pl-generator/:id (fetch).
      Startup cost entered manually by user — not auto-pulled from M3.4.

L122  P&L computation is client-side only in pl-generator.injector.js → computePL(inputs, periods).
      Returns: { pl[], bs[], cf[], kpis{} }. No server-side calculation.
      Conservative growth = +3%/mo. Aggressive = +8%/mo plateau at M9.
      Depreciation = straight-line from period 1. Tax = 20% of positive EBIT.

L123  PDF export = window.print() with @media print CSS. Inject review-note header before print,
      remove after. Review note appears as italic bordered paragraph in PDF header.
      ODS export = SheetJS XLSX.writeFile with bookType:'ods'. 3 sheets: P&L, Balance Sheet, Cashflow.

L124  Archive view: list all R2 keys with prefix pl-generator/, display as searchable/filterable list.
      Load restores full inputs + outputs. Soft delete removes from R2.
      Search by model name or assumption note. Filter by period (12mo / 5yr).

L125  P&L Generator CSS: uses ONLY global CSS variables. Font sizes: KPI values 0.95rem bold,
      table data 0.72rem, inputs 0.78rem, labels 0.65rem, badges 0.62rem.
      Panel anatomy: stats strip → chart (120px) → two-column (280px sidebar | output).
```

3. Update PROJECT_STATE.md:
   - Add `pl-generator.injector.js` to FILE INVENTORY
   - Add `functions/api/pl-generator.js` + `functions/api/pl-generator/[id].js`
   - Mark 4.4 P&L Generator ✅ COMPLETE in roadmap
   - Update CONFIRMED WORKING list

4. Commit docs: `docs: RULES L121–L125, PROJECT_STATE pl-generator complete`

---

## COMMIT ORDER

```
feat(api): pl-generator.js — GET list + POST save to R2
feat(api): pl-generator/[id].js — GET single version from R2
feat(m44): pl-generator.injector.js — full P&L generator UI, computation engine, archive view
feat(m44): pl-generator.injector.js — PDF print export with review note header
feat(m44): pl-generator.injector.js — ODS export via SheetJS (3 sheets)
feat(nav): index.html — wire pl-generator.injector.js script tag + panel activation
docs: RULES L121–L125, PROJECT_STATE pl-generator complete
```

Branch: `feat/pl-generator`
Merge to main after owner confirms:

- [ ] Panel loads with stats strip, chart placeholder, sidebar tabs, output area
- [ ] Revenue tab: units × price auto-computes revenue; probability and growth mode work
- [ ] Costs tab: variable open list, semi-fixed open list, fixed categories, SG&A all render
- [ ] Assets tab: startup cost entry, fixed asset list, working capital fields
- [ ] Funding tab: fund need auto-calc, sources list, loan terms, review note textarea
- [ ] Generate 12mo: KPI strip populates, chart renders, P&L table fills
- [ ] Generate 5yr: period toggle switches table columns to Y1/Y2/Y3/Y5
- [ ] Balance sheet view: two-column layout, balance check line shows ✓ balanced
- [ ] Cashflow view: horizontal bars per month, BEP row highlighted
- [ ] Save: POSTs to R2, shows "✓ Saved as v1" confirmation
- [ ] Archive: loads list from R2, search filters work, Load restores model
- [ ] PDF: window.print() fires, review note appears in print header
- [ ] ODS: downloads .ods file with 3 sheets (P&L / Balance sheet / Cashflow)
- [ ] No existing injector or API file modified
- [ ] RULES.md — L121–L125 appended
