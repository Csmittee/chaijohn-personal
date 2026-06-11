# CC_PROMPT_mindmap-organic-s13.md
> Mind Map — organic visual upgrade
> Session 13 — 2026-06-11
> Branch: feat/mindmap-organic-s13

---

## CC INTRO (paste this to start CC)

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md
Then read and execute: CC_PROMPT_mindmap-organic-s13.md
```

---

## CONTEXT

Visual upgrade of mindmap.injector.js only.
No API changes. No Airtable changes. No other files touched.
Direction: calm, organic, living — like microorganisms floating in liquid.
Functional clarity is priority. Not flashy. Not 3D. Canvas 2D only.

Read public/assets/js/mindmap.injector.js fully before writing anything.

---

## CHANGE 1 — Node rendering: soft glowing circles

- Replace flat filled circles with radial gradient fills
- Gradient: center = node color at 80% opacity, edge = node color at 15% opacity
- Add soft outer glow: ctx.shadowBlur=18, ctx.shadowColor = node color at 40% opacity
- Node stroke: remove hard border, replace with 0.5px same-color stroke at 30% opacity
- Selected node: glow intensifies (shadowBlur=32, opacity 70%) — no hard ring

---

## CHANGE 2 — Breathing animation (idle pulse)

- Each node breathes independently: draw scale oscillates between 0.92 and 1.08
- Per-node phase offset using node index so no two nodes pulse in sync
- Breathing period varies by type: Business=4s, People=3.5s, all others=3s
- Implement as requestAnimationFrame loop running continuously
- Breathing affects draw scale only — never mutates node.x / node.y positions
- rAF loop stored in module-level variable
- Cancel loop when panel deactivates (panelactivated event, wrong route)
- Restart loop when panel activates
- Never run loop when panel is not active

---

## CHANGE 3 — Edge rendering: bezier curves

- Replace straight ctx.lineTo with quadratic bezier curves
- Control point: perpendicular offset from edge midpoint
- Offset magnitude: distance * 0.15
- Direction alternates by edge index (odd/even) so parallel edges fan out
- Default edge: rgba(200,200,220,0.07), lineWidth 0.8
- Highlighted edge (connected to selected): rgba(200,200,220,0.35), lineWidth 1.5,
  shadowBlur=6
- Edge label: shown only on highlight, at bezier midpoint, 9px mono

---

## CHANGE 4 — Idle drift

- After simulation settles (post 300 ticks), nodes enter drift mode
- Each node gets tiny random velocity vector: magnitude 0.08–0.15px per frame
- Direction rotates slowly: angle += 0.003 per frame per node
- Bounded: node approaching canvas edge by < 60px → gentle push back
- Drift does not re-trigger simulation forces — cosmetic only
- Dragging a node pauses its drift, resumes on release
- If drift causes position instability or performance issues: skip this change,
  note it in commit message, keep changes 1–3 only

---

## CHANGE 5 — Add Connection flow (verify only)

Read the current Add Connection modal code.
If the target node dropdown or save is broken: fix it.
If working correctly after reading live code: skip and note in commit.

---

## PERMANENT RULES — add to RULES.md

```
L210  MindMap visual: nodes use radial gradient + shadowBlur glow, no flat fill, no hard border.
      Breathing pulse per node via rAF loop, phase-offset by node index. Period 3–5s by type.
      Edges are quadratic bezier curves. Offset = distance * 0.15, alternates odd/even.
      Idle drift: post-simulation, nodes float at 0.08–0.15px/frame, slow direction rotation.
      rAF loop cancelled on panel deactivate, restarted on activate. Never runs off-screen.
```

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] Nodes render with radial gradient glow — no flat circles
- [ ] Each node breathes at different rhythm — not synchronized
- [ ] Edges are curved — no straight lines
- [ ] Selected node glows brighter, connected edges highlight softly
- [ ] Pan, zoom, drag all still work
- [ ] Add Node, filter pills, search all still work
- [ ] No console errors
- [ ] rAF loop stops when navigating away from mindmap panel

---

## COMMIT ORDER

```
feat(mindmap): organic visual — gradient nodes, breathing pulse, bezier edges, idle drift
fix(mindmap): Add Connection flow (if broken found, else omit)
docs: RULES.md L210
```

Branch: feat/mindmap-organic-s13
Merge to main after QA checklist passes.
Archive this prompt to docs/prompts/CC_PROMPT_mindmap-organic-s13.md
