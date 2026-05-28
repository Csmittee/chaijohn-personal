✅ COMPLETE — 2026-05-28 — CLAUDE.md + RULES.md + PROJECT_STATE.md created; masterseed + lessons_learned archived to docs/archive/

# CC_PROMPT — SYSTEM MIGRATION (Mid-Project)
> One-time session. Do this BEFORE starting 9C.
> Estimated token cost: 8,000–10,000 tokens.

---

## CONTEXT

We are migrating the Chaijohn OS project from the old documentation system
(masterseed.md + lessons_learned.md) to a new leaner system designed to
reduce token consumption by 65% per session.

This is a documentation-only session. No UI changes. No API changes.
Touch only the files listed below.

---

## YOUR TASK — 4 steps in order

---

### STEP 1 — Create CLAUDE.md at repo root

Replace any existing masterseed.md as the primary CC entry point.
CLAUDE.md must be exactly 30 lines or fewer.
Use this content exactly as written:

```markdown
# CHAIJOHN OS — Project Brief

**Stack:** Cloudflare Pages · Airtable (apphBGWfSPL45oSFd) · Vanilla JS · Chart.js CDN · Cloudinary · Anthropic API
**Auth:** PIN → chaijohn_session cookie → _middleware.js checks all /api/*
**Deploy:** Frontend = Cloudflare Pages auto from main. Workers = paste manually into Cloudflare editor.
**Branch rule:** Always develop on a feature branch. Create PR to main. Merge to main before ending session.

## Key files
```
public/index.html              → single-page shell (sidebar + panels + entry drawer)
public/assets/js/              → one IIFE injector per panel (never shared bundle)
functions/_airtable.js         → ALL shared Airtable helpers (import with '../_airtable.js')
functions/api/                 → one file per endpoint (Cloudflare Pages Functions)
```

## Panel init pattern
`navigate()` dispatches `panelactivated` CustomEvent → each injector lazy-inits on first activation.
Check `panel-xxx.classList.contains('active')` at IIFE parse time for direct hash navigation.

## 5 rules — never break
1. Read RULES.md before every task — no exceptions
2. Complete replacement files only — never patches or diffs
3. One injector per panel — never put logic in a shared file loaded everywhere
4. No React, no Tailwind — pure CSS variables + vanilla JS only
5. Read all relevant source files fresh from repo before writing anything

## Read next
- `RULES.md` — compact lessons (required before every task)
- `PROJECT_STATE.md` — phases, roadmap, file inventory (required for Build Mode only)
```

---

### STEP 2 — Create RULES.md at repo root

This replaces lessons_learned.md as CC's compact rule reference.
Use this content exactly as written — do not reorder or summarise:

```markdown
# RULES.md — Chaijohn OS
> CC reads this before every task. One line per rule. Newest rules at TOP.
> Full context for each rule lives in lessons_learned.md (archive — human readable only).

---

## SHELL & PANELS (9A/9B/9B2)

L047  Collapse+summary pattern: default collapsed, show 1-line summary above toggle, guard with `_utilToggleInit` flag to prevent double-bind
L046  Chart.js in grid: add `min-width:0` to ALL direct grid children containing charts — prevents overflow beyond column
L045  Panel injector init: TWO checks — (1) `panelactivated` listener for future nav, (2) immediate `if panel.classList.contains('active')` at IIFE parse time for direct hash nav
L044  Toggle groups: query buttons by their EXACT CSS class — `.range-btn` and `.period-btn` are different; check HTML before writing toggle logic
L043  Entry drawer: embed full form HTML in shell — entry.injector.js binds by ID, always in DOM, no changes needed; `--nav-height:0px` in shell tokens
L042  CSS compat bridge: re-declare `.btn .card .tabs .tab-btn .period-toggle .modal` etc inside shell `<style>` using shell tokens — do not import global.css
L041  Per-panel IIFE injectors: lazy init via `panelactivated` event — never init charts when panel is `display:none`
L040  Sidebar always-dark: re-declare dark token values on `#sidebar` directly — never hardcode colors, use token override
L039  Sidebar shell auth: inline script handles full auth lifecycle — do NOT load auth.js; call `/api/auth/check` on load, show overlay by default

## DATA MODEL

L038  Dashboard zones: T1=2-col mini tx cards, T2=mosaic grid height∝sqrt(amount), T3=2-col grid expandable, T4=table rows
L035  Airtable singleSelect PATCH: existing choices MUST include `{id, name}` — omitting id causes duplicates or rejection
L034  Enrich at API layer: GET /api/transactions returns budget_label+category_name merged — never join client-side
L033  Unbudgeted detection: check `budget_id` first — if truthy, transaction IS budgeted; legacy category_id fallback only
L032  Resolve category via budget: `resolveCatId(t)` → budget_id→Budget.category_id→catMap. Never direct t.category_id for expenses
L031  Linked record migration: keep old field forever, never replace — mark legacy in comments, only new field gets new writes
L029  Debts ≠ Liabilities field names: Debts uses `creditor_name`+`original_amount`; Liabilities uses `name`+`loan_size` — always re-read schema

## AIRTABLE API

L036  New liability: always set `current_balance = loan_size` on create — Airtable defaults to 0 (shows "fully paid" immediately)
L028  Airtable boolean fields: guard with `!== false && !== 0` — checkbox can return numeric 0 not boolean false
L027  singleSelect PATCH choices: map existing as `{name:c.name}` ONLY — never include id or color, causes 422
L021  New singleSelect value: call Airtable Meta API to add choice BEFORE creating record — 422 if value not in field options
L003  Batch creates: 10 records per POST — never one-by-one (timeout risk on Cloudflare Functions)
L002  Airtable checkbox colors: always `greenBright`/`blueBright` — never `green`/`blue`
L001  Airtable multipleRecordLinks: use ONLY `{linkedTableId:id}` at table creation — never add `prefersSingleRecordLink` or `isReversed`

## BUDGET & CATEGORIES

L037  Category uniqueness: POST /api/categories checks case-insensitive name match before create — returns 400 if duplicate
L026  Budget period normalisation: Annual÷12 for monthly display, show "Annual" badge — One-time only if today within start_date–end_date
L022  UI naming: call `group` field "Category", call `name` field "Item Name" — never expose Airtable field names in UI
L020  One-time budget filter: use Airtable formula with date-range AND period check — pass `?active_only=true`

## LIABILITIES & CASHFLOW

L023  Liability cashflow direction: loan received=Income tx, loan payment=Expense tx — both non-fatal (try/catch)

## CHARTS

L025  Chart.js view toggle: store mode in module-level var, render function branches on mode, destroy/recreate chart each render
L016  Chart.js v4 inline plugins: use top-level `plugins:[]` array in config — do NOT use `Chart.register()` for one-off plugins

## CLOUDFLARE

L024  KV for app-state: use `CHAIJOHN_KV.get/put` for single-value state — no Airtable table needed for a single JSON object
L015  Nested routes safe: `functions/api/dropzone.js` coexists with `functions/api/dropzone/approve.js` — no conflict

## DIARY & DROPZONE

L018  AI undo: never replace textarea immediately — show comparison panel (Keep/Apply/Append), store snapshot only after Apply
L017  Text files in Drop Zone: skip Cloudinary, use FileReader.readAsText() → send text_content to /api/dropzone → same review card shape
L006  Diary save: ALL entries → chaijohn-core Diary table. ONLY Blog+publish_to_web=true → ALSO push to business base Blogs table

## WORKFLOW

L014  CC ends every session: merge branch to main, verify Cloudflare production URL updated
L012  Prompt archive: move CC_PROMPT file to docs/prompts/, stamp ✅ COMPLETE + date + summary at top
L011  Complete files only: never patches, never diffs — full replacement always
L010  Read before write: read CLAUDE.md + RULES.md + all relevant source files fresh before writing anything
```

---

### STEP 3 — Create PROJECT_STATE.md at repo root

Read masterseed.md in full. Extract the following into PROJECT_STATE.md:
- All phase history (what was built in each phase, current status)
- Current roadmap (what phases are planned next)
- Full file inventory (all key files, their purpose)
- Any critical project rules not already in RULES.md or CLAUDE.md
- Current broken/in-progress items
- Confirmed working items (do not break list)

Structure PROJECT_STATE.md exactly like this:

```markdown
# PROJECT STATE — Chaijohn OS
> Last updated: [today's date] — System migration from masterseed to new lean system

## IDENTITY
[extract from masterseed — what the project is, who it's for, the goal]

## BUILD PHASES
| Phase | Scope | Status |
|---|---|---|
[extract all phases from masterseed with their status]

## CURRENT STATE
**Working:** [list confirmed working modules]
**In progress / broken:** [list anything not yet resolved]
**Pending phases:** [list upcoming phases]

## CONFIRMED WORKING — DO NOT BREAK
[extract the "do not break" list from masterseed]

## FILE INVENTORY
[extract all key files and their purpose from masterseed]

## AIRTABLE TABLES
[extract all table names, base IDs, field summaries from masterseed]

## ROADMAP
[extract planned phases and design decisions not yet built]

## CRITICAL RULES
[anything in masterseed that is a hard rule not already covered by CLAUDE.md or RULES.md]
```

---

### STEP 4 — Archive old files

Do NOT delete masterseed.md or lessons_learned.md.
Move both to `docs/archive/`:

```
docs/archive/masterseed_archived_[today's date].md
docs/archive/lessons_learned_archived_[today's date].md
```

Add this line at the top of each archived file:
```
> ARCHIVED [date] — Replaced by CLAUDE.md + RULES.md + PROJECT_STATE.md. Do not read. Do not update.
```

---

## CLOSING STEPS (every session)

1. Commit all changes with message:
   `chore: system migration — CLAUDE.md + RULES.md + PROJECT_STATE.md, archive masterseed + lessons_learned`
2. Push to a branch named `chore/system-migration`
3. Create PR to main
4. Report back: list all files created/moved with line counts

## DO NOT

- Do not change any UI files
- Do not change any API files
- Do not change any injector files
- Do not delete masterseed.md or lessons_learned.md — move to docs/archive/ only
- Do not summarise or compress RULES.md content — use the exact text provided above
