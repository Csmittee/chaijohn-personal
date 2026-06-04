# CC_PROMPT_fix-pl-generator-p1e.md
> P&L Generator — computation structure + display bugs
> Branch: fix/pl-generator-p1e

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Read CLAUDE.md and RULES.md first.
Read the full live pl-generator.injector.js before forming any opinion.

Branch: fix/pl-generator-p1e
```

---

## CARRY OVER FROM p1d (verify if already fixed, fix if not)

- Revenue tab data not saving
- Save bar obstructing panel height
- 12mo/5yr toggle highlight not moving with selection
- Sidebar resizer stops working after a while

---

## PROBLEM 1 — P&L table structure wrong (CRITICAL)

Observed: SG&A appears before Gross profit. Labor missing as own line.
Current grouping does not reflect the intended 4-margin structure.

Required P&L table — 4 margin levels (implement exactly this):

```
Revenue
  ↳ Direct material       (dim, indent)
  ↳ Labor                 (dim, indent)
  ↳ Freight               (dim, indent)
  ↳ Other variable items  (dim, indent — if any)
Variable cost margin      (bold — Revenue minus variable costs only)
                          label: "Variable cost margin"

  ↳ Semi-fixed            (dim, indent)
  ↳ Fixed costs           (dim, indent)
Gross profit              (bold — after semi-fixed and fixed, before SG&A/depreciation)

  ↳ SG&A                  (dim, indent)
  ↳ Depreciation          (dim, indent)
EBITDA                    (bold)

  ↳ Interest              (dim, indent)
  ↳ Tax (est.)            (dim, indent)
Net profit                (bold, green if positive / red if negative)
─────────────────────────
Variable cost margin %    (dim row — variable cost margin / revenue)
Gross margin %            (dim row — gross profit / revenue)
EBITDA %                  (dim row — ebitda / revenue)
Net margin %              (dim row — net profit / revenue)
```

What each margin tells the owner:
- Variable cost margin: is the sale price and volume healthy? (below 60% = risk)
- Gross profit: after all true operating costs, is there real room to profit?
- EBITDA: does the business generate liquidity before financing/accounting items?
- Net profit: what actually remains in the balance sheet?

Also fix computePL() to match:
- variable_cost_margin = revenue − (direct_material + labor + freight + variable_items)
- gross_profit = variable_cost_margin − semi_fixed − fixed_costs
- ebitda = gross_profit − sga − depreciation
- net_profit = ebitda − interest − tax

---

## PROBLEM 2 — 5yr chart shows 60 monthly bars instead of 5 yearly bars

Observed: 5 years view shows 60 individual bars instead of 5 yearly bars.

Suggested cause: renderChart() passes raw 60-month pl[] array without aggregating
by year. Should group months 1-12 → Y1, 13-24 → Y2, 25-36 → Y3, 37-48 → Y4,
49-60 → Y5 and render 5 bars.
CC verify and fix.

Required: 5yr = 5 bars Y1–Y5. 12mo = 12 bars M1–M12.

---

## PROBLEM 3 — Balance Sheet and Cashflow tabs not rendering

Observed: clicking Balance Sheet or Cashflow shows blank area after Generate.

CC: read renderBSTable() and renderCFView() in live file. Trace why output is
empty and fix.

---

## PROBLEM 4 — PDF landscape and centered chart

Fix: add to @media print CSS inside renderPanel() style block:
```css
@page { size: A4 landscape; margin: 1cm; }
```
Ensure chart canvas is centered in print view.

---

## PERMANENT RULES — add to RULES.md

```
L143  P&L Generator — canonical 4-margin table structure (never change order):
      Revenue → [variable costs indented] → Variable cost margin →
      [semi-fixed, fixed indented] → Gross profit →
      [SG&A, depreciation indented] → EBITDA →
      [interest, tax indented] → Net profit →
      [margin % rows: variable cost margin%, gross margin%, EBITDA%, net margin%]

      Definitions:
      Variable cost margin = Revenue − direct material − labor − freight − variable items
      Gross profit = Variable cost margin − semi-fixed − fixed costs
      EBITDA = Gross profit − SG&A − depreciation
      Net profit = EBITDA − interest − tax

L144  P&L 5yr chart: aggregate monthly pl[] into 5 yearly totals before rendering.
      Show 5 bars Y1–Y5. Never pass raw 60-month array to chart in 5yr mode.
```

---

## AFTER ALL FIXES — MANDATORY

1. Archive → `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-p1e — [date]`
2. Add L143–L144 to RULES.md
3. Update PROJECT_STATE.md
4. Commit per fix, merge to main

---

## QA CHECKLIST

- [ ] P&L table shows 4 bold subtotals: Variable cost margin → Gross profit → EBITDA → Net profit
- [ ] SG&A and Depreciation are between Gross profit and EBITDA (not before)
- [ ] Labor appears as its own indented line under Revenue
- [ ] 4 margin % rows at bottom: variable cost margin%, gross margin%, EBITDA%, net margin%
- [ ] 5yr chart shows 5 bars Y1–Y5
- [ ] 12mo chart shows 12 bars M1–M12
- [ ] Balance Sheet tab renders content after Generate
- [ ] Cashflow tab renders content after Generate
- [ ] PDF prints landscape, chart centered
- [ ] Revenue data saves correctly
- [ ] 12mo/5yr toggle highlight follows selection
- [ ] Resizer works and stays working
- [ ] Save bar not obstructing panel height
