# CC_PROMPT_fix-dashboard-circuit-v3.md
> M1.0 Dashboard — Circuit Board Visual Rebuild v3 (appearance + drag fix)
> Branch: fix/dashboard-circuit-v3
> Design locked from Chat session 2026-06-08

---

## CC INTRO

```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-finance.md
4. public/assets/js/dash-overview.injector.js   — current file (full replacement)
5. public/assets/js/expenses.injector.js         — copy meter card HTML/CSS structure only
6. functions/api/hard-assets.js                  — field names
7. functions/api/liabilities.js                  — field names
8. functions/api/transactions.js                 — field names

If any file exceeds token limit → skip immediately, never retry (L171).

Then read and execute: CC_PROMPT_fix-dashboard-circuit-v3.md
Branch: fix/dashboard-circuit-v3
```

---

## OBJECTIVE

Full replacement of `public/assets/js/dash-overview.injector.js`.

Previous version (v2) had these bugs — fix ALL of them:
1. Meter cards used wrong CSS — must match expenses injector exactly
2. Draggable nodes moved but connected SVG lines stayed fixed — broken
3. East/West blocks too wide, crowding YOU in center
4. Sub-asset circles (M3.3/M3.2/M3.4/MindMap) appeared on wrong side (left of East)
5. SVG clipped dragged nodes at edges — overflow hidden
6. Sub-text inside blocks unreadable — too small, too dark
7. 4 main blocks not vertically centered in SVG

Keep all existing data wiring, API calls, business logic. This is layout + appearance only.

---

## ARCHITECTURE — DRAGGABLE NODES WITH LINE REDRAW

This is the most critical fix. Previous version moved `<g>` elements but left
line coordinates hardcoded. That is wrong.

**Correct architecture:**

```javascript
// All draggable node positions stored in one object
const nodePos = {
  // North biz circles
  iFlex:    { x: 200, y: 58 },
  daje:     { x: 340, y: 46 },
  satu:     { x: 480, y: 46 },
  ploikong: { x: 620, y: 46 },
  // South debt entities
  house:    { x: 270, y: 558 },
  car:      { x: 410, y: 558 },
  ff:       { x: 270, y: 618 },
  newSlot:  { x: 410, y: 618 },
  // Right-side sub-asset circles
  m33:      { x: 640, y: 185 },
  m32:      { x: 640, y: 265 },
  m34:      { x: 640, y: 345 },
  mindmap:  { x: 640, y: 415 },
};

// Apply saved KV deltas on load
async function applyKVPositions() {
  const saved = await loadNodePositions(); // fetch /api/kv?key=dashboard:node-positions
  if (!saved) return;
  Object.keys(saved).forEach(k => {
    if (nodePos[k]) {
      nodePos[k].x += saved[k].dx;
      nodePos[k].y += saved[k].dy;
    }
  });
}

// SINGLE redraw function — called on every drag frame and on data load
function redrawCircuit(data) {
  const svg = document.getElementById('dashboard-svg');
  if (!svg) return;
  svg.innerHTML = buildSVGContent(nodePos, data);
  // Re-attach drag listeners after innerHTML replace
  attachDragListeners(svg, data);
}

// Drag handler
let dragState = null;
function attachDragListeners(svg, data) {
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-node]');
    if (!g) return;
    const key = g.dataset.node;
    dragState = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: nodePos[key].x,
      origY: nodePos[key].y,
    };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  svg.addEventListener('pointermove', e => {
    if (!dragState) return;
    const svgRect = svg.getBoundingClientRect();
    const scaleX = 900 / svgRect.width;
    const scaleY = 700 / svgRect.height;
    const dx = (e.clientX - dragState.startX) * scaleX;
    const dy = (e.clientY - dragState.startY) * scaleY;
    nodePos[dragState.key].x = dragState.origX + dx;
    nodePos[dragState.key].y = dragState.origY + dy;
    redrawCircuit(data); // redraws ALL lines from updated nodePos
  });

  svg.addEventListener('pointerup', async e => {
    if (!dragState) return;
    // Save deltas to KV
    const deltas = {};
    Object.keys(nodePos).forEach(k => {
      const def = defaultNodePos[k];
      deltas[k] = { dx: nodePos[k].x - def.x, dy: nodePos[k].y - def.y };
    });
    await saveNodePositions(deltas);
    dragState = null;
  });
}
```

`defaultNodePos` = copy of original positions before any KV deltas applied.
`buildSVGContent(nodePos, data)` = pure function, returns SVG innerHTML string using
current `nodePos` for ALL circle centers AND all line endpoints.

**Every single line in the SVG must use `nodePos[key].x / nodePos[key].y`
for its endpoints — no hardcoded coordinates anywhere in lines.**

---

## TOP STRUCTURE (HTML above SVG)

### Panel header — L147 MANDATORY
```html
<div class="panel-header-row">
  <h2 class="panel-title">Dashboard</h2>
  <span class="panel-subtitle">M1.0 · CIRCUIT</span>
</div>
```
Use the SAME classes as other injectors. Do NOT use inline styles on header.

### 4 Meter cards — COPY EXACT STRUCTURE FROM expenses.injector.js
Read expenses.injector.js and find the top 4-card grid HTML.
Use the IDENTICAL HTML structure and CSS classes.
Only change: labels and values for Dashboard.

| # | Label | Value | Color class |
|---|---|---|---|
| 1 | Net worth | haMV + collVal − liabBal | purple / `--accent` |
| 2 | Days to ฿0 | cashflow-sync daysToZero, else `—` | red |
| 3 | Total debt | sum liabilities current_balance | amber |
| 4 | Project value | `0 / 2 · Satu+Ploi` | green |

### KPI strip — 5 cells, keep existing logic exactly, no changes.

---

## SVG CANVAS

```
viewBox="0 0 900 700"
width="100%"
height="100%"
style="overflow:visible; display:block;"
id="dashboard-svg"
```

SVG container div:
```css
flex:1;
overflow:visible;
position:relative;
min-height:500px;
```

**overflow:visible on BOTH svg element AND container** — nodes must never clip at edges.

---

## FIXED BLOCK POSITIONS — 4 main blocks, vertically centered

Block size: width=175, height=155 each.
Vertical center of SVG (700px tall): mid = 350.
Two blocks stacked with 10px gap:
  Top block: y = 350 − 155 − 5 = 190
  Bottom block: y = 350 + 5 = 355

West boundary: x=30, y=175, w=195, h=345
East boundary: x=675, y=175, w=195, h=345

```
EARN block:      x=40   y=190  w=175  h=155   stroke=#22c55e  fill=#040d06
EXPENSE block:   x=40   y=355  w=175  h=155   stroke=#ef4444  fill=#0d0404
ASSET block:     x=685  y=190  w=175  h=155   stroke=#3b82f6  fill=#04060d
LIABILITY block: x=685  y=355  w=175  h=155   stroke=#ef4444  stroke-width=2  fill=#0d0404
```

Midpoints (for YOU hands — computed exactly):
```
Earn midpoint:      x=215 (right edge)   y=190+155/2 = 267
Expense midpoint:   x=215 (right edge)   y=355+155/2 = 432
Asset midpoint:     x=685 (left edge)    y=190+155/2 = 267
Liability midpoint: x=685 (left edge)    y=355+155/2 = 432
```

YOU circle: cx=450, cy=350 (true center of SVG)

---

## BLOCK CONTENT — text sizes and colors

All blocks follow this pattern. NO text smaller than 9px. NO dark-on-dark.

**EARN block:**
```
Header:  "M2.2 EARN IN"     10px bold monospace  fill=#22c55e   y=+18 from block top
Value:   ฿XX,XXX            26px bold            fill=#4ade80   y=+58
Sub:     "income this month" 9px                 fill=#4ade80   y=+76
Note:    "click → Sales"    8px                  fill=#166534   y=+92
Dots:    "● ● ●"            8px                  fill=#166534   y=+108
Surplus: "SURPLUS ฿XX,XXX"  8px bold             fill=#22c55e   y=+130 (bottom of block)
```

**EXPENSE block:**
```
Header:  "M2.3 EXPENSE OUT"  10px bold monospace  fill=#ef4444   y=+18
Value:   ฿XX,XXX             26px bold            fill=#f87171   y=+58
Sub:     "spent this month"  9px                  fill=#f87171   y=+76
Branch1: "① Life drain →"   8px                  fill=#9ca3af   y=+96
Branch2: "② Interest → debt →" 8px              fill=#9ca3af   y=+109
Branch3: "③ Owner invest → Liab →" 8px          fill=#9ca3af   y=+122
Dots:    "● ● ●"            8px                  fill=#7f1d1d   y=+140
```

**ASSET block:**
```
Header:  "TOTAL ASSETS"      10px bold monospace  fill=#3b82f6   y=+18
Value:   ฿XX,XXX,XXX         26px bold            fill=#60a5fa   y=+58
Sub:     "market value · X.Xx×" 9px              fill=#3b82f6   y=+76
Note:    "← inject from right" 8px               fill=#1e3a5f   y=+92
Dots:    "● ● ●"             8px                 fill=#1e3a5f   y=+108
NW:      "NET WORTH ฿X.XM"  8px bold             fill=#a78bfa   y=+130
```

**LIABILITY block:**
```
Header:  "TOTAL LIABILITIES" 10px bold monospace  fill=#ef4444   y=+18
Value:   ฿X,XXX,XXX          26px bold            fill=#f87171   y=+58
Sub:     "all active debt"   9px                  fill=#ef4444   y=+76
Line1:   "① Bank: ฿X,XXX,XXX" 8px               fill=#9ca3af   y=+96
Line2:   "② F/F: ฿XX,XXX"   8px                 fill=#9ca3af   y=+109
Line3:   "③ Owner (proj): ฿0" 8px               fill=#9ca3af   y=+122
Dots:    "● ● ●"             8px                 fill=#7f1d1d   y=+140
```

Surplus + Net Worth shown INSIDE their respective blocks (bottom line) — not as separate cells below.

---

## YOU NODE

```
cx=450  cy=350  r=44
Outer blink ring: r=54, stroke=#4c1d95, stroke-dasharray="3 3"
  animation: opacity 1↔0.1, 1.4s ease-in-out infinite
Inner: fill=#08050f, stroke=#7c3aed, stroke-width=2
"YOU" 16px bold fill=#a78bfa
"command center" 7px fill=#4c1d95
```

**4 HAND LINES** — static, stroke-width=3, stroke-linecap=round, NOT draggable:
These use FIXED block edge midpoints (not nodePos) since blocks don't move.

```javascript
// Hand endpoints — computed from fixed block positions
const hands = [
  { x1: 406, y1: 330, x2: 215, y2: 267, color: '#22c55e' }, // YOU → Earn midpoint
  { x1: 406, y1: 370, x2: 215, y2: 432, color: '#ef4444' }, // YOU → Expense midpoint
  { x1: 494, y1: 330, x2: 685, y2: 267, color: '#3b82f6' }, // YOU → Asset midpoint
  { x1: 494, y1: 370, x2: 685, y2: 432, color: '#ef4444' }, // YOU → Liability midpoint
];
// Each hand: <line> + <circle r="5" fill="color"/> at block-edge endpoint
```

---

## DRAGGABLE NODE DEFAULT POSITIONS

```javascript
const defaultNodePos = {
  // North — evenly spaced, y=58
  iFlex:    { x: 200, y: 58 },
  daje:     { x: 340, y: 46 },
  satu:     { x: 480, y: 46 },
  ploikong: { x: 620, y: 46 },
  // South — 2×2 grid centered under the 4-block area
  house:    { x: 310, y: 560 },
  car:      { x: 450, y: 560 },
  ff:       { x: 310, y: 625 },
  newSlot:  { x: 450, y: 625 },
  // Right-side sub-assets — stacked right of East boundary
  m33:      { x: 648, y: 205 },
  m32:      { x: 648, y: 285 },
  m34:      { x: 648, y: 365 },
  mindmap:  { x: 648, y: 430 },
};
```

All 12 nodes are draggable. `nodePos` starts as deep copy of `defaultNodePos`,
then KV deltas applied on load.

---

## NORTH CIRCLES — style per node

Each North circle: `<g data-node="[key]" style="cursor:grab">` containing circle + text.
Circle center from `nodePos[key]`. Radius=34.

Active (i-Flex, Daje — or any project with business_id):
```
stroke=#22c55e  fill=#050f08
name: 9px bold fill=#4ade80
value: 8px fill=#6b7280
"● ACTIVE": 7px fill=#22c55e
```
Inactive (Satu, Ploikong — no business_id):
```
stroke=#1a4028  stroke-dasharray="4 3"  fill=#080d14
name: 9px bold fill=#374151
value: 8px fill=#374151
"○ INACTIVE": 7px fill=#1a4028
```

**Launch logic**: fetch `/api/projects`, check each record for `business_id` field.
If `business_id` is set → render that project as ACTIVE solid North circle.
If not set → render as inactive dashed North circle.
Satu and Ploikong default inactive. business_id set = launched = moves to solid.

---

## SOUTH CIRCLES — style per entity

Each South circle: `<g data-node="[key]" style="cursor:grab">` containing circle + text.
Circle center from `nodePos[key]`. Radius=32.

House, Car: `stroke=#8b5cf6  fill=#08050f`
F/F: `stroke=#f59e0b  stroke-dasharray="5 3"  fill=#09070a`
+New slot: `stroke=#1f2937  stroke-dasharray="3 4"  fill=#06060a`

Text in each: name 10px bold, detail 8px fill=#6b7280, "↑ debt out" 7px fill=#ef4444.
F/F: "↑ obligation" in fill=#f59e0b instead.

---

## RIGHT-SIDE SUB-ASSET CIRCLES

CRITICAL: These circles must be positioned to the LEFT of their default x=648,
meaning they sit OUTSIDE the East boundary (East boundary starts at x=675).
At x=648, they are just to the left of the boundary's left edge — visible outside.

Wait — correct position: sub-assets are OUTSIDE East boundary to the RIGHT.
East boundary right edge = 675 + 195 = 870.
Sub-asset circles default x = 860 (just inside right edge, center of circle at 860).

Corrected defaultNodePos for sub-assets:
```javascript
m33:     { x: 855, y: 215 },
m32:     { x: 855, y: 295 },
m34:     { x: 855, y: 375 },
mindmap: { x: 855, y: 445 },
```

Each: `<g data-node="[key]" style="cursor:grab">` — draggable.
Radius=28.

M3.3: `stroke=#3b82f6  fill=#04060d`  — "M3.3 / Hard Assets / ฿X.XM"
M3.2: `stroke=#8b5cf6  fill=#04060d`  — "M3.2 / Collection / ฿X.XM"
M3.4: `stroke=#06b6d4  stroke-dasharray="4 3"  fill=#040a0d` — "M3.4 / Projects / launch→North"
MindMap: `stroke=#374151  stroke-dasharray="3 3"  fill=#080808` — "MindMap / idea→M3.4"

All text: 7px bold for type, 6px for detail. fill=#60a5fa / #a78bfa / #22d3ee / #4b5563.

---

## FLOW LINES — all use nodePos for endpoints

Every line endpoint must reference `nodePos[key].x` / `nodePos[key].y`.
Lines are rebuilt by `buildSVGContent()` on every drag frame.

Fixed endpoints (blocks don't move — use hardcoded block edge values):
```
Earn top-center:      x=127  y=190
Earn right-mid:       x=215  y=267
Earn bottom-center:   x=127  y=345
Expense right-mid:    x=215  y=432
Expense bottom-center: x=127 y=510
Asset left-mid:       x=685  y=267
Asset top-center:     x=772  y=190
Liability left-mid:   x=685  y=432
Liability bottom-center: x=772 y=510
```

### All flows:

**1. Active biz → Earn** (animated green, one per active node):
```
from: nodePos[nodeKey].x, nodePos[nodeKey].y + 34  (bottom of circle)
to:   Earn top-center (127, 190)
stroke=#22c55e  stroke-width=1.8  stroke-dasharray="6 3"
animate stroke-dashoffset 0→-18, dur=1.2s
Only render for active nodes (has business_id or toggle=active)
```

**2. Asset → active biz** (STATIC — no animation, thick hand):
```
from: Asset top-center (772, 190)
to:   nodePos[nodeKey].x, nodePos[nodeKey].y + 34  (bottom of each active circle)
stroke=#3b82f6  stroke-width=2  stroke-linecap=round  opacity=0.5
One line per active North node
```

**3. Earn → YOU**:
```
from: Earn right-mid (215, 267)
to:   cx=406, cy=330  (YOU left edge)
stroke=#22c55e  stroke-width=1.5  stroke-dasharray="5 3"
animate 0→-16, dur=1.8s
```

**4. Expense ① Life drain**:
```
from: Expense bottom-center (127, 510)
to:   x=30, y=580  (exits bottom-left)
stroke=#ef4444  stroke-width=1.5  stroke-dasharray="5 3"
animate 0→-16, dur=1.0s
label: "① life drain" 7px fill=#4b1c1c at x=35, y=560
```

**5. Expense ② Interest → House**:
```
from: Expense bottom-center (127, 510)
to:   nodePos.house.x, nodePos.house.y - 32  (top of House circle)
stroke=#ef4444  stroke-width=1.3  stroke-dasharray="4 3"
animate 0→-14, dur=1.3s
```

**6. Expense ② Interest → Car**:
```
from: Expense bottom-center (127, 510)
to:   nodePos.car.x, nodePos.car.y - 32
stroke=#ef4444  stroke-width=1.2  stroke-dasharray="4 3"
animate 0→-14, dur=1.5s
NO line to F/F — F/F has zero interest
```

**7. Expense ③ Owner invest → Liability**:
```
from: Expense right-mid (215, 432) — same height as liability midpoint
to:   Liability left-mid (685, 432)
stroke=#f97316  stroke-width=1.3  stroke-dasharray="4 3"
animate 0→-14, dur=2.0s
label: "③ owner invest" 7px fill=#7c2d12 at midpoint y-8
```

**8. House → Liability**:
```
from: nodePos.house.x, nodePos.house.y - 32
to:   Liability bottom-center (772, 510)  then arc up to left-mid (685, 432)
Use quadratic bezier: M {house.x} {house.y-32} Q 772 510 685 432
stroke=#8b5cf6  stroke-width=1.5  stroke-dasharray="5 3"
animate 0→-18, dur=2.0s
```

**9. Car → Liability**:
```
Same pattern as House but from nodePos.car
stroke=#8b5cf6  stroke-width=1.3  animate dur=2.2s
```

**10. F/F → Liability**:
```
from: nodePos.ff.x, nodePos.ff.y - 32
to:   Liability bottom-center bezier
stroke=#f59e0b  stroke-width=1.2  animate dur=2.4s
```

**11. YOU surplus → repay South**:
```
from: cx=450, cy=394  (YOU bottom)
to:   nodePos.house.x, nodePos.house.y - 32
stroke=#a78bfa  stroke-width=1.2  stroke-dasharray="4 4"  opacity=0.65
animate 0→-16, dur=3.0s
label: "surplus→repay" 6px fill=#2d1f4a
```

**12. Sub-assets → Asset block**:
```
m33: from nodePos.m33 left edge → Asset right edge (860, 267)
     Wait — sub-assets are RIGHT of East boundary. They inject INTO Asset from the right.
     from: nodePos.m33.x - 28  (left edge of circle)
     to:   Asset right edge = 675+175 = 850 → but Asset block right = 860? 
     
     Correct: Asset block x=685, w=175, so right edge = 860.
     Sub-asset circles at x≈855 are just outside the right edge.
     Lines go: from left edge of sub-circle → right edge of Asset block.
     
     from: nodePos.m33.x - 28, nodePos.m33.y
     to:   860, 267  (Asset right edge mid — use Asset right = 685+175=860, mid y=267)
     stroke=#3b82f6  stroke-width=1.3  stroke-dasharray="4 3"  animate dur=2.0s

m32: same pattern, stroke=#8b5cf6  animate dur=2.3s
m34: same pattern, stroke=#06b6d4  animate dur=2.5s  (dashed circle, project)
MindMap → M3.4: static dashed line between nodePos.mindmap and nodePos.m34
     stroke=#374151  stroke-width=1  stroke-dasharray="3 3"  no animation
```

---

## FOCUS BLINK LABELS — algorithm

Compute after data loads:
```javascript
const focusItems = [];
if (earn < expense)
  focusItems.push({ x:240, y:170, text:'⚡ EARN TOO SMALL', fill:'#ef4444' });
if (assetLeverage < 2.0)
  focusItems.push({ x:690, y:170, text:'⚡ BUILD ASSETS', fill:'#f59e0b' });
if (liabBal > totalAssets * 0.5)
  focusItems.push({ x:690, y:525, text:'⚡ DEBT HIGH', fill:'#ef4444' });
if (earn >= expense && surplus > 0)
  focusItems.push({ x:390, y:310, text:'✓ SURPLUS', fill:'#22c55e' });
```
Each: 8px monospace, blink animation opacity 1↔0.1, 1.4s infinite.

---

## KV PERSISTENCE

```javascript
const KV_POS_KEY = 'dashboard:node-positions';

async function loadNodePositions() {
  try {
    const r = await fetch('/api/kv?key=' + KV_POS_KEY, { credentials: 'same-origin' });
    if (r.ok) { const d = await r.json(); return d.value ? JSON.parse(d.value) : null; }
  } catch {}
  return null;
}

async function saveNodePositions(deltas) {
  try {
    await fetch('/api/kv', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KV_POS_KEY, value: JSON.stringify(deltas) })
    });
  } catch {}
}
```

If `/api/kv` returns 404 → drag works in-session only, no error shown to user.

---

## COMPASS + BOUNDARY LABELS

All 7px monospace, letter-spacing 2:
```
North label: "NORTH · INCOME GENERATORS" x=450 y=18 text-anchor=middle fill=#1a4028
South label: "SOUTH · LIABILITY CREATORS" x=450 y=695 text-anchor=middle fill=#2d1f4a
West boundary label: "WEST · M2.1 CASHFLOW" above boundary fill=#22c55e
East boundary label: "EAST · M3 BOUNDARY" above boundary fill=#3b82f6
```

---

## RULES TO ADD — RULES.md

```
L172 — Dashboard SVG: viewBox="0 0 900 700", overflow:visible both on svg and container.
        4 main blocks FIXED and CENTERED: Earn x=40 y=190, Expense x=40 y=355,
        Asset x=685 y=190, Liability x=685 y=355. All w=175 h=155. Never move these.

L173 — Dashboard YOU hands: 4 static lines stroke-width=3 from YOU (cx=450 cy=350)
        to exact midpoints: Earn(215,267) Expense(215,432) Asset(685,267) Liability(685,432).

L174 — Dashboard draggable nodes: North circles, South circles, right-side sub-asset circles.
        ALL stored in nodePos{}. redrawCircuit() rebuilds full SVG innerHTML on every drag frame.
        Lines use nodePos values — never hardcoded coordinates in line elements.
        KV key: dashboard:node-positions. Deltas saved on pointerup.

L175 — Dashboard focus blink algorithm: earn<expense→EARN TOO SMALL, leverage<2→BUILD ASSETS,
        liab>50%assets→DEBT HIGH, surplus>0→SURPLUS POSITIVE. 8px blink labels near each block.

L176 — Dashboard expense 3 branches: ① life exits bottom-left, ② interest to House+Car only
        (NOT F/F — zero interest), ③ orange owner invest line to Liability right-mid.

L177 — Dashboard liability 3 summary lines: ① Bank debt sum, ② F/F debt sum, ③ Owner ฿0.
        All sub-text in blocks: minimum 8px, fill=#9ca3af. Never dark-on-dark.

L178 — Dashboard sub-asset circles (M3.3/M3.2/M3.4/MindMap) default position RIGHT of
        East boundary (x≈855). They inject left into Asset block right edge. All draggable.
        MindMap→M3.4: static dashed line only, no animation.

L179 — Dashboard meter cards: use IDENTICAL HTML structure and CSS classes as
        expenses.injector.js top-4 card grid. No custom inline styles on meter cards.
```

---

## FILE TO REPLACE

`public/assets/js/dash-overview.injector.js` — full replacement.

Also update:
- `RULES.md` — add L172–L179 at top (newest first)
- `PROJECT_STATE.md` — Dashboard: v3 visual rebuild
- `docs/prompts/` — archive as `✅ COMPLETE — fix-dashboard-circuit-v3 — 2026-06-08`

---

## COMMIT ORDER

```
feat(dashboard): circuit v3 — redrawCircuit() drag architecture, all lines follow nodes
feat(dashboard): blocks vertically centered, sub-assets right of East, overflow visible
feat(dashboard): meter cards match expenses injector CSS, text readability fixed
docs: RULES L172-L179 dashboard v3 layout rules
docs: PROJECT_STATE dashboard v3 complete
```

Branch: `fix/dashboard-circuit-v3`
Merge to main after QA.

---

## QA CHECKLIST

- [ ] Panel header "Dashboard" present — L147
- [ ] 4 meter cards match expenses page visual style exactly
- [ ] KPI strip 5 cells correct
- [ ] SVG no clipping at any edge — drag node to corner, it stays visible
- [ ] North 4 circles: i-Flex + Daje solid green, Satu + Ploikong dashed gray
- [ ] Drag i-Flex circle → all connected lines redraw in real time, no line stays fixed
- [ ] Drag House circle → expense-interest line and debt-to-liability line both follow
- [ ] Drag M3.3 circle → inject line to Asset block follows
- [ ] Reload page → all dragged positions restored from KV
- [ ] West boundary green dashed, Earn top + Expense bottom equal height (155px)
- [ ] East boundary blue dashed, Asset top + Liability bottom equal height (155px)
- [ ] Sub-text in all 4 blocks readable — minimum 8px, visible on dark background
- [ ] Liability 3 summary lines visible and readable
- [ ] YOU centered, purple blink ring animating
- [ ] 4 hands hit exact vertical midpoints of each block
- [ ] Focus blink: "⚡ EARN TOO SMALL" visible (earn < expense currently)
- [ ] Expense: 3 separate flow lines — ① exits bottom-left, ② House+Car only, ③ orange
- [ ] South 2×2 grid: House+Car top row, F/F++slot bottom row
- [ ] Sub-asset circles RIGHT of East boundary, not left
- [ ] Static thick lines: Asset → active North biz circles (no animation)
- [ ] All animated flows run in correct direction
- [ ] Click Earn → Sales panel navigation
- [ ] Click Expense → Expenses panel navigation  
- [ ] Click biz node → toggle active/inactive, earn flow appears/disappears
- [ ] No console errors on load
