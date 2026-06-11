# RULES-data.md — Chaijohn OS
> Domain: Transaction model, API response shapes, Airtable patterns, KV cache
> Load this file when: working on any data/API/Airtable endpoint or transaction logic
> Last updated: 2026-06-11

---

⚠️  AIRTABLE TOKEN — FULL SCOPE CONFIRMED (see RULES.md L205):
    schema.bases:read + schema.bases:write are granted.
    CC must handle ALL field/table changes via Meta API.
    Owner will NEVER manually change Airtable field types — ever.

⚠️  LifeTimeline: `story` field renamed to `note` (Long text). See RULES.md L204, L206.
    Use key `note` everywhere. `story_refs` (Single line text) is unchanged.

⚠️  BEFORE WRITING ANY AIRTABLE ENDPOINT: check field types first.
    Batch PATCH is all-or-nothing — one wrong type rejects ALL records.
    Use schema.bases:read (Meta API) or confirmed field list in RULES.md L204
    to verify precision/type before building buildFields(). Always include
    typecast:true in PATCH/POST bodies as a safety net.

L132  KV free tier write budget: 1,000/day.
      Guardrails: no list+delete patterns; task ticks (project-tasks/[id].js) do NOT invalidate
      projects cache; sales caches biz layer only; all puts/deletes wrapped in .catch(()=>{}).
      budgets_all_v1 cached only on all=true (full unfiltered list — what transactions enrichment needs).
      Estimated Airtable reduction: ~80% on warm cache during a typical session.

L131  KV key naming convention:
      Static lists : {table}_all_v1          (e.g. categories_all_v1, budgets_all_v1)
      Period-scoped: tx:{period}:{bust}       (e.g. tx:2026-06-01:14)
      Bust counter : tx:bust                  (integer, TTL 24hr)
      Biz data     : sales_biz_v1
      P&L models   : pl-generator:{id}

L130  KV cache strategy — all heavy GET endpoints use KV-first pattern (assets.js as reference).
      TTLs: categories=3600s, liabilities=1800s, budgets=600s, projects=300s, transactions=300s.
      sales.js caches biz data only (sales_biz_v1, 600s, default view period=6m only).
      All support ?refresh=1 bypass. All invalidate on write (POST/PATCH/DELETE).
      transactions.js reads budgets+categories from KV first — reduces tx GET from 3 Airtable
      calls to 1 on warm cache.
      transactions.js cache condition: unfiltered requests only (no type/source/project/category).

L110  category_id field permanently deleted from Transactions table on 2026-06-03.
      Never recreate it. Transaction model uses type + source + budget_id + project_id only.

L108  transactions GET must return project_id field in response. No fields[] whitelist is passed to listRecords —
      Airtable returns all fields including project_id. Do not add a fields filter that would exclude project_id.

L106  Project funding POST body: {type:Expense, source:project_funding, project_id, amount, date, entity, description}. No budget_id, no category_id.

L105  Presale POST body: {type:Income, source:presale, project_id, amount, date, entity, description}. Nothing else.

L104  source field in Airtable Transactions is singleSelect. Do NOT attempt to patch options via Meta API — requires schema admin permission. Owner manages allowed values in Airtable UI.

L103  View filters by source: Expenses M2.3 = budget_id not empty. Projects lane M2.2 = source=presale. Asset Sales = source IN (collection, hard_asset_sale). Cashflow = everything.

L102  project_id on Transactions: plain text string (not array). Required for source=presale and source=project_funding.

L101  POST validation rule: budget_id required ONLY when type=Expense AND source=Manual (or source absent). All other sources bypass budget requirement.

L100  category_id on Transactions: NEVER write on new records. Read legacy records for display only. Silently ignore if sent in POST body.

L099  Transaction model is the single source of truth for all money flow. Never add complexity beyond this table.

L096  Transactions source field is singleSelect in Airtable. New values (presale, cash_in, etc.)
      must be patched in via Meta API PATCH before first POST. Use patchSourceOptions() called once
      per cold start (module flag sourceFieldPatched). Budget_id is NOT required when
      source='LiabilityPayment' or source='project_funding'. Source='project_funding' is excluded
      from M2.3 Expense view via NOT({source}='project_funding') filter at GET time.

L092  Hard asset sale transaction pattern: source='hard_asset_sale' + category_id from
      'Hard asset sale' category (Per-earn group, type=Earn). The category is fetched/created
      at M3.3 panel init and cached. Transaction also carries entity=soldTo and
      description='Hard asset sale — <name>'.

L088  Airtable linked record filter formula: ARRAYJOIN({linkedField}) returns PRIMARY FIELD VALUES
      (e.g. project names), NOT record IDs. FIND('recXXX', ARRAYJOIN({project_id})) always returns 0.
      Correct pattern: fetch the parent record first to get its name, then filter child tables with
      ARRAYJOIN({project_id})='${projectName}'. The REST API (list/filter by record) still returns
      linked fields as ["recXXX"] arrays — linkedId() handles that correctly.

L087  Collection Sell must always set source='collection' + category_id on the Transaction POST.
      Never post a sale transaction with source='Manual' — it becomes unroutable in M2.2 and M2.1.
      The 'Collection sale' category_id must be fetched at init and cached in module scope.

L086  Transactions GET must explicitly include source and project_id in the fields array, OR omit
      fields[] entirely so Airtable returns all fields. If fields[] is passed, ensure source and
      project_id are listed or Airtable omits them from the response.

L083  Always render section empty states — never hide entire sections when data
      is empty. Owner needs to see the section exists even with no data. Use a clear
      instructional empty state: "No X yet. To add: go to Y → do Z."

L082  /api/projects returns { records: [] } where each record is ALREADY FLATTENED
      ({ id, name, type, ... }) — not raw Airtable { id, fields: {} } shape. Do NOT
      re-spread r.fields on consumer side. Use `data.records || []` directly.
      Any paginated Airtable endpoint wrapped in jsonResponse follows this shape.

L077  Schema-first rule for external Airtable bases: Before writing ANY
      code that touches an external Airtable base (not chaijohn-core), call
      the Meta API to read actual field names:
      GET https://api.airtable.com/v0/meta/bases/{baseId}/tables
      Verify EVERY field name used in filterByFormula, sort, and field mapping.
      Never trust field names from CC prompt specs — they may be wrong.
      One verification pass prevents 5 debug cycles.

L076  Sale record table — confirmed field names (appMBjlfYyVd8I7ML):
      - Table name: 'Sale record' (space, NOT underscore 'Sale_record')
      - Date field: 'Sale date' (space, capital S — NOT 'sale_date')
      - Use in formula: {Sale date} — NOT {sale_date}
      - Use in sort: { field: 'Sale date' } — NOT { field: 'sale_date' }
      - Other confirmed fields: quote_id, invoice_no, business_id,
        customer_name, payment_stage, invoice_total, 'Formatted Sale Order',
        'Actual sale', 'Invoice no.', 'Product Name', 'Status'

L075  Business ID table — confirmed field names (appMBjlfYyVd8I7ML):
      - Table: 'Business ID' (primary field also named 'Business ID')
      - bus_id field: map as r.fields['Business ID'] first, then r.fields.bus_id
      - Status: 'Status', values: 'Active' / 'Inactive'
      - Business Name: 'Business Name'
      - Brand name: 'Brand name'
      - Tag line: 'Tag line'
      - Business Type: 'Business Type'

L073  Never swallow errors in biz data catch blocks: Always capture the
      error message and include it in the API response:
        catch(err) { bizError = err.message; ... }
        return jsonResponse({ ..., biz_error: bizError });
      Silent catch blocks make diagnosis impossible without code changes.

L072  403 from Airtable = table or field not found (not just permissions):
      INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND fires when: (a) token lacks access,
      OR (b) table name does not exist, OR (c) field name in formula does not exist.
      Always check table and field names before concluding it is a permissions issue.
      Token permissions for this project are confirmed full-scope — never re-investigate.

L071  Airtable primary field rule: the FIRST field in any new table definition MUST be type singleLineText. singleSelect, number, date, and checkbox are all rejected as primary field types. Always start every table definition with { name: 'name', type: 'singleLineText' }.
