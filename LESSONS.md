# Lessons Learned — Chaijohn Dashboard

## Airtable API — multipleRecordLinks field creation
**Bug:** Creating a table with linkedTableId in multipleRecordLinks
options fails if you include prefersSingleRecordLink or isReversed.
**Root cause:** Airtable table-creation endpoint only accepts
linkedTableId in multipleRecordLinks options. The field-add
endpoint accepts more properties, but table creation is strict.
**Fix:** When creating tables, use only:
  { type: 'multipleRecordLinks', options: { linkedTableId: id } }
**Do not add:** prefersSingleRecordLink or isReversed at table
creation time.

## Schema init — seeding timeout
**Bug:** 84 records × 250ms delay = 21 seconds, hits Cloudflare
Function timeout.
**Fix:** Use Airtable batch create (10 records per POST) to reduce
API calls from 84 to ~10.

## Checkbox color values
**Bug:** Airtable Meta API rejects 'green'/'blue' for checkbox color.
**Fix:** Always use 'greenBright'/'blueBright'.

## L004 — Shared Airtable helpers
All API helpers (listRecords, createRecord, updateRecord, etc.) live in
`functions/_airtable.js`. Import with relative path `'../_airtable.js'` from
any functions/api/*.js file. Never duplicate these helpers in individual files.

## L005 — Cloudflare Pages nested routes
`functions/api/dropzone.js` (file) coexists with `functions/api/dropzone/` (directory).
Cloudflare Pages supports this: the file handles `/api/dropzone` directly, the
directory handles `/api/dropzone/approve`, `/api/dropzone/[id]`, etc.
No naming conflicts occur.

## L006 — Text file processing in Drop Zone
Text/markdown files (.txt, .md) must skip Cloudinary upload entirely.
Use FileReader.readAsText() → send {text_content, filename, mime_type} to
/api/dropzone → Claude text classification path (no image_url).
The API normalises the result to the same {suggested_type, description, prefilled}
shape so the review card works identically for text and image items.

## L007 — AI undo pattern in diary
Do NOT immediately replace textarea content when AI returns a result.
Instead: show a comparison panel (Keep Original / Apply & Replace / Append).
Store `aiPreviousContent` only after user clicks "Apply & Replace" — that is
the only moment that warrants an undo. The Undo button restores that snapshot.
Saves/new-entry clear both the snapshot and the comparison panel.

## L008 — Chart.js v4 inline plugins
Chart.js v4 accepts a top-level `plugins` array in the chart config for
inline (unregistered) plugins. Use `afterDraw(chart)` to draw canvas overlays
like a "today" vertical dashed line. Access canvas context via `chart.ctx`.
Do not use `Chart.register()` for one-off per-chart plugins.

## L009 — Alert dismissal with event delegation
When dynamically rendering alert chips with dismiss buttons, avoid inline
onclick handlers (they require global function access inside an IIFE).
Instead: use CSS class `.alert-dismiss` + `data-alert-id` attribute, then
wire via `querySelectorAll('.alert-dismiss').forEach(b => b.addEventListener(...))`
after each render call. Store dismissed IDs in a module-level `Set`.

## L010 — One-time budget visibility
One-time budgets in Airtable need an explicit date-range filter on the server.
Use Airtable formula: `AND({active}=TRUE(), OR({period}!="One-time",
AND(OR({start_date}="",{start_date}<="TODAY"),OR({end_date}="",{end_date}>="TODAY"))))`
Pass via `?active_only=true` query param. Keep default behaviour (?no param) as
simple `{active}=TRUE()` to avoid breaking existing callers.
