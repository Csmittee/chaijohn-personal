# 📚 LESSONS LEARNED — Chaijohn Personal Diary (CPD)
> CC reads this at the start of every session. Never delete lessons — only add.
> Last updated: 2026-05-26
> Current highest lesson: L052

---

## HOW TO USE

- Every CC session starts with reading this file fresh from repo
- Lessons are referenced in CC prompts by ID (e.g. "follow L001, L016")
- Chat references lesson IDs instead of re-explaining rules
- New lessons are appended after every CC session with next available L-number
- Sequential L-numbers across entire project lifetime

---

## PHASE 0 — Initial Build

### L001 — Airtable multipleRecordLinks at table creation
**Problem:** Creating a table with `linkedTableId` in multipleRecordLinks options fails if you include `prefersSingleRecordLink` or `isReversed`.
**Rule:** When creating tables via Airtable API, use ONLY:
```js
{ type: 'multipleRecordLinks', options: { linkedTableId: id } }
```
Never add `prefersSingleRecordLink` or `isReversed` at table creation time.
**Tag:** #airtable #schema

### L002 — Airtable checkbox color values
**Problem:** Airtable Meta API rejects `'green'` or `'blue'` as checkbox colors.
**Rule:** Always use `'greenBright'` and `'blueBright'` (not `'green'`/`'blue'`).
**Tag:** #airtable #schema

### L003 — Schema seed timeout
**Problem:** Seeding 84 records one at a time (×250ms delay) = 21 seconds, hits Cloudflare Function timeout.
**Rule:** Always batch-create records: 10 records per POST to Airtable. Reduces API calls from 84 to ~9.
**Tag:** #airtable #performance #cloudflare

### L004 — Cloudflare Pages Functions shared helpers
**Problem:** Shared helper functions placed in various locations caused import path chaos.
**Rule:** All shared helpers go in `functions/_airtable.js`. Import using relative path one level up only: `import { ... } from '../_airtable.js'`. Do not nest helpers in subdirectories.
**Tag:** #cloudflare #architecture

---

## PHASE 1–4 — Dashboard + Diary Fixes

### L005 — Drop Zone approve button not saving
**Problem:** Approve button on Drop Zone cards was calling the wrong endpoint or missing record ID.
**Rule:** Approve flow: POST /api/dropzone/approve with `{queue_record_id, suggested_type, prefilled_data}`. The queue record `approved_record_id` field must be updated after the target record is created.
**Tag:** #dropzone #airtable

### L006 — Diary save destination logic
**Problem:** Risk of diary entries routing to wrong Airtable base.
**Rule:** ALL diary entries ALWAYS save to `chaijohn-core` Diary table regardless of type. ONLY when `publish_to_web=true` AND `entry_type=Blog`: ADDITIONALLY push a copy to `AIRTABLE_BUSINESS_BASE_ID` → Blogs table. Personal base never receives from business base.
**Tag:** #diary #airtable #architecture

### L007 — Diary preview overwrites content
**Problem:** Preview mode hid the textarea, making user think content was lost.
**Rule:** Render markdown preview in a separate div beside/below the textarea. Never replace the textarea. Edit/Preview toggle — Edit shows textarea, Preview shows rendered markdown.
**Tag:** #diary #ux

### L008 — Entry type options for Diary
**Problem:** "Finance note" was an entry_type but not useful. Missing "Project" and "Skill".
**Rule:** Diary entry_type options: Story / Idea / Blog / Project / Skill. Never include "Finance note".
**Tag:** #diary #airtable

### L009 — Connected Concept should be a remembered dropdown
**Problem:** Plain text input for connected_concept lost previous values.
**Rule:** Implement as combo input: fetch distinct `connected_concept` values from Diary table + preset global concepts. Show as dropdown suggestions while allowing new text values.
**Tag:** #diary #ux

---

## WORKFLOW UPGRADE — 2026-05-24

### L010 — Workflow: CC reads before writing
**Problem:** CC sessions started writing based on stale context, causing regressions.
**Rule:** CC MUST read `masterseed.md`, `lessons_learned.md`, and ALL relevant source files fresh from repo before writing any file. Never assume file contents match previous sessions.
**Tag:** #workflow #cc

### L011 — Workflow: complete files only
**Problem:** Patch-style edits caused CC to inadvertently delete surrounding logic.
**Rule:** CC writes COMPLETE replacement files — never patches, never diffs. Every file touched must be written in full and committed.
**Tag:** #workflow #cc

### L012 — Workflow: prompt archive discipline
**Problem:** Completed prompt files piling up in repo root — impossible to know what was pending vs done.
**Rule:** After executing any CC_PROMPT file: (1) move from root to `docs/prompts/`, (2) add `✅ COMPLETE — [date] — [summary]` at top, (3) update masterseed.md phase status, (4) append new lessons here.
**Tag:** #workflow #cc

### L013 — Project folder discipline (Chat side)
**Problem:** Project folder accumulating old versions, patched files, outdated context.
**Rule:** Project folder keeps ONLY: GitHub repo connection, CHAT_INTRO_TEMPLATE.md, WORKFLOW_SKILL.md, and the currently active CC_PROMPT file. Everything else lives in the repo.
**Tag:** #workflow #chat

### L014 — CC always creates a new branch — merge to main after every session
**Problem:** CC creates a new branch per session. Owner had to manually find and switch Cloudflare to the right branch.
**Rule:** Every CC_PROMPT must end with: "Commit directly to main. If a branch was created, merge it to main before ending the session." Chat must include this in every prompt it writes.
**Tag:** #workflow #cc #github

---

## FIX A + B — Liabilities + Budgets (2026-05-25)

### L015 — Cloudflare Pages nested routes coexist safely
**Problem:** Uncertainty whether `functions/api/dropzone.js` (file) could coexist with `functions/api/dropzone/` (directory).
**Rule:** Cloudflare Pages supports this: the file handles `/api/dropzone` directly, the directory handles `/api/dropzone/approve`, `/api/dropzone/[id]`, etc. No naming conflicts occur.
**Tag:** #cloudflare #architecture

---

## FIX C — Dashboard Budget Scale + Utilities YoY (2026-05-25)

### L016 — Chart.js v4 inline plugins
**Problem:** Needed to draw a "today" vertical dashed line on Chart.js without polluting global Chart registry.
**Rule:** Chart.js v4 accepts a top-level `plugins` array in the chart config for inline (unregistered) plugins. Use `afterDraw(chart)` to draw canvas overlays. Access canvas context via `chart.ctx`. Do not use `Chart.register()` for one-off per-chart plugins.
**Tag:** #chartjs #dashboard

---

## FIX D — Dropzone + Diary AI + Dashboard Forecast + Category + Budget (2026-05-25)

### L017 — Text file processing in Drop Zone
**Problem:** Drop Zone only accepted images — crashed on .txt and .md files.
**Rule:** Text/markdown files (.txt, .md) must skip Cloudinary upload entirely. Use FileReader.readAsText() → send `{text_content, filename, mime_type}` to /api/dropzone → Claude text classification path (no image_url). API normalises result to same shape so review card works identically for text and image items.
**Tag:** #dropzone #diary

### L018 — AI undo pattern in diary
**Problem:** AI assist replaced textarea content immediately with no way to recover original.
**Rule:** Do NOT immediately replace textarea content when AI returns a result. Show a comparison panel (Keep Original / Apply & Replace / Append). Store `aiPreviousContent` only after user clicks "Apply & Replace". Undo button restores that snapshot. Saves/new-entry clear both snapshot and panel.
**Tag:** #diary #ux #ai

### L019 — Alert dismissal with event delegation
**Problem:** Dynamically rendered alert chips with inline onclick handlers required global function access inside an IIFE — failed silently.
**Rule:** Use CSS class `.alert-dismiss` + `data-alert-id` attribute on dismiss buttons. Wire via `querySelectorAll('.alert-dismiss').forEach(b => b.addEventListener(...))` after each render call. Store dismissed IDs in a module-level `Set`.
**Tag:** #dashboard #alerts #js

### L020 — One-time budget visibility filter
**Problem:** One-time budgets showed in all months even when outside their active date range.
**Rule:** One-time budgets need explicit date-range filter on server. Use Airtable formula:
`AND({active}=TRUE(), OR({period}!="One-time", AND(OR({start_date}="",{start_date}<="TODAY"),OR({end_date}="",{end_date}>="TODAY"))))`
Pass via `?active_only=true` query param. Default (`?no param`) stays as simple `{active}=TRUE()`.
**Tag:** #budgets #airtable

### L021 — Airtable singleSelect group field rejects new values at record creation
**Problem:** Categories `group` field is a singleSelect with fixed seeded choices. Sending a new group value like "test" returns error 422 INVALID_MULTIPLE_CHOICE_OPTIONS.
**Rule:** Before creating a category record with a new group value, call Airtable Meta API to add the new choice to the field's options first:
`PATCH https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables/{TABLE_ID}/fields/{FIELD_ID}`
Body: `{ options: { choices: [...existing, { name: newGroupName }] } }`
Fetch field ID from Meta API — do not hardcode. Then create the record.
**Tag:** #airtable #categories #meta-api

### L022 — Category vs Group UX naming mismatch
**Problem:** Owner calls "Family", "Car", "Personal" a "category" but in Airtable schema these are stored in the `group` field. The individual items (Coffee, Fuel) are stored as `name`. This caused UI confusion.
**Rule:** In ALL UI labels: call the `group` field "Category" and call the `name` field "Item Name" or "Expense Name". Never expose Airtable field names in the UI. Tooltips and placeholders must use owner's language.
**Tag:** #ux #categories

---

## FIX E — Category + Liability Cashflow + Dashboard Overhaul (2026-05-24)

### L023 — Liability cashflow direction
**Problem:** Creating a new liability was triggering a negative (cash-out) transaction, or no transaction at all. Paying a loan also created no matching transaction. Cashflow chart was factually wrong.
**Rule:** Loan received = cash IN → create `type: 'Income'` transaction. Loan payment = cash OUT → create `type: 'Expense'` transaction. Both use category with `type='Loan'` from Categories table. Both are non-fatal (wrapped in try/catch) so primary Liabilities operation never fails due to tx creation.
**Tag:** #liabilities #cashflow #transactions

### L024 — Cloudflare KV for lightweight app-state sync
**Problem:** Needed a persistent "starting balance" anchor for the cashflow chart without creating a new Airtable table for a single value.
**Rule:** Cloudflare KV (`CHAIJOHN_KV`) is ideal for small app-state values (a single JSON object). Use `env.CHAIJOHN_KV.get/put('cashflow_sync')` in a dedicated `functions/api/cashflow-sync.js` endpoint (GET + POST). No Airtable table needed for single-record state.
**Tag:** #kv #cloudflare #architecture

### L025 — Chart.js multi-mode view toggle pattern
**Problem:** T1 chart needed two mutually exclusive render modes (netflow vs in-vs-out) sharing the same canvas and data.
**Rule:** Store view mode in a module-level state variable (`let t1ViewMode = 'netflow'`). The render function checks the mode and branches: `if (t1ViewMode === 'invsout') { ... } else { ... }`. Toggle buttons set the state then call `renderT1()`. Destroy/recreate chart on each render (standard Chart.js pattern). Never inline mode logic in the toggle handler.
**Tag:** #chartjs #dashboard #ux

### L026 — Budget meter period normalisation
**Problem:** Annual budgets (e.g. ฿300,000 travel) shown in a monthly view made all monthly items look negligible (tiny bars) and caused visual distortion.
**Rule:** For monthly display: `if period === 'Annual' → use amount ÷ 12`. Show badge "Annual" next to label so user knows it's a derived figure. One-time budgets only show if today falls within `start_date`–`end_date`. Filter toggle (All/Monthly/Annual/One-time) lets user isolate categories relevant to their current review.
**Tag:** #budgets #dashboard #ux


---

## FIX F — Bugfixes + Dashboard Structure Overhaul (2026-05-25)

### L027 — Airtable singleSelect PATCH must send only `{name}` for existing choices
**Problem:** When `ensureGroupChoice()` patched the `group` singleSelect field, it mapped existing choices as `{ id, name, color }`. If any existing choice had no color, Airtable returned 422 Unprocessable Entity — rejected the entire PATCH even though the new choice was valid.
**Rule:** When PATCHing a singleSelect/multipleSelect field's choices via Airtable Meta API, always map existing choices to `{ name: c.name }` only — never include `id` or `color`. Airtable infers the rest. Including undefined fields causes 422.
**Tag:** #airtable #meta-api #categories

### L028 — Airtable `active` field can return numeric 0 (not boolean false)
**Problem:** Budget meter filter used `b.active !== false` to exclude inactive budgets. Airtable sometimes returns `active: 0` (numeric) for unchecked checkbox fields. The filter passed numeric 0 as truthy, showing inactive budgets in the meters.
**Rule:** Always guard Airtable boolean fields with both `!== false && !== 0`. Defensive form: `b.active !== false && b.active !== 0`. Alternatively: `Boolean(b.active)`.
**Tag:** #airtable #budgets #filters

### L029 — Debts table uses different field names than Liabilities table
**Problem:** Both tables track loans but use different field names: Liabilities uses `name` + `loan_size`; Debts uses `creditor_name` + `original_amount`. The F2 Income-tx creation for new debts had to use the Debts field names, not Liabilities field names.
**Rule:** When extending cashflow logic to a second "liability-like" table, always re-read that table's actual field names from source before writing. Do not assume they match a sibling table.
**Tag:** #debts #liabilities #airtable

### L030 — Dashboard content zone pattern: active panel drives dynamic content
**Problem:** The old dashboard used a fixed 4-panel CSS grid that showed all panels simultaneously. This cramped every chart and made the page non-scalable for adding new content types.
**Rule:** New pattern — two zones: (1) GRAPH ZONE: horizontal-scroll flex row of fixed-width chart panels (380 px, `flex-shrink: 0`). Clicking a panel sets it `.active` (blue border). (2) CONTENT ZONE: `#content-controls` + `#content-body` re-rendered by JS on every panel switch. Content controls include period toggle (T1/T2), year selector (T3/T4), filter chips, and modal trigger buttons. Each panel gets its own `renderT#Content(body)` function. `loadContentZone(panelId)` is called from `activatePanel()` and from `loadAll()` (using current `activePanel`). This decouples chart rendering from tabular/card content rendering and keeps each function focused.
**Tag:** #dashboard #architecture #ux

### L031 — Airtable linked record field migration: always add, never replace
**Problem:** The Transactions table originally linked directly to Categories via `category_id`. When the new `budget_id` field (linking to Budgets) was introduced, the old `category_id` field had to stay in Airtable because (a) old records already have it set, and (b) Airtable linked record fields can't be renamed without breaking API access.
**Rule:** When adding a new link field to an Airtable table, KEEP the old link field forever. Mark the old field as legacy in code comments and masterseed. Read the old field for display of legacy records. Never write to it again for new records. The new field is the source of truth going forward. Booking rules: Expense → budget_id required; Earn → category_id optional; LiabilityPayment → neither field needed.
**Tag:** #airtable #data-model #migration

### L032 — Resolve category via budget, not directly from transaction
**Problem:** After introducing `budget_id`, expense transactions no longer have `category_id` set. Any code that did `linkedId(t.category_id)` for expense grouping would return null, breaking T2 Pareto, budget meters, alert chips, and cash simulation.
**Rule:** For expense transaction grouping by category, always use `resolveCatId(t)`: resolve via `budget_id → Budget.category_id` first, fall back to `t.category_id` for legacy records only. Add `budgetMap` as a module-level variable populated immediately after `budgets` is fetched in `loadAll()`. The resolution chain is: `Transaction.budget_id → budgetMap[bid].category_id → catMap[catId]`.
**Tag:** #dashboard #data-model #budget

### L033 — Unbudgeted transaction detection must check budget_id first
**Problem:** After G3, new expense transactions have `budget_id` set but `category_id` is null. The old "unbudgeted" detection filtered by checking if `linkedId(t.category_id)` was in the set of budgeted category IDs — this caused ALL new expense transactions to appear as unbudgeted since their `category_id` is null.
**Rule:** Unbudgeted detection must check `budget_id` first: if `linkedId(t.budget_id)` is truthy, the transaction IS budgeted — skip it from the unbudgeted list immediately before any category lookup. Only apply legacy category-ID-based unbudgeted detection for records that have no `budget_id`.
**Tag:** #entry #budgets #bug-prevention

### L034 — API server-side enrichment: merge fields before returning
**Problem:** Frontend was making multiple fetch calls (transactions + budgets + categories) and joining them client-side. As the data model got more complex (transaction → budget → category), client-side joining became brittle and hard to maintain.
**Rule:** Enrich at the API layer. GET /api/transactions now returns `budget_label`, `category_name`, `category_group` merged into each record's fields (resolved via budget chain). GET /api/budgets returns `category_name`, `category_group`, `category_type` from linked Category. Use `Promise.allSettled` for parallel enrichment fetches so one failure doesn't break the whole response. Skip enrichment entirely (early return) if no records have any link fields — avoids unnecessary API calls.
**Tag:** #api #airtable #performance #architecture

### L035 — Airtable single-select PATCH requires existing choice IDs
**Problem:** The `ensureGroupChoice` Meta API function sent choices as `{ name: c.name }` only. Airtable's field PATCH rejects this because existing choices must include their `id` field — otherwise Airtable cannot match them and treats them as new duplicates or rejects the update entirely.
**Rule:** When PATCHing an Airtable single-select field via the Meta API to add new choices, always include `{ id: c.id, name: c.name }` for ALL existing choices. Only new choices (being added) omit the `id`. The Meta API requires `schema.bases:write` scope on the token.
**Tag:** #airtable #meta-api #bug-prevention

### L036 — New liability must default current_balance to loan_size
**Problem:** When creating a liability, if `current_balance` is not explicitly provided, Airtable defaults it to 0. The UI calculated: `(loan_size - 0) / loan_size = 100%` paid off — a brand-new loan with no payments showed "Fully paid" immediately.
**Rule:** In the liabilities POST handler, always set `current_balance`. If not provided in the body, default it to `loan_size`. A new loan starts 100% outstanding, not 100% paid. `current_balance` should only be 0 after all payments are made.
**Tag:** #liabilities #bug-prevention #api

### L037 — Category name uniqueness must be enforced at API level
**Problem:** No duplicate check on category name allowed identical records to be created (e.g. "Dog food" created twice). Frontend has no mechanism to prevent this — only the API can enforce it.
**Rule:** POST /api/categories checks for existing records with the same name (case-insensitive, using Airtable formula `LOWER({name})="..."`) before creating. Returns 400 if duplicate found. UI shows inline error without clearing the form so the user can correct.
**Tag:** #categories #validation #api

---

## PHASE 9a — Sidebar Shell (2026-05-26)

### L040 — Sidebar always-dark: lock CSS tokens on #sidebar element
**Problem:** Light mode flips `--text`, `--text-dim`, `--text-muted`, `--border` to dark-on-light values. The sidebar background is intentionally kept dark (`--sidebar-bg: #0a0a10`), so light-mode text tokens (dark text on dark background) make all sidebar labels invisible.
**Rule:** When a UI region is intentionally always-dark regardless of theme, re-declare the dark-mode token values directly on that element's ID/class selector. Example: `#sidebar { --text: #e8e8f0; --text-dim: rgba(232,232,240,0.45); ... }`. This overrides any `[data-theme="light"]` cascade without touching the sidebar's structural CSS. Never use hardcoded color values inside sidebar rules — always use tokens so this single override is sufficient.
**Tag:** #shell #theme #css-tokens #ux

### L039 — Sidebar shell auth: overlay + /api/auth/check bypass
**Problem:** New `index.html` is both the login page AND the app shell. auth.js was designed for a redirect pattern (login page → dashboard.html). Reusing it wholesale would cause a redirect loop.
**Rule:** For the sidebar shell pattern, handle auth inline. Show a full-screen overlay by default. On DOM load, call `GET /api/auth/check` — if 200, call `revealShell()` immediately to bypass the PIN overlay. If not, wait for form submit → `POST /api/auth/verify`. `revealShell()` hides the overlay and calls `navigate(hash || 'dashboard')`. Do NOT load auth.js on this page — the inline script handles the full auth lifecycle.
**Tag:** #auth #shell #architecture

---

### L043 — Entry drawer: embed full form HTML in shell, not a separate page
**Problem:** The old entry.html was a standalone page. The new shell needs a centralized, context-aware entry panel that responds to which M2 panel is active.
**Rule:** Embed the complete entry form HTML (all 4 tabs: transactions, utilities, liabilities, budgets) inside a fixed-right drawer div (`#entry-drawer`). The entry.injector.js initializes on DOMContentLoaded and binds to IDs — since they're always in the DOM, no changes to the injector are needed. Context-awareness: `PANEL_TAB_MAP` in the shell JS maps routes to tab names; `navigate()` calls `switchEntryTab()` when the drawer is open. The Entry nav item triggers `toggleDrawer()` instead of routing. Pin = `margin-right` on `#main` + no-close behaviour. Always define `--nav-height: 0px` in the shell tokens so sticky form card positions correctly inside the drawer scroll container.
**Tag:** #shell #entry #drawer #architecture

### L042 — CSS compat bridge for old injectors in new shell
**Problem:** collection.injector.js, ai.injector.js, and entry.injector.js rely on CSS classes from global.css (`.btn`, `.form-group`, `.form-row`, `.card`, `.tabs`, `.tab-btn`, `.tab-panel`, `.period-toggle`, `.period-btn`, `.section-header`, `.section-title`, `.modal-backdrop`, `.modal`, `.fab-btn`). The new shell doesn't import global.css (conflicting variable names and body reset).
**Rule:** Add a "compat bridge" CSS block inside the shell `<style>` that: (1) maps `--text-primary`, `--text-secondary`, `--bg-page`, `--color-income`, `--color-expense`, `--color-primary`, `--success`, `--nav-height` to shell token equivalents via `var(--xxx)`, and (2) redefines all utility classes used by injectors using the shell's own tokens. This keeps the shell self-contained without importing global.css. Never add `[data-theme="light"]` overrides inside the compat section — token aliasing handles it automatically.
**Tag:** #css #shell #compat #injectors

### L041 — Per-panel IIFE injectors: lazy init via panelactivated event
**Problem:** Panels with Chart.js charts render with zero dimensions when the panel is `display:none` at DOMContentLoaded. Initializing all charts on page load wastes API calls and causes render bugs.
**Rule:** Each M2 panel gets its own IIFE injector file (cashflow.injector.js, expenses.injector.js, liabilities-panel.injector.js, budget-panel.injector.js, dash-overview.injector.js). Each IIFE uses an `initialized` flag and only runs `loadAndRender()` on first panel activation. Listen for `window.dispatchEvent(new CustomEvent('panelactivated', { detail: route }))` dispatched by `navigate()`. Also listen for `DOMContentLoaded` to handle direct hash navigation to that panel. Pattern: `window.addEventListener('panelactivated', e => { if (e.detail === 'xxx') init(); })`.
**Tag:** #shell #charts #lazy-init #panelactivated

---

## FIX 9B2 — Module QA Fixes (2026-05-26)

### L044 — CSS class name matters for toggle groups
**Problem:** cashflow.injector.js `initRangeToggle()` queried `.period-btn` to deactivate buttons, but the cashflow HTML uses `.range-btn`. Clicking any period button appeared to work (active class applied to clicked button) but never deactivated the previous active button — multiple buttons could appear active simultaneously.
**Rule:** Before writing any toggle group logic, check the exact CSS class on the HTML buttons. `.period-btn` and `.range-btn` are different classes with different styles. Use `querySelectorAll('.range-btn')` or `querySelectorAll('.period-btn')` matching what the HTML actually uses. The rule: query the buttons via the class attribute, not by a sibling class.
**Tag:** #css #toggle #cashflow

### L045 — deferred script init: immediate active-panel check, not DOMContentLoaded
**Problem:** Panel injectors registered `DOMContentLoaded` listeners. But the shell's inline `<script>` also registers DOMContentLoaded callbacks and dispatches `panelactivated` from there — which fires BEFORE deferred scripts' DOMContentLoaded callbacks run (callbacks execute in registration order).
**Rule:** In deferred panel injector IIFEs, replace `document.addEventListener('DOMContentLoaded', ...)` with TWO things: (1) `window.addEventListener('panelactivated', e => { if (e.detail === 'xxx') init(); })` — for future panel navigations; and (2) `if (el('panel-xxx')?.classList.contains('active')) init()` — executed immediately at IIFE parse time (after DOMContentLoaded, so `.active` class is already set). The second check handles direct hash navigation.
**Tag:** #shell #timing #panelactivated

### L046 — CSS min-width:0 on grid children prevents Chart.js overflow
**Problem:** Charts inside a CSS grid container overflowed their column width. Chart.js sets canvas dimensions based on the container's computed width, but grid columns allow children to grow beyond their track size by default (min-width is 'auto').
**Rule:** Add `min-width: 0` to all direct grid children that contain charts. For `.panel-charts`: `.panel-charts > * { min-width: 0; }`. This forces the grid column to respect its defined width, allowing Chart.js `responsive: true` to correctly measure the container.
**Tag:** #css #charts #responsive #grid

### L047 — Collapse-with-summary pattern for dense UI sections
**Problem:** Entry utility drawer showed a full 12-month history table + 2 charts + 4 YoY charts as always-visible. This occupied most of the drawer, pushing the entry form far below the fold.
**Rule:** For large data-history sections in a drawer/panel: (1) default to collapsed (`display:none` on body div); (2) always show a one-line summary of the most recent record above the toggle button; (3) chevron text "▶ Show history" / "▲ Hide history" communicates collapsed state; (4) guard the toggle listener with `_utilToggleInit` flag to prevent double-binding if `loadUtilityHistory()` is called multiple times (e.g. after save).
**Tag:** #ux #drawer #collapse

---

## FIX 9B3 — Section Bands, Proportional Cards, Entry FAB (2026-05-26)

### L048 — Section band pattern for grouped card views
**Problem:** User wanted "left tab zoning" for grouped card lists (liability types, expense groups, cashflow directions). Multi-column card grids with no visual grouping make it impossible to scan categories.
**Rule:** Add a full-width `.section-band` header before each group's card grid. HTML structure: `<div class="section-band">GROUP NAME</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.75rem;margin-bottom:1rem">...cards...</div>`. The `.section-band` CSS uses `background: rgba(255,255,255,0.04); border-left: 3px solid var(--accent); padding: 0.35rem 0.75rem; font-size: 0.7rem; font-weight:600; letter-spacing:0.08em; color: var(--text-dim); text-transform:uppercase`. Color can be overridden inline for semantic sections (green=cash-in, red=cash-out).
**Tag:** #shell #cards #ux #css

### L049 — Proportional card height via sqrt scaling
**Problem:** Using raw amount / maxAmount for card heights produces extreme aspect ratios — the largest card is enormous while small cards are invisible.
**Rule:** Use `Math.max(72, Math.sqrt(amount / maxAmount) * 160)` px as the card `min-height`. The sqrt function compresses the range: a card worth 10% of max gets `√0.1 × 160 = 50.6 → 72px` (floor), while max gets 160px. This gives visible proportionality without extreme sizing. Use 72px floor and 160px ceiling consistently across cashflow, expenses, and liabilities card views.
**Tag:** #cards #ux #chartjs

### L050 — Chart.js single-data-point: use bar not line
**Problem:** A line chart with only one data point renders as a single dot — no line, no fill, looks broken. This happens in the expenses trend when "Current Month" is selected (only one month label).
**Rule:** Check `const isSingle = months === 1` before creating the trend chart. When `isSingle`, use `type: 'bar'` with `borderRadius: 4`, `backgroundColor: '#ef4444'`, `borderWidth: 0`. When `!isSingle`, use `type: 'line'` with `fill: true`, `borderWidth: 2`. The `data`, `labels`, and `scales` options work identically for both types.
**Tag:** #chartjs #expenses #ux

### L051 — Entry FAB: position:fixed for cross-panel access
**Problem:** The entry toggle button was inside the nav sidebar, making it feel like a navigation item rather than a quick-action tool. Users had to return to nav to open the entry drawer.
**Rule:** Place the entry FAB (`#entry-fab`) as `position:fixed; top:0.7rem; right:1rem; z-index:400` directly inside `<body>`. This makes it overlay every panel without being part of the sidebar nav. Use a compact yellow `⊕ Entry` button style matching the brand accent. Wire to the same `toggleDrawer()` function — no change to drawer logic needed.
**Tag:** #shell #entry #ux #css

### L052 — Frosted glass for overlay panels
**Problem:** The entry drawer had a solid `var(--bg-raised)` background — felt heavy and covered all context behind it.
**Rule:** For side drawers / overlay panels, use semi-transparent frosted glass: `background: rgba(12,12,20,0.88); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px)`. The rgba matches the dark shell background (`--bg-base: #0c0c14`) at 88% opacity. The blur creates depth without obscuring the content underneath. Always include the `-webkit-` prefix for Safari support.
**Tag:** #css #shell #ux #drawer

### L053 — Budget panel: computeMaps() helper avoids data re-fetch on filter toggle
**Problem:** View/period filter toggles on the budget panel (actual/budget/gap, this-month/12mo-avg) need to re-render the grid with different data slices. Naively re-fetching 12 months of data on every toggle click would be slow and wastes API calls.
**Rule:** Extract `computeMaps()` as a pure function that reads from already-loaded module-scope arrays (`txData`, `budgets`, `categories`, `liabilities`) and returns derived maps (spendMonth, earnMonth, spend12Avg, earn12Avg, activeDebt, debtMonthly). Toggle handlers call `computeMaps()` + `renderGrid(maps)` with no API calls. Only `loadAndRender()` actually fetches. This pattern works for any panel with multiple filter states over static loaded data.
**Tag:** #budget #performance #pattern

### L054 — Diary AI pane: scope `.ai-assist-type` queries to avoid cross-wiring
**Problem:** Adding an AI bottom pane with `.ai-assist-type` buttons alongside the existing modal's `.ai-assist-type` buttons caused all buttons (pane + modal) to share the same `querySelectorAll('.ai-assist-type')` handler — clicking any pane button triggered modal output.
**Rule:** When adding a second UI zone with the same button class, scope each querySelectorAll to its container: `document.querySelectorAll('#ai-assist-modal .ai-assist-type')` for modal buttons, `document.querySelectorAll('#ai-bottom-pane .ai-assist-type')` for pane buttons. Each group gets its own event handler and streams to its own output element. Never rely on document-level class queries when the same class appears in multiple independent UI regions.
**Tag:** #diary #ai #pattern

### L038 — Dashboard content zones: compact 2-col grid + proportional mosaic for T2
**Problem:** Dashboard content zones (T1-T4) were rendering as full-width stacked cards/rows — sparse and hard to scan when there are many items.
**Rule:** T1 (Cashflow) uses `.tx-mini-grid` 2-column mini cards — each transaction is a small pill-card with label, subtitle, and amount. T2 (Expense Intelligence) uses `.budget-mosaic` 2-column grid with `min-height` proportional to budget amount via sqrt scaling (`max(78, sqrt(amount/max) * 200)`px). Larger budgets are visually taller; all budgets remain readable with minimum height. T3 (Debt) uses `.liab-content-grid` 2-column grid — expandable history panels still work (grid rows auto-expand for the open card). T4 (Annual Plan) stays as table rows — numeric comparison data is best in tabular format.
**Tag:** #dashboard #ux #layout
