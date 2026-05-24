# 📚 LESSONS LEARNED — Chaijohn Dashboard
> CC reads this at the start of every session. Never delete lessons — only add.
> Last updated: 2026-05-24

---

## HOW TO USE

- Every CC session starts with reading this file fresh from repo
- Lessons are referenced in CC prompts by ID (e.g. "follow L033, L075")
- Chat references lesson IDs instead of re-explaining rules
- New lessons are appended after every CC session with next available L-number
- Sequential L-numbers across entire project lifetime

---

## PHASE 0 — Initial Build

### L001 — Airtable multipleRecordLinks at table creation
**Problem:** Creating a table with `linkedTableId` in multipleRecordLinks options fails if you include `prefersSingleRecordLink` or `isReversed`.
**Rule:** When creating tables via Airtable API, use ONLY:
```js
{ type: 'multipleRecordLinks', options: { linkedTableId: id } }
```
Never add `prefersSingleRecordLink` or `isReversed` at table creation time. These can be added later via the field-update endpoint.
**Tag:** #airtable #schema

### L002 — Airtable checkbox color values
**Problem:** Airtable Meta API rejects `'green'` or `'blue'` as checkbox colors.
**Rule:** Always use `'greenBright'` and `'blueBright'` (not `'green'`/`'blue'`).
**Tag:** #airtable #schema

### L003 — Schema seed timeout
**Problem:** Seeding 84 records one at a time (×250ms delay) = 21 seconds, hits Cloudflare Function timeout.
**Rule:** Always batch-create records: 10 records per POST to Airtable. Reduces API calls from 84 to ~9.
**Tag:** #airtable #performance #cloudflare

### L004 — Cloudflare Pages Functions shared helpers
**Problem:** Shared helper functions placed in various locations caused import path chaos.
**Rule:** All shared helpers go in `functions/_airtable.js`. Import using relative path one level up only: `import { ... } from '../_airtable.js'`. Do not nest helpers in subdirectories.
**Tag:** #cloudflare #architecture

---

## PHASE 1–4 — Dashboard + Diary Fixes

### L005 — Drop Zone approve button not saving
**Problem:** Approve button on Drop Zone cards was calling the wrong endpoint or missing record ID.
**Rule:** Approve flow: POST /api/dropzone/approve with `{queue_record_id, suggested_type, prefilled_data}`. The queue record `approved_record_id` field must be updated after the target record is created.
**Tag:** #dropzone #airtable

### L006 — Diary save destination logic
**Problem:** Risk of diary entries routing to wrong Airtable base.
**Rule:** ALL diary entries ALWAYS save to `chaijohn-core` Diary table regardless of type. ONLY when `publish_to_web=true` AND `entry_type=Blog`: ADDITIONALLY push a copy to `AIRTABLE_BUSINESS_BASE_ID` → Blogs table (fields: title, content, tags, date, published_url). Personal base never receives from business base.
**Tag:** #diary #airtable #architecture

### L007 — Diary preview overwrites content
**Problem:** Preview mode hid the textarea, making user think content was lost.
**Rule:** Render markdown preview in a separate div BELOW or BESIDE the textarea. Never replace the textarea. Use Edit/Preview toggle — Edit shows textarea, Preview shows rendered markdown. Content never disappears.
**Tag:** #diary #ux

### L008 — Entry type options for Diary
**Problem:** "Finance note" was an entry_type but not useful. Missing "Project" and "Skill".
**Rule:** Diary entry_type options: Story / Idea / Blog / Project / Skill. Update both HTML dropdown and Airtable singleSelect field choices. Never include "Finance note".
**Tag:** #diary #airtable

### L009 — Connected Concept should be a remembered dropdown
**Problem:** Plain text input for connected_concept lost previous values — user had to retype.
**Rule:** Implement as combo input: fetch distinct `connected_concept` values from Diary table + include preset global concepts (obsidian, project-memory, skill-library, business-idea, personal-growth, finance-concept). Show as dropdown suggestions while allowing new text values. Save as plain text to Airtable.
**Tag:** #diary #ux

---

## PHASE 8 — D1 + Worker Fixes

### L010 — Worker deploy is always manual
**Problem:** CC attempted to auto-deploy or gave instructions that assumed CLI access.
**Rule:** The file `workers/gold-proxy/index.js` must ALWAYS be deployed manually: user pastes file content into Cloudflare Worker editor → Save & Deploy. CC never auto-deploys workers. Always remind user at end of any session that touches this file.
**Tag:** #cloudflare #worker #deploy

### L011 — D1 tab scroll broken by flex layout
**Problem:** D1 tab results table could not scroll because parent flex containers had no `min-height: 0`.
**Rule:** For flex scroll to work: the scrollable child container needs `overflow-y: auto` AND every flex ancestor must have `min-height: 0`. Without this, flex children expand indefinitely and scroll never triggers.
**Tag:** #css #d1tab

### L012 — Sticky table headers in flex scroll context
**Problem:** Table `<th>` sticky positioning didn't work inside flex scroll containers.
**Rule:** Sticky headers require `position: sticky; top: 0; z-index: 1` on `th` elements. The scroll container (`.d1-table-wrap`) must be the overflow parent — not a parent above it.
**Tag:** #css #d1tab

### L013 — Ghost buys definition
**Problem:** Ghost buy query was including today's active open positions, causing false positives.
**Rule:** Ghost buys = open buys OLDER THAN 24 hours with no exit price. Use cutoff: `new Date(Date.now() - 24*3600*1000).toISOString().slice(0,10)`. Query: `open=true&before={cutoff}`. Today's active positions are NOT ghost buys.
**Tag:** #d1tab #business-logic

### L014 — Dangerous Reset SQL removed
**Problem:** D1 tab had a "Confirm Reset SQL" query that could wipe the trades table.
**Rule:** Never include destructive SQL generation in read-mode query tools. The Reset SQL query has been permanently removed from the D1 tab QUERIES list. If a reset is ever needed, it requires a separate admin tool with explicit confirmation flow.
**Tag:** #d1tab #safety

---

## WORKFLOW UPGRADE — 2026-05-24

### L015 — Workflow: CC reads before writing
**Problem:** CC sessions started writing based on stale context from previous sessions, causing regressions.
**Rule:** CC MUST read `masterseed.md`, `lessons_learned.md`, and ALL relevant source files fresh from the repo before writing any file. Never assume file contents match previous sessions. (Same as L033 in WORKFLOW_SKILL.md reference — this is the project-local record.)
**Tag:** #workflow #cc

### L016 — Workflow: complete files only
**Problem:** Patch-style edits (showing only changed sections) caused CC to inadvertently delete surrounding logic.
**Rule:** CC writes COMPLETE replacement files — never patches, never diffs. Every file touched must be written in full and committed. (Same as L074 in WORKFLOW_SKILL reference.)
**Tag:** #workflow #cc

### L017 — Workflow: prompt archive discipline
**Problem:** Completed prompt files piling up in repo root made it impossible to know what was pending vs done.
**Rule:** After executing any CC_PROMPT file: (1) move from root to `docs/prompts/`, (2) add `✅ COMPLETE — [date] — [summary]` at the top, (3) update masterseed.md phase status, (4) append new lessons here.
**Tag:** #workflow #cc

### L018 — Project folder discipline (Chat side)
**Problem:** Project folder was accumulating old versions of prompts, patched files, and outdated context.
**Rule:** Project folder keeps ONLY: GitHub repo connection, CHAT_INTRO_TEMPLATE.md, WORKFLOW_SKILL.md, and the currently active CC_PROMPT file. No old versions. No uploaded source files. No legacy docs. Everything lives in the repo.
**Tag:** #workflow #chat

---

## PART A PENDING (Fix 18 + Fix 21)

*Lessons to be added by CC after Part A execution*

---

## PART B PENDING (Fix 19 + Fix 22)

*Lessons to be added by CC after Part B execution*

---

## PART C PENDING (Fix 14–17)

*Lessons to be added by CC after Part C execution*

---

## PHASE 8c PENDING (D1 Tab rebuild)

*Lessons to be added by CC after Phase 8c execution*
