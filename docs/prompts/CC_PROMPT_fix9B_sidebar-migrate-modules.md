# CC_PROMPT_fix9B_sidebar-migrate-modules.md ✅ COMPLETE
> Part 2 of 3 — Migrate existing modules into the new sidebar shell
> Completed: 2026-05-26

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
- masterseed.md
- lessons_learned.md
- WORKFLOW_SKILL.md

Then read and execute: docs/prompts/CC_PROMPT_fix9B_sidebar-migrate-modules.md
```

---

## OBJECTIVE

Migrate all existing working modules into the Phase 9a sidebar shell
(`public/index.html` on branch `feat/sidebar-shell`).

Read the current state of ALL relevant files fresh from repo before
deciding anything. You know the codebase — use that knowledge to
determine the correct approach for each migration step.
Do not guess. If a file does not exist, note it and skip that step.

Branch: `feat/sidebar-shell` (continue from Phase 9a)

---

## READ FIRST

Before writing a single line, read:
1. `masterseed.md` + `lessons_learned.md` + `WORKFLOW_SKILL.md`
2. `public/index.html` — the Phase 9a shell
3. `public/dashboard.html` — existing dashboard page
4. `public/entry.html` — existing entry page
5. Every injector JS file that exists under `public/assets/js/`
6. `public/assets/css/global.css`

Summarize your understanding of what each injector does and what
HTML elements it depends on before proceeding.

---

## OUTCOMES REQUIRED

Deliver all of the following. How you achieve each is your decision
based on what you find in the repo.

### O1 — Light mode sidebar fix
Sidebar was QA'd: sidebar stays dark in light mode (correct) but
sidebar nav text becomes invisible. Fix so sidebar text is always
readable regardless of theme. Main content area must not be affected.

### O2 — Drop Zone available on all panels
The Drop Zone button and panel that currently exists in `dashboard.html`
must work globally across all route panels in the new shell.

### O3 — Dashboard content in #dashboard panel
All content currently in `dashboard.html` (charts, budget meters,
alert chips, risk simulator, solution playroom) must render correctly
inside the `#panel-dashboard` route panel in the shell.
The dashboard injector logic must not be changed — only wired in.

### O4 — Entry becomes a right-side drawer
Clicking M2.7 Data Entry in the sidebar must open a slide-in drawer
from the right side. It must NOT navigate to a separate page.
All entry tabs (transactions, utilities, liabilities, budgets,
categories) must work inside the drawer exactly as they do today.
The entry injector logic must not be changed — only wired in.

### O5 — Existing module panels wired
For each route panel that has an existing working module
(cashflow, budget, liabilities, collection, ai — check what exists):
Wire the module content and injector into its panel.
If a module's injector does not exist, leave the panel as placeholder.

### O6 — Old pages redirect to shell
`public/dashboard.html` and `public/entry.html` must redirect
to the shell so bookmarks and direct links still work.

---

## CONSTRAINTS

- Do NOT change any logic in any injector file
- Do NOT change any `functions/api/` files
- Do NOT break PIN auth, Drop Zone, or any confirmed working feature
  listed in masterseed.md CONFIRMED WORKING section
- One dedicated injector per module — no merging injectors
- Commit after each outcome so failures are easy to isolate

---

## AFTER ALL OUTCOMES — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — [one line summary]`

2. Update `masterseed.md`:
   - Mark Phase 9b ✅
   - Update CURRENT STATE and FILE INVENTORY
   - Update ROADMAP

3. Append new lessons to `lessons_learned.md` (next L-number after current highest)

4. Commit: `docs: update masterseed and lessons_learned after phase9b`

List all files changed at end of response.

---

## MERGE

Merge `feat/sidebar-shell` → `main` only after owner QA confirms
all outcomes pass.
