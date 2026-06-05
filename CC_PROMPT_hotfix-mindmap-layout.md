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
