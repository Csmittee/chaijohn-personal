# CC_PROMPT_fix-pl-generator-p1f.md
> ✅ COMPLETE — fix-pl-generator-p1f — 2026-06-04
> Direct mat/labor persistence, resizer restored, cashflow chart side-by-side
> Branch: fix/pl-generator-p1f → claude/youthful-wozniak-WLSs5

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Read CLAUDE.md and RULES.md first.
Read the full live pl-generator.injector.js before forming any opinion.

Branch: fix/pl-generator-p1f
```

---

## PROBLEM 1 — Direct material and Labor values not saving

Observed: user fills Direct material (฿/unit) and Labor (฿/unit) in Costs tab.
After Save and reload, both fields return to 0.
All other cost fields save correctly.

CC: trace where direct material and labor values are read in getInputs() and
where they are written back in renderPanel(). Find why these two specific
fields lose their values and fix.

---

## PROBLEM 2 — Sidebar resizer completely gone

Observed: the drag handle between sidebar and output area no longer exists.
Previously it worked then regressed. Now fully absent — sidebar width is fixed
and label text is truncated with no way to widen it.

CC: check if the resizer div exists in renderPanel() HTML output and if the
drag event wiring exists in init(). Restore fully so user can drag to resize
sidebar width between min 220px and max 480px.

---

## PROBLEM 3 — Cashflow chart not appearing side by side with P&L chart

Observed: after Generate, the chart area still shows only the P&L chart.
The cashflow bars (cash-in vs cash-out per period) should appear as the
right 50% of the chart area side by side with the P&L chart.

CC: check if the split chart layout was implemented in p1e. If not implemented —
add it now. Chart area after Generate must split 50/50:
- Left: P&L revenue vs total cost bars (existing)
- Right: per-period cash-in (green) vs cash-out (red) horizontal bars
  Cash-in = revenue. Cash-out = total costs. No payment term complexity.
  Periods match active toggle (12mo shows M1–M12, 5yr shows Y1–Y5).

---

## AFTER ALL FIXES — MANDATORY

1. Archive → `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-p1f — [date]`
2. Update RULES.md if any new pattern discovered
3. Update PROJECT_STATE.md
4. Commit per fix, merge to main

---

## QA CHECKLIST

- [x] Fill Direct material and Labor → Save → reload → values restored correctly
- [x] Drag handle visible between sidebar and output area
- [x] Drag resizes sidebar from min 220px to max 480px, label text fully readable
- [x] After Generate: chart area shows P&L chart on left AND cashflow bars on right
- [x] Cashflow bars show cash-in vs cash-out per period matching 12mo/5yr toggle
