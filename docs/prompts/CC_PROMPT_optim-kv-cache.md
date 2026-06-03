# CC_PROMPT_optim-kv-cache.md
> ✅ COMPLETE — 2026-06-03 — KV cache all endpoints: categories/budgets/liabilities/transactions/projects/sales, bust counter for tx, ~80% Airtable reduction
> Optimization: KV cache layer on all heavy GET endpoints — reduce Airtable from ~1000/2wk to ~150/2wk
> Branch: optim/kv-cache
> IMPORTANT: Run this in a FRESH CC session (100% context). Reads 6 API files before writing.

---

## CC INTRO
```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L132 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory (required for build sessions)

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_optim-kv-cache.md
Branch: optim/kv-cache
```

---

## CONTEXT — WHY THIS EXISTS
Owner hit Airtable free tier limit (~1,000 calls / 2 weeks) from uncached GET endpoints.
KV cache already works on `/api/assets` (L052d) — apply same pattern to all heavy endpoints.
NO UI changes. NO injector changes. API files only.
Goal: ~85% reduction in Airtable calls on warm cache.

**KV binding name: `CHAIJOHN_KV`** — confirmed in Cloudflare dashboard.
**No R2 binding exists** — do not reference R2 anywhere.

---

## ⚠️ FREE TIER GUARDRAILS — READ BEFORE WRITING ANY CODE

Cloudflare KV free limits:
- Reads: 100,000/day — not a concern
- **Writes: 1,000/day — this is the constraint. Every `.put()` and `.delete()` counts.**
- List operations: 1,000/day — also a constraint

Apply these rules to every file you write:

**RULE A — No list+delete for invalidation.**
Never do `kv.list({ prefix: 'tx:' })` then loop-delete. That costs 1 list + N writes per POST.
Use a bust counter pattern instead (see FILE 4 — transactions).

**RULE B — Task status changes do NOT invalidate projects cache.**
Task ticks (PATCH project-tasks/[id].js) happen frequently during a work session.
Invalidating projects_all_v1 on every tick wastes writes. Let TTL handle it (5min lag is fine).
Only invalidate projects_all_v1 on: new project POST, project name/status PATCH, project DELETE.

**RULE C — sales.js: one cache key only (biz data), not two.**
Skip caching the full aggregated sales response per period — too many keys, too many writes.
Only cache the expensive cross-base Business Airtable fetch (`sales_biz_v1`).
The transaction side of sales is already covered by transactions.js cache.

**RULE D — All KV .put() and .delete() must use .catch(() => {}).**
A KV failure must never block or crash the API response. Silently fall through always.

**RULE E — Never write to KV inside a loop.**
If enrichment loops over records, write once after all records are processed.

---

## READ FIRST — all files before touching anything

1. `functions/api/transactions.js` — fetches Transactions + Budgets + Categories on every GET
2. `functions/api/budgets.js` — fetches Budgets + Categories on every GET
3. `functions/api/categories.js` — fetches Categories on every GET (almost static data)
4. `functions/api/liabilities.js` — fetches Liabilities on every GET
5. `functions/api/projects.js` — fetches Projects + Tasks + Resources on every GET
6. `functions/api/sales.js` — fetches Transactions + Business Airtable data on every GET
7. `functions/api/assets.js` — **REFERENCE ONLY**, already cached correctly — study this first
8. `functions/api/budgets/[id].js` — needs invalidation added
9. `functions/api/liabilities/[id].js` — needs invalidation added
10. `functions/api/projects/[id].js` — needs invalidation added
11. `functions/api/project-tasks.js` — needs invalidation added (POST only)
12. `functions/api/project-tasks/[id].js` — read to understand, but do NOT add invalidation here (RULE B)
13. `functions/api/project-resources/[id].js` — needs invalidation added

Study `assets.js` cache pattern before writing anything. Match it exactly.

---

## STANDARD CACHE PATTERN (from assets.js — use this exact structure)

```javascript
const KV_KEY = 'xxx_all_v1';
const KV_TTL = 300; // seconds

// At top of onRequestGet, AFTER reading url and checking ?refresh:
const refresh = url.searchParams.get('refresh') === '1';
if (!refresh && env.CHAIJOHN_KV) {
  try {
    const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
    if (cached) return jsonResponse({ records: cached, cached: true });
  } catch { /* KV miss — fall through to Airtable */ }
}

// After Airtable fetch succeeds, before return:
if (env.CHAIJOHN_KV) {
  await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(records), { expirationTtl: KV_TTL }).catch(() => {});
}

// In onRequestPost / PATCH / DELETE — invalidate:
if (env.CHAIJOHN_KV) await env.CHAIJOHN_KV.delete(KV_KEY).catch(() => {});
```

**?refresh=1 bypass applies to ALL endpoints.** This lets injectors force fresh data after a write.

---

## FILE 1 — functions/api/categories.js

Categories almost never change. Long TTL is safe. Low write risk.

```javascript
const KV_KEY = 'categories_all_v1';
const KV_TTL = 3600; // 1 hour — categories are near-static
```

- Cache the full unfiltered list
- Invalidate on POST only (new category created)
- No PATCH/DELETE endpoint — no further invalidation needed

**KV write cost: ~1 write per hour max. Very safe.**

---

## FILE 2 — functions/api/budgets.js + functions/api/budgets/[id].js

```javascript
const KV_KEY = 'budgets_all_v1';
const KV_TTL = 600; // 10 minutes
```

- Cache full enriched list (with any joined fields already computed)
- Invalidate in `budgets.js` on POST
- Invalidate in `budgets/[id].js` on PATCH and DELETE
- Read `budgets/[id].js` fresh — add the single invalidation line to both handlers

**KV write cost: 1 write per budget add/edit. Low.**

---

## FILE 3 — functions/api/liabilities.js + functions/api/liabilities/[id].js

```javascript
const KV_KEY = 'liabilities_all_v1';
const KV_TTL = 1800; // 30 minutes — liabilities change rarely
```

- Cache full list
- Invalidate in `liabilities.js` on POST
- Invalidate in `liabilities/[id].js` on PATCH and DELETE
- Read `liabilities/[id].js` fresh — add invalidation to both handlers

**KV write cost: 1 write per liability add/edit. Very low.**

---

## FILE 4 — functions/api/transactions.js

**Most impactful file.** Currently does 3 Airtable calls per GET (Transactions + Budgets + Categories).

### Part A — KV-first lookup for budgets and categories

Instead of fetching ALL Budgets + ALL Categories fresh on every transaction GET, read from KV first
(they are already cached by files 1+2 above):

```javascript
// Replace parallel Airtable fetches with KV-first reads:
const [budgetsCached, catsCached] = await Promise.all([
  env.CHAIJOHN_KV?.get('budgets_all_v1', { type: 'json' }).catch(() => null),
  env.CHAIJOHN_KV?.get('categories_all_v1', { type: 'json' }).catch(() => null)
]);

const budgetRecords = budgetsCached
  || (await listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Budgets', { maxRecords: 500 })).records;
const catRecords = catsCached
  || (await listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Categories', { maxRecords: 500 })).records;
```

On warm cache: transactions GET = 1 Airtable call (transactions only) instead of 3.
On cold cache: falls through normally — no change in behaviour.

### Part B — Cache transactions per period using bust counter (RULE A — no list+delete)

```javascript
// Bust counter pattern — avoids list+delete on every POST
// One extra KV read per GET, one write per POST — total cost stays low

const period  = url.searchParams.get('start') || 'all';
const bust    = (await env.CHAIJOHN_KV?.get('tx:bust', { type: 'text' }).catch(() => null)) || '0';
const KV_KEY  = `tx:${period}:${bust}`;
const KV_TTL  = 300; // 5 minutes

// GET — try cache (after bust read above):
const refresh = url.searchParams.get('refresh') === '1';
if (!refresh && env.CHAIJOHN_KV) {
  try {
    const cached = await env.CHAIJOHN_KV.get(KV_KEY, { type: 'json' });
    if (cached) return jsonResponse({ records: cached, cached: true });
  } catch { /* miss */ }
}

// After Airtable fetch — write cache:
if (env.CHAIJOHN_KV) {
  await env.CHAIJOHN_KV.put(KV_KEY, JSON.stringify(records), { expirationTtl: KV_TTL }).catch(() => {});
}

// POST (new transaction) — increment bust counter only. Old tx:* keys expire by TTL naturally.
// This costs exactly 2 KV ops (read current bust + write new bust) instead of list+N deletes.
if (env.CHAIJOHN_KV) {
  const cur = parseInt(await env.CHAIJOHN_KV.get('tx:bust', { type: 'text' }).catch(() => '0')) || 0;
  await env.CHAIJOHN_KV.put('tx:bust', String(cur + 1), { expirationTtl: 86400 }).catch(() => {});
}
```

**KV write cost per transaction POST: 2 ops (read bust + write bust). Safe even at 50 entries/day.**

---

## FILE 5 — functions/api/projects.js + write endpoints

```javascript
const KV_KEY = 'projects_all_v1';
const KV_TTL = 300; // 5 minutes
```

- Cache the full enriched list (with tasks, resources, computed fields already joined)
- Invalidate in `projects.js` on POST (new project)
- Invalidate in `projects/[id].js` on PATCH (project name/status change) and DELETE
- Invalidate in `project-tasks.js` on POST (new task added to project)
- **Do NOT invalidate in `project-tasks/[id].js`** — task status ticks are too frequent (RULE B)
- **Do NOT invalidate in `project-resources/[id].js` on PATCH** — let TTL handle it
- Invalidate in `project-resources/[id].js` on DELETE only (resource removed = structural change)

**KV write cost: only on meaningful structural changes, not every task tick. Safe.**

---

## FILE 6 — functions/api/sales.js

Cache the expensive cross-base Business Airtable fetch only. Skip caching the full response (RULE C).

```javascript
const BIZ_KV_KEY = 'sales_biz_v1';
const BIZ_KV_TTL = 600; // 10 minutes
```

At top of handler, before Business Airtable fetch:
```javascript
let bizData = null;
if (!refresh && env.CHAIJOHN_KV) {
  bizData = await env.CHAIJOHN_KV.get(BIZ_KV_KEY, { type: 'json' }).catch(() => null);
}
if (!bizData) {
  bizData = await fetchBusinessAirtableData(env); // whatever the current fetch is called
  if (env.CHAIJOHN_KV) {
    await env.CHAIJOHN_KV.put(BIZ_KV_KEY, JSON.stringify(bizData), { expirationTtl: BIZ_KV_TTL }).catch(() => {});
  }
}
```

- Invalidate `sales_biz_v1` on any POST to sales
- The transaction side is already covered by transactions.js cache — do not duplicate
- Do NOT add a second cache key for the full aggregated response

**KV write cost: ~1 write per 10 minutes on first load. Very safe.**

---

## DO NOT TOUCH
- Any injector files (`*.injector.js`)
- `index.html`
- `functions/api/auth.js`
- `functions/api/ai-chat.js`
- `functions/_airtable.js` — shared helper, no caching here
- `functions/api/assets.js` — already cached, reference only
- `functions/api/project-tasks/[id].js` — read only, do NOT add invalidation (RULE B)

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/` stamped ✅ COMPLETE — 2026-06-03 — KV cache all endpoints
2. Append RULES.md:
```
L130  KV cache strategy — all heavy GET endpoints use KV-first pattern (assets.js as reference).
      TTLs: categories=3600s, liabilities=1800s, budgets=600s, projects=300s, transactions=300s.
      sales.js caches biz data only (sales_biz_v1, 600s) — not the full response.
      All support ?refresh=1 bypass. All invalidate on write (POST/PATCH/DELETE).
      transactions.js reads budgets+categories from KV first — reduces tx GET from 3 Airtable
      calls to 1 on warm cache.

L131  KV key naming convention:
      Static lists : {table}_all_v1          (e.g. categories_all_v1, budgets_all_v1)
      Period-scoped: {table}:{period}:{bust}  (e.g. tx:2026-06:14)
      Bust counter : {table}:bust             (e.g. tx:bust — integer, TTL 24hr)
      Biz data     : sales_biz_v1
      P&L data     : pl:{project_id}

L132  KV free tier write budget: 1,000/day.
      Guardrails: no list+delete patterns; task ticks do not invalidate projects cache;
      sales caches biz layer only; all puts/deletes wrapped in .catch(()=>{}).
      Estimated Airtable reduction: ~85% on warm cache (~7 calls/day vs ~50 before).
```
3. Update PROJECT_STATE.md — optim/kv-cache complete, note Airtable usage reduction
4. Commit docs: `docs: RULES L130–L132, PROJECT_STATE kv-cache complete`

---

## COMMIT ORDER
```
1. optim(api): categories.js — KV cache 1hr TTL
2. optim(api): budgets.js + budgets/[id].js — KV cache 10min, invalidate on write
3. optim(api): liabilities.js + liabilities/[id].js — KV cache 30min, invalidate on write
4. optim(api): transactions.js — bust counter pattern + KV-first budget/category lookup
5. optim(api): projects.js + [id].js + project-tasks.js + project-resources/[id].js — KV cache 5min, selective invalidation
6. optim(api): sales.js — biz data KV cache only
7. docs: RULES L130–L132, PROJECT_STATE kv-cache complete
```
Branch: optim/kv-cache
Merge to main after owner confirms QA checklist below.

---

## QA CHECKLIST
- [ ] Navigate Cashflow → Expenses → Budget → Sales: Cloudflare logs show `cached: true` on repeat loads
- [ ] Add a transaction → navigate away → return Cashflow: new transaction is visible (bust counter worked)
- [ ] Add a project → project list refreshes correctly
- [ ] Tick a task status → project list still loads (no crash from missing invalidation)
- [ ] `?refresh=1` on any endpoint returns fresh Airtable data (no cached:true in response)
- [ ] Cloudflare Pages KV metrics: writes stay well under 1,000/day in normal use
- [ ] No API endpoint returns a 500 error when KV is unavailable (all fallback to Airtable)
