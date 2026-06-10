# CC_PROMPT_feat-life-panel.md
> M4.5 Life Timeline — full panel build
> Branch: feat/life-panel

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md
4. .claude/rules/RULES-data.md
5. public/index.html               ← confirm panel-life div + ROUTES array
6. public/assets/js/timemanagement.injector.js   ← reference panel pattern only
7. public/assets/js/mindmap.injector.js          ← reference only — do not modify
8. functions/api/setup/mindmap-schema.js         ← reference schema pattern only
9. functions/api/mindmap-edges.js                ← READ FULL — LifeConnections reuses this table

If any file exceeds token limit → skip immediately, never retry (L171).

Then read and execute: CC_PROMPT_feat-life-panel.md
Branch: feat/life-panel
```

---

## PURPOSE — READ THIS FIRST

Life Timeline is one half of a two-part personal intelligence system:

- **Mind Map** = everything connected RIGHT NOW — no time axis, pure relationship web
- **Life Timeline** = the moving train through time — every year is a station with its own story

Together they form the owner's complete AI memory layer. Life feeds history.
Mind Map feeds the present. Both will feed future AI agents that need to know
who this person is, what they built, and why.

Life Timeline serves four purposes:
1. Historical record — source for books, stories, self-biography
2. Goal measurement — past trajectory informs 20-year future objective, feeds M1.0 Dashboard
3. Creation journal — M3.1 Ideas flows INTO Life as permanent record (Phase 2)
4. Time-travelling Mind Map — "you did this before" reminder, rooted in time

---

## PART 1 — AIRTABLE SCHEMA

### New table: `LifeTimeline`

Call `GET /api/setup/life-schema` (create this endpoint — see Part 2A).

| Field | Type | Notes |
|---|---|---|
| `year` | number | Required. 1972–2037 |
| `month` | number | 1–12. Null = year-level row |
| `location` | singleLineText | City or province/country |
| `financial_earn` | number | Real ฿ value |
| `knowledge_earn` | number | 1–10 |
| `happiness_factor` | number | 1–10 |
| `health` | number | 1–10 |
| `relationship` | number | 1–10 |
| `creation` | number | 1–10 |
| `achievement` | number | 1–10 |
| `a_impact` | number | 1–10, weight of achievement |
| `failure` | number | 1–10 |
| `f_impact` | number | 1–10, weight of failure (negative pull) |
| `travel` | number | 1–10 |
| `t_impact` | number | 1–10 |
| `hobby` | number | 1–10 |
| `h_impact` | number | 1–10 |
| `decision` | multilineText | Key choice that still echoes today |
| `tags` | singleLineText | Comma-separated: business, loss, love, travel, creation |
| `story` | multilineText | Full narrative — shown on node click |
| `people` | singleLineText | Key person who entered or exited life that year |

**No `life_score` field in Airtable — computed client-side on load.**

### Connection table — NO NEW TABLE NEEDED

Life events connect to each other and to MindMapNodes using the EXISTING
`MindMapEdges` table. `from_id` and `to_id` can hold either a MindMapNode
record ID or a LifeTimeline record ID. The `edge_type` choices already cover
all life connections: `led_to`, `inspired_by`, `failed_to`, `spawned`, `knows`.
Read `functions/api/mindmap-edges.js` to understand the existing pattern.

---

## PART 2 — API ENDPOINTS

### 2A — Schema setup: `functions/api/setup/life-schema.js`

`GET /api/setup/life-schema`

Creates `LifeTimeline` table using Airtable Meta API.
Follow exact same pattern as `functions/api/setup/mindmap-schema.js`.
Idempotent — return `{ status: 'already_exists' }` if table exists.
Pre-seed rows: create one year-level row per year from 1972 to 2037 with
ONLY `year` field set, all other fields null. This gives the owner a
pre-populated grid to fill in. Check if table already has rows before seeding —
never re-seed.

### 2B — List + create: `functions/api/life-timeline.js`

- `GET /api/life-timeline?year=YYYY` → all rows for that year (year-level + months)
- `GET /api/life-timeline?from=YYYY&to=YYYY` → all rows in year range, sorted by year asc, month asc
- `GET /api/life-timeline` → all rows (for full life view curve)
- `POST /api/life-timeline` → create row, required: year

Flat response shape: `{ records: [ { id, year, month, location, ... } ] }`

### 2C — Update + delete: `functions/api/life-timeline/[id].js`

- `PATCH /api/life-timeline/:id` → update any fields, return updated flat record
- `DELETE /api/life-timeline/:id` → delete row

### 2D — Batch save: `functions/api/life-timeline/batch.js`

- `POST /api/life-timeline/batch` → body: `{ updates: [ { id, fields: {} } ] }`
- Updates up to 10 records in one Airtable batch call
- Returns `{ saved: N, errors: [] }`
- This powers the "Save All" button in entry view — all dirty cells saved once

---

## PART 3 — PANEL STRUCTURE (L147 compliant)

Panel: `#panel-life` Route: `life`
File: `public/assets/js/life.injector.js`

### Shell (renderPanel includes header — L147)

```
┌─────────────────────────────────────────────────────────┐
│  LIFE  //  your story through time          [KPI strip] │  ← fixed header
├─────────────────────────────────────────────────────────┤
│  [ ENTRY VIEW ]      [ LIFE VIEW ]                      │  ← mode toggle
│─────────────────────────────────────────────────────────│
│  LIFE VIEW:  SVG canvas — full width, full bleed        │  ← section 2
│  (curve + branches + location dots)                     │
│─────────────────────────────────────────────────────────│
│  ENTRY VIEW body  /  story popup panel                  │  ← section 3, scrollable
└─────────────────────────────────────────────────────────┘
```

Header is rendered INSIDE the injector's buildPanelShell(). Never assumed from index.html.
Full width — no max-width container. Responsive to panel resize.
Section 2 and 3 scroll together when in Entry View. Life View graph is fixed height (400px), body scrolls below.

---

## PART 4 — KPI STRIP (5 cells)

Render as stat chips identical in structure to other panels' stat strips.

| Cell | Value | Color |
|---|---|---|
| Years recorded | count of rows with any non-null data field | var(--yellow) |
| Peak life score | year label of highest computed life_score | #22c55e (green) |
| Lifetime earn | sum of all financial_earn formatted as ฿ compact | #a78bfa (purple) |
| Story entries | count of rows where story is not empty | #38bdf8 (cyan) |
| Connections | count of MindMapEdges where from_id or to_id is a LifeTimeline record | #f97316 (orange) |

For Connections count: fetch `/api/mindmap-edges` and count edges where
from_id or to_id starts with "rec" and matches any known LifeTimeline record ID.
If edge fetch fails — show "–" gracefully, never block load.

---

## PART 5 — LIFE VIEW

### Canvas

SVG canvas. Full panel width. Height: 400px fixed. `overflow: visible`.
`viewBox` computed from data range — always 1972 to max(2037, current year + 1).

### Lines rendered

Each line is a smooth SVG cubic bezier path. Render only toggled-on lines.

| Line | Color | Data source |
|---|---|---|
| Financial | #22c55e (green) | financial_earn normalized to −10/+10 |
| Happiness | #f5c518 (yellow/amber) | happiness_factor, 1–10 → −5/+5 |
| Health | #38bdf8 (cyan) | health, 1–10 → −5/+5 |
| Life Score | #a78bfa (purple) | computed life_score, already −10/+10 |

Toggle buttons above the graph: `[ Financial ] [ Happiness ] [ Health ] [ Life Score ] [ All ]`
Active toggle = var(--yellow) background, color #0a0a10. Inactive = ghost border.

### Life Score formula (client-side, not stored)

```javascript
function computeLifeScore(row) {
  const { financial_earn, knowledge_earn, happiness_factor, health,
          relationship, achievement, a_impact, failure, f_impact } = row;

  // Financial: normalize across dataset min/max → −10/+10
  // Computed after all rows are loaded using global min/max
  const finNorm = normalizeFinancial(financial_earn); // injected per row after range computed

  const happNorm  = norm110(happiness_factor) * 3;   // weight 3
  const healthNorm = norm110(health) * 2;            // weight 2
  const relNorm   = norm110(relationship) * 1.5;
  const achNorm   = norm110(achievement) * ((a_impact || 5) / 5);
  const failPen   = norm110(failure) * ((f_impact || 5) / 5) * -1.5; // negative
  const finScore  = (finNorm || 0) * 2;              // weight 2

  const raw = (happNorm + healthNorm + relNorm + achNorm + failPen + finScore)
              / (3 + 2 + 1.5 + (a_impact/5) + 2);
  return Math.max(-10, Math.min(10, raw));

  function norm110(v) {
    if (!v) return 0;
    return ((v - 1) / 9) * 20 - 10; // maps 1→−10, 10→+10
  }
}
```

### Scale toggle

```
[ Full life 1972–today ]   [ 10yr window ]  ← →
```

10yr window: shows 10 years at a time. Arrow buttons slide left/right by 5 years.
Full life: entire dataset compressed into SVG width.

### Year nodes on the timeline

- Every year with any data = a small circle on the baseline (y = center)
- Circle size: small default (r=4). If row has `story` text → **heartbeat animation** (pulse r=4→8→4, 1.8s infinite, color matches dominant line)
- Circle color: if life_score > 3 → green. If < −3 → red. Otherwise dim grey.
- Hover any circle → tooltip shows: year, location, life_score, tags
- Click any circle → open story panel (section 3) for that year

### Branch flows

Events that have `achievement`, `creation`, or `failure` data branch UPWARD (positive)
or DOWNWARD (negative) from the baseline as short vertical stems with a label node at tip.

- Achievement / creation → branch UP, color #22c55e, label = tags or "achievement"
- Failure → branch DOWN, color #ef4444, label = tags or "failure"
- Branch height proportional to a_impact or f_impact (1–5 = short, 6–10 = tall)
- Branch is a thin SVG line (stroke-width 1.5, dashed)
- Branch tip = small rounded rect with short label text (truncated 20 chars)

### Location dots

Below the SVG curve baseline (y + 30px), render location as small colored dot + short text label.
One dot per year where location is set. If same location repeats consecutive years — show only
one dot spanning those years as a wider underline bar.
Color: #f97316 (orange). Font: 9px monospace.
No map library. Pure SVG text + circle elements.

### Connections (MindMapEdges bridge)

After loading life records and edges:
- For each edge where both from_id and to_id are LifeTimeline record IDs →
  draw a curved arc ABOVE the timeline between those two year nodes
- Arc color: match edge_type — `led_to` = green, `failed_to` = red, `inspired_by` = amber, default = dim grey
- Arc label = edge.label text, rendered small (9px) at arc midpoint
- Click arc → show tooltip: from year, to year, edge_type, label

---

## PART 6 — ENTRY VIEW

### Sub-toggle

```
[ Year View ]   [ Month View — select year: ▼ ]
```

### Year View

Rows = years 1972–2037, pre-seeded from Airtable.
Each row is one year. Columns = field groups (not individual fields).

**Group headers (click to expand/collapse all rows in that group):**

| Group | Fields |
|---|---|
| Performance | financial_earn, achievement, a_impact, failure, f_impact |
| Emotional | happiness_factor, health, relationship, knowledge_earn |
| Hobby | hobby, h_impact, travel, t_impact, creation |
| Story | decision, story, people, tags, location |

Default: all groups collapsed. Owner expands one at a time.

**Row behavior:**
- Sticky column 1 = Year label (bold, var(--yellow) if has data, dim if empty)
- Each field = inline input cell. `type="text" inputmode="numeric"` for number fields (L133). `type="text"` for text fields.
- Click cell → focus + highlight border var(--yellow)
- **Drag fill**: click cell, hold, drag down → fills same value to all dragged rows (same field). Show a drag handle cursor on cell right edge.
- No up/down spinner arrows ever (L133)
- Dirty cells = light yellow tint background
- One **[ Save All ]** button fixed at top right of entry view — calls batch API with all dirty records
- Save shows "Saving X rows…" then "Saved ✓" or lists errors

### Month View

Select year from dropdown (1972–2037).
Rows = Jan–Dec (12 rows). Same group/column structure as Year View.
If no month rows exist for selected year → auto-create 12 blank rows on first load
(POST /api/life-timeline for each month 1–12 with year + month fields only).
Save works identically — batch save all dirty cells.

### Story Panel (section 3 — opens on node click from Life View)

Full-width panel below the graph.
Shows: Year heading, location, life_score computed, tags.
Four expandable sections: Story (multilineText), Decision, People, Connections.
Connections section lists all MindMapEdges linked to this record with link to
the connected node/year.
Edit button → makes all fields editable inline. Save → PATCH single record.
Close button → collapses section 3, graph returns to full view.

---

## PART 7 — VISUAL DETAILS

### Heartbeat animation (story nodes)

```css
@keyframes life-heartbeat {
  0%   { r: 4; opacity: 1; }
  14%  { r: 8; opacity: 0.8; }
  28%  { r: 4; opacity: 1; }
  42%  { r: 6; opacity: 0.9; }
  70%  { r: 4; opacity: 1; }
  100% { r: 4; opacity: 1; }
}
```

Applied to SVG circle via `animate` element or CSS animation on the circle element.
Only circles where `story` field is non-empty get heartbeat.

### Color system

| Element | Color |
|---|---|
| Financial line | #22c55e |
| Happiness line | #f5c518 |
| Health line | #38bdf8 |
| Life score line | #a78bfa |
| Achievement branch | #22c55e |
| Failure branch | #ef4444 |
| Location dots | #f97316 |
| Positive node | #22c55e |
| Negative node | #ef4444 |
| Neutral node | var(--text-dim) |
| Story heartbeat | matches dominant line color |
| Connection arc led_to | #22c55e |
| Connection arc failed_to | #ef4444 |
| Connection arc inspired_by | #f5c518 |
| Connection arc default | rgba(255,255,255,0.2) |

### No React, no Tailwind, no Chart.js

Pure SVG + vanilla JS + CSS vars. Follow existing injector patterns exactly.

---

## PART 8 — index.html WIRING

1. Confirm `life` is in the ROUTES array — add if missing
2. Confirm `#panel-life` div exists — add if missing
3. Add `<script src="/assets/js/life.injector.js"></script>` near other injector script tags
4. Do NOT modify any other panel

---

## PART 9 — OWNER ACTION AFTER DEPLOY

Owner must call once to create table and seed year rows:
```
GET https://chaijohn-dashboard.pages.dev/api/setup/life-schema
```
Expected: `{ "status": "ok", "created": true, "seeded": 66 }`

---

## PERMANENT RULES — add to RULES.md

```
L187 — Life Timeline panel: route=life, panel=#panel-life,
        injector=life.injector.js. Airtable table: LifeTimeline (year 1972–2037 pre-seeded).
        No life_score field in Airtable — computed client-side on every load.
        Connections to MindMapNodes use existing MindMapEdges table — no new connection table.

L188 — Life Timeline connections: MindMapEdges.from_id and to_id can hold LifeTimeline
        record IDs as well as MindMapNode IDs. This is the universal connection system
        across time and the present moment. Never create a separate LifeConnections table.

L189 — Life Timeline entry view: spreadsheet-style grid, groups collapsible (Performance,
        Emotional, Hobby, Story). All numeric inputs use type="text" inputmode="numeric" (L133).
        Drag-fill down to copy value across rows. One batch Save All — never per-row saves.
        No spinner arrows. No single-field form modals.

L190 — Life Timeline life_score formula: normalize financial across dataset min/max to −10/+10.
        Normalize 1–10 fields to −10/+10. Weight: happiness×3, health×2, relationship×1.5,
        achievement weighted by a_impact, failure weighted by f_impact (negative). Clamp −10/+10.
        Recompute on every data load — never cache or store in Airtable.
```

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] Panel loads without console errors on route `life`
- [ ] Header rendered by injector (not index.html) — L147 compliant
- [ ] KPI strip shows 5 cells with correct values
- [ ] ENTRY VIEW — Year View: 1972–2037 rows pre-loaded from Airtable
- [ ] ENTRY VIEW — click cell → editable inline, yellow border
- [ ] ENTRY VIEW — dirty cells tinted, Save All sends batch PATCH
- [ ] ENTRY VIEW — Month View: 12 rows for selected year, auto-creates if missing
- [ ] ENTRY VIEW — group collapse/expand works for all 4 groups
- [ ] ENTRY VIEW — drag fill: drag down copies value to multiple rows
- [ ] LIFE VIEW — Financial line renders as smooth curve
- [ ] LIFE VIEW — Happiness, Health, Life Score lines toggle correctly
- [ ] LIFE VIEW — 10yr window slides left/right
- [ ] LIFE VIEW — Full life scale compresses correctly
- [ ] LIFE VIEW — Story nodes pulse with heartbeat animation
- [ ] LIFE VIEW — Hover node → tooltip shows year, location, score, tags
- [ ] LIFE VIEW — Click node → section 3 story panel opens
- [ ] LIFE VIEW — Branch stems render up (achievement) and down (failure)
- [ ] LIFE VIEW — Location dots appear below baseline
- [ ] LIFE VIEW — Connection arcs render between linked year nodes
- [ ] `/api/setup/life-schema` creates table + seeds 66 year rows idempotently
- [ ] `/api/life-timeline?year=YYYY` returns correct rows
- [ ] `/api/life-timeline/batch` PATCH saves multiple dirty records
- [ ] No other injector files modified
- [ ] RULES.md updated with L187–L190

---

## COMMIT ORDER

```
feat(api): life-schema setup + seed 1972–2037 year rows
feat(api): life-timeline GET/POST + life-timeline/:id PATCH/DELETE + batch save
feat(life): life.injector.js — full panel, entry view, life view, SVG timeline
chore(index): wire life route + script tag
docs: RULES.md L187–L190 after feat-life-panel
```

Branch: `feat/life-panel`
Merge to main after owner confirms QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_feat-life-panel.md` after merge.
