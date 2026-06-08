# CC_PROMPT_feat-dashboard-circuit-M1.md
> M1.0 Dashboard — Circuit Board Redesign (Blood Flow)
> Branch: feat/dashboard-circuit
> Design session: 2026-06-07

---

## CC INTRO
```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-finance.md
4. PROJECT_STATE.md
5. public/assets/js/dash-overview.injector.js   — current dashboard (replace entirely)
6. public/assets/js/dashboard.injector.js        — cashflow injector (read for API patterns)
7. functions/api/cashflow.js                     — cashflow API
8. functions/api/liabilities.js                  — liabilities API
9. functions/api/assets.js                       — hard assets API (if exists, else note)
10. functions/api/budgets.js                     — budgets API

Then read and execute: CC_PROMPT_feat-dashboard-circuit-M1.md
Branch: feat/dashboard-circuit
```

---

## OBJECTIVE

Replace the current dash-overview.injector.js (4 stats + 4 mini charts) with a
full circuit-board "blood flow" diagram that visualises the owner's complete
financial system in one view. Design is fully locked from design session —
implement exactly as specified. Do not improvise layout or add features not listed.

---

## LAYOUT — COMPASS MODEL

The circuit has four compass zones rendered inside one SVG canvas inside the panel:

```
        NORTH — Income generators (business nodes)
WEST — M2.1 Cashflow        EAST — Asset boundary M3
        SOUTH — YOU · Liability creators
```

Flow direction is **counter-clockwise**:
Asset (East) → Business earn (North) → Cashflow/Expense (West) → Surplus to debt
(South) → good debt funds new Asset (East) → loop

---

## SECTION 1 — KPI STRIP (top, above circuit)

Five cells, left to right. All values pulled from Airtable APIs.
Show `—` when data unavailable. Never show 0 falsely.

| # | Label | Measure | Color | Data source |
|---|---|---|---|---|
| 1 | Income sufficiency | active biz profit ÷ life goal target (placeholder: show raw profit total) | #22c55e | cashflow API — income transactions, type=Income, exclude LiabilityCreation |
| 2 | Expense discipline | actual spend ÷ budget envelope × 100% | #ef4444 | budgets API + cashflow expense transactions |
| 3 | Liability load | total interest paid ÷ total liability balance × 100% | #f59e0b | liabilities API — monthly_payment as proxy if interest field absent |
| 4 | Asset leverage | total market_value ÷ total cost_basis (show as X.Xx) | #3b82f6 | assets API — market_value and cost fields |
| 5 | Project conversion | projects generating income ÷ total active projects | #06b6d4 | hardcoded: 0/2 · Satu + Ploikong · target Aug 2026 |

Each cell: label (7.5px uppercase monospace), value (13px bold), subtitle (7.5px),
3px progress bar beneath.

---

## SECTION 2 — NORTH · Business nodes

Four business nodes rendered as toggleable SVG groups across the top of the circuit.

| Node | Default state | Color |
|---|---|---|
| i-Flex Pilates | ACTIVE | #22c55e solid border |
| Daje Claw | ACTIVE | #22c55e solid border |
| Satu | INACTIVE | #22c55e dashed border, 35% opacity |
| Ploikong | INACTIVE | #22c55e dashed border, 35% opacity |

**Toggle behaviour (JS, no Airtable write needed):**
- Click node → toggles active/inactive state in memory
- Active: solid border, full opacity, animated dashed trace flowing south into M2.2
- Inactive: dashed border, 35% opacity, static dimmed trace
- Toggle only affects visual state + earn sum calculation in Box 1
- No sendPrompt() on toggle — owner feedback was that system warning is unwanted

**Each node shows:**
- Business name (9px bold, #4ade80 when active)
- "฿ profit/mo" placeholder (pulls from Sales API when connected — show — for now)
- Status label: "● ACTIVE" or "○ ~Aug 2026"

**Dual nature note:** Each business has asset value (equipment, inventory) AND earn
generation. Asset value face is FUTURE — placeholder slot only, not wired to API yet.
Show small "asset value: —" line inside node as placeholder.

---

## SECTION 3 — WEST · M2.1 Cashflow boundary

Dashed boundary rect containing two sub-panels stacked vertically.

**TOP — M2.2 Sales / Earn in** (green tinted)
- Large ฿ figure: sum of all Income transactions current month (exclude LiabilityCreation)
- Only counts ACTIVE business nodes (i-Flex + Daje currently)
- Label: "M2.2 SALES / EARN IN"
- Clickable → navigate to route `sales`

**BOTTOM — M2.3 Expenses out** (red tinted)
- Large ฿ figure: sum of all Expense transactions current month (exclude LiabilityPayment)
- Shows "vs ฿X budget" using total budget envelope
- Label: "M2.3 EXPENSES OUT"
- Clickable → navigate to route `expenses`

**BOTTOM of boundary — two heartbeat rows:**
- Row 1: MONTHLY SURPLUS = earn − expense. Positive = #22c55e, negative = #ef4444.
  Blink animation: 2-beat heartbeat pattern, 2.2s cycle. (CSS keyframes only)
- Row 2: NET WORTH = total assets − total liabilities. Color: #a78bfa.
  Slower blink: 3.2s cycle.

**Earn → Expense internal animated trace:** dashed red line flowing down inside boundary.

---

## SECTION 4 — EAST · Asset boundary M3

Dashed boundary rect containing four asset nodes.

| Node | Panel | Border | Notes |
|---|---|---|---|
| M3.1 Ideas | mindmap | #06b6d4 dashed | ignites M3.4 via animated cyan trace |
| M3.4 Projects | project-assets | #8b5cf6 dashed | Satu · Ploikong · 0% → earn soon · static no-flow trace to M2.2 |
| M3.3 Hard Assets | hard-assets | #3b82f6 solid | shows ฿ market value + leverage ×. ⚠ loan-bound badge. Animated trace → M2.2 |
| M3.2 Collection | collection | #3b82f6 faded | shows ฿ sellable value. Animated trace → M2.2 |

**Asset → M2.2 earn traces:** animated dashed blue lines flowing west from M3.3
and M3.2 into the M2.2 earn box. These represent passive income / asset sales.

**Business asset value arrows:** thin static dashed line from North business nodes
pointing toward East boundary — labeled "biz asset value →" — not animated,
placeholder only until asset valuation fields exist in Airtable.

---

## SECTION 5 — SOUTH · YOU · Liability creators

Horizontal row of liability nodes inside a purple-bordered boundary rect.
Label: "SOUTH · LIABILITY CREATORS"

| Node | Border | Content |
|---|---|---|
| House | #8b5cf6 | "10yr loan · ฿2.9M→7M+" · "drain → bank" |
| Car | #8b5cf6 | "loan → biz cash" · "drain → bank" |
| Family / Friends | #f59e0b dashed | "no interest · real obligation" · "respect debt · stay visible" |
| + new liability | #374151 dashed | empty slot — placeholder for future liabilities |

**South → Expense drain traces:** animated amber dashed lines flowing north-west
from each liability node up into the M2.3 expense box. These represent monthly
repayments draining from cashflow.

**South → East binding:** thin static dashed line from House/Car toward M3.3
Hard Assets — labeled "loan binds asset" — shows that these liabilities are
tied to hard assets on the east side.

**Clickable:** each node → sendPrompt() describing that liability in context.
Exception: Family/Friends node shows a note about visibility without judgment.

---

## FLOW ANIMATIONS — CSS only, no JS animation libraries

| Flow type | Class | stroke-dasharray | animation speed | color |
|---|---|---|---|---|
| Earn (North→West) | .te | 7 5 | 1.1s | #22c55e |
| Asset→Earn (East→West) | .ta | 7 5 | 1.7s | #3b82f6 |
| Expense drain (West→out) | .td | 5 5 | 1.4s | #ef4444 |
| Liability drain (South→West) | .tl | 6 6 | 2.2s | #f59e0b |
| Idea→Project | .ti | 3 5 | 3.0s | #06b6d4 |
| Inactive nodes | none | static | — | dimmed |

All animations: `stroke-dashoffset` from 0 to -26 (or -30 for slow), `linear infinite`.

---

## DATA FETCHING

Fetch in parallel on panel activation. Use existing API patterns from
dashboard.injector.js and cashflow injector. APIs to call:

```javascript
// All fetched on panelactivated event, route === 'dashboard'
Promise.all([
  api('/api/cashflow'),        // transactions
  api('/api/liabilities'),     // liabilities
  api('/api/budgets'),         // budgets
  api('/api/assets'),          // hard assets — if 404, handle gracefully
  api('/api/cashflow-sync'),   // sync point for cash balance
])
```

If `/api/assets` does not exist: show `—` in all asset fields, log a note, do not throw.

---

## TECH CONSTRAINTS (from RULES.md)

- Pure vanilla JS + CSS vars — no React, no Tailwind, no Chart.js on this panel
- SVG viewBox: 0 0 680 490 — do not change width
- Panel header must be inside renderPanel() — L147
- Route guard first line: `if (e.detail !== 'dashboard') return;`
- Panel display via CSS class `.active` — never inline style.display
- No shared bundles — this is dash-overview.injector.js only
- CSS animation: transform + opacity only — no layout animations
- All ฿ amounts: Math.round() before display, toLocaleString('en')
- Dark mode mandatory — use CSS vars, never hardcode colors except the
  PCB-specific palette (#0d1117 bg, #22c55e trace, #1a6b3c border) which
  are intentional fixed colors for the PCB aesthetic

---

## FILE TO REPLACE

`public/assets/js/dash-overview.injector.js` — full replacement, complete file.
Do not modify any other file except:
- RULES.md — add new rules (see below)
- PROJECT_STATE.md — update dashboard status
- docs/prompts/ — archive this prompt as ✅ COMPLETE after finishing

---

## PERMANENT RULES — add to RULES.md

L165 — Dashboard M1.0: circuit board compass layout — North=biz, West=M2.1 boundary
       (M2.2 top + M2.3 bottom), East=M3 assets, South=YOU liabilities. Counter-clockwise flow.
L166 — Dashboard business nodes: 4 nodes (i-Flex, Daje, Satu, Ploikong). Toggle active/inactive
       in JS memory only — no Airtable write. Active state filters earn sum in Box 1.
L167 — Dashboard KPI strip: 5 cells — Income sufficiency, Expense discipline, Liability load,
       Asset leverage, Project conversion. Order and color locked. Do not reorder.
L168 — Dashboard earn = profit only (Income transactions excluding LiabilityCreation source).
       Total revenue is NOT the correct measure. Fix note: business dashboard revenue→profit
       separation is a separate task.
L169 — Dashboard South row: House, Car, Family/Friends, +slot. Family/Friends = amber dashed,
       no-interest but visible obligation. New liabilities always added to South row.
L170 — Dashboard asset leverage = market_value ÷ cost_basis shown as multiplier (X.Xx).
       Not a percentage. House example: 7M ÷ 2.9M = 2.41×.

---

## COMMIT ORDER
```
feat(dashboard): circuit board compass layout — M1.0 blood flow redesign
docs: RULES L165-L170 dashboard circuit rules
docs: PROJECT_STATE M1.0 dashboard circuit complete
```

Branch: feat/dashboard-circuit
Merge to main after owner QA confirms circuit renders and KPI strip populates.

---

## QA CHECKLIST — owner verifies after deploy

- [ ] Circuit SVG renders without overflow or clipping
- [ ] North: 4 business nodes visible, i-Flex + Daje active (solid), Satu + Ploikong inactive (dashed)
- [ ] Toggle click: node switches active/inactive state, trace animates/stops accordingly
- [ ] West boundary: M2.2 earn total populates from API, M2.3 expense total populates
- [ ] Surplus heartbeat blinks — green if positive, red if negative
- [ ] Net worth value shows in second heartbeat row
- [ ] East: M3.3 hard assets shows market value + leverage multiplier
- [ ] East: M3.1→M3.4 idea trace animates
- [ ] South: House, Car, Family/Friends, +slot all visible
- [ ] South drain traces animate upward into M2.3
- [ ] KPI strip: all 5 cells show — placeholder (real data populates when APIs return)
- [ ] Clicking M2.2 box → navigates to sales panel
- [ ] Clicking M2.3 box → navigates to expenses panel
- [ ] Clicking asset nodes → navigates to correct M3 panel
- [ ] No console errors on load
- [ ] Sidebar remains visible (panel does not go full-screen)
- [ ] Panel header "Dashboard" present inside renderPanel() per L147
