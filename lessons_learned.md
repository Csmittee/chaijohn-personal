# 📚 LESSONS LEARNED — Chaijohn Personal Diary (CPD)
> CC reads this at the start of every session. Never delete lessons — only add.
> Last updated: 2026-05-24
> Current highest lesson: L026

---

## HOW TO USE

- Every CC session starts with reading this file fresh from repo
- Lessons are referenced in CC prompts by ID (e.g. "follow L001, L016")
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
Never add `prefersSingleRecordLink` or `isReversed` at table creation time.
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
**Rule:** ALL diary entries ALWAYS save to `chaijohn-core` Diary table regardless of type. ONLY when `publish_to_web=true` AND `entry_type=Blog`: ADDITIONALLY push a copy to `AIRTABLE_BUSINESS_BASE_ID` → Blogs table. Personal base never receives from business base.
**Tag:** #diary #airtable #architecture

### L007 — Diary preview overwrites content
**Problem:** Preview mode hid the textarea, making user think content was lost.
**Rule:** Render markdown preview in a separate div beside/below the textarea. Never replace the textarea. Edit/Preview toggle — Edit shows textarea, Preview shows rendered markdown.
**Tag:** #diary #ux

### L008 — Entry type options for Diary
**Problem:** "Finance note" was an entry_type but not useful. Missing "Project" and "Skill".
**Rule:** Diary entry_type options: Story / Idea / Blog / Project / Skill. Never include "Finance note".
**Tag:** #diary #airtable

### L009 — Connected Concept should be a remembered dropdown
**Problem:** Plain text input for connected_concept lost previous values.
**Rule:** Implement as combo input: fetch distinct `connected_concept` values from Diary table + preset global concepts. Show as dropdown suggestions while allowing new text values.
**Tag:** #diary #ux

---

## WORKFLOW UPGRADE — 2026-05-24

### L010 — Workflow: CC reads before writing
**Problem:** CC sessions started writing based on stale context, causing regressions.
**Rule:** CC MUST read `masterseed.md`, `lessons_learned.md`, and ALL relevant source files fresh from repo before writing any file. Never assume file contents match previous sessions.
**Tag:** #workflow #cc

### L011 — Workflow: complete files only
**Problem:** Patch-style edits caused CC to inadvertently delete surrounding logic.
**Rule:** CC writes COMPLETE replacement files — never patches, never diffs. Every file touched must be written in full and committed.
**Tag:** #workflow #cc

### L012 — Workflow: prompt archive discipline
**Problem:** Completed prompt files piling up in repo root — impossible to know what was pending vs done.
**Rule:** After executing any CC_PROMPT file: (1) move from root to `docs/prompts/`, (2) add `✅ COMPLETE — [date] — [summary]` at top, (3) update masterseed.md phase status, (4) append new lessons here.
**Tag:** #workflow #cc

### L013 — Project folder discipline (Chat side)
**Problem:** Project folder accumulating old versions, patched files, outdated context.
**Rule:** Project folder keeps ONLY: GitHub repo connection, CHAT_INTRO_TEMPLATE.md, WORKFLOW_SKILL.md, and the currently active CC_PROMPT file. Everything else lives in the repo.
**Tag:** #workflow #chat

### L014 — CC always creates a new branch — merge to main after every session
**Problem:** CC creates a new branch per session. Owner had to manually find and switch Cloudflare to the right branch.
**Rule:** Every CC_PROMPT must end with: "Commit directly to main. If a branch was created, merge it to main before ending the session." Chat must include this in every prompt it writes.
**Tag:** #workflow #cc #github

---

## FIX A + B — Liabilities + Budgets (2026-05-25)

### L015 — Cloudflare Pages nested routes coexist safely
**Problem:** Uncertainty whether `functions/api/dropzone.js` (file) could coexist with `functions/api/dropzone/` (directory).
**Rule:** Cloudflare Pages supports this: the file handles `/api/dropzone` directly, the directory handles `/api/dropzone/approve`, `/api/dropzone/[id]`, etc. No naming conflicts occur.
**Tag:** #cloudflare #architecture

---

## FIX C — Dashboard Budget Scale + Utilities YoY (2026-05-25)

### L016 — Chart.js v4 inline plugins
**Problem:** Needed to draw a "today" vertical dashed line on Chart.js without polluting global Chart registry.
**Rule:** Chart.js v4 accepts a top-level `plugins` array in the chart config for inline (unregistered) plugins. Use `afterDraw(chart)` to draw canvas overlays. Access canvas context via `chart.ctx`. Do not use `Chart.register()` for one-off per-chart plugins.
**Tag:** #chartjs #dashboard

---

## FIX D — Dropzone + Diary AI + Dashboard Forecast + Category + Budget (2026-05-25)

### L017 — Text file processing in Drop Zone
**Problem:** Drop Zone only accepted images — crashed on .txt and .md files.
**Rule:** Text/markdown files (.txt, .md) must skip Cloudinary upload entirely. Use FileReader.readAsText() → send `{text_content, filename, mime_type}` to /api/dropzone → Claude text classification path (no image_url). API normalises result to same shape so review card works identically for text and image items.
**Tag:** #dropzone #diary

### L018 — AI undo pattern in diary
**Problem:** AI assist replaced textarea content immediately with no way to recover original.
**Rule:** Do NOT immediately replace textarea content when AI returns a result. Show a comparison panel (Keep Original / Apply & Replace / Append). Store `aiPreviousContent` only after user clicks "Apply & Replace". Undo button restores that snapshot. Saves/new-entry clear both snapshot and panel.
**Tag:** #diary #ux #ai

### L019 — Alert dismissal with event delegation
**Problem:** Dynamically rendered alert chips with inline onclick handlers required global function access inside an IIFE — failed silently.
**Rule:** Use CSS class `.alert-dismiss` + `data-alert-id` attribute on dismiss buttons. Wire via `querySelectorAll('.alert-dismiss').forEach(b => b.addEventListener(...))` after each render call. Store dismissed IDs in a module-level `Set`.
**Tag:** #dashboard #alerts #js

### L020 — One-time budget visibility filter
**Problem:** One-time budgets showed in all months even when outside their active date range.
**Rule:** One-time budgets need explicit date-range filter on server. Use Airtable formula:
`AND({active}=TRUE(), OR({period}!="One-time", AND(OR({start_date}="",{start_date}<="TODAY"),OR({end_date}="",{end_date}>="TODAY"))))`
Pass via `?active_only=true` query param. Default (`?no param`) stays as simple `{active}=TRUE()`.
**Tag:** #budgets #airtable

### L021 — Airtable singleSelect group field rejects new values at record creation
**Problem:** Categories `group` field is a singleSelect with fixed seeded choices. Sending a new group value like "test" returns error 422 INVALID_MULTIPLE_CHOICE_OPTIONS.
**Rule:** Before creating a category record with a new group value, call Airtable Meta API to add the new choice to the field's options first:
`PATCH https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables/{TABLE_ID}/fields/{FIELD_ID}`
Body: `{ options: { choices: [...existing, { name: newGroupName }] } }`
Fetch field ID from Meta API — do not hardcode. Then create the record.
**Tag:** #airtable #categories #meta-api

### L022 — Category vs Group UX naming mismatch
**Problem:** Owner calls "Family", "Car", "Personal" a "category" but in Airtable schema these are stored in the `group` field. The individual items (Coffee, Fuel) are stored as `name`. This caused UI confusion.
**Rule:** In ALL UI labels: call the `group` field "Category" and call the `name` field "Item Name" or "Expense Name". Never expose Airtable field names in the UI. Tooltips and placeholders must use owner's language.
**Tag:** #ux #categories

---

## FIX E — Category + Liability Cashflow + Dashboard Overhaul (2026-05-24)

### L023 — Liability cashflow direction
**Problem:** Creating a new liability was triggering a negative (cash-out) transaction, or no transaction at all. Paying a loan also created no matching transaction. Cashflow chart was factually wrong.
**Rule:** Loan received = cash IN → create `type: 'Income'` transaction. Loan payment = cash OUT → create `type: 'Expense'` transaction. Both use category with `type='Loan'` from Categories table. Both are non-fatal (wrapped in try/catch) so primary Liabilities operation never fails due to tx creation.
**Tag:** #liabilities #cashflow #transactions

### L024 — Cloudflare KV for lightweight app-state sync
**Problem:** Needed a persistent "starting balance" anchor for the cashflow chart without creating a new Airtable table for a single value.
**Rule:** Cloudflare KV (`CHAIJOHN_KV`) is ideal for small app-state values (a single JSON object). Use `env.CHAIJOHN_KV.get/put('cashflow_sync')` in a dedicated `functions/api/cashflow-sync.js` endpoint (GET + POST). No Airtable table needed for single-record state.
**Tag:** #kv #cloudflare #architecture

### L025 — Chart.js multi-mode view toggle pattern
**Problem:** T1 chart needed two mutually exclusive render modes (netflow vs in-vs-out) sharing the same canvas and data.
**Rule:** Store view mode in a module-level state variable (`let t1ViewMode = 'netflow'`). The render function checks the mode and branches: `if (t1ViewMode === 'invsout') { ... } else { ... }`. Toggle buttons set the state then call `renderT1()`. Destroy/recreate chart on each render (standard Chart.js pattern). Never inline mode logic in the toggle handler.
**Tag:** #chartjs #dashboard #ux

### L026 — Budget meter period normalisation
**Problem:** Annual budgets (e.g. ฿300,000 travel) shown in a monthly view made all monthly items look negligible (tiny bars) and caused visual distortion.
**Rule:** For monthly display: `if period === 'Annual' → use amount ÷ 12`. Show badge "Annual" next to label so user knows it's a derived figure. One-time budgets only show if today falls within `start_date`–`end_date`. Filter toggle (All/Monthly/Annual/One-time) lets user isolate categories relevant to their current review.
**Tag:** #budgets #dashboard #ux

