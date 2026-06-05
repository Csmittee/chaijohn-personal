# CC_PROMPT_hotfix-mindmap-layout.md
> Branch: fix/mindmap-layout
> File to modify: public/assets/js/mindmap.injector.js ONLY
> Quick fix — layout, canvas height, force tuning

---

## CC INTRO

```
New session. Ignore all previous context.
Read CLAUDE.md, RULES.md, public/assets/js/mindmap.injector.js
Then execute this prompt. Branch: fix/mindmap-layout
```

---

## ISSUES TO FIX (3 only)

### Fix 1 — Canvas too short

The canvas area must fill available viewport height minus header (~160px).
Find where canvas height is set and replace with:

```javascript
function getCanvasHeight() {
  return Math.max(500, window.innerHeight - 180);
}
```

Apply on init AND on window resize:
```javascript
window.addEventListener('resize', () => {
  canvas.width  = wrap.clientWidth;
  canvas.height = getCanvasHeight();
  wrap.style.height = getCanvasHeight() + 'px';
  draw();
});
```

Also set the wrapper div height dynamically on init:
```javascript
wrap.style.height = getCanvasHeight() + 'px';
```

---

### Fix 2 — Force simulation too flat (horizontal line)

Nodes spread horizontally because repulsion is too weak and there is no
vertical spread. Fix the simulation parameters:

Find the force tick / simulation loop. Update:

```javascript
// Repulsion: increase strength, add vertical component
const REPULSION  = 12000;   // was likely 800 — increase significantly
const DAMPING    = 0.78;    // was likely 0.85 — more damping = less jitter
const CENTER_X   = canvas.width  / 2;
const CENTER_Y   = canvas.height / 2;
const GRAVITY    = 0.004;   // gentle pull to center — increase from 0.002

// On init: spread nodes in a CIRCLE not randomly
// Replace random position init with:
nodes.forEach((n, i) => {
  const angle  = (2 * Math.PI * i) / nodes.length;
  const radius = Math.min(canvas.width, canvas.height) * 0.35;
  n.x = CENTER_X + radius * Math.cos(angle);
  n.y = CENTER_Y + radius * Math.sin(angle);
  n.vx = 0;
  n.vy = 0;
});
```

Run simulation for **500 ticks** (not 300) before freezing on initial load.

---

### Fix 3 — Node labels overlap

When 60+ nodes render, labels collide. Fix:
- Only show label when node radius >= 13 OR node is hovered/selected
- For small nodes (r < 13): show label only on hover
- Truncate labels to 12 chars max (not 14)
- Font size: `Math.max(8, n.r * 0.55)` instead of fixed 10px

---

## QA

- [ ] Canvas fills most of viewport height on load
- [ ] Nodes spread in 2D cluster (not horizontal line)
- [ ] Connected nodes pull toward each other visibly
- [ ] Labels readable without major overlap
- [ ] Pan and zoom still work correctly after resize fix

Merge to main after quick owner visual check.

---

## Fix 4 — Draggable nodes

Nodes must be individually draggable. When dragged, they pin in place.
Other nodes continue to repel/attract around the pinned node.

Add to module state:
```javascript
let dragNode = null;      // node being dragged
let dragOffset = { x: 0, y: 0 };
```

Mouse/touch events on canvas:

```javascript
canvas.addEventListener('mousedown', e => {
  const { x, y } = toWorld(e);
  const hit = nodes.find(n => Math.hypot(n.x - x, n.y - y) < n.r + 6);
  if (hit) {
    dragNode = hit;
    dragOffset = { x: hit.x - x, y: hit.y - y };
    hit.pinned = true;   // mark as pinned
    hit.vx = 0; hit.vy = 0;
    canvas.style.cursor = 'grabbing';
    e.stopPropagation();
  }
});

canvas.addEventListener('mousemove', e => {
  if (!dragNode) return;
  const { x, y } = toWorld(e);
  dragNode.x = x + dragOffset.x;
  dragNode.y = y + dragOffset.y;
  dragNode.vx = 0; dragNode.vy = 0;
  draw();
});

canvas.addEventListener('mouseup', () => {
  dragNode = null;
  canvas.style.cursor = 'grab';
});
```

In simulation tick — pinned nodes skip force calculation:
```javascript
// In tick():
nodes.forEach(n => {
  if (n.pinned) return;  // skip — user placed this node
  // ... apply forces normally
});
```

Pinned node visual indicator: small 📌 dot (2px yellow circle) at top-right of node.

Double-click node → if pinned, unpin it (remove pin, let simulation move it again).
If not pinned → open edit/detail as before.

Pinned positions are session-only for now (resets on reload).
Future: save positions to MindMapNodes via PATCH on `pos_x`, `pos_y` fields.

---

## Fix 5 — Disconnected nodes visual hint

Nodes with zero edges render with:
- Dashed border ring: `setLineDash([3,3])` circle stroke around the node
- Slightly lower opacity: 0.7 instead of full
- Tooltip on hover adds text: "No connections yet — use Add Connection to link this node"

This makes it clear they are valid nodes waiting for edges, not errors.

