# RULES.md — Chaijohn OS
> CC reads this before every task. One line per rule. Newest rules at TOP.
> Full context for each rule lives in lessons_learned.md (archive — human readable only).

---

## SALES PANEL (9D — M2.2)

L060  Sales lanes are DYNAMIC: fetch all Categories WHERE type='Earn', group by fixed_variable field value — 'Bus-earn' → Active Business section, 'Per-earn' → Personal section. NEVER hardcode BUS01/BUS02/BUS04 or any lane name in code.
L060b Business Airtable registry: read Business ID table (appMBjlfYyVd8I7ML) — all records with Status=Active define valid business lanes. New business added there = new lane appears automatically with zero code change.
L060c Sales data sources — 3 streams, unified by API: (1) Business Airtable Sale_record table (multi-payment invoices, grouped by quote_id); (2) chaijohn-core Assets WHERE status='Sold' (personal asset sales); (3) chaijohn-core Transactions WHERE type='Earn' AND source='M2.2' (manual entries)
L060d Project revenue in Sales: Projects WHERE sales_forecast_sent=true AND type='Active' appear under Projects section as expected recurring income. When project matures and gets a Business ID in Business Airtable, remove from Projects section — it now has its own Business lane.
L060e AR definition: invoice is AR when sale_date <= today AND invoice_total > SUM(actual_sale payments for that quote_id). Overdue = AR AND due_date < today → card shows RED frame + heartbeat. Not yet overdue = AR AND due_date >= today → amber badge.
L060f Sales cashflow injection: every confirmed payment (actual_sale with date) must auto-create or update a Transaction in chaijohn-core (type=Earn, source='M2.2', category from matching Bus-earn category). This is the bridge between M2.2 and M2.1 — no double entry by owner.
L060g Entry button in Sales panel opens existing entry drawer pre-set to EARN tab — do NOT build a separate sale form. Income Source dropdown already provides the categorisation. Sales panel reads the result back via Transactions API.
L060h Income Source dropdown is dynamic: fetch Categories WHERE type='Earn', group by fixed_variable. Bus-earn group shows active businesses + any Project WHERE sales_forecast_sent=true. Remove Ploikong, Satu, Old stocks sale, Stock earn — these are incorrect legacy seeds.
L060i Sales UI scroll rule: summary bubbles + graph zone are STICKY (position:sticky, top:0) — only the body lanes section scrolls. Never overflow:hidden on graph containers. All Chart.js instances use responsive:true, maintainAspectRatio:false with explicit container height.
L060j Pareto in Sales: shown as vertical bar on right of graph zone. When filter = All businesses → pareto shows revenue by business. When filter = single business → pareto shows top products/services for that business (from Sale_record Product Name field).

---

## LIABILITIES (debt structure — future balance sheet prep)

L059  Liability payment split: every payment has interest_portion + principal_portion. Only principal_portion reduces current_balance. interest_portion is recorded as Expense transaction (category: loan interest). Current system books full payment amount — this is a known limitation to fix when Liability_Payments table is extended.
L059b Balance sheet foundation (M1.1 — future): Net Worth = Total Assets (estimated_value from Assets table + Hard Assets) − Total Liabilities (current_balance from Liabilities). Do not build yet — document the formula so CC never designs anything that conflicts with it.

---

## PROJECTS MODULE (9C)

L054  Projects: schema-projects.js must be called once by owner (POST /api/setup/schema-projects) before the panel works — it creates 5 Airtable tables in two phases (tables first, linked-record fields second)
L054b Projects: when a project is created, auto-create 5 phases (DS/PT/PD/PV/LA), 4 exit milestones (FTS/PI/PL/PX), and seed tasks + resources for the detected type
L054c Projects: when a task status→Done, check if ALL tasks in the same phase are Done — if so, auto-set phase status=Complete and milestone status=Reached with auto_date=today
L054d Projects: depends_on_project_id is a linked-record field to Projects (cross-project dependency) — dependency_active=true blocks the dependent project; set to false when source project reaches 'Active'
L054e Projects: auto_date field on milestones is a formula-type field in Airtable — do not attempt to write it; it auto-calculates from phase completion. The API returns it read-only
L054f Projects: phase colors are fixed — DS=#3b82f6, PT=#8b5cf6, PD=#06b6d4, PV=#f59e0b, LA=#22c55e; do not invent new phases
L054g Projects: renderLaneView() uses a 12-week window from Monday of (today + weekOffset*7); phase bands are drawn as percentage spans across the lane; launch diamond marker is always shown
L054h Projects: openRedClearance(id) is the DEF CON equivalent for projects — shown when type=Active and health=critical; checklist must all be checked before "Mark resolved" unlocks
L054i Projects: AI inquiry (runAiInquiry) calls /api/ai-chat with a structured prompt; types: 'feasibility', 'tasks', 'extend' — extend takes duration_weeks param
L054j Projects: GET /api/projects returns enriched records with computed fields: total_tasks, delayed_tasks, pending_tasks, investment_total, days_to_launch — never compute these in the injector

---

## CASHFLOW PANEL (9B5)

L053  Cashflow: all card amounts must prorate via prorateAmount() — never use raw budget.amount for display or forecast
L053b Cashflow: buildForecast() is the single source of truth — never calculate running balance anywhere else
L053c Cashflow: 3 budget types — standard (daily burn fixed per calendar month), one-day-bound (lump on start_date), force-pay (lump on period_due_day each month)
L053d Cashflow: daily_burn = monthly_prorated / total_days_in_month (fixed rate) — NEVER divide by days remaining
L053e Cashflow: debt payments booked only on payment_due_day — no spreading, default 5th if missing
L053f DEF CON: checkFirewall() runs after every buildForecast() completion — never manually triggered
L053g DEF CON: exit test uses GROSS budget amounts (no intents, no on-hold) — honest test only
L053h Carry debt: budget backlog_type field — 'carry' accumulates as family debt, 'forgive' disappears; default 'forgive' if missing
L053i Simulation: state persists in CF module object — never localStorage; dies on panel nav or Reset
L053j Cashflow: active-strategy GET/POST uses KV key 'active_strategy' — not cashflow_sync

---

## COLLECTION PANEL (cache + pagination)

L052  Cache-first rendering: load ALL assets once into `allAssets`; filter/sort client-side with `renderFilteredGrid()` — never re-fetch for filter changes
L052b After add/edit/delete: update `allAssets` in memory from API response, call `renderFilteredGrid()` — never call `loadAssets()` after a mutation
L052c Airtable pagination: `listRecords` returns only 100 records per call — use `listAllRecords` (auto-follows `offset`) for tables that may exceed 100 rows
L052d KV cache for assets GET: store full unfiltered list in CHAIJOHN_KV with 5-min TTL; invalidate on every POST/PATCH/DELETE via `assets_all_v1` key
L052e Force-refresh trigger: pass `?refresh=1` to `/api/assets` to bypass KV cache (e.g. after cloudinary-sync import)

## COLLECTION PANEL (edit-gallery)

L051  Modal button IDs: HTML uses `save-asset-btn`, `asset-modal-cancel`, `confirm-sell`, `sell-cancel` — injector must bind these exact IDs; mismatches silently fail
L051b Delete button injection: `#delete-asset-btn` does not exist in index.html — inject via JS into `#asset-modal .flex.justify-between`, show/hide per add vs edit mode
L051c Summary bar IDs: collection strip uses `sum-holding`, `sum-forsale`, `sum-sold-ytd`, `sum-knife`, `sum-vice`, `sum-plant`, `sum-doll` — never guess IDs, always re-read HTML
L051d Sync button container: append to `#collection-filters` (the outer `.filter-bar`), NOT to `statusBtns[0].parentElement` which is the inner `.period-toggle`
L051e Edit modal pre-fill: `openEditAssetModal` must populate `asset-image-url` from `f.cloudinary_image_url`; `saveAsset` reads file upload first, falls back to URL text field

## COLLECTION PANEL (gallery-sync)

L050  Gallery hover: inject FAB CSS via `<style>` tag in init (not index.html) — clear FAB inner nodes so ::before provides the + unambiguously; attach gallery arrows via addEventListener not inline onclick
L050b Filter bar sync button: append to `#collection-filters` outer bar — see L051d
L050c Gallery multi-image: store allImages = [mainImage, ...galleryUrls]; parse cloudinary_gallery_urls as JSON; navigate with currentImageIndex closure per card

---

## CASHFLOW PANEL (9B4)

L049  Cashflow simulation: ghost line = original forecast (dashed), solid = simulated — never mutate original txData or stats for simulation; offset only
L048  Parallel fetch pattern for card view: budgets + liabilities + projects fetched simultaneously with Promise.allSettled — never block on one fetch
L048b cashflow-sync API uses `amount` field (not `balance`) — injector must send `{ amount, date }` on POST and read `syncPoint.amount` on GET
L048c Cut-button delegation: attach once in init() on the permanent zone element — never add per-render to avoid listener accumulation

---

## SHELL & PANELS (9A/9B/9B2)

L047  Collapse+summary pattern: default collapsed, show 1-line summary above toggle, guard with `_utilToggleInit` flag to prevent double-bind
L046  Chart.js in grid: add `min-width:0` to ALL direct grid children containing charts — prevents overflow beyond column
L045  Panel injector init: TWO checks — (1) `panelactivated` listener for future nav, (2) immediate `if panel.classList.contains('active')` at IIFE parse time for direct hash nav
L044  Toggle groups: query buttons by their EXACT CSS class — `.range-btn` and `.period-btn` are different; check HTML before writing toggle logic
L043  Entry drawer: embed full form HTML in shell — entry.injector.js binds by ID, always in DOM, no changes needed; `--nav-height:0px` in shell tokens
L042  CSS compat bridge: re-declare `.btn .card .tabs .tab-btn .period-toggle .modal` etc inside shell `<style>` using shell tokens — do not import global.css
L041  Per-panel IIFE injectors: lazy init via `panelactivated` event — never init charts when panel is `display:none`
L040  Sidebar always-dark: re-declare dark token values on `#sidebar` directly — never hardcode colors, use token override
L039  Sidebar shell auth: inline script handles full auth lifecycle — do NOT load auth.js; call `/api/auth/check` on load, show overlay by default

## DATA MODEL

L038  Dashboard zones: T1=2-col mini tx cards, T2=mosaic grid height∝sqrt(amount), T3=2-col grid expandable, T4=table rows
L035  Airtable singleSelect PATCH: existing choices MUST include `{id, name}` — omitting id causes duplicates or rejection
L034  Enrich at API layer: GET /api/transactions returns budget_label+category_name merged — never join client-side
L033  Unbudgeted detection: check `budget_id` first — if truthy, transaction IS budgeted; legacy category_id fallback only
L032  Resolve category via budget: `resolveCatId(t)` → budget_id→Budget.category_id→catMap. Never direct t.category_id for expenses
L031  Linked record migration: keep old field forever, never replace — mark legacy in comments, only new field gets new writes
L029  Debts ≠ Liabilities field names: Debts uses `creditor_name`+`original_amount`; Liabilities uses `name`+`loan_size` — always re-read schema

## AIRTABLE API

L036  New liability: always set `current_balance = loan_size` on create — Airtable defaults to 0 (shows "fully paid" immediately)
L028  Airtable boolean fields: guard with `!== false && !== 0` — checkbox can return numeric 0 not boolean false
L027  singleSelect PATCH choices: map existing as `{name:c.name}` ONLY — never include id or color, causes 422
L021  New singleSelect value: call Airtable Meta API to add choice BEFORE creating record — 422 if value not in field options
L003  Batch creates: 10 records per POST — never one-by-one (timeout risk on Cloudflare Functions)
L002  Airtable checkbox colors: always `greenBright`/`blueBright` — never `green`/`blue`
L001  Airtable multipleRecordLinks: use ONLY `{linkedTableId:id}` at table creation — never add `prefersSingleRecordLink` or `isReversed`

## BUDGET & CATEGORIES

L037  Category uniqueness: POST /api/categories checks case-insensitive name match before create — returns 400 if duplicate
L026  Budget period normalisation: Annual÷12 for monthly display, show "Annual" badge — One-time only if today within start_date–end_date
L022  UI naming: call `group` field "Category", call `name` field "Item Name" — never expose Airtable field names in UI
L020  One-time budget filter: use Airtable formula with date-range AND period check — pass `?active_only=true`

## LIABILITIES & CASHFLOW

L023  Liability cashflow direction: loan received=Income tx, loan payment=Expense tx — both non-fatal (try/catch)

## CHARTS

L025  Chart.js view toggle: store mode in module-level var, render function branches on mode, destroy/recreate chart each render
L016  Chart.js v4 inline plugins: use top-level `plugins:[]` array in config — do NOT use `Chart.register()` for one-off plugins

## CLOUDFLARE

L024  KV for app-state: use `CHAIJOHN_KV.get/put` for single-value state — no Airtable table needed for a single JSON object
L015  Nested routes safe: `functions/api/dropzone.js` coexists with `functions/api/dropzone/approve.js` — no conflict

## DIARY & DROPZONE

L018  AI undo: never replace textarea immediately — show comparison panel (Keep/Apply/Append), store snapshot only after Apply
L017  Text files in Drop Zone: skip Cloudinary, use FileReader.readAsText() → send text_content to /api/dropzone → same review card shape
L006  Diary save: ALL entries → chaijohn-core Diary table. ONLY Blog+publish_to_web=true → ALSO push to business base Blogs table

## WORKFLOW

L014  CC ends every session: merge branch to main, verify Cloudflare production URL updated
L012  Prompt archive: move CC_PROMPT file to docs/prompts/, stamp ✅ COMPLETE + date + summary at top
L011  Complete files only: never patches, never diffs — full replacement always
L010  Read before write: read CLAUDE.md + RULES.md + PROJECT_STATE.md + ALL relevant source files fresh before writing anything
