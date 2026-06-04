# RULES.md — Chaijohn OS
> CC reads this before every task. One line per rule. Newest rules at TOP.
> Full context for each rule lives in lessons_learned.md (archive — human readable only).

---

L145  P&L Generator wireResizer(): sidebar resizer wiring must be extracted as a module-level
      function and called after EVERY p.innerHTML = renderPanel() replacement — in init(),
      loadProjectModel(), resetForm(), and archive load handler. Inline wiring in init() only
      does NOT survive re-renders. The #plg-resizer element is replaced each time.

L144  P&L 5yr chart: aggregate monthly pl[] into 5 yearly totals before rendering.
      Show 5 bars Y1–Y5. Never pass raw 60-month array to chart in 5yr mode.

L143  P&L Generator — canonical 4-margin table structure (never change order):
      Revenue → [variable costs indented: mat, labor, freight, other] → Variable cost margin →
      [semi-fixed, fixed indented] → Gross profit →
      [SG&A, depreciation indented] → EBITDA →
      [interest, tax indented] → Net profit →
      [% rows: variable cost margin%, gross margin%, EBITDA%, net margin%]
      Variable cost margin = Revenue − mat − labor − freight − var items
      Gross profit = Variable cost margin − semi-fixed − fixed costs
      EBITDA = Gross profit − SG&A − depreciation
      Net profit = EBITDA − interest − tax

L142  P&L Generator period toggle (12mo/5yr): use rebuildOutputHeader() after _activePeriod changes.
      Same rule as L136 — active state lives in module var, button styles reconstructed from it.
      Never rely on post-click querySelectorAll style patches alone; they fail when DOM is rebuilt.

L141  P&L Generator Revenue tab: all revenue input values (units_mo, sale_price, revenue_mo,
      probability, growth_mode, start_period, input_mode) must be mirrored into _revInputs module
      var on every input/change event. getInputs() reads _revInputs when DOM element is absent
      (Revenue tab not active). Never rely on DOM-only state for save.

L136  P&L injector re-render pattern: any p.innerHTML = renderPanel() wipe will reset dynamic DOM state
      (active tab styles, subtitle color, etc.). Store all dynamic state in module-level vars and read
      them inside renderPanel() to reconstruct correct HTML on every re-render. Never rely on post-render
      DOM patches for values that survive a full re-render.

L135  P&L Generator KV storage — one model per project: Key = pl-generator:proj_{projectId} (overwrite on Save).
      Selecting a project in dropdown auto-loads KV model for that project if exists.
      No project selected: versioned key pl-generator:{timestamp}. PDF/ODS never save to KV — export only.
      R2 not configured — KV only for all P&L storage.

L134  P&L Generator panel ID is panel-pl-generator, route is pl-generator (confirmed after fix/pl-generator-core).
      Injector panelactivated listener must use e.detail === 'pl-generator'.
      panel() function must return document.getElementById('panel-pl-generator').

L133  Data entry inputs: NEVER use type="number". Always use type="text" inputmode="numeric" pattern="[0-9.]*".
      Browser spinners waste space and are never needed. User types values directly.
      Apply to all existing and future injectors. No exceptions unless explicitly specified.

---

## BATCH 6 FIXES — Cashflow reload + Sales Projects lane key

L109  Sales Projects lane presalesByProject map key = p.project_id (Airtable record ID from /api/sales response).
      The /api/sales projects array uses { project_id: r.id } not { id: r.id }. Never use p.id for project matching
      in the sales injector — it is always undefined.

L108  transactions GET must return project_id field in response. No fields[] whitelist is passed to listRecords —
      Airtable returns all fields including project_id. Do not add a fields filter that would exclude project_id.

L107  Cashflow M2.1 display must never filter by source or budget_id — show ALL transactions.
      The cashflow init() must call loadAndRender() on EVERY panelactivated event, not just on first init.
      One-time DOM setup (CSS injection, toggle bindings) stays inside the initialized guard;
      loadAndRender() is called unconditionally after the guard so fresh data is fetched every navigation.

---

## TRANSACTION MODEL (canonical — confirmed 2026-06-03)

L099  Transaction model is the single source of truth for all money flow. Never add complexity beyond this table.
L100  category_id on Transactions: NEVER write on new records. Read legacy records for display only. Silently ignore if sent in POST body.
L101  POST validation rule: budget_id required ONLY when type=Expense AND source=Manual (or source absent). All other sources bypass budget requirement.
L102  project_id on Transactions: plain text string (not array). Required for source=presale and source=project_funding.
L103  View filters by source: Expenses M2.3 = budget_id not empty. Projects lane M2.2 = source=presale. Asset Sales = source IN (collection, hard_asset_sale). Cashflow = everything.
L104  source field in Airtable Transactions is singleSelect. Do NOT attempt to patch options via Meta API — requires schema admin permission. Owner manages allowed values in Airtable UI.
L105  Presale POST body: {type:Income, source:presale, project_id, amount, date, entity, description}. Nothing else.
L106  Project funding POST body: {type:Expense, source:project_funding, project_id, amount, date, entity, description}. No budget_id, no category_id.

---

## BATCH 4 FIXES — Source routing, presale transactions, M3.3 delete

L098  M3.3 Hard Assets: each card must have a Delete button. Ghost records (blank name) show
      Delete-only (no Edit/Sell). Delete calls DELETE /api/hard-assets/:id (soft delete → status=Disposed).
      Client-side: confirm dialog, then filter allAssets in memory, call renderPanel().

L097  M2.2 Projects lane = presale transactions grouped by project_id. Fetch
      /api/transactions?source=presale&limit=500 separately; build presalesByProject map keyed by
      project_id. Do NOT show forecast cards. Only render projects that have at least one presale tx.

L096  Transactions source field is singleSelect in Airtable. New values (presale, cash_in, etc.)
      must be patched in via Meta API PATCH before first POST. Use patchSourceOptions() called once
      per cold start (module flag sourceFieldPatched). Budget_id is NOT required when
      source='LiabilityPayment' or source='project_funding'. Source='project_funding' is excluded
      from M2.3 Expense view via NOT({source}='project_funding') filter at GET time.

---

## P2 — Sale Origins, Hard Assets, Inline Presale

L091  Entry drawer is expense-only from P2 onwards. The EARN/EXPENSE toggle buttons are removed.
      Cash injections (savings top-ups, transfers in) use the separate Cash In tab (source='cash_in').
      Hard asset sales use the M3.3 Sell modal (source='hard_asset_sale'). Pre-sale transactions
      are created directly in the M2.4 Finance Projects inline form (source='presale').

L092  Hard asset sale transaction pattern: source='hard_asset_sale' + category_id from
      'Hard asset sale' category (Per-earn group, type=Earn). The category is fetched/created
      at M3.3 panel init and cached. Transaction also carries entity=soldTo and
      description='Hard asset sale — <name>'.

L093  Inline presale form in M2.4: The expanded project card now has a "+ Add presale" button
      that reveals an inline form. On save: POST /api/transactions with source='presale',
      project_id, category_id from cached 'Pre-sale' category. After save, reload only the
      presale list for that project — do NOT full re-render unless presale total changes.
      Both loadPresaleCategory() and loadAll() must be called at init.

L094  Lane view phase segments: renderLane() renders 5 equal-width phase segments (DS/PT/PD/PV/LA)
      across the timeline band. Done phases show 44% opacity fill, current phase shows 87% fill,
      future phases show ~7% fill. A today dot (6px red circle) is overlaid at current position.
      This requires NO extra API calls — uses p.current_phase from list data.

L095  Focus view task rows (F1): Each task row uses 4 columns — title (flex:1), date (90px right),
      assigned_to (70px center), status select (90px). The second line (assigned · date · measure)
      is removed. Measure is shown as a tooltip (title attribute) on the title div.

---

## HOTFIX M3.4 — Focus view / Phase names / Filter formula

L090  Edit drawer pre-fetches /api/projects/:id before opening — pre-fills drawerResources and
      drawerTasks from res.resources and res.tasks. Never open edit drawer with empty state arrays.
      Field mapping: resource {id,item,time_needed,cost,status}, task {id,title,finish_by,assigned_to,measure,phase_code}.

L089  Phase auto-create: name field MUST be set to "{projectName} — {phaseName}" (e.g. "Ploikong — Design").
      Blank name leaves the primary field empty — Airtable shows "Unnamed record" everywhere the
      phase appears as a linked record. Always populate `name` in the createRecord call.

L088  Airtable linked record filter formula: ARRAYJOIN({linkedField}) returns PRIMARY FIELD VALUES
      (e.g. project names), NOT record IDs. FIND('recXXX', ARRAYJOIN({project_id})) always returns 0.
      Correct pattern: fetch the parent record first to get its name, then filter child tables with
      ARRAYJOIN({project_id})='${projectName}'. The REST API (list/filter by record) still returns
      linked fields as ["recXXX"] arrays — linkedId() handles that correctly.

---

## QA BATCH 3 — M3.4 / M2.4 / M2.2 / M3.2

L087  Collection Sell must always set source='collection' + category_id on the Transaction POST.
      Never post a sale transaction with source='Manual' — it becomes unroutable in M2.2 and M2.1.
      The 'Collection sale' category_id must be fetched at init and cached in module scope.

L086  Transactions GET must explicitly include source and project_id in the fields array, OR omit
      fields[] entirely so Airtable returns all fields. If fields[] is passed, ensure source and
      project_id are listed or Airtable omits them from the response.

L085  M2.2 Projects lane = pipeline tracker only. Never show forecast revenue numbers (target_revenue_monthly).
      presale_total = real money confirmed (show it). Monthly target = planning only (never show in Sales).
      Revenue forecasts live in M2.4 Finance only.

L084  sales_forecast_sent and finance_opened are checkbox fields — must exist in Airtable before PATCH.
      The [id].js PATCH handler must call ensureCheckboxFields() via Meta API on first use.
      If fields are missing, Airtable returns NOT_FOUND / UNKNOWN_FIELD_NAME — create then retry.

---

## API RESPONSE SHAPES

L082  /api/projects returns { records: [] } where each record is ALREADY FLATTENED
({ id, name, type, ... }) — not raw Airtable { id, fields: {} } shape. Do NOT
re-spread r.fields on consumer side. Use `data.records || []` directly.
Any paginated Airtable endpoint wrapped in jsonResponse follows this shape.

L083  Always render section empty states — never hide entire sections when data
is empty. Owner needs to see the section exists even with no data. Use a clear
instructional empty state: "No X yet. To add: go to Y → do Z."

---

## PANEL INIT & DOM SCOPE

L078  panelactivated route guard: ALWAYS guard the panelactivated handler with
`if (e.detail !== 'route-name') return;` as the FIRST line. Never init or render
without this guard — causes content to bleed into every panel on navigation.
Guard already exists in all injectors — preserve it on every edit.

L079  Panel DOM scope: ALL innerHTML and style manipulation must use the specific
panel element from `getElementById('panel-xxx')`. Never set `panel.style.cssText`
with `display:flex/block` — this overrides the `.route-panel { display:none }` CSS
and makes the panel permanently visible. Instead, add `#panel-xxx.active { display:flex; }`
via ensureStyles() so visibility stays under class control.

L080  Active button text color: always set explicit `color:#0a0a10` when button
background is var(--yellow), white, or any light color. Never use `color:#000` or
`color:var(--text)` — the text variable is light on dark theme. Always use #0a0a10.

L081  var(--accent) is NOT defined in chaijohn-core theme — it resolves to nothing.
Use `var(--yellow)` (#f5c518) for all interactive highlights, active states, and
primary buttons. Never use var(--accent) in injector files.

---

## BUSINESS AIRTABLE (external base — appMBjlfYyVd8I7ML)

L072  403 from Airtable = table or field not found (not just permissions):
INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND fires when: (a) token lacks access,
OR (b) table name does not exist, OR (c) field name in formula does not exist.
Always check table and field names before concluding it is a permissions issue.
Token permissions for this project are confirmed full-scope — never re-investigate.

L073  Never swallow errors in biz data catch blocks: Always capture the
error message and include it in the API response:
  catch(err) { bizError = err.message; ... }
  return jsonResponse({ ..., biz_error: bizError });
Silent catch blocks make diagnosis impossible without code changes.

L074  Cloudflare Pages env var deployment: Retry-deployment reuses cached
build and does NOT pick up new env vars. New env vars require a fresh build
triggered by a new commit to main. Tell owner this explicitly when adding
new env vars.

L075  Business ID table — confirmed field names (appMBjlfYyVd8I7ML):
- Table: 'Business ID' (primary field also named 'Business ID')
- bus_id field: map as r.fields['Business ID'] first, then r.fields.bus_id
- Status: 'Status', values: 'Active' / 'Inactive'
- Business Name: 'Business Name'
- Brand name: 'Brand name'
- Tag line: 'Tag line'
- Business Type: 'Business Type'

L076  Sale record table — confirmed field names (appMBjlfYyVd8I7ML):
- Table name: 'Sale record' (space, NOT underscore 'Sale_record')
- Date field: 'Sale date' (space, capital S — NOT 'sale_date')
- Use in formula: {Sale date} — NOT {sale_date}
- Use in sort: { field: 'Sale date' } — NOT { field: 'sale_date' }
- Other confirmed fields: quote_id, invoice_no, business_id,
  customer_name, payment_stage, invoice_total, 'Formatted Sale Order',
  'Actual sale', 'Invoice no.', 'Product Name', 'Status'

L077  Schema-first rule for external Airtable bases: Before writing ANY
code that touches an external Airtable base (not chaijohn-core), call
the Meta API to read actual field names:
GET https://api.airtable.com/v0/meta/bases/{baseId}/tables
Verify EVERY field name used in filterByFormula, sort, and field mapping.
Never trust field names from CC prompt specs — they may be wrong.
One verification pass prevents 5 debug cycles.

---

## AIRTABLE TABLE CREATION

L071  Airtable primary field rule: the FIRST field in any new table definition MUST be type singleLineText. singleSelect, number, date, and checkbox are all rejected as primary field types. Always start every table definition with { name: 'name', type: 'singleLineText' }.

L110  category_id field permanently deleted from Transactions table on 2026-06-03.
      Never recreate it. Transaction model uses type + source + budget_id + project_id only.

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

L116  M3.4 focus view tasks: table layout with grid 56px|1fr|80px|110px. Phase badge in col 1.
      Collapsible per-phase sections with _taskSectionCollapsed[projId+'_'+pc] state.
      Filter buttons (All/DS/PT/PD/PV/LA) above tasks — _taskFilter module var, default 'all'.

L117  Phase auto-exit dates: computePhaseExits(tasks) — latest finish_by per phase_code + 3 days.
      Client-side display only in phase pills. Never write auto_date back to Airtable from injector.

L118  M2.4 payback display: < 12 months → "N mo payback", >= 12 months → "N.N yr payback", null → "—".
      Apply to both per-card payback AND avg payback strip bubble. Never show raw years when < 1yr.

L119  AI "Generate tasks" prompt must request JSON array ONLY — no markdown, no explanation.
      Parse with try/catch. Strip ```json``` fences before parsing. On success show "Add N tasks"
      button that POSTs each task to /api/project-tasks. On parse fail fall back to pre-wrap text.

L120  P&L Generator (route pl-gen, panel panel-pl-gen) is a placeholder panel in Tools nav group.
      Show "soon" badge on nav item. Panel contains centered placeholder — no injector needed yet.
      Nav was incorrectly placed under Finance in batch8 — corrected to Tools in batch9.

L128  ai-chat.js: when body.stream === false, return buffered JSON { reply } (non-streaming).
      AI panel chat UI always uses streaming (no stream key in body).
      Project AI inquiry (runAiInquiry) must pass stream: false in body — never use SSE path for inquiry.

L129  Focus view event delegation: ALL click handlers (collapse, filter) must use ONE delegated
      listener on zone container — never bind directly to innerHTML elements.
      Direct binding is lost on every re-render. Delegation survives because zone element persists.
      Bound once via zone._focusBound flag. Status select uses change event delegation on same zone.
      _resCollapsed module var tracks resource section collapse state across renders.

L130  KV cache strategy — all heavy GET endpoints use KV-first pattern (assets.js as reference).
      TTLs: categories=3600s, liabilities=1800s, budgets=600s, projects=300s, transactions=300s.
      sales.js caches biz data only (sales_biz_v1, 600s, default view period=6m only).
      All support ?refresh=1 bypass. All invalidate on write (POST/PATCH/DELETE).
      transactions.js reads budgets+categories from KV first — reduces tx GET from 3 Airtable
      calls to 1 on warm cache.
      transactions.js cache condition: unfiltered requests only (no type/source/project/category).

L131  KV key naming convention:
      Static lists : {table}_all_v1          (e.g. categories_all_v1, budgets_all_v1)
      Period-scoped: tx:{period}:{bust}       (e.g. tx:2026-06-01:14)
      Bust counter : tx:bust                  (integer, TTL 24hr)
      Biz data     : sales_biz_v1
      P&L models   : pl-generator:{id}

L132  KV free tier write budget: 1,000/day.
      Guardrails: no list+delete patterns; task ticks (project-tasks/[id].js) do NOT invalidate
      projects cache; sales caches biz layer only; all puts/deletes wrapped in .catch(()=>{}).
      budgets_all_v1 cached only on all=true (full unfiltered list — what transactions enrichment needs).
      Estimated Airtable reduction: ~80% on warm cache during a typical session.

L121  P&L Generator (M4.4) is now LIVE. Nav placement: Tools section only (not Finance).
      Panel ID: panel-pl-gen. Injector: pl-generator.injector.js (standalone IIFE).
      Storage: CHAIJOHN_KV with prefix pl-generator:{id}. No Airtable reads or writes.
      API: GET /api/pl-generator (list), POST /api/pl-generator (save), GET/DELETE /api/pl-generator/:id.

L122  P&L computation is client-side only in pl-generator.injector.js → computePL(inputs, periods).
      Returns: { pl[], bs[], cf[], kpis{} }. No server-side calculation.
      Conservative growth = +3%/mo. Aggressive = +8%/mo plateau at M9.
      Depreciation = straight-line from period 1. Tax = 20% of positive EBIT.

L123  PDF export = window.print() with @media print CSS. Inject review-note header before print,
      remove after. Review note appears as italic bordered paragraph in PDF header.
      ODS export = SheetJS XLSX.writeFile with bookType:'ods'. 3 sheets: P&L, Balance Sheet, Cashflow.

L124  Archive view: list all KV keys with prefix pl-generator:, display as searchable/filterable list.
      Load restores full inputs + outputs. Soft delete removes from KV.
      Search by model name or assumption note. Filter by period (12mo / 5yr).

L125  P&L Generator CSS: uses ONLY global CSS variables. Font sizes: KPI values 0.95rem bold,
      table data 0.72rem, inputs 0.78rem, labels 0.65rem, badges 0.62rem.
      Panel anatomy: stats strip → chart (120px) → two-column (280px sidebar | output).

L126  P&L Generator project state alignment:
      Accessible for projects in any state (Draft / Active / Active+InSales).
      Pre-fill via project selector dropdown only (optional). Never writes back to project.
      Nav placement: Tools section only. Panel ID: panel-pl-gen.

L127  Project state definitions (canonical):
      Draft = saved but not activated. Grey frame. M3.4 only. No M2.4 connection.
      Active = "Update + Active" triggered. Grey frame. M3.4 only. No M2.4 connection.
      Active+InSales = "✓ In Sales" triggered from focus card. Green frame. Visible in M2.4.
      P&L Generator available at all 3 states.
      No Airtable reads or writes — data stored in CHAIJOHN_KV as JSON.
      KV key prefix: pl-generator:{id}
      API: GET /api/pl-generator (list), POST /api/pl-generator (save), GET /api/pl-generator/:id (fetch).
      Startup cost entered manually by user — not auto-pulled from M3.4.

---

## QA BLOCKER FIXES (bugfix session)

L063  403 from Airtable on table create/read = table does not exist, NOT a permissions error. Token is full access. Check table existence first. Call POST /api/setup/schema-projects to provision missing tables.
L064  Secondary auto-creates (phases, milestones, tasks, resources) must be individually wrapped in try/catch. Primary record save must ALWAYS return 201. Secondary failures log to console + return in warnings array. Never let a missing table block the primary save.
L065  isSubmitting guard on all save buttons. Set true on first click, disable all save buttons, show "Saving…". Re-enable only on error. Reset in finally block. Prevents duplicate records on slow Cloudflare cold start.
L066  POST dedup — case-insensitive name filter: LOWER({name})=LOWER("name"). Return 409 with existing_id if found. Injector handles 409 by showing inline error, keeping drawer open.
L067  Harvest-before-add — call readDrawerData() before pushing new row. Re-render full innerHTML from state array (not +=). Prevents existing values from being lost when new row is added.
L068  panelactivated event is dispatched on window (not document) with detail = route string (e.g. 'sales'). Always use window.addEventListener, match e.detail === routeString. Never check e.detail?.panelId.
L069  AI chat payload must be: { messages: [{ role:'user', content: promptString }], session_id: string }. Field is 'messages' (array), not 'message' (string). Sending wrong shape returns "messages array is required".
L070  Panel init must call panel.innerHTML = '' or set innerHTML to loading state before rendering. Clears any placeholder .coming-soon div left in HTML. Never append to placeholder.

---

## M2.4 FINANCE PROJECTS + PRESALE BRIDGE (9C-rewire)

L062  Panel ID mapping (PERMANENT): M3.4 Project Assets = #panel-proj-assets (route: proj-assets). M2.4 Finance Projects = #panel-projects (route: projects). These are fixed — never swap them again.
L062b M3.4↔M2.4 propose/approve rule: M3.4 PROPOSES resources/costs → M2.4 APPROVES. Resources created in M3.4 appear as Planned budget cards in M2.4. Owner confirms in M2.4 (status→Purchased). M2.4 never receives surprise changes — they always come from M3.4 first.
L062c M2.4 boundary card: collapsed shows name, phase badge, P&L, funding bar, presale total, days to revenue. Expanded shows budget cards (from ProjectResources), presale cards (Transactions WHERE source=presale AND project_id=X), and actions (Send to Sales, View Project).
L062d Presale transaction pattern: source='presale' + project_id (singleLineText) in Transactions table. One record simultaneously feeds M2.1 (all Transactions), M2.2 presale_total on project lane, and M2.4 presale cards section. No new table needed.
L062e Entry drawer conditional field: when Income Source = Pre-sale category, show #presale-project-row with project select dropdown. Fetch /api/projects?type=Active once, cache in module scope. On save: body.source='presale', body.project_id=selectedProjectId. Hide row when switching to Expense.
L062f Pre-sale category (OWNER ACTION required): must exist in Airtable Categories table — name='Pre-sale', group='Bus-earn', type='Earn', active=true. Also requires project_id field (Single line text) added to Transactions table. CC cannot create these automatically — owner must do it once in Airtable UI or via /api/setup call.
L062g project-finance.injector.js filters: shows projects WHERE type='Active' OR finance_opened=true. Draft projects without finance_opened do NOT appear in M2.4 — they live in M3.4 only until owner clicks Push → Open Finance.

---

## SALES PANEL (9D — M2.2) — IMPLEMENTATION LESSONS

L061  Business Airtable env var: AIRTABLE_BUSINESS_BASE_ID must be set in Cloudflare Pages env — if missing, panel loads with biz_unavailable=true and shows per-lane warning. NEVER crash on missing biz data.
L061b Sale_record grouping: rows are grouped by quote_id to build invoices. A single invoice may have multiple payment rows (deposit, at_ship, balance). paid_total = sum of all actual_sale values per quote_id.
L061c Cashflow injection is idempotent: dedup check uses AND(source='M2.2', date=X, amount=Y, entity=Z). Called on every GET /api/sales — safe to call multiple times. Failures are swallowed (logged, not thrown).
L061d Product image resolution: products fetched from Business Airtable Products table; indexed by lowercase name for lookup. main_image field is the Cloudinary URL. If not found, card renders without thumbnail.
L061e listBizRecords pattern: defined locally in sales.js (not in _airtable.js) because it targets a different base. Follow same offset-pagination pattern as listAllRecords but keep it local to avoid polluting shared helpers.
L061f Category cleanup: legacy earn categories (Ploikong, Satu, Old stocks sale, Stock earn) should be set active=false if they have no transaction references — NOT deleted. sales.js does NOT run this cleanup; it is a one-time admin action.

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
