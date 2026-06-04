# RULES-plgen.md — Chaijohn OS
> Domain: M4.4 P&L Generator (route: pl-generator, panel: panel-pl-generator)
> Load this file when: working on the P&L Generator injector, KV storage, or computePL engine
> Last updated: 2026-06-04

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

L127  Project state definitions (canonical):
      Draft = saved but not activated. Grey frame. M3.4 only. No M2.4 connection.
      Active = "Update + Active" triggered. Grey frame. M3.4 only. No M2.4 connection.
      Active+InSales = "✓ In Sales" triggered from focus card. Green frame. Visible in M2.4.
      P&L Generator available at all 3 states.
      No Airtable reads or writes — data stored in CHAIJOHN_KV as JSON.
      KV key prefix: pl-generator:{id}
      API: GET /api/pl-generator (list), POST /api/pl-generator (save), GET /api/pl-generator/:id (fetch).
      Startup cost entered manually by user — not auto-pulled from M3.4.

L126  P&L Generator project state alignment:
      Accessible for projects in any state (Draft / Active / Active+InSales).
      Pre-fill via project selector dropdown only (optional). Never writes back to project.
      Nav placement: Tools section only. Panel ID: panel-pl-gen.

L125  P&L Generator CSS: uses ONLY global CSS variables. Font sizes: KPI values 0.95rem bold,
      table data 0.72rem, inputs 0.78rem, labels 0.65rem, badges 0.62rem.
      Panel anatomy: stats strip → chart (120px) → two-column (280px sidebar | output).

L124  Archive view: list all KV keys with prefix pl-generator:, display as searchable/filterable list.
      Load restores full inputs + outputs. Soft delete removes from KV.
      Search by model name or assumption note. Filter by period (12mo / 5yr).

L123  PDF export = window.print() with @media print CSS. Inject review-note header before print,
      remove after. Review note appears as italic bordered paragraph in PDF header.
      ODS export = SheetJS XLSX.writeFile with bookType:'ods'. 3 sheets: P&L, Balance Sheet, Cashflow.

L122  P&L computation is client-side only in pl-generator.injector.js → computePL(inputs, periods).
      Returns: { pl[], bs[], cf[], kpis{} }. No server-side calculation.
      Conservative growth = +3%/mo. Aggressive = +8%/mo plateau at M9.
      Depreciation = straight-line from period 1. Tax = 20% of positive EBIT.

L121  P&L Generator (M4.4) is now LIVE. Nav placement: Tools section only (not Finance).
      Panel ID: panel-pl-gen. Injector: pl-generator.injector.js (standalone IIFE).
      Storage: CHAIJOHN_KV with prefix pl-generator:{id}. No Airtable reads or writes.
      API: GET /api/pl-generator (list), POST /api/pl-generator (save), GET/DELETE /api/pl-generator/:id.

L120  P&L Generator (route pl-gen, panel panel-pl-gen) is a placeholder panel in Tools nav group.
      Show "soon" badge on nav item. Panel contains centered placeholder — no injector needed yet.
      Nav was incorrectly placed under Finance in batch8 — corrected to Tools in batch9.
