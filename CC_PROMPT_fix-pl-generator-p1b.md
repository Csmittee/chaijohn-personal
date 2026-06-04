# CC_PROMPT_fix-pl-generator-p1b.md
> P&L Generator — Part 1 remaining bugs
> Branch: fix/pl-generator-p1b

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. public/assets/js/pl-generator.injector.js  ← read the FULL file
4. public/index.html  ← read the navigate() function and route-panel CSS

Then execute this prompt.
Branch: fix/pl-generator-p1b
```

---

## CONFIRMED FACTS (read from live file — do not re-verify)

- `rebuildSidebar()` only replaces `#plg-sidebar-body` innerHTML
- Tab buttons are rendered in the parent div above `#plg-sidebar-body` in `renderPanel()`
- `init()` sets `p.style.display = 'flex'` as inline style on the panel element
- `#plg-gen-12` and `#plg-gen-5y` are rendered inside `renderFundingTab()` only
- `id="plg-subtitle"` exists in the header HTML
- Project selector change listener exists and updates subtitle

---

## PROBLEM 1 — Tab highlight stays on Revenue regardless of which tab is clicked

**Observed:** User clicks Costs / Assets / Funding — content area updates correctly
but the tab underline highlight never moves from Revenue.

**Confirmed cause:** Tab buttons live outside `#plg-sidebar-body`.
`rebuildSidebar()` never re-renders them so the active style never updates.

CC: fix however you judge best. The result must be: clicking any tab moves the
yellow underline to that tab.

---

## PROBLEM 2 — Panel content bleeds into other pages after idle

**Observed:** On first load all panels work correctly. After navigating around
or leaving idle, P&L Generator content appears overlapping other panels.

**Confirmed cause:** `init()` sets `p.style.display = 'flex'` as inline style.
The router's navigate() toggles `.active` CSS class to show/hide panels.
Inline style overrides the `.route-panel { display:none }` CSS class rule,
so the panel never truly hides after init() has run once.

CC: fix however you judge best. The result must be: navigating away from P&L
Generator fully hides it; no bleed into any other panel at any time.

---

## PROBLEM 3 — Generate buttons only visible on Funding tab

**Observed:** User cannot find or click Generate from Revenue / Costs / Assets tabs.
Buttons only appear when Funding tab is active because they are rendered
inside `renderFundingTab()`.

**Design intent:** Generate should be triggerable from any tab at any time —
user fills in Revenue, wants to generate immediately without going to Funding.

CC: move Generate buttons to a position that is always visible regardless of
which sidebar tab is active. Choose the best location in the layout.

---

## PROBLEM 4 — Project subtitle does not turn yellow after selecting a project

**Observed:** Selecting Ploikong or Satu 1.0 from dropdown — subtitle stays grey,
does not update to show project name in yellow.

**Confirmed:** `id="plg-subtitle"` exists. Change listener exists in the file.
CC: trace why the subtitle update is not firing and fix it.

---

## AFTER ALL FIXES — MANDATORY

1. Archive this prompt → `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-p1b — [date]`
2. Append any new patterns discovered to RULES.md
3. Update PROJECT_STATE.md
4. Commit with clear message per fix, merge to main

---

## QA CHECKLIST

- [ ] Click Costs tab → yellow underline moves to Costs. Click Revenue → moves back
- [ ] Navigate to P&L Generator → go to Dashboard → wait 30s → no P&L content on Dashboard
- [ ] On Revenue tab: Generate buttons visible. Click → KPI strip + chart + table populate
- [ ] Select project from dropdown → subtitle turns yellow with project name
- [ ] All other panels unaffected
