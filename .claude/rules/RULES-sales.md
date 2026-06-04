# RULES-sales.md — Chaijohn OS
> Domain: M2.2 Sales panel (route: sales, panel: panel-sales) + presale bridge + business base
> Load this file when: working on sales.injector.js, /api/sales, or business Airtable integration
> Last updated: 2026-06-04

---

L113  M2.2 Projects lane card view: each project card max-width:220px in a flex-wrap row.
      Never let project presale cards stretch full panel width — constrain same as assetSaleCard().

L112  M2.2 summary strip must include: total_presale (sum of all project presale totals) and
      total_collection + total_hard_asset (from asset_sales transactions). These fields come from
      /api/sales response summary object. Strip bubbles: Presale Total (green) + Asset Sales (gold).

L111  M2.2 asset_sales source of truth = Transactions table ONLY (source=collection or hard_asset_sale).
      Never read from Collection/HardAssets table records for M2.2 display — causes duplicate cards.
      Transactions do not store cost_price — gain is not shown in M2.2 Asset Sales (acceptable).

L109  Sales Projects lane presalesByProject map key = p.project_id (Airtable record ID from /api/sales response).
      The /api/sales projects array uses { project_id: r.id } not { id: r.id }. Never use p.id for project matching
      in the sales injector — it is always undefined.

L097  M2.2 Projects lane = presale transactions grouped by project_id. Fetch
      /api/transactions?source=presale&limit=500 separately; build presalesByProject map keyed by
      project_id. Do NOT show forecast cards. Only render projects that have at least one presale tx.

L085  M2.2 Projects lane = pipeline tracker only. Never show forecast revenue numbers (target_revenue_monthly).
      presale_total = real money confirmed (show it). Monthly target = planning only (never show in Sales).
      Revenue forecasts live in M2.4 Finance only.

L061  Business Airtable env var: AIRTABLE_BUSINESS_BASE_ID must be set in Cloudflare Pages env — if missing, panel loads with biz_unavailable=true and shows per-lane warning. NEVER crash on missing biz data.
L061b Sale_record grouping: rows are grouped by quote_id to build invoices. A single invoice may have multiple payment rows (deposit, at_ship, balance). paid_total = sum of all actual_sale values per quote_id.
L061c Cashflow injection is idempotent: dedup check uses AND(source='M2.2', date=X, amount=Y, entity=Z). Called on every GET /api/sales — safe to call multiple times. Failures are swallowed (logged, not thrown).
L061d Product image resolution: products fetched from Business Airtable Products table; indexed by lowercase name for lookup. main_image field is the Cloudinary URL. If not found, card renders without thumbnail.
L061e listBizRecords pattern: defined locally in sales.js (not in _airtable.js) because it targets a different base. Follow same offset-pagination pattern as listAllRecords but keep it local to avoid polluting shared helpers.
L061f Category cleanup: legacy earn categories (Ploikong, Satu, Old stocks sale, Stock earn) should be set active=false if they have no transaction references — NOT deleted. sales.js does NOT run this cleanup; it is a one-time admin action.

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
