# CC_PROMPT_fix9D_m22-sales.md
> Phase 9D — Build M2.2 Sales module from scratch
> Dynamic multi-stream sales aggregator + AR tracking + cashflow injection

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
- CLAUDE.md
- RULES.md
- PROJECT_STATE.md
- WORKFLOW_SKILL.md

Then read and execute: docs/prompts/CC_PROMPT_fix9D_m22-sales.md
```

---

## CRITICAL PRE-READ (read these files fresh from repo before touching anything)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/index.html` — find `#panel-sales`, understand sidebar shell structure
3. `public/assets/js/entry.injector.js` — understand existing EARN entry form + Income Source dropdown
4. `public/assets/js/expenses.injector.js` — reference for panel anatomy pattern (sticky graph + scrollable body)
5. `public/assets/js/cashflow.injector.js` — understand how Transactions are consumed; DO NOT CHANGE
6. `functions/api/transactions.js` — understand Transaction schema; DO NOT CHANGE
7. `functions/api/categories.js` — understand Categories schema; needed for dynamic lane generation
8. `functions/_airtable.js` — use existing helpers; add new ones here if needed
9. `functions/api/assets.js` — understand Assets table schema for personal sale stream

**Also read from Business Airtable (AIRTABLE_BUSINESS_BASE_ID) — use Airtable Meta API to inspect:**
- `Business ID` table — all fields (base_id, Business Name, Business Type, Status, Brand name, Tag line)
- `Sale_record` table — all fields (Formatted Sale Order, Sale date, Prod id, Product Name, Sale price, Actual sale, Invoice no., Status, Units, Total sale, invoice_no, quote_id, business_id, customer_name, payment_stage, invoice_total, notes)
- `Products` table — fields: id, name, Group, brand, Business ID, bus_id, category, price, main_image, Status

Do NOT guess field names. Read the actual schema before writing any API code.

---

## OBJECTIVE

Build M2.2 Sales — the unified earn aggregator for Chaijohn OS.

This module shows all income streams in one panel with AR tracking, overdue alerts, and automatic cashflow injection. It does NOT replace the entry system — it reads from it. All sales data entry continues through the existing Entry drawer (EARN tab).

Branch: `feat/m22-sales`
Do NOT touch any existing API files or injectors.

---

## ARCHITECTURE DECISION: Dynamic Lanes (CRITICAL — read L060 in RULES.md)

**Sales lanes are NEVER hardcoded.** The panel generates lanes from live data:

```
Boot sequence:
1. Fetch Business ID table from AIRTABLE_BUSINESS_BASE_ID
   → All records WHERE Status = 'Active' define Active Business lanes
   → Each record: { bus_id, business_name, brand_name, tag_line, business_type }

2. Fetch Categories from chaijohn-core WHERE type = 'Earn'
   → Group by fixed_variable field value
   → 'Bus-earn' group items = active business identifiers for manual entries
   → 'Per-earn' group items = personal income streams

3. Fetch Projects from chaijohn-core WHERE sales_forecast_sent = true AND type = 'Active'
   → These are pre-launch / pre-operational projects with expected revenue
   → Appear as lanes under Projects section

4. Fetch Assets WHERE status = 'Sold'
   → Appear under Personal > Asset Sales lane

5. Fetch Transactions WHERE type = 'Earn' AND source = 'M2.2'
   → Manual sale entries added via Entry drawer

New business added to Business ID table = new lane appears automatically.
No code change ever needed for new businesses.
```

---

## PART 1 — API ENDPOINT

### `functions/api/sales.js`

This is the ONLY new API file for this phase.

#### GET /api/sales

Returns unified sales data from all streams. Query params:
- `?period=6m` | `12m` | `all` (default 6m)
- `?bus_id=BUS01` (optional — filter to one business)

Response shape:
```javascript
{
  businesses: [
    {
      bus_id: "BUS01",
      business_name: "I-Flex Pilates",
      brand_name: "I-flex",
      tag_line: "A healthy lifestyle",
      business_type: "Pilates Machines",
      invoices: [
        {
          quote_id: "2026-BUS01-001",
          invoice_no: "INV-2026-003",
          customer_name: "Apichaya Wattananukij",
          product_name: "Oak Reformer With Half Tower",
          product_image: "https://res.cloudinary.com/...",
          invoice_total: 45684,
          paid_total: 45684,
          balance: 0,
          status: "Paid",   // Paid | Partial | Overdue | Open
          sale_date: "2026-05-08",
          due_date: null,   // null if no due date set
          payments: [
            { stage: "deposit", amount: 31979, date: "2026-05-08" },
            { stage: "at_ship", amount: 13705, date: "2026-05-08" }
          ],
          days_since_last_payment: 24,
          is_ar: false,
          is_overdue: false
        }
      ],
      summary: {
        total_invoiced: 45684,
        total_received: 45684,
        total_ar: 0,
        total_overdue: 0,
        invoice_count: 1
      }
    }
  ],
  projects: [
    {
      project_id: "recXXX",
      name: "Project Name",
      target_revenue_monthly: 50000,
      current_phase: "PV",
      days_to_launch: 45
    }
  ],
  personal: {
    asset_sales: [
      {
        asset_id: "recXXX",
        name: "Strider gunner",
        sold_price: 14000,
        sold_date: "2026-03-15",
        sold_via: "Direct",
        category: "Collection-Knife"
      }
    ],
    manual_entries: [
      // Transactions WHERE type=Earn AND source=M2.2
    ]
  },
  summary: {
    total_earned_mtd: 0,
    total_ar: 0,
    total_overdue: 0,
    ytd_revenue: 45684,
    open_quotes: 1,
    open_quotes_total: 60000,
    by_business: { BUS01: 45684, BUS02: 0, BUS04: 0 },
    by_month: [ { month: "2026-05", total: 45684 }, ... ]
  }
}
```

**AR logic (implement exactly):**
- AR = invoice WHERE sale_date <= today AND paid_total < invoice_total
- Overdue = AR WHERE due_date is set AND due_date < today
- Not yet overdue = AR WHERE due_date is null OR due_date >= today

**Group Sale_record rows by quote_id** to build invoice objects. Each quote_id = one invoice with multiple payment rows. Sum actual_sale per quote_id for paid_total. Use invoice_total from any row (same per invoice).

**Business Airtable read — use AIRTABLE_BUSINESS_BASE_ID env var.** Use existing `_airtable.js` helpers or add new function `listBizRecords(table, params)` following same pattern as existing `listRecords`.

#### POST /api/sales

Creates a manual sale entry. Only used when the entry source needs `source=M2.2` tagging.
In practice: Entry drawer already creates Transactions. This endpoint is for future automation only.
For now: accept `{ date, amount, category_name, entity, description, note }` and create a Transaction record in chaijohn-core with `source='M2.2'`, `type='Earn'`.

---

## PART 2 — INJECTOR

Create: `public/assets/js/sales.injector.js`

Boot on `DOMContentLoaded`, target `#panel-sales`.
Lazy-init via `panelactivated` event (see L045 in RULES.md).

### State
```javascript
let salesData = null;          // full API response
let currentPeriod = '6m';      // '6m' | '12m' | 'all'
let currentBusFilter = 'all';  // 'all' | 'BUS01' | 'BUS02' | etc
let currentView = 'card';      // 'card' | 'list'
```

### Panel anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ SUMMARY STRIP (5 bubbles — sticky, never scrolls)            │
│ [This month vs budget] [AR Outstanding] [YTD Revenue]        │
│ [Open Quotes total] [Nearest overdue]                        │
├─────────────────────────────────────────────┬───────────────┤
│ GRAPH ZONE (sticky, never scrolls)          │ PARETO BAR    │
│ Filter row: [6M][12M][All] [All][BUS01]...  │ (vertical)    │
│ Stacked bar chart by month                  │ When All:     │
│ Each business = own color stack             │ revenue by    │
│ Line overlay: cumulative YTD                │ business      │
│ X axis: month names (Jan, Feb, Mar...)      │ When 1 biz:   │
│ responsive:true, NO overflow:hidden         │ top products  │
│ container height: 220px explicit            │ by revenue    │
├─────────────────────────────────────────────┴───────────────┤
│ BODY (scrollable — overflow-y:auto, this section only)       │
│ Filter: [Card][List]   Entry button (top right)              │
│                                                              │
│ ▼ ACTIVE BUSINESS          [section header — collapsible]   │
│   ▼ I-Flex Pilates (BUS01) [lane — collapsible, auto-hide   │
│     [card][card][card]      if zero sales in period]         │
│   ▼ Daje Queencatcher (BUS02)                                │
│     [card][card]                                             │
│   ▼ Flow Lifestyle (BUS04)                                   │
│     (no sales — collapsed by default if empty)               │
│                                                              │
│ ▼ PROJECTS                 [section — collapsible]          │
│   ▼ [Project name]         [lane per project]               │
│     Shows: target_revenue_monthly · phase · days to launch  │
│                                                              │
│ ▼ PERSONAL                 [section — collapsible]          │
│   ▼ Asset Sales            [lane]                           │
│     [card per sold asset]                                    │
│   ▼ Manual Entries         [lane — hide if empty]           │
│                                                              │
│ 🔴 OVERDUE                 [section — visible only if AR]   │
│   [red-frame card][red-frame card]                           │
└─────────────────────────────────────────────────────────────┘
```

### Scroll implementation
```css
#panel-sales {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.sales-sticky-zone {
  flex-shrink: 0;  /* summary + graph — never scrolls */
}
.sales-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
```

### Sale card (card view)
```
┌──────────────────────────────────────────────┐
│ [product thumbnail 48px]  [BUS badge]        │
│ Customer name             Invoice no.        │
│ Product name                                 │
│ ─────────────────────────────────────────── │
│ Invoice: ฿XX,XXX                             │
│ Paid:    ฿XX,XXX  ████████░░  (progress bar) │
│ Balance: ฿XX,XXX  [stage badge]              │
│ Sale date · N days since last payment        │
│ ─────────────────────────────────────────── │
│ [Edit]  [Delete]  [↗ Full record]            │
└──────────────────────────────────────────────┘
```

- Payment stage badge: `deposit` (blue) | `at_ship` (amber) | `balance` (orange) | `paid` (green)
- AR badge (amber): "Balance due" — when paid < invoice and not overdue
- Overdue badge (red + heartbeat): when past due_date
- Card border: default = var(--border-color); overdue = var(--danger) with CSS animation pulse

### Sale card (list view)
Single row: Date · Customer · Product · Invoice total · Paid · Balance · Stage · [actions]
Compact for mobile / narrow screen.

### Card click → detail modal
Shows full payment history (all stages), edit/delete buttons.
Edit: opens inline edit form within modal — can update customer_name, notes, due_date.
Delete: soft delete — sets status to 'Cancelled' in Business Airtable Sale_record. Confirm first.
Note: Business Airtable records can only be modified if the record was created via this app. Records that come from the Operational Dashboard are marked as read-only in the UI (show lock icon, no edit/delete).

### Project lane card
```
[Project name]  [phase badge DS/PT/PD/PV/LA]  [heartbeat if active]
Expected: ฿XX,XXX/mo · Launch in N days
Phase progress bar (5 segments)
[Go to Project ↗]
```

### Personal asset sale card
```
[asset cloudinary_image_url thumbnail]
Asset name · Category
Sold: ฿XX,XXX · via [sold_via] · [sold_date]
Cost: ฿XX,XXX → Gain: ฿XX,XXX (green if positive)
```

### Entry button
Top-right of body filter bar. When clicked:
- Dispatch custom event `open-entry-drawer` with `{ tab: 'transactions', type: 'earn' }`
- Entry drawer opens pre-set to EARN tab
- Income Source dropdown already has correct categories
- After save, re-fetch `/api/sales` and re-render

### Overdue section
- Appears at top of body if any overdue invoices exist
- Red background section, always visible (not collapsible)
- Cards have red border + heartbeat CSS animation
- Click card → same detail modal as above

### Graph implementation (Chart.js)
```javascript
// Stacked bar chart
type: 'bar',
data: {
  labels: ['Jan', 'Feb', 'Mar', ...], // month names from period
  datasets: [
    { label: 'I-Flex', data: [...], backgroundColor: 'rgba(59,130,246,0.7)' },
    { label: 'Daje', data: [...], backgroundColor: 'rgba(139,92,246,0.7)' },
    { label: 'Flow', data: [...], backgroundColor: 'rgba(245,158,11,0.7)' },
    { label: 'Projects', data: [...], backgroundColor: 'rgba(20,184,166,0.7)' },
    { label: 'Personal', data: [...], backgroundColor: 'rgba(212,175,55,0.7)' },
  ]
},
options: {
  responsive: true,
  maintainAspectRatio: false,
  stacked: true,
  scales: { x: { stacked: true }, y: { stacked: true } }
}

// Pareto vertical bar (right panel)
type: 'bar',
indexAxis: 'x',  // vertical bars
// When all: labels = business names, data = total revenue
// When single biz: labels = product names (top 8), data = revenue per product
options: { responsive: true, maintainAspectRatio: false }
```

Both charts: container has explicit height set in CSS (`height: 220px`), `min-width: 0` on parent grid columns. NEVER use `overflow: hidden` on chart containers.

---

## PART 3 — WIRE INTO index.html

Add `<script src="/assets/js/sales.injector.js" defer></script>` alongside other injectors.

Ensure `#panel-sales` exists in sidebar shell with correct structure.
If the panel div does not exist: add it following the same pattern as other panels.
If it already exists (CC 9C may have added a placeholder): verify it has the correct id and is in the nav.

---

## PART 4 — CASHFLOW INJECTION

When `/api/sales` is called and confirmed payments exist from Business Airtable, the API must check if a corresponding Transaction already exists in chaijohn-core (match by: date + amount + entity + source='M2.2'). If not found, create it:

```javascript
// In sales.js GET handler, after fetching Business Airtable data:
for (const payment of confirmedPayments) {
  const existing = await findTransaction({
    date: payment.date,
    amount: payment.actual_sale,
    entity: payment.customer_name,
    source: 'M2.2'
  });
  if (!existing) {
    await createTransaction({
      date: payment.date,
      type: 'Earn',
      amount: payment.actual_sale,
      entity: payment.customer_name,
      description: payment.product_name,
      category_name: matchBusEarnCategory(payment.business_id), // see below
      source: 'M2.2',
      note: `Auto from ${payment.invoice_no}`
    });
  }
}
```

`matchBusEarnCategory(bus_id)`:
- BUS01 → fetch Categories WHERE name LIKE '%I-Flex%' OR name LIKE '%Pilates%' AND fixed_variable='Bus-earn'
- BUS02 → fetch Categories WHERE name LIKE '%Daje%' OR name LIKE '%queen%' AND fixed_variable='Bus-earn'
- BUS04 → fetch Categories WHERE name LIKE '%Flow%' OR name LIKE '%board%' AND fixed_variable='Bus-earn'
- If no match found → use first Bus-earn category as fallback, log warning
- NEVER hardcode category IDs — always resolve by name match at runtime

**This injection is idempotent** — calling GET /api/sales multiple times will not create duplicate Transactions.

---

## PART 5 — CATEGORY CLEANUP (chaijohn-core Categories table)

Check Categories table for these incorrect legacy seeds and handle:
- `Ploikong sale` — if exists AND has no Transactions referencing it: DELETE
- `Satu Sale` — same: DELETE if no references
- `Old stocks sale` — same: DELETE if no references
- `Stock earn` — same: DELETE if no references

If any have existing Transactions referencing them: DO NOT delete. Instead set `active=false` on the category record so it no longer appears in dropdowns. Log what was found in commit message.

---

## SCALABILITY CHECKLIST (senior dev review before commit)

Before committing, verify each of these:

**Dynamic lanes:**
- [ ] Zero hardcoded business names or bus_id values in injector
- [ ] Adding a new record to Business ID table creates a new lane on next load
- [ ] Removing a business (Status → Inactive) removes its lane automatically

**API resilience:**
- [ ] If Business Airtable is unreachable: panel loads with personal + project data, shows "Business data unavailable" notice per lane — does NOT crash
- [ ] If no sales in period: lane renders with "No sales in this period" message — NOT hidden (owner needs to know lane exists)
- [ ] Empty lane auto-collapses in card view but remains accessible via expand

**Cashflow injection safety:**
- [ ] Deduplication check runs before every Transaction create
- [ ] Transaction creates use try/catch — failure logs but does NOT block panel load
- [ ] Injected transactions are tagged source='M2.2' — cashflow panel already filters by source

**Mobile / narrow screen:**
- [ ] List view activated automatically when viewport < 600px
- [ ] Summary bubbles wrap gracefully on mobile
- [ ] Graph zone height stays fixed even on small screen

**Cross-module links:**
- [ ] Project lane card links to #panel-projects (passes project_id in hash)
- [ ] Asset sale card links to collection panel (passes asset record)
- [ ] Entry button dispatches `open-entry-drawer` event — does NOT navigate away

**Zero regression:**
- [ ] cashflow.injector.js: not touched
- [ ] entry.injector.js: not touched
- [ ] transactions.js API: not touched
- [ ] categories.js API: not touched (category cleanup via direct Airtable call in sales.js only)

---

## CONSTRAINTS

- No React, no Tailwind — CSS variables + vanilla JS only (L010)
- Complete replacement files only — never patches (L011)
- All amounts in Thai Baht (฿) with toLocaleString()
- All dates displayed as "D MMM YYYY" (e.g. "1 Jun 2026")
- Business Airtable: READ ONLY except for cashflow injection into chaijohn-core
- Panel must work with zero sales data (empty state per section)
- Chart containers: responsive:true, maintainAspectRatio:false, explicit container height — never overflow:hidden

---

## AFTER ALL PARTS — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — M2.2 Sales: dynamic lanes + AR + cashflow injection`

2. Update `PROJECT_STATE.md`:
   - Mark Fix 9D ✅ COMPLETE
   - Add `sales.injector.js` + `functions/api/sales.js` to FILE INVENTORY
   - Update CURRENT STATE
   - Move Fix 9E-hard to "Immediate next"

3. Append new lessons to `RULES.md` (L061+):
   - Any Business Airtable access patterns discovered
   - Any cashflow injection edge cases
   - Any chart or scroll pattern lessons

4. Commit docs: `docs: update PROJECT_STATE and RULES after phase 9D`

List all files changed at end of response.

---

## COMMIT ORDER

```
feat(api): sales.js — unified earn aggregator + AR logic + cashflow injection
feat(m22): sales.injector.js — dynamic lanes, card/list view, overdue alerts
feat(m22): wire #panel-sales in index.html
fix(categories): remove/deactivate legacy earn categories (Ploikong, Satu, Old stocks, Stock earn)
docs: update PROJECT_STATE and RULES after phase 9D
```

Branch: `feat/m22-sales`
Merge to `main` only after owner QA confirms:
- [ ] All business lanes appear correctly
- [ ] AR outstanding shows correctly
- [ ] Overdue cards show red + heartbeat
- [ ] Cashflow transaction injected and visible in M2.1
- [ ] Entry button opens EARN drawer
- [ ] Graph renders without overflow on both desktop and mobile
- [ ] Empty business lanes collapse gracefully
