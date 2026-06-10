# CC_PROMPT_life-phase2-location-and-story-mount.md
> Life panel — location display redesign + story_refs schema + M3.1 mount
> Branch: direct to main

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
5. public/assets/js/life.injector.js          ← primary file, read full
6. public/assets/js/ideas-panel.injector.js   ← read full — do not break anything
7. functions/api/life-timeline/[id].js        ← read full — PATCH endpoint
8. functions/api/setup/life-schema.js         ← read full — may need new field

If any file exceeds token limit → skip immediately, never retry (L171).

Then read and execute: CC_PROMPT_life-phase2-location-and-story-mount.md
```

---

## SYSTEM ARCHITECTURE PRINCIPLE — READ FIRST

This system follows one universal rule for all data:

> **"If a thing was created and exists in the system, store only its index (record ID).
> Never duplicate content across tables. Everything lives once. Everything else points."**

This principle governs Problem 2 and 3 below. CC must not deviate from it.
Any solution that copies text content between tables is wrong by design.

---

## CONTEXT — LOCATION HISTORY

The owner's real location history:
- ~3 years in Jeddah (childhood)
- Majority of life in Thailand across 3 cities
- All other countries = short visits of 1–3 weeks

**Duration determines display type:**
- **Year-level row** (`month` is null) = full year lived there = a "stay"
- **Month-level row** (`month` is 1–12) = a visit within that month = a "visit"

CC must read the live injector to understand current rendering before changing anything.

---

## PROBLEM 1 — Location display: stays vs visits

### Observed
Location labels/dots pile up and become unreadable. The Life View timeline is cluttered.

### Suggested cause
Current rendering puts one label per year per location with no differentiation
between long stays and short visits. CC verifies in live file before acting.

### Required outcome

**Stays (year-level rows — `month` is null):**
- Rendered as a **horizontal swimlane bar** in a dedicated band BELOW the main curve
- Each unique location = auto-assigned color from fixed palette (6–8 colors, no lib)
- Bar spans x-range of consecutive years at that location. Gap = new bar.
- Bar height ~18px. Label inside bar if wide enough, otherwise label left of bar.
- Hover → tooltip: city name + year range + total years count

**Visits (month-level rows — `month` is 1–12):**
- Rendered as a **small floating dot** ABOVE the baseline (fixed y, no overlap with curves)
- Dot radius 4px. Color #f97316 (orange). No bar, no label on canvas.
- One dot per month-row that has a location value
- Dot x = year's x-coordinate on same scale as timeline
- Hover → tooltip: city name + month + year

**Remove** the old location rendering entirely.
**Add** these two new layers in its place.
Swimlane band: fixed-height zone below the SVG curve, clearly separated.
Keep inside same SVG or add a second narrow SVG strip below — CC judges from live code.
No external map library. Pure SVG + vanilla JS.

---

## PROBLEM 1B — Entry View month rows: inherit year values for empty fields

### Observed
Month View rows are mostly empty. Owner needs to see the year baseline as context
without confusing it with real entered data.

### Required outcome

In Entry View → Month View:
- After loading month rows, also fetch the year-level record (month=null) for that year
- Store year record in module state — fetch once, reuse for all 12 rows
- For each month row, for each field that is null/empty:
  render the year row's value as **dimmed placeholder** — `opacity:0.35`, italic
- Dimmed placeholder = visual reference only. Not dirty-tracked. Never sent to API.
- Owner clicks cell and types → becomes real entry, normal style, dirty-tracked, saves on Save All
- Owner clears cell back to empty → reverts to dimmed inherited display
- CC reads live bindEntryViewEvents() and dirty-tracking logic before implementing —
  must not break existing drag-fill or Save All behavior

---

## PROBLEM 2 — Add `story_refs` field to LifeTimeline schema

### Context
The `story` field (multilineText) = the owner's hand-typed narrative for that year.
This is the "global temperature" — a quick personal summary, always native to Life.

A separate field `story_refs` is needed to store references (record IDs) to content
that lives in other tables (M3.1 Ideas, and future sources). This keeps content in
its origin table and stores only the pointer here. No text duplication ever.

### Required outcome

**Schema change:**
- Add field `story_refs` (singleLineText) to the LifeTimeline Airtable table
- Use the Airtable Meta API — same pattern as functions/api/setup/life-schema.js
- Add this field addition to the setup endpoint as an idempotent operation:
  if field already exists → skip, do not error
- CC may create a new setup sub-endpoint or extend the existing one — judge from live code

**API change — flat() function in all life-timeline API files:**
- Add `story_refs` to the flat() mapper in:
  - functions/api/life-timeline.js
  - functions/api/life-timeline/[id].js
  - functions/api/life-timeline/batch.js
- `story_refs` is a comma-separated string of Airtable record IDs (e.g. "recABC,recDEF,recXYZ")

**PATCH logic:**
- When PATCHing `story_refs`, always APPEND the new ID to existing value
  (read current → append → write). Never overwrite. Deduplication: if ID already
  present in the string, do not add again.
- This append logic lives in functions/api/life-timeline/[id].js

---

## PROBLEM 3 — Life View: render story_refs as floating story nodes

### Context
The year node already has a heartbeat animation when `story` is non-empty.
`story_refs` IDs point to M3.1 Ideas entries. When refs exist, they should be
visible as additional floating nodes above the timeline — separate from the main
year node — so the owner can see "this year has referenced stories" at a glance.

### Required outcome

**In Life View SVG rendering:**
- For each year record that has `story_refs` (non-empty):
  - Parse the comma-separated IDs → count them
  - Render one **small square node** (6×6px) per ref, stacked vertically above
    the year's x-position, starting 30px above the baseline, spaced 14px apart
  - Node color: #8b5cf6 (purple — matches M3.1 Story type color)
  - Thin hairline stem (stroke-width:1, dashed, var(--border)) connecting
    the baseline year node up to the stack of square nodes
  - Hover any square node → tooltip: "Story ref [n of total] · click to view"
  - Click square node → fetch GET /api/ideas/[id] and display content in the
    story panel (section 3) with source badge "[Ideas · Story]"
    If fetch fails → show "Referenced story not available"

**Fetching referenced content:**
- Fetch each ref ID on demand (on click) — not on panel load
- Cache fetched content in module state for the session to avoid repeat fetches
- Use existing /api/ideas endpoint — CC reads the live API shape before coding

---

## PROBLEM 4 — M3.1: "→ Mount to Life" action for Story entries

### Context
When an owner writes a Story in M3.1 and wants to anchor it to a year in their
Life Timeline, the mount action appends the Ideas record ID to `story_refs` —
it does NOT copy any text. The story content stays in M3.1. Life only holds the pointer.

### Required outcome

In ideas-panel.injector.js, when entry_type = "Story" is open in the editor:
- Add button **"→ Mount to Life"** near existing save/publish buttons
  (CC picks best placement from reading live layout — do not guess)
- Button hidden for all non-Story entry types
- Clicking shows a small **inline input** (not a modal, not alert):
  "Year: [____] Month (optional): [____]  [ Mount ]"
- On Mount click:
  1. Validate year 1972–2037. If invalid → flash error.
  2. If month provided → validate 1–12.
  3. Fetch GET /api/life-timeline?from=YYYY&to=YYYY to find the year-level record ID
     (month=null row). If not found → flash "Year not found in Life Timeline".
  4. If month provided → also fetch month row for that year+month.
     If month row does not exist → create it first via POST /api/life-timeline
     with { year: YYYY, month: MM }. Then use the new record ID.
  5. PATCH the target record:
     - field: `story_refs`
     - value: append this Ideas entry's record ID (currentEntryId) to existing story_refs
     - The PATCH endpoint handles deduplication and append logic (Problem 2 above)
  6. Flash "Mounted to [year][month label if provided] ✓"
  7. No navigation away. Ideas panel stays open and unchanged.

- If entry has no content → flash "Write content first" and abort
- CC reads the live ideas-panel.injector.js save flow and currentEntryId variable
  before writing any code

---

## PERMANENT RULES — add to RULES.md

```
L191 — Life location display: year-level rows (month=null) → swimlane bar below
        timeline, color-coded by location, spans consecutive years. Month-level
        rows → small floating orange dot (#f97316) above baseline, hover tooltip only.
        No text label clutter on main SVG canvas.

L192 — System index principle: if content exists in one table, store only its
        record ID (pointer) in all other tables. Never duplicate text content
        across tables. Everything lives once. Everything else points.
        Applies to story_refs, and all future cross-table references.

L193 — LifeTimeline story architecture: story field = owner's hand-typed native
        narrative (global temperature for that year). story_refs field = comma-
        separated Airtable record IDs pointing to content in other tables (M3.1
        Ideas etc). Append-only for story_refs — never overwrite, deduplicate on append.

L194 — Life Entry View month rows: empty fields display year-level (month=null)
        value as dimmed inherited placeholder (opacity:0.35, italic). Inherited
        values are never sent to the API. Real typed values override and are
        dirty-tracked normally. Fetch year record once on Month View load.
```

---

## QA CHECKLIST (CC self-verify before merge)

**Location display:**
- [ ] Old location rendering removed from Life View
- [ ] Year-level locations render as colored swimlane bars below curve
- [ ] Consecutive same-location years merge into one bar
- [ ] Hover bar → tooltip: city, year range, total years
- [ ] Month-level locations render as small orange floating dots above baseline
- [ ] Hover dot → tooltip: city, month, year
- [ ] No overlap with financial/happiness/health/lifescore lines

**Schema + API:**
- [ ] story_refs field added to LifeTimeline in Airtable (idempotent)
- [ ] story_refs included in flat() mapper across all 3 life-timeline API files
- [ ] PATCH story_refs = append + deduplicate, never overwrite

**Life View story refs:**
- [ ] Years with story_refs show purple square nodes above baseline
- [ ] One square per ref ID, stacked vertically with hairline stem
- [ ] Hover square → tooltip "Story ref [n]"
- [ ] Click square → fetches Ideas entry and renders in story panel with [Ideas · Story] badge
- [ ] Fetch is on-demand (click), cached in module state for session
- [ ] Fetch failure shows graceful message, does not crash panel

**Mount from M3.1:**
- [ ] "→ Mount to Life" button visible only for entry_type = Story
- [ ] Inline year + optional month input (not modal, not alert)
- [ ] Year validation 1972–2037
- [ ] Fetches correct LifeTimeline record before PATCHing
- [ ] Creates month row if month provided and row does not exist
- [ ] PATCHes story_refs with entry record ID — no text copied
- [ ] Flash "Mounted to [year] ✓" on success
- [ ] Flash errors on invalid year / not found / no content

**Entry View:**
- [ ] Month View empty cells show dimmed inherited year values
- [ ] Inherited values never sent to API on Save All
- [ ] Typing over inherited → real edit, dirty-tracked
- [ ] Clearing → reverts to inherited display

**Hygiene:**
- [ ] No other injectors modified
- [ ] RULES.md updated with L191–L194
- [ ] PROJECT_STATE.md updated

---

## COMMIT ORDER

```
feat(schema): add story_refs field to LifeTimeline — idempotent setup
feat(api): story_refs append+deduplicate in life-timeline PATCH + flat() mappers
fix(life): location display — swimlane bars for stays, floating dots for visits
feat(life): story_refs render as purple floating nodes with on-demand fetch
feat(ideas): → Mount to Life button appends record ID to story_refs (no text copy)
fix(life): month view entry rows inherit year baseline as dimmed placeholder
docs: RULES.md L191–L194, PROJECT_STATE.md updated
```

Merge to main after full QA checklist passes.
Archive this prompt to docs/prompts/ after merge.
