# CC_PROMPT_qa-batch3-m34-m24-m22.md
> ✅ COMPLETE — 2026-06-02 — M3.4 tasks/buttons, M2.4 resources/presales, M2.2 personal earn + projects lane, M3.2 collection sale source
> QA batch 3 — 9 confirmed bugs across M3.4, M2.4, M2.2, M3.2 + 1 architectural correction
> Branch: fix/qa-batch3
> Commit directly to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L083+ (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_qa-batch3-m34-m24-m22.md
```

---

## READ FIRST (before touching any file)

Read these files fresh from repo in this order:
1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/projects.injector.js` — M3.4, full file
3. `public/assets/js/project-finance.injector.js` — M2.4, full file
4. `public/assets/js/sales.injector.js` — M2.2, full file
5. `functions/api/projects.js` — GET + POST handlers
6. `functions/api/projects/[id].js` — single project GET + PATCH handler
7. `functions/api/transactions.js` — GET handler, field list returned
8. `functions/api/sales.js` — projects section + presale totals logic
9. `public/assets/js/collection.injector.js` — Sell button + confirm sale handler

Read all 9 before writing a single line.

---

## CONFIRMED FACTS

- 2 Active projects: Ploikong (฿1M/mo, 38d launch, resources added) + Satu 1.0 (฿300k/mo, resources added)
- Both projects have tasks and resources linked in Airtable (confirmed by owner)
- `sales_forecast_sent` field confirmed: Ploikong = true (In Sales), Satu 1.0 = false
- `/api/projects` returns pre-flattened `{ records: [] }` — L082
- `/api/projects/:id` returns full detail including tasks, resources arrays
- `source='presale'` + `project_id` pattern is implemented in transactions.js and entry.injector.js
- Owner saved 2 test transactions via Entry drawer: one "Ploikong sale ฿1,000" (presale), one "Collection sale ฿1,000" — both only appear in Cashflow, not Sales

---

## ARCHITECTURAL CORRECTION — M2.2 Projects Lane (read before fixing bugs)

**Current wrong behavior:** When `sales_forecast_sent = true`, M2.2 shows project in Projects lane as a forecast lane with "Expected ฿X/mo" and progress bar. Owner confirmed this is wrong.

**Correct behavior:**
The Projects (forecast) section in M2.2 Sales should show:
- Project name + phase badge
- Presale total confirmed (฿ amount from actual presale transactions)
- "Launch date not set" OR actual launch date if set
- `[Go to Project ↗]` button only
- NO "Expected ฿/mo" recurring revenue — that is NOT a sale yet
- NO progress bar simulating revenue

The forecast revenue number belongs ONLY in M2.4 Finance Projects as planning data.
M2.2 Sales is a record of real money only. Presale transactions = real money. Monthly target = planning only.

This change affects `sales.injector.js` rendering of the Projects section only.
Do NOT change the API — `presale_total` is already returned and correct.

---

## BUG 1 — M3.4 Tasks not showing in focus view

**File:** `public/assets/js/projects.injector.js`

Read the `renderFocusView(projectId)` function fresh.
The function fetches `/api/projects/:id` which returns `{ tasks: [], resources: [], ... }`.

Confirmed: tasks exist in Airtable for both projects (5 tasks total showing in header chip).

Likely cause: the tasks rendering block checks a condition that fails silently, OR
the task array is nested differently than expected. Read the actual API response shape
from `functions/api/projects/[id].js` — check exactly what key the tasks come back under
and what fields each task has.

Fix: ensure tasks render correctly grouped by phase. If phases are empty/null, render
tasks in a flat list with "No phase" group. Never show an empty TASKS section when tasks exist.

Also fix: resource list in focus view — same issue. Resources exist but may not render.
Check resource field names match what the API returns.

---

## BUG 2 — M3.4 "Open Finance" navigates to Dashboard instead of M2.4

**File:** `public/assets/js/projects.injector.js`

Find the `proj-focus-finance` button click handler. It does:
```javascript
window.location.hash = `finance-projects?project=${projectId}`;
```

The router in index.html does not handle query params in hash — it strips everything after `?`
and routes to whatever the base hash resolves to, which may be `#finance-projects` → Dashboard.

**Fix:** Check index.html router to find the correct route string for M2.4.
Per L062, M2.4 panel ID = `#panel-projects`, route = `projects`.
Change the navigation to:
```javascript
window.location.hash = 'projects';
```
Do not try to pass projectId in the hash for now — M2.4 loads all active projects anyway.

---

## BUG 3 — M3.4 "Send to Sales" / "✓ In Sales" returns 404

**File:** `functions/api/projects/[id].js` PATCH handler

The 404 is an Airtable error: `{ "error": "NOT_FOUND" }`.
This means the field `sales_forecast_sent` does not exist in the Projects Airtable table.

**Fix sequence:**
1. Read `functions/api/projects/[id].js` PATCH handler — find where `sales_forecast_sent` is written
2. Before the PATCH, add a check: use the Airtable Meta API to verify if `sales_forecast_sent`
   field exists in the Projects table
3. If it does not exist: create it via Meta API as `checkbox` type field, then proceed with the PATCH
4. Alternatively: catch the 404 on the PATCH, create the field, then retry the PATCH once

The simpler approach: add field creation to the setup/schema-projects.js endpoint so owner
can run it once. But since the project is already live, do the defensive check in the PATCH handler.

Also check: does `finance_opened` field exist? It's used in `project-finance.injector.js`
to filter which projects show in M2.4. If it doesn't exist in Airtable, M2.4 filter logic
will behave unpredictably.

If either field is missing, add both via Meta API in the PATCH handler before use.

---

## BUG 4 — M3.4 Button UX redesign (consolidate action buttons)

**File:** `public/assets/js/projects.injector.js`

Owner confirmed: the focus view should have exactly these buttons:
- `Edit` — always present
- `Open Finance` — show ONLY if `finance_opened !== true`
  When clicked: navigate to `#projects` (M2.4)
  After click: PATCH project with `{ finance_opened: true }`, then navigate
- `→ Send to Sales` — show ONLY if `sales_forecast_sent !== true` AND `type === 'Active'`
  When clicked: PATCH with `{ sales_forecast_sent: true }`, show success, re-render
- `✓ In Sales` — show ONLY if `sales_forecast_sent === true` (disabled badge, not clickable)

**Remove:** the Push Active button from focus view for Active projects (it only applies to Draft → Active transition which is done via the card view, not focus view).

Never show both "Open Finance" and "✓ In Sales" together without the Send to Sales step in between.

---

## BUG 5 — M2.4 Earn / Presale transactions not showing in expanded view

**File:** `public/assets/js/project-finance.injector.js`

The init function fetches:
```javascript
GET /api/transactions?source=presale
```

Read `functions/api/transactions.js` GET handler.
Check: does it support `?source=presale` filter? If not, presale transactions are never returned.

Also check: does `transactions.js` GET return `source` and `project_id` in the response fields?
If the GET doesn't include those fields in the Airtable `fields` param, they come back undefined.

**Fix in `functions/api/transactions.js`:**
In the GET handler fields list, ensure `source` and `project_id` are included in the Airtable
fields array (the list passed to `fields[]` param in the Airtable API request).

Also add support for `?source=presale` query param:
```javascript
const sourceFilter = url.searchParams.get('source');
if (sourceFilter) {
  // add to filterByFormula: AND existing filter, {source}='presale'
}
```

**Fix in `project-finance.injector.js`:**
After fetching presales, group by `project_id` field (not `r.fields.project_id` — data is
pre-flattened per L082). Verify the grouping key matches the project `id` format.

---

## BUG 6 — M2.4 Resources not showing in expanded Budget Cards section

**File:** `public/assets/js/project-finance.injector.js`

The `loadProjectResources(projId)` function calls `/api/projects/:id` and reads `res.resources`.

Read `functions/api/projects/[id].js` GET — check the exact key name for the resources array
in the response. It may be `resources`, `ProjectResources`, or nested differently.

Also check each resource object's field names vs what `resourceCardHtml(r)` expects.
Fields used in render: `r.item`, `r.cost`, `r.status`, `r.time_needed`.
Compare against what the API actually returns for resource records.

Fix field name mismatches. If field is `r.item_name` not `r.item`, update the render function.
Do not change the API response shape — fix the injector to match what the API returns.

---

## BUG 7 — M2.2 Projects lane shows wrong forecast (architectural fix)

**File:** `public/assets/js/sales.injector.js`

Find the Projects (forecast) section rendering. Currently shows:
- "Expected ฿300,000/mo" — REMOVE THIS
- Progress bar — REMOVE THIS
- "Launch date not set" — KEEP this

**Replace with:**
```
[Project name]  [phase badge]
Presale confirmed: ฿X,XXX  (if presale_total > 0)
Launch date not set  (if no launch date)  OR  Launch: D MMM YYYY
[Go to Project ↗]  button
```

No revenue forecast numbers. No progress bar. This section is a PROJECT PIPELINE TRACKER,
not a revenue forecast. Revenue forecasts live in M2.4 only.

The `presale_total` is already returned by `functions/api/sales.js` — use it.

---

## BUG 8 — Earn transactions (collection sale, presale) only appear in Cashflow

**Root cause to investigate:**

Owner saved:
- Entry → EARN → "Ploikong sale" category → amount ฿1,000 — expected: shows in M2.2 + M2.4
- Entry → EARN → "Collection sale" category → amount ฿1,000 — expected: shows in M2.2 Personal

Read `functions/api/transactions.js` GET handler carefully.
Read `functions/api/sales.js` — how does it fetch Personal → Manual Entries section?

The Personal section in M2.2 shows Manual Earn transactions WHERE:
- type = Income/Earn
- source ≠ 'presale'
- category group is NOT a Business lane category

Check: does `sales.js` actually query the Transactions table for manual earn entries?
If the Personal section is just rendering empty state "No manual earn entries yet" regardless,
the query is either missing or the filter is too restrictive.

Fix: ensure `sales.js` fetches personal earn transactions and passes them to the injector.
Ensure `sales.injector.js` renders them in the PERSONAL → MANUAL ENTRIES section.

For presale transactions: they only show in M2.4 expanded view (Bug 5 fix handles this).
They do NOT need to appear in M2.2 Personal — they belong in the Projects presale cards in M2.4.

---

## BUG 9 — M3.2 Collection Sell → Transaction saved with wrong source + no category

**File:** `public/assets/js/collection.injector.js`

**Confirmed from Airtable:** Transactions table row 146 — "Collection sale - Jen carabiner"
฿9,000 — Transaction IS created ✅ but `source = 'Manual'` and `category_id` is empty.

**Result:**
- M2.2 Personal → Asset Sales: cannot find it (no `source='collection'` to filter on)
- M2.1 Cashflow Pareto: label lookup fails → uncategorized (hidden under DEF CON 5 currently)
- M2.3 Expenses: irrelevant but label = blank looks broken

**Fix in `collection.injector.js` Confirm Sale handler:**

When the sale is confirmed and Transaction is POSTed to `/api/transactions`:
1. Set `source: 'collection'` in the POST body
2. Look up the "Collection sale" category from the categories list:
   - Fetch `/api/categories` once at injector init, cache in module scope
   - Find category WHERE `name === 'Collection sale'` (Per-earn group)
   - If found: include `category_id: [cat.id]` in POST body
   - If not found: log warning to console, post without category (do not block sale)
3. Keep all existing fields: `date`, `amount`, `description` (= "Collection sale - [item name]"),
   `entity` (= sold_via field from modal), `type: 'Income'`

**Also fix in `functions/api/sales.js`:**
The Personal → Asset Sales section must query Transactions WHERE `source = 'collection'`.
Check if this filter already exists. If not, add it alongside the existing personal earn query.

**Do NOT change** the Assets table update logic (sold_price, sold_date, status) — that is working.

---

## DO NOT TOUCH

- `public/assets/js/cashflow.injector.js` — cashflow is working correctly
- `public/assets/js/expenses.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/entry.injector.js` — presale bridge already working
- `functions/api/categories.js`
- `functions/api/sales.js` projects presale_total query — already correct, only change rendering

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/CC_PROMPT_qa-batch3-m34-m24-m22.md`
   Stamp: `✅ COMPLETE — [date] — M3.4 tasks/buttons, M2.4 resources/presales, M2.2 personal earn, M3.2 collection sale source`

2. Append to RULES.md (next L-number after L083):
   - `sales_forecast_sent` and `finance_opened` are checkbox fields — must exist in Airtable
     before PATCH. PATCH handler must verify field existence via Meta API on first use.
   - M2.2 Projects lane = pipeline tracker only. Never show forecast revenue numbers.
     Presale total = real money (show). Monthly target = planning only (never show in Sales).
   - Transactions GET must explicitly include `source` and `project_id` in the fields array
     or Airtable omits them from the response.
   - Collection Sell must always set `source='collection'` + `category_id` on the Transaction.
     Never post a sale transaction with source='Manual' — it becomes unroutable.

3. Update PROJECT_STATE.md:
   - Current state: list what each module does correctly after this fix
   - Next: CC_PROMPT_feat-sale-origins-and-hard-assets (P2 — new builds)

4. Commit docs: `docs: update RULES and PROJECT_STATE after qa-batch3`

---

## COMMIT ORDER

```
fix(m34): projects.injector.js — tasks render in focus view, resources render
fix(m34): projects.injector.js — Open Finance hash fix (#projects route)
fix(m34): projects.injector.js — button consolidation (Edit + Open Finance + Send to Sales)
fix(api): projects/[id].js — defensive field creation for sales_forecast_sent + finance_opened
fix(api): transactions.js — include source + project_id in GET fields, add ?source= filter
fix(m24): project-finance.injector.js — presale transactions show in expanded view
fix(m24): project-finance.injector.js — resources render correctly (field name match)
fix(m22): sales.injector.js — Projects lane removes forecast revenue, shows presale only
fix(m22): sales.injector.js — Personal earn transactions render from sales.js data
fix(m32): collection.injector.js — Sell sets source='collection' + category_id on Transaction
fix(api): sales.js — Personal Asset Sales section queries source='collection' transactions
docs: update RULES and PROJECT_STATE after qa-batch3
```

Branch: `fix/qa-batch3`
Merge to main after owner confirms:
- [ ] M3.4 focus view shows task list (grouped by phase or flat)
- [ ] M3.4 focus view shows resource list with costs
- [ ] M3.4 "Open Finance" navigates to Finance → Projects (M2.4)
- [ ] M3.4 "Send to Sales" succeeds (no 404)
- [ ] M3.4 buttons: only Edit + Open Finance (if not opened) + Send to Sales (if not sent)
- [ ] M2.4 expanded view shows Budget Cards (resources from Airtable)
- [ ] M2.4 expanded view shows Presale Records (presale transactions)
- [ ] M2.2 Projects lane: no forecast revenue shown, presale total shown if any
- [ ] M2.2 Personal → Manual Entries: manual earn entries appear
- [ ] M2.2 Personal → Asset Sales: Collection sale ฿9,000 (Jen carabiner) appears
