# CC_PROMPT_fix-dashboard-circuit-v2.md
> ✅ COMPLETE — fix/dashboard-circuit-v2 — 2026-06-08
> Full visual rebuild: 900×680 viewBox, exact midpoint YOU hands, 4 meter cards,
> draggable North/South nodes (KV persist), expense 3-branch flows, liability 3-line
> summary, focus blink algorithm, sub-asset circles, RULES L172-L178 added.
> M1.0 Dashboard — Circuit Board Visual Rebuild (appearance pass)
> Branch: fix/dashboard-circuit-v2
> Design locked from Chat session 2026-06-08

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
4. public/assets/js/dash-overview.injector.js   — current file (full replacement)
5. functions/api/hard-assets.js                  — field names for hard assets
6. functions/api/liabilities.js                  — field names for liabilities
7. functions/api/transactions.js                 — field names for transactions

If any file exceeds token limit → skip it immediately, never retry (L171).

Then read and execute: CC_PROMPT_fix-dashboard-circuit-v2.md
Branch: fix/dashboard-circuit-v2
```

---

## OBJECTIVE

Full visual rebuild of `public/assets/js/dash-overview.injector.js`.
All data wiring from the previous version is CORRECT — do not change APIs, data fetching,
or business logic. This is an appearance + layout pass only.

The current SVG is cramped, flows are misaligned, YOU hands don't hit block midpoints,
South circles are clipped, North circles clip at top.

Fix all of this with the exact coordinate system specified below.

---

## LAYOUT — COORDINATE SYSTEM (locked, implement exactly)

SVG canvas: `viewBox="0 0 900 680"` — wider and taller than current.
Background: `#060a10`. Grid pattern overlay `#0c1018` at 20×20.

### TOP STRUCTURE (above SVG — HTML divs)

**Panel header** (L147 — MUST be inside renderPanel()):
```html
<div style="display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px 4px;border-bottom:1px solid #1a2030;flex-shrink:0">
  <h2 style="margin:0;font-size:1rem;font-weight:700;color:var(--text)">Dashboard</h2>
  <span style="font-size:0.65rem;color:#374151;font-family:monospace">M1.0 · CIRCUIT</span>
</div>
```

**4 Meter cards** (restore — currently hidden by injector overwrite):
Grid of 4, gap 6px, margin-bottom 7px. Cards: `background:#111827; border:1px solid #1f2937`.
| # | Label | Value source | Color |
|---|---|---|---|
| 1 | Net worth | haMV + collVal − liabBal | #a78bfa |
| 2 | Days to ฿0 | from cashflow-sync daysToZero field, else `—` | #ef4444 |
| 3 | Total debt | sum liabilities current_balance | #f59e0b |
| 4 | Project value | hardcoded `0 / 2 · Satu + Ploikong` | #22c55e |

**KPI strip** (5 cells, existing logic — keep exactly, just re-render in new HTML):
Same as current implementation. No changes to data logic.

---

## SVG LAYOUT — EXACT COORDINATES

All positions are for `viewBox="0 0 900 680"`.

```
NORTH arc  — Y center: 58
West box   — X:18   Y:100  W:220  H:390
East box   — X:662  Y:100  W:220  H:390
YOU circle — cx:450 cy:330 r:46
South box  — X:120  Y:520  W:660  H:148
```

### NORTH — 4 business node circles

Evenly spaced across X 190–620, Y-center 58, radius 36.

| Node | cx | cy | Active stroke | Active fill |
|---|---|---|---|---|
| i-Flex Pilates | 190 | 58 | #22c55e | #050f08 |
| Daje Claw | 340 | 46 | #22c55e | #050f08 |
| Satu | 490 | 42 | #1a4028 dashed | #080d14 |
| Ploikong | 630 | 46 | #1a4028 dashed | #080d14 |

Each circle shows: name (10px bold, #4ade80 active / #374151 inactive), profit value or
"฿0 value" (8px), "● ACTIVE" or "○ INACTIVE" (7px). Clickable → toggle active state (L166).

North circles are **draggable** (see DRAGGABLE section below).

**Active indicator**: if node has business_id field in projects API response → treat as active
and render at North (solid). If no business_id → render dashed/inactive at North.
Satu and Ploikong start inactive until they have a business_id.

---

### WEST BOUNDARY — M2.1 Cashflow

```
Boundary rect: x=18  y=100  w=220  h=390  stroke=#1a4028  stroke-dasharray="5 4"
Label: "WEST · M2.1 CASHFLOW" at top, fill=#22c55e, 7px monospace
```

**M2.2 Earn block** (top half of west):
```
x=28  y=108  w=200  h=165  rx=5
fill=#040d06  stroke=#22c55e  stroke-width=1.5
Header: "M2.2 EARN IN" — 10px bold monospace, fill=#22c55e, y=124
Value: earn total — 30px bold, fill=#4ade80, y=162
Sub: "income this month" — 9px, fill=#4ade80, y=180
Note: "click → Sales panel" — 7px, fill=#1a4028, y=196
Heartbeat dot row — 7px, fill=#1a4028, y=210
Midpoint Y of this block = 108 + 165/2 = 190.5 → round to 191
```

**M2.3 Expense block** (bottom half of west):
```
x=28  y=283  w=200  h=165  rx=5
fill=#0d0404  stroke=#ef4444  stroke-width=1.5
Header: "M2.3 EXPENSE OUT" — 10px bold monospace, fill=#ef4444, y=299
Value: expense total — 30px bold, fill=#f87171, y=337
Sub: "spent this month" — 9px, fill=#f87171, y=355
3 branch labels (7px, fill=#4b1c1c):
  y=370: "① Life drain →"
  y=382: "② Interest → debt entity →"
  y=394: "③ Owner invest → Liability →"
Midpoint Y of this block = 283 + 165/2 = 365.5 → round to 366
```

**Surplus + Net Worth row** (inside west, below expense):
```
Two cells side by side: x=28 y=458 each w=96 h=24 gap=8
Left: SURPLUS — value in #22c55e
Right: NET WORTH — value in #a78bfa
```

---

### EAST BOUNDARY — M3

```
Boundary rect: x=662  y=100  w=220  h=390  stroke=#1a3a5c  stroke-dasharray="5 4"
Label: "EAST · M3 BOUNDARY" at top, fill=#3b82f6, 7px monospace
```

**Total Asset block** (top half of east — SAME dimensions as Earn):
```
x=672  y=108  w=200  h=165  rx=5
fill=#04060d  stroke=#3b82f6  stroke-width=1.5
Header: "TOTAL ASSETS" — 10px bold monospace, fill=#3b82f6, y=124
Value: haMV + collVal — 30px bold, fill=#60a5fa, y=162
Sub: "market value · X.Xx leverage" — 9px, fill=#3b82f6, y=180
Note: "← sub-assets inject from right" — 7px, fill=#1e3a5f, y=196
Pulse label — 7px, fill=#1e3a5f, y=210
Midpoint Y = 108 + 165/2 = 191
```

**Total Liability block** (bottom half of east — SAME dimensions as Expense):
```
x=672  y=283  w=200  h=165  rx=5
fill=#0d0404  stroke=#ef4444  stroke-width=2
Header: "TOTAL LIABILITIES" — 10px bold monospace, fill=#ef4444, y=299
Value: liabBal total — 30px bold, fill=#f87171, y=337
Sub: "all active debt" — 9px, fill=#ef4444, y=355
3 summary lines (7px, fill=#4b1c1c):
  y=370: "① Bank debt: ฿X,XXX,XXX"   — sum liabilities where creditor_type = Bank
  y=382: "② F/F debt: ฿XX,XXX"       — sum liabilities where creditor_type = Friend/Family
  y=394: "③ Owner (projects): ฿0"    — hardcoded ฿0 until tracked
Midpoint Y = 283 + 165/2 = 366
```

**Net asset position row** (inside east, below liability):
```
x=672  y=458  w=200  h=24  rx=4
"NET ASSET POSITION · ฿X.XM NET" — 10px, fill=#a78bfa
```

---

### SUB-ASSET NODES — outside East boundary, to the right

Three circles stacked vertically, X=632 (left edge touches outside-left of East boundary).
They inject LEFT into the Total Asset block.

```
M3.3 Hard Assets  — cx=632  cy=135  r=28  stroke=#3b82f6
M3.2 Collection   — cx=632  cy=210  r=28  stroke=#8b5cf6
M3.4 Projects     — cx=632  cy=285  r=28  stroke=#06b6d4  stroke-dasharray="4 3"
MindMap/Idea      — cx=632  cy=355  r=22  stroke=#374151  stroke-dasharray="3 3"
```

Each circle: type label (7px bold), name (7px), value (6px).
M3.4: add "(launch→North)" in 6px below name.
MindMap: "MindMap → M3.4" label, "idea seeds project" in 5px.

**M3.4 project-to-North logic**: If a project record has `business_id` field set →
render it as a SOLID North circle instead of dashed East circle.
Implement this check in the data layer — fetch `/api/projects` and check each record's
`business_id` field. If set → remove from East sub-nodes, render at North as active solid.

---

### YOU — center node

```
cx=450  cy=330  r=46
Outer blink ring: r=56, stroke=#4c1d95, stroke-dasharray="3 3"
  → blink animation CSS (opacity 1↔0.1, 1.4s ease-in-out infinite)
Inner circle: fill=#08050f, stroke=#7c3aed, stroke-width=2
Text: "YOU" — 16px bold, fill=#a78bfa, y=326
Text: "command center" — 7px, fill=#4c1d95, y=340
```

**4 HANDS from YOU** — thick static lines (stroke-width=3, stroke-linecap=round):

These must hit the EXACT vertical midpoint of each block:

| Hand | From (YOU edge) | To (block edge midpoint) | Color |
|---|---|---|---|
| → Earn | cx−46, cy−30 ≈ (404, 300) | right edge of Earn = (228, 191) | #22c55e |
| → Expense | cx−46, cy+20 ≈ (404, 350) | right edge of Expense = (228, 366) | #ef4444 |
| → Asset | cx+46, cy−30 ≈ (496, 300) | left edge of Asset = (672, 191) | #3b82f6 |
| → Liability | cx+46, cy+20 ≈ (496, 350) | left edge of Liability = (672, 366) | #ef4444 |

Endpoint dot: `<circle r="5" fill="[hand color]"/>` at the block-edge endpoint of each hand.

---

### FOCUS BLINK LABELS — algorithm driven

Compute after data loads. Show blinking ⚡ label near the relevant block:

```javascript
const focusItems = [];
if (earn < expense)             focusItems.push({ x:240, y:90,  text:'⚡ EARN TOO SMALL',     fill:'#ef4444' });
if (assetLeverage < 2.0)        focusItems.push({ x:700, y:90,  text:'⚡ BUILD ASSETS',        fill:'#f59e0b' });
if (liabBal > totalAssets*0.5)  focusItems.push({ x:700, y=480, text:'⚡ DEBT HIGH vs ASSET',  fill:'#ef4444' });
if (earn >= expense && surplus > 0) focusItems.push({ x:450, y:90, text:'✓ SURPLUS POSITIVE',  fill:'#22c55e' });
```

Each label: 8px monospace, blinking (same animation as YOU ring), no background.

---

### SOUTH — liability creator entities (2-row grid, centered)

```
South boundary: x=120  y=520  w=660  h=148  rx=6
stroke=#2d1f4a  stroke-dasharray="4 4"
Label: "SOUTH · LIABILITY CREATORS" at y=516, centered, fill=#4c1d95, 7px monospace
```

**2-row grid of circles** — South entities are **draggable** (see DRAGGABLE section).

Default positions (save/load from KV):
```
Row 1: House  cx=250 cy=558  r=34    Car  cx=380 cy=558  r=34
Row 2: F/F    cx=250 cy=616  r=34    +New cx=380 cy=616  r=34
```

House: stroke=#8b5cf6, fill=#08050f — name 10px bold, detail 8px, "↑ debt out" 7px #ef4444
Car:   stroke=#8b5cf6, fill=#08050f — same pattern
F/F:   stroke=#f59e0b stroke-dasharray="5 3", fill=#09070a — "↑ obligation" in #f59e0b
+New:  stroke=#1f2937 stroke-dasharray="3 4", fill=#06060a — gray placeholder

---

## DRAGGABLE NODES — KV persistence

**Which nodes are draggable**: North business circles + South debt entity circles only.
Main blocks (Earn, Expense, Asset, Liability) are NOT draggable — fixed positions.

**Implementation**:

```javascript
// KV key for node positions
const KV_POS_KEY = 'dashboard:node-positions';

// On load: fetch positions from KV API
async function loadNodePositions() {
  try {
    const r = await fetch('/api/kv?key=' + KV_POS_KEY, { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json();
      return d.value ? JSON.parse(d.value) : null;
    }
  } catch { /* ignore */ }
  return null;
}

// On drag-end: save positions to KV
async function saveNodePositions(positions) {
  try {
    await fetch('/api/kv', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KV_POS_KEY, value: JSON.stringify(positions) })
    });
  } catch { /* ignore */ }
}
```

**Drag implementation on SVG**:
- Add `data-draggable="true"` and `data-node-key="[nodeKey]"` to each draggable `<g>` element.
- Use `pointerdown` / `pointermove` / `pointerup` on the SVG element (not individual circles).
- On `pointerdown`: if target or ancestor has `data-draggable`, begin drag — record `startX/Y`.
- On `pointermove`: translate the `<g>` element using `transform="translate(dx, dy)"`.
- On `pointerup`: save all current positions to KV via `saveNodePositions()`.
- Positions stored as `{ nodeKey: { dx: number, dy: number } }` — delta from default position.
- On load: apply saved deltas to each node's default position.
- Check if `/api/kv` GET/POST endpoint exists. If not, skip KV persistence silently — dragging
  still works in-session using JS state only. Log "KV endpoint not found — positions not persisted".

---

## FLOW LINES — all animated with correct direction

All flows use `<animate attributeName="stroke-dashoffset">` for movement direction.
Markers defined in `<defs>`.

### Animated flows (marching ants):

| Flow | From | To | Color | stroke-width | dur | Notes |
|---|---|---|---|---|---|---|
| Biz earn → M2.2 | bottom of each active North circle | top of Earn block (x=128, y=108) | #22c55e | 1.8 | 1.2s | Only active nodes. Inactive = no flow |
| M2.2 Earn → YOU | right edge of Earn (228,191) | YOU left (404,310) | #22c55e | 1.5 | 1.8s | income surplus flowing |
| Expense ① Life | left edge of Expense (28,366) | exit point (8,500) going down | #ef4444 | 1.5 | 1.0s | drains out of system |
| Expense ② Interest → House | bottom of Expense (128,448) | top of House circle (250,524) | #ef4444 | 1.3 | 1.3s | interest cost |
| Expense ② Interest → Car | bottom of Expense (128,448) | top of Car circle (380,524) | #ef4444 | 1.2 | 1.5s | interest cost — NO line to F/F (no interest) |
| Expense ③ Owner invest → Liability | right of Expense (228,394) | left of Liability (672,394) | #f97316 | 1.3 | 2.0s | owner funds projects = becomes liability |
| South House → Liability | top of House (250,524) | bottom of Liability (772,448) | #8b5cf6 | 1.5 | 2.0s | debt balance inject |
| South Car → Liability | top of Car (380,524) | bottom of Liability (772,448) | #8b5cf6 | 1.3 | 2.2s | debt balance inject |
| South F/F → Liability | top of F/F (250,582) | bottom of Liability (772,448) | #f59e0b | 1.2 | 2.4s | obligation inject |
| YOU surplus → South repay | YOU bottom (450,376) | House top (250,524) | #a78bfa | 1.2 | 3.0s | dashed, opacity 0.65 |
| Sub-assets → Asset | left of each sub-circle | right of Asset block (872,191) | #3b82f6/#8b5cf6/#06b6d4 | 1.3 | 2.0s | inject from right |
| MindMap → M3.4 | MindMap circle top | M3.4 circle bottom | #374151 | 1.0 | — | static dashed only |

### Static lines (no animation — "hand" connections):
| Flow | From → To | Color | stroke-width | Notes |
|---|---|---|---|---|
| Asset → active biz | left edge of Asset (672,160) → bottom of active North circles | #3b82f6 | 2.0 | Static thick. Asset enables business. One line per active node |

---

## PCB AESTHETIC RULES

- Background: `#060a10` with `#0c1018` grid
- All block borders follow color of their zone: green=earn, red=expense/liability, blue=asset
- `stroke-dasharray` on inactive/dashed elements only
- Animated flows: `stroke-dasharray="6 3"` + `stroke-dashoffset` animation
- Direction: positive `stroke-dashoffset` from 0 to -18 = forward flow (left→right or top→bottom)
  Reverse for "drain out" flows that exit the system
- All SVG text: minimum 7px. Labels: uppercase monospace. Values: bold sans
- All ฿ amounts: `Math.round()` + `.toLocaleString('en')`

---

## DATA WIRING — UNCHANGED from current implementation

Keep all existing:
- `api()` fetch function
- `flat()` record mapper
- `_bizActive` toggle state
- `_dNav()` / `_dTog()` / `_dLiab()` global handlers
- All Airtable field reads (use field names confirmed from live files)
- `Promise.allSettled` parallel fetch pattern
- Route guard: `if (e.detail !== 'dashboard') return;`

Only change: rebuild `renderPanel()` + `svgCircuit()` + `kpiHTML()` + CSS with new layout.

---

## PERMANENT RULES — add to RULES.md

```
L172 — Dashboard circuit SVG viewBox fixed at 0 0 900 680. Do not change.
        Earn/Asset blocks: y=108 h=165. Expense/Liability blocks: y=283 h=165.
        YOU: cx=450 cy=330 r=46. South boundary: y=520 h=148.
        These coordinates are the locked layout — never adjust without owner approval.

L173 — Dashboard YOU hands: 4 thick static lines (stroke-width=3) from YOU to
        exact vertical midpoint of each block. Midpoints: Earn=191, Expense=366,
        Asset=191 (East), Liability=366 (East). Never eyeball — always compute.

L174 — Dashboard draggable nodes: North biz circles + South debt entity circles only.
        Positions saved to CHAIJOHN_KV key: dashboard:node-positions as JSON delta objects.
        Format: { nodeKey: { dx: number, dy: number } }. Load on init, save on pointerup.
        If /api/kv endpoint absent → drag works in-session only, no error shown to user.

L175 — Dashboard focus blink algorithm:
        earn < expense → blink "⚡ EARN TOO SMALL" near Earn block
        assetLeverage < 2.0 → blink "⚡ BUILD ASSETS" near Asset block
        liabBal > totalAssets × 0.5 → blink "⚡ DEBT HIGH vs ASSET" near Liability block
        earn >= expense AND surplus > 0 → blink "✓ SURPLUS POSITIVE" near YOU
        Animation: opacity 1↔0.1, 1.4s ease-in-out infinite.

L176 — Dashboard expense 3 branches: ① life drain exits left (no marker destination),
        ② interest lines go to HOUSE and CAR only — NO line to Family/Friends (zero interest),
        ③ owner invest line (orange #f97316) goes to Total Liability block directly.
        This is the correct expense flow model — never merge these into one line.

L177 — Dashboard liability block 3 summary lines (inside block, 7px):
        ① Bank debt: sum creditor_type=Bank from liabilities API
        ② F/F debt: sum creditor_type=Friend or Family from liabilities API
        ③ Owner (projects): hardcoded ฿0 until owner invest tracking is built
        These 3 lines replace any previous breakdown format.

L178 — Dashboard M3.4 project placement rule: if project record has business_id field set
        → render as solid active North circle (not East sub-node). business_id is set when
        owner clicks "launch" on a project. South entity circles are liability creators only.
```

---

## FILE TO REPLACE

`public/assets/js/dash-overview.injector.js` — full replacement, complete file.

Also update:
- `RULES.md` — add L172–L178 at top (newest first)
- `PROJECT_STATE.md` — Dashboard status: from ⚠️ QA fixes to ✅ v2 visual rebuild
- `docs/prompts/` — archive this prompt as `✅ COMPLETE — fix-dashboard-circuit-v2 — 2026-06-08`

---

## COMMIT ORDER

```
feat(dashboard): circuit v2 — full visual rebuild, correct layout coordinates
feat(dashboard): YOU hands to exact block midpoints, focus blink algorithm
feat(dashboard): draggable North/South nodes with KV position persistence
feat(dashboard): expense 3-branch flows, liability 3-line summary, asset static hands
docs: RULES L172-L178 dashboard circuit v2 layout rules
docs: PROJECT_STATE dashboard v2 visual rebuild complete
```

Branch: `fix/dashboard-circuit-v2`
Merge to main after owner QA pass.

---

## QA CHECKLIST

- [ ] Panel header "Dashboard" present — L147
- [ ] 4 meter cards visible: Net Worth, Days to ฿0, Total debt, Project value
- [ ] KPI strip 5 cells correct colors and data
- [ ] SVG fills full panel width, no clipping at top or bottom
- [ ] North: 4 circles evenly spaced, i-Flex + Daje solid green, Satu + Ploikong dashed gray
- [ ] West boundary green dashed, Earn block (top) and Expense block (bottom) equal height
- [ ] East boundary blue dashed, Asset block (top) and Liability block (bottom) equal height
- [ ] Earn and Asset blocks same height as each other ✓
- [ ] Expense and Liability blocks same height as each other ✓
- [ ] YOU circle centered between all 4 blocks, purple glow ring blinks
- [ ] 4 hand lines from YOU hit exact vertical midpoints of each block
- [ ] Focus blink label appears: "⚡ EARN TOO SMALL" (since earn < expense currently)
- [ ] Expense: 3 flow lines — ① exits left, ② to House + Car only (not F/F), ③ orange to Liability
- [ ] South: 2-row grid — House+Car top row, F/F++slot bottom row
- [ ] South circles draggable — drag and release, reload page, positions preserved
- [ ] North circles draggable — drag and release, reload page, positions preserved
- [ ] All flow animations run — marching ants moving in correct direction
- [ ] Static hands: asset → active North circles (thick, no animation)
- [ ] Sub-asset circles (M3.3, M3.2, M3.4, MindMap) outside East boundary to the right
- [ ] Sub-assets inject left into Asset block via animated blue lines
- [ ] Liability block shows 3 summary lines: Bank / F/F / Owner
- [ ] No console errors on load
- [ ] Click Earn block → navigates to Sales panel
- [ ] Click Expense block → navigates to Expenses panel
- [ ] Click M3.3 / M3.2 circles → navigate to correct panels
- [ ] Click South liability entities → opens AI panel with pre-filled prompt
