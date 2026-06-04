# CC_PROMPT_fix-pl-generator-p1d.md
> ✅ COMPLETE — fix-pl-generator-p1d — 2026-06-04
> Revenue tab persistence (_revInputs), panel height calc(100vh-3rem), period toggle rebuildOutputHeader()
> Branch: fix/pl-generator-p1d

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Read CLAUDE.md and RULES.md first.
Read the full live file before forming any opinion.

Branch: fix/pl-generator-p1d
```

---

## QA STATUS

Working ✅: project name prominent, chart renders, generate triggers on 12mo/5yr
buttons, save works, no + New model button.

---

## PROBLEM 1 — Revenue tab data is lost on save (CRITICAL)

Observed: user fills in Revenue tab fields (units, price, probability, growth mode,
start period). Clicks Save. On reload or project switch the Revenue data is gone.
All other tabs (Costs, Assets, Funding) retain their data correctly.

Suggested cause: Costs/Assets/Funding tabs store their open-list data in module-level
arrays (_varItems, _semiItems, _fixedItems, _assetItems, _fundItems) which persist
across re-renders. Revenue tab fields are read directly from DOM via getInputs() at
save time — but if the Revenue tab is not currently active when save fires, its DOM
elements may not exist and getInputs() returns empty/default values for those fields.
CC verify the actual cause from the live file and fix it.

Required outcome: all Revenue tab field values are included in every save regardless
of which tab is currently active when Save is clicked.

---

## PROBLEM 2 — Save bar obstructs sidebar and output area height

Observed: the save bar at the bottom reduces the visible height of the left sidebar
and right output area. The working area feels cut off.

Suggested cause: the panel flex column layout gives the save bar a fixed height but
the middle working area (containing sidebar + output) is not set to flex:1 or
min-height:0, so it does not fill remaining space correctly.
CC verify and fix so sidebar and output use all available height above the save bar.

---

## PERMANENT RULES — add to RULES.md

```
L141  P&L Generator Revenue tab: all revenue input values (units, price, revenue_mo,
      probability, growth_mode, start_period, capacity fields) must be stored in
      module-level variables on every input change — same pattern as _varItems etc.
      Never rely on DOM-only state for save. getInputs() must always have values
      regardless of which tab is active.
```

---

## AFTER ALL FIXES — MANDATORY

1. Archive → `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-p1d — [date]`
2. Add L141 to RULES.md
3. Update PROJECT_STATE.md
4. Commit per fix, merge to main

---

## QA CHECKLIST

- [ ] Fill Revenue tab: units=100, price=500, probability=80, growth=Aggressive
- [ ] Switch to Costs tab, fill a value, click Save
- [ ] Reload or switch project and back — Revenue values are all restored correctly
- [ ] Sidebar and output area fill full panel height — save bar at bottom, not obstructing
- [ ] All previous fixes still working

---

## PROBLEM 3 — 12mo / 5yr toggle highlight does not move

Observed: clicking 12mo or 5yr switches the data correctly but the active
highlight (yellow/bold indicator) stays on whichever button was active at
render time — it does not move to the clicked button.

Suggested cause: same pattern as the sidebar tab bug fixed in p1b. The period
toggle buttons are rendered with inline active styles baked in at render time.
When the user clicks, _activePeriod is updated and data switches, but the
button styles are not updated — either the buttons are outside the re-rendered
container, or the post-click style update is not reaching the correct elements.
CC verify from live file and fix.

Required outcome: clicking 12mo highlights 12mo. Clicking 5yr highlights 5yr.
Active state must survive any re-render.

Add to permanent rules:
```
L142  P&L Generator period toggle (12mo/5yr): active button style must update on
      every click. Same rule as L136 — active state must live in _activePeriod
      module var and be applied on every render, not patched post-render.
```
