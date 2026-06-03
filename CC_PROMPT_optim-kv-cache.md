# CC_PROMPT_optim-kv-cache.md
> Optimization: KV cache layer on all heavy GET endpoints — reduce Airtable from ~1000/2wk to ~150/2wk
> Branch: optim/kv-cache
> IMPORTANT: Run this in a FRESH CC session (100% context). Reads 6 API files before writing.

---

## CC INTRO
```
Read CLAUDE.md, RULES.md, PROJECT_STATE.md first.
Then execute: CC_PROMPT_optim-kv-cache.md
Branch: optim/kv-cache
```

---

## CONTEXT — WHY THIS EXISTS
Owner hit Airtable free tier limit (1,000 calls / 2 weeks) from uncached GET endpoints.
KV cache already works on `/api/assets` (L052d) — apply same pattern to all heavy endpoints.
NO UI changes. NO injector changes. API files only.
Goal: 85% reduction in Airtable calls. Safe because KV TTL invalidates stale data.

---

## READ FIRST — all 6 files before touching anything
1. `functions/api/transactions.js` — fetches Transactions + Budgets + Categories on every GET
2. `functions/api/budgets.js` — fetches Budgets + Categories on every GET
3. `functions/api/categories.js` — fetches Categories on every GET (almost static data)
4. `functions/api/liabilities.js` — fetches Liabilities on every GET
5. `functions/api/projects.js` — fetches Projects + Tasks + Resources on every GET
6. `functions/api/sales.js` — fetches Transactions + Business Airtable data on every GET
7. `functions/api/assets.js` — REFERENCE ONLY, already has KV cache correctly implemented

Study `assets.js` cache pattern before writing anything. Match it exactly.

---

## CACHE PATTERN (from assets.js — use this exact structure)

```javascript
const KV_KEY = 'xxx_all_v1';
const KV_TTL = 300; // seconds

// At top of onRequestGet, before Airtable call:
if (env.CHAIJOHN_KV) {
  try {
    const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
    if (cached) return jsonResponse({ records: cached, cached: true });
  } catch { /* KV miss — fall through */ }
}

// After Airtable fetch succeeds, before return:
if (env.CHAIJOHN_KV) {
  await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(records), { expirationTtl: KV_TTL }).catch(() => {});
}

// In onRequestPost / PATCH / DELETE — invalidate cache:
if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
```

---

## FILE 1 — functions/api/categories.js

Categories almost never change. Long TTL is safe.

```javascript
const KV_KEY = 'categories_all_v1';
const KV_TTL = 3600; // 1 hour — categories rarely change
```

- Cache the full unfiltered list
- Invalidate on any POST (new category created)
- No PATCH/DELETE endpoint exists — no invalidation needed there

---

## FILE 2 — functions/api/budgets.js

```javascript
const KV_KEY = 'budgets_all_v1';
const KV_TTL = 600; // 10 minutes
```

- Cache the full enriched list (with category_name, category_group already joined)
- Invalidate on POST, PATCH, DELETE in `budgets/[id].js` too
- Read `functions/api/budgets/[id].js` — add invalidation there as well

---

## FILE 3 — functions/api/liabilities.js

```javascript
const KV_KEY = 'liabilities_all_v1';
const KV_TTL = 1800; // 30 minutes — liabilities change rarely
```

- Cache full list
- Invalidate in `liabilities/[id].js` PATCH and DELETE
- Read `functions/api/liabilities/[id].js` — add invalidation

---

## FILE 4 — functions/api/transactions.js

**Most impactful file** — currently does 3 Airtable calls per GET:
1. Transactions (paginated)
2. ALL Budgets (for enrichment)
3. ALL Categories (for enrichment)

**Strategy:** Cache budgets and categories separately (already done in files 1+2 above). For transactions themselves — cache by month period:

```javascript
// Key includes period so different months cache separately
const period = url.searchParams.get('start') || 'all';
const KV_KEY = `tx:${period}`;
const KV_TTL = 300; // 5 minutes — transactions change on every entry

// IMPORTANT: Only cache when no unusual filter params present
// Skip cache if: ?refresh=1
```

**Also optimize:** Instead of fetching ALL Budgets + ALL Categories fresh on every transaction GET, read them from KV first (they are already cached by files 1+2 above):

```javascript
// Replace parallel Airtable fetches with KV-first reads:
const [budgetsCached, catsCached] = await Promise.all([
  env.CHAIJOHN_KV?.get('budgets_all_v1', { type: 'json' }).catch(() => null),
  env.CHAIJOHN_KV?.get('categories_all_v1', { type: 'json' }).catch(() => null)
]);

const budgetRecords = budgetsCached || (await listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Budgets', { maxRecords: 500 })).records;
const catRecords    = catsCached    || (await listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Categories', { maxRecords: 500 })).records;
```

This means on a warm cache: transactions GET = 1 Airtable call (transactions only) instead of 3.

**Invalidate** `tx:*` pattern: KV list + delete all matching keys on POST transaction.
Use: `const keys = await env.CHAIJOHN_KV.list({ prefix: 'tx:' })` then delete each.

---

## FILE 5 — functions/api/projects.js

```javascript
const KV_KEY = 'projects_all_v1';
const KV_TTL = 300; // 5 minutes
```

- Cache the full enriched list (with tasks, resources, computed fields)
- Invalidate on POST new project
- Also invalidate in `projects/[id].js` on PATCH and DELETE
- Also invalidate in `project-tasks/[id].js` on PATCH (task status change updates project computed fields)
- Also invalidate in `project-resources/[id].js` on PATCH/DELETE

Read all 4 files: `projects/[id].js`, `project-tasks/[id].js`, `project-resources/[id].js`, `project-tasks.js` (POST) — add invalidation in each.

---

## FILE 6 — functions/api/sales.js

Sales aggregates from multiple sources — more complex. Two-part cache:

```javascript
// Part A: Business Airtable data (changes rarely — new invoices only)
const BIZ_KV_KEY = 'sales_biz_v1';
const BIZ_KV_TTL = 600; // 10 minutes

// Part B: Full sales response per period
const period = url.searchParams.get('period') || 'current';
const SALES_KV_KEY = `sales:${period}`;
const SALES_KV_TTL = 300; // 5 minutes
```

- Cache business Airtable data separately (expensive cross-base fetch)
- Cache full aggregated response by period
- Invalidate `sales:*` on POST to sales (manual entry)
- Do NOT cache the cashflow injection side-effect — that runs after cache check

---

## FORCE REFRESH SUPPORT (all endpoints)

Add `?refresh=1` bypass to ALL cached endpoints (matches existing assets.js pattern):
```javascript
const refresh = url.searchParams.get('refresh') === '1';
if (!refresh && env.CHAIJOHN_KV) {
  // try cache...
}
```

This lets injectors force fresh data when needed (e.g. after a write operation).

---

## DO NOT TOUCH
- Any injector files
- `index.html`
- `functions/api/auth.js`
- `functions/api/ai-chat.js`
- `functions/_airtable.js` — helper only, no caching here
- `functions/api/assets.js` — already cached, reference only

---

## AFTER ALL FIXES — MANDATORY

1. Archive → `docs/prompts/` stamped ✅
2. Append RULES.md:
```
L130  KV cache strategy — all heavy GET endpoints use KV-first pattern (assets.js as reference).
      TTLs: categories=3600s, liabilities=1800s, budgets=600s, projects=300s, transactions=300s, sales=300s.
      All invalidate on write (POST/PATCH/DELETE). All support ?refresh=1 bypass.
      transactions.js reads budgets+categories from KV first before falling back to Airtable —
      reduces tx GET from 3 Airtable calls to 1 on warm cache.

L131  KV key naming convention:
      Static lists: {table}_all_v1 (e.g. categories_all_v1, budgets_all_v1)
      Period-scoped: {table}:{period} (e.g. tx:2026-06, sales:current)
      Project-scoped: {table}:{id} (e.g. pl:{project_id})
      Invalidate period-scoped: list({ prefix: '{table}:' }) then delete each key.

L132  Estimated Airtable call reduction after KV cache: ~85%.
      Before: ~50 calls/day (1000/2wk). After: ~7-8 calls/day on warm cache.
      Cold start (KV miss or TTL expired): same as before — falls through to Airtable normally.
```
3. Update PROJECT_STATE.md — optim/kv-cache complete, note Airtable usage reduction
4. Commit docs: `docs: RULES L130–L132, PROJECT_STATE kv-cache complete`

## COMMIT ORDER
```
optim(api): categories.js — KV cache 1hr TTL, invalidate on POST
optim(api): budgets.js + budgets/[id].js — KV cache 10min, invalidate on write
optim(api): liabilities.js + liabilities/[id].js — KV cache 30min, invalidate on write
optim(api): transactions.js — KV cache per period + KV-first budget/category lookup
optim(api): projects.js + [id].js + tasks + resources — KV cache 5min, invalidate on all writes
optim(api): sales.js — KV cache biz data + period response
docs: RULES L130–L132, PROJECT_STATE kv-cache complete
```

## QA CHECKLIST
- [ ] Navigate Cashflow → Expenses → Budget → Sales: only 1 Airtable call per panel (check CF logs)
- [ ] Add a transaction → navigate away → return: new transaction visible (cache invalidated)
- [ ] Add a project → project list refreshes correctly
- [ ] ?refresh=1 on any endpoint returns fresh Airtable data
- [ ] Cloudflare Pages function logs show `cached: true` on repeat loads
