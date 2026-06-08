# CC_PROMPT_feat-utility-auto-charge.md
> ✅ COMPLETE — feat-utility-auto-charge — 2026-06-08
> Summary: entry.injector.js: autoWriteUtilityCharge() fires after expense save.
> Matches budget label "electric"/"water" case-insensitive, GETs utilities for year,
> skips if non-zero charge exists, POSTs only that charge field. Silent fail. RULES L181.

> Auto-populate Utilities charge from Transaction entry
> Branch: feat/utility-auto-charge

---

## CC INTRO

```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. public/assets/js/entry.injector.js
4. functions/api/utilities.js
5. functions/api/transactions.js

If any file exceeds token limit → skip immediately, never retry (L171).

Then read and execute: CC_PROMPT_feat-utility-auto-charge.md
Branch: feat/utility-auto-charge
```

---

## PROBLEM

Owner books an electricity or water expense via Entry → Transactions tab.
Then has to open Entry → Utilities tab and manually re-enter the same ฿ amount
into Electricity Charge or Water Charge field for the same month.

This is double entry of the same value. Fix it.

---

## EXPECTED OUTCOME

When a transaction is saved with a category that matches electricity or water
(check against category/budget name — "Electricity", "Home water",
"Drinking water" are the relevant names in the system):

1. The charge amount is automatically written to the Utilities record
   for that transaction's month — electricity_charge or water_charge field
2. If a Utilities record already has a non-zero value for that charge field
   for that month → do NOT overwrite it
3. The transaction save flow is never blocked or affected — auto-write
   is always silent fail
4. A small non-blocking success note appears briefly to confirm
   the auto-write happened

Owner then opens Utilities tab only to enter kWh or litre usage.
The ฿ charge is already there. One field to fill, not two.

---

## CONSTRAINTS

- Read the actual code before implementing — do not guess field names,
  button selectors, API shape, or response format
- Units (kWh / litres) are NEVER auto-written — owner adds those manually
- Never overwrite an existing non-zero charge value
- Auto-write must never block or error the transaction save
- Do NOT add new fields to Transactions table
- Do NOT change Utilities entry form behavior
- Minimum code change — touch only what is necessary

---

## FILES EXPECTED TO CHANGE

- `public/assets/js/entry.injector.js`
- `functions/api/utilities.js` — only if the existing PATCH/POST
  does not already support partial field updates for a given month

---

## PERMANENT RULE — add to RULES.md

```
L180 — Utility auto-charge: when a Transaction is saved with category
        matching electricity or water → auto-write charge to Utilities
        table for that month. Never overwrite existing non-zero values.
        Never auto-write units. Always silent fail — never blocks save.
```

---

## COMMIT

```
feat(entry): auto-write utility charge when electricity/water expense booked
docs: RULES L180 utility auto-charge
```

Branch: `feat/utility-auto-charge`
Merge to main after owner QA confirms.

---

## QA CHECKLIST

- [ ] Book expense category "Electricity" → open Utilities same month
      → Electricity Charge already populated with that amount
- [ ] Book expense category "Home water" → Water Charge auto-populated
- [ ] Book any other expense category → Utilities not affected
- [ ] Book electricity when Utilities charge already exists → not overwritten
- [ ] Transaction save works normally in all cases — no regression
