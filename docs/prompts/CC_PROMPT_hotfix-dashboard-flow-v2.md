# CC_PROMPT_hotfix-dashboard-flow-v2.md
✅ COMPLETE — 2026-06-08
Summary: 7 fixes applied to dash-overview.injector.js. YOU node draggable (added to DEFAULT_NODE_POS), grey curved bezier hands, YOU→MindMap dashed line, removed orange expense→liability line, removed YOU→House repay line, replaced earn→YOU with earn→asset (green) + earn→liability (cyan) lines, fixed KV position persistence race condition with _initInProgress guard.

> Dashboard circuit — flow logic + YOU positioning fixes
> Quick fix — commit directly to main, no branch needed

---

## CC INTRO

```
Read CLAUDE.md and RULES.md.
File to edit: public/assets/js/dash-overview.injector.js
Read the file fully first, then apply only these changes.
If file exceeds token limit → skip, never retry (L171).
Commit directly to main.
```

---

## FIX 1 — YOU node becomes draggable

YOU circle (currently fixed at center) must become draggable
like the North and South circles — add it to nodePos{} with
default position at current center.

All 4 hand lines from YOU to the 4 blocks must follow YOU
as it moves — same redrawCircuit() pattern already in place.

---

## FIX 2 — YOU hands: lighter weight, grey, curved

Change all 4 hand lines from YOU to blocks:
- Stroke color: #374151 (grey)
- Stroke width: reduce to 1.5
- Change from straight lines to quadratic bezier curves
  so they bend naturally when YOU is dragged off-center
- Keep endpoint dots at block midpoints

---

## FIX 3 — New line: YOU → MindMap → M3.4

Add a line from YOU (12 o'clock edge, top of circle) to
MindMap circle (at its 7 o'clock or 5 o'clock edge).
Then the existing MindMap → M3.4 static dashed line stays.
This creates the chain: YOU → MindMap → M3.4 Projects.
Line style: thin dashed, color #a78bfa (purple), no animation.

---

## FIX 4 — Remove: Expense → Liability direct line

Remove the orange dashed line (owner invest) that goes
directly from Expense block right-mid to Liability block left-mid.
Delete this line entirely from buildSVGContent().

---

## FIX 5 — Remove: YOU → House repay line

Remove the purple dashed surplus→repay line from YOU bottom
to House circle top. Delete entirely.

---

## FIX 6 — Replace: Earn → YOU surplus line with 2 new lines

Remove the existing green animated line from Earn block to YOU.

Replace with 2 new lines FROM Earn block:

Line A — Earn → Total Assets (direct):
  From Earn block right-mid → Asset block left-mid
  Color: #22c55e (green), stroke-width 1.5, animated dashes
  Small label near midpoint: "earn → buy asset"

Line B — Earn → Total Liabilities (direct):
  From Earn block right-mid → Liability block left-mid
  (same horizontal level, crossing center)
  Color: #06b6d4 (cyan), stroke-width 1.3, animated dashes
  Small label near midpoint: "earn → fund project"

Both lines use fixed block edge midpoint coordinates
(blocks do not move), not nodePos.

---

## COMMIT

```
fix(dashboard): YOU draggable, grey curved hands, flow logic corrections
fix(dashboard): earn→asset + earn→fund-project lines replace surplus→YOU
```

No RULES.md update needed.

---

## FIX 7 — KV position load on init not persisting

**Problem**: Node positions save correctly on drag but reset to default
on every page reload. KV load is either not being awaited before
first render, or positions are applied after SVG is already drawn.

**Fix**:
Find the dashboard init sequence in the panelactivated handler.
Confirm this exact order:
1. Fetch all data (APIs) — parallel
2. Load KV node positions — await this BEFORE calling redrawCircuit()
3. Apply KV deltas to nodePos{}
4. Only then call redrawCircuit() for first render

If KV load is currently called after redrawCircuit() → move it before.
If KV load result is not awaited → add await.
If nodePos{} is reset to defaultNodePos anywhere after KV load → remove that reset.

The user must see their last saved layout immediately on page open —
not the default layout that then jumps to saved positions.
