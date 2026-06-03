# CC_PROMPT_fix-batch6.md
> Batch 6 — Cashflow M2.1 not showing presale/project_funding, M2.2 Projects lane empty
> Branch: fix/batch6
> Merge to main after owner QA confirms checklist

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L106 (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: CC_PROMPT_fix-batch6.md
```

---

## CONFIRMED STATE (do not re-investigate)

Airtable Transactions table has correct records:
- Row 147: type=Income, source=presale, project_id=reczUTiirUTQursev ✅
- Row 148: type=Income, source=presale, project_id=recNRJOw9Db4Rr0OD ✅
- Row 149: type=Expense, source=project_funding, project_id=recNRJOw9Db4Rr0OD ✅
- Row 150: type=Expense, source=project_funding, project_id=recNRJOw9Db4Rr0OD ✅

Data is correct. Problem is in the GET API and/or frontend display.

---

## READ FIRST (before touching any file)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `functions/api/transactions.js` — full GET handler, what fields are returned, any source/type filter
3. `public/assets/js/cashflow.injector.js` — loadAndRender(), how CF.transactions is built, how it filters for display
4. `public/assets/js/sales.injector.js` — Projects lane fetch, how presalesByProject map is built

Read all 4 before writing anything.

---

## BUG 1 — M2.1 Cashflow: presale and project_funding not appearing

**Diagnosis to verify:** The cashflow injector fetches:
```javascript
api('/api/transactions?start=' + wsStr)
```

Check `transactions.js` GET handler:
- Does it apply any source filter that would exclude `presale` or `project_funding`?
- Does it return `project_id` field in the response?
- Does it return `source` field in the response?

Also check `cashflow.injector.js`:
- Does `updateStats()` or `renderCards()` filter transactions by source before display?
- Does the list/card render skip transactions where `budget_id` is empty?
  (If yes — this is the bug. presale + project_funding have no budget_id, so they'd be invisible)

**Fix:**
Cashflow M2.1 = ALL transactions, no filter. Per RULES.md L103.

If the render skips transactions with empty budget_id, remove that filter from the cashflow display.
If the API GET excludes certain sources, remove that filter.
Cashflow must show everything — income and expense — with no source/budget filter.

---

## BUG 2 — M2.2 Sales Projects lane: presale transactions not appearing

**Diagnosis to verify:** The sales injector fetches:
```javascript
GET /api/transactions?source=presale
```

Check `transactions.js` GET handler:
- Does it support `?source=` query param filtering? If not — all transactions are returned
  and the injector tries to filter client-side. Check which approach is used.
- Is `project_id` included in the returned fields? If not, the grouping fails silently.

Check `sales.injector.js` Projects lane:
- How is `presalesByProject` map built? What field name is used for project_id?
- How are project cards matched to presale records? Is it matching by record ID or by name?

**Fix:**
Ensure:
1. `GET /api/transactions` returns `project_id` field in every record
2. `GET /api/transactions?source=presale` correctly filters OR client-side filter works
3. `presalesByProject` map keys match the actual `project_id` values (record IDs like `recXXXXXX`)
4. Project card lookup uses the project's Airtable record ID, not its name

---

## DO NOT TOUCH

- `public/assets/js/project-finance.injector.js` — presale save is working ✅
- `public/assets/js/expenses.injector.js`
- `public/assets/js/hard-assets.injector.js`
- `public/assets/js/liabilities.injector.js`
- `public/assets/js/collection.injector.js`
- `functions/api/expenses.js`

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/`
   Stamp: `✅ COMPLETE — [date] — Cashflow shows presale+project_funding, M2.2 Projects lane wired`

2. Append to RULES.md after L106:
   - L107: Cashflow M2.1 display must never filter by source or budget_id — show all transactions
   - L108: transactions GET must always return project_id field in response
   - L109: Sales Projects lane presalesByProject map key = Airtable record ID of project (recXXX), not name

3. Update PROJECT_STATE.md — mark Batch 6 ✅ COMPLETE

4. Commit docs separately: `docs: update RULES L107-L109 and PROJECT_STATE after batch6`

---

## COMMIT ORDER

```
fix(transactions): ensure project_id returned in GET response, support ?source= filter
fix(cashflow): remove any source/budget_id filter from M2.1 display — show all transactions
fix(sales): wire presalesByProject map correctly using project record IDs
docs: update RULES L107-L109 and PROJECT_STATE after batch6
```

Branch: `fix/batch6`
Merge to main after owner confirms:
- [ ] M2.1 Cashflow — presale transactions appear as green income rows
- [ ] M2.1 Cashflow — project_funding transactions appear as red outflow rows
- [ ] M2.2 Sales → Projects lane — presale rows grouped under correct project
- [ ] M2.3 Expenses — still clean (no presale, no project_funding)
