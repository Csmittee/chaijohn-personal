# CC_PROMPT_sanitize-earn-category-lookup-s14.md
> Remove dead Earn category lookups from collection + hard-assets injectors
> Session 14 — 2026-06-11
> Branch: fix/sanitize-earn-category-lookup-s14

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-data.md
4. public/assets/js/collection.injector.js  ← full file
5. public/assets/js/hard-assets.injector.js ← full file

Then read and execute: CC_PROMPT_sanitize-earn-category-lookup-s14.md
```

---

## CONTEXT

Transaction routing is done entirely via the `source` field (L103).
`category_id` on new transactions must never be written (L100).

Both injectors below do a live `/api/categories` fetch at init to find
an Earn category, then attach `category_id` to the transaction POST.
This is dead code — the category is never read back for any filter,
display, or routing purpose. `source` alone handles everything.

Owner has confirmed intent to delete all Earn categories from Airtable.
These lookups must be removed before that cleanup happens.

---

## FIX 1 — collection.injector.js

**Observed:** `loadCollectionSaleCategory()` fetches `/api/categories` at init,
finds `Collection sale` category, caches its ID in `collectionSaleCategoryId`.
The sale transaction POST includes `category_id: [collectionSaleCategoryId]`.

**Required outcome:**
- Remove `loadCollectionSaleCategory()` function entirely
- Remove the `collectionSaleCategoryId` module-level variable
- Remove the call to `loadCollectionSaleCategory()` from init
- Remove `category_id` from the transaction POST body in the Confirm Sale handler
- Keep everything else exactly as-is — sale flow, source='collection', all other fields

---

## FIX 2 — hard-assets.injector.js

**Observed:** `loadHardAssetSaleCategory()` fetches `/api/categories` at init,
finds `Hard asset sale` category, caches its ID in `hardAssetSaleCategoryId`.
The sale transaction POST includes `category_id: [hardAssetSaleCategoryId]`.

**Required outcome:**
- Remove `loadHardAssetSaleCategory()` function entirely
- Remove the `hardAssetSaleCategoryId` module-level variable
- Remove the call to `loadHardAssetSaleCategory()` from init
- Remove `category_id` from the transaction POST body in the Confirm Sale handler
- Keep everything else exactly as-is — sale flow, source='hard_asset_sale', all other fields

---

## PERMANENT RULES — add to RULES.md and .claude/rules/RULES-data.md

```
L212  Transaction POST must never include category_id — not for collection sale,
      not for hard asset sale, not for any new transaction. Source field is the
      sole routing mechanism (L100, L103). Any injector that looks up a category
      to attach category_id to a transaction POST contains dead code — remove it.
```

Add L212 to TOP of RULES.md (newest first).
Add L212 to RULES-data.md (newest first).

---

## DO NOT TOUCH

- functions/api/categories.js
- functions/api/transactions.js
- Any other injector
- Any API file

---

## AFTER FIX — MANDATORY

1. Move prompt → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — Remove dead Earn category lookup from collection + hard-assets injectors`

2. Update `PROJECT_STATE.md` — note: category_id no longer written on any transaction.
   Earn categories in Airtable Categories table are safe to delete.

3. Commit:
```
fix(collection): remove dead loadCollectionSaleCategory — source field routes, not category_id
fix(hard-assets): remove dead loadHardAssetSaleCategory — source field routes, not category_id
docs: RULES.md + RULES-data.md L212
docs: archive prompt + update PROJECT_STATE
```

Branch: `fix/sanitize-earn-category-lookup-s14`
Merge to main after QA checklist passes.

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] collection.injector.js: no reference to collectionSaleCategoryId anywhere in file
- [ ] collection.injector.js: no call to /api/categories at init
- [ ] collection.injector.js: transaction POST has no category_id field
- [ ] collection.injector.js: source='collection' still present on POST
- [ ] hard-assets.injector.js: no reference to hardAssetSaleCategoryId anywhere in file
- [ ] hard-assets.injector.js: no call to /api/categories at init
- [ ] hard-assets.injector.js: transaction POST has no category_id field
- [ ] hard-assets.injector.js: source='hard_asset_sale' still present on POST
- [ ] No other files modified
- [ ] L212 added to RULES.md (top) and RULES-data.md (top)
