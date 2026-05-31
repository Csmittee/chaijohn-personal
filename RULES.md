# RULES.md — Chaijohn OS
> CC reads this before every task. One line per rule. Newest rules at TOP.
> Full context for each rule lives in lessons_learned.md (archive — human readable only).

---

## COLLECTION PANEL (gallery-sync)

L050  Gallery hover: inject FAB CSS via `<style>` tag in init (not index.html) — clear FAB inner nodes so ::before provides the + unambiguously; attach gallery arrows via addEventListener not inline onclick
L050b Filter bar sync button: find parent via `statusBtns[0].parentElement`, set display:flex on parent, use margin-left:auto on sync button for far-right alignment
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
L010  Read before write: read masterseed/CLAUDE.md + RULES.md + ALL relevant source files fresh before writing anything
