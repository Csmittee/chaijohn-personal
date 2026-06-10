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
6. For ANY external Airtable base (not chaijohn-core): call Meta API to verify
   field names BEFORE writing code. Never assume from prompt specs. See L077.
7. PANEL HEADERS: Every injector owns its own header. If p.innerHTML is used,
the header must be inside renderPanel(). index.html panel headers are
overwritten on injector init — do not rely on them.

## TRANSACTION MODEL
See RULES.md L099–L106 for the full canonical model.
Short version:
- Cashflow = all transactions
- Expenses M2.3 = type=Expense AND budget_id not empty
- Sales M2.2 = type=Income grouped by source
- NEVER write category_id on new transactions
- source field = Airtable singleSelect (owner manages options)

## Read next
- `RULES.md` — universal rules (required every session)
- `.claude/rules/RULES-[domain].md` — load ONLY the file matching your task:
  | Working on | Load |
  |---|---|
  | M2.1 Cashflow | RULES-cashflow.md |
  | M2.2 Sales | RULES-sales.md |
  | M2.5 Budget | RULES-budget.md |
  | M2.4 / M3.4 Projects | RULES-projects.md |
  | M4.4 P&L Generator | RULES-plgen.md |
  | Any data/API/Airtable | RULES-data.md |
  | Workflow / docs only | RULES-workflow.md |
  | Legacy pre-9C module | RULES-archive.md |
- `PROJECT_STATE.md` — phases + roadmap (required for build sessions)

## SYSTEM PURPOSE — PERSONAL INTELLIGENCE SUBSTRATE

This OS is not a dashboard. It is a **personal intelligence substrate** —
a structured memory system designed to be queried by AI agents.

### The two layers

**Mind Map (M4.1) = the aura**
Everything useful RIGHT NOW. Skills, people, rules, active strategies,
relationships, tools in use. An agent scans Mind Map to understand who
the owner is and what they are capable of today.

**Life Timeline (M4.5) = the highway**
The owner's car driving through time. Every year is a station with its
own story, financial reality, emotional state, and the people present.
An agent travels backward through Life to find connections between the
past and the present that the owner has forgotten.

### The combined agent capability

> Mind Map scan → "You have built 21 repos, used these tools most, continue
> this pattern for any new project."

> Life Timeline scan → "In 1998 you visited the Peugeot plant in Montbéliard,
> France. You met a man named X. You are now building a vintage industrial
> business. Contact X — he may have inventory relevant to your new venture."

No other system produces this. It only exists because both layers are built,
populated, and wired together.

### The index principle (L192)

Every module in this OS follows one rule:
> **If content exists in one table, store only its record ID everywhere else.
> Content lives once. Everything else points.**

This applies to: story_refs in LifeTimeline, edge connections in MindMapEdges,
and all future cross-module references. Never duplicate text across tables.
An agent follows the pointers. It does not need copies.

### What CC must understand

Every build decision — field design, API shape, UI behavior — must serve
the agent query use case. Ask: can an AI traverse this data and surface
a non-obvious insight for the owner? If the answer is no, the design is wrong.
