# CC_PROMPT_chore-doc-transformation.md
> Reorganise the documentation system — split RULES.md into universal + domain files,
> introduce .claude/rules/ structure, update all doc pointers.
> No UI files. No API files. No injector files. Docs only.

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read IN FULL:
1. CLAUDE.md
2. RULES.md          ← read every line — you are reorganising this file
3. PROJECT_STATE.md
4. WORKFLOW_SKILL.md ← read every line — you are updating the CC intro block inside it

Do NOT read anything in docs/archive/.
Then execute this prompt.
```

---

## CONTEXT — WHY THIS EXISTS

The project has grown from a blueprint → masterseed → CLAUDE+RULES+PROJECT_STATE system.
RULES.md now has 147+ rules covering every module. CC reads all of it every session
even when fixing a single panel — pure waste. This prompt fixes that.

**Principle:** CC reads only what it needs for the task at hand.
**Method:** Split rules by domain. CLAUDE.md points to the right file per task.

This is a documentation-only session.
**Touch ZERO files in:** `public/`, `functions/`, `wrangler.toml`, `package.json`

---

## WHAT YOU ARE BUILDING

```
/ (repo root)
├── CLAUDE.md                 ← update index section + reading instructions
├── RULES.md                  ← keep ONLY universal rules (~25 rules)
├── RULES-archive.md          ← move L001–L060j here (old rules, rarely needed)
├── WORKFLOW_SKILL.md         ← update CC intro block + prompt template
├── PROJECT_STATE.md          ← update file inventory section only
└── .claude/
    └── rules/
        ├── RULES-workflow.md     ← L010–L015 + workflow discipline (extracted from RULES.md)
        ├── RULES-dom.md          ← panel init, route guard, DOM scope, input types (universal DOM rules)
        ├── RULES-data.md         ← Transaction model, API response shapes, Airtable patterns (L082–L110)
        ├── RULES-cashflow.md     ← M2.1 specific rules
        ├── RULES-sales.md        ← M2.2, Sales, presale bridge, business base rules
        ├── RULES-projects.md     ← M3.4, M2.4, project phases, milestones, resources rules
        ├── RULES-budget.md       ← M2.5, budget matrix, GAP rows, meter rules
        └── RULES-plgen.md        ← L133–L147 P&L Generator rules
```

---

## STEP 1 — Read and map every rule in RULES.md

Before writing anything, read RULES.md top to bottom.
Map each rule (by L-number and topic) to one of these buckets:

| Bucket | Goes to file | Criteria |
|---|---|---|
| Universal workflow | `RULES.md` (keep) | Applies to every CC session regardless of module |
| Universal DOM | `RULES.md` (keep) | Injector patterns needed by any panel |
| Workflow discipline | `.claude/rules/RULES-workflow.md` | L010–L015, read/write discipline, commit order |
| DOM + input patterns | `.claude/rules/RULES-dom.md` | panelactivated, route guard, panel scope, CSS class, input type |
| Data + API | `.claude/rules/RULES-data.md` | Transaction model, API shapes, Airtable field rules |
| Cashflow M2.1 | `.claude/rules/RULES-cashflow.md` | DEF CON 5, simulation, forecast, reload rules |
| Sales M2.2 | `.claude/rules/RULES-sales.md` | Lanes, presale, business base, pareto |
| Projects M3.4+M2.4 | `.claude/rules/RULES-projects.md` | Phase lifecycle, milestones, resources, dependency |
| Budget M2.5 | `.claude/rules/RULES-budget.md` | Matrix, period-aware meters, GAP rows |
| P&L Generator M4.4 | `.claude/rules/RULES-plgen.md` | L133–L147 — all P&L rules |
| Archive | `RULES-archive.md` | L001–L060j — old rules, pre-9C era, rarely needed |

Do this mapping mentally before touching any file.

---

## STEP 2 — Create `.claude/rules/` domain files

Create the `.claude/rules/` directory and all 8 files listed above.

**Format for every domain file:**
```markdown
# RULES-[domain].md — Chaijohn OS
> Domain: [module name and route]
> Load this file when: [exact condition — e.g. "working on M4.4 P&L Generator"]
> Last updated: [date]

---

[rules extracted from RULES.md — exact wording, no summarising, no compressing]
```

Rules go in **newest-first order** (same as RULES.md convention).
Copy exact wording. Do not paraphrase. Do not compress.

---

## STEP 3 — Rewrite RULES.md (universal only)

After domain files are created, rewrite RULES.md to contain ONLY rules that apply
to every CC session regardless of which module is being fixed.

Target: **~20–30 rules maximum.**

**Keep in RULES.md:**
- Save/submit guards (isSubmitting, dedup, harvest-before-add)
- panelactivated event shape (window, e.detail string) — L068
- API /api/projects response shape — L082
- Empty state rule — L083
- type="text" inputmode="numeric" — L133
- Panel header integrity — L147
- Any rule where breaking it would damage ANY module

**Do not keep in RULES.md:**
- Anything module-specific (cashflow timing, sales lane keys, P&L margins, etc.)
- L001–L060j (those go to RULES-archive.md)

Header for the new RULES.md:
```markdown
# RULES.md — Chaijohn OS
> Universal rules — apply to every session regardless of module.
> Newest first. CC reads this every session.
> For module-specific rules: load .claude/rules/RULES-[domain].md

---
```

---

## STEP 4 — Create RULES-archive.md

Move L001–L060j (all pre-9C rules) to `RULES-archive.md` at repo root.

Header:
```markdown
# RULES-archive.md — Chaijohn OS
> Archived rules L001–L060j (pre-9C era).
> CC reads this ONLY when working on a legacy module or explicitly instructed.
> Do not update. Do not append new rules here — new rules go to RULES.md or .claude/rules/.

---
```

Copy exact rule text. Do not modify.

---

## STEP 5 — Update CLAUDE.md

Update the "Read next" section at the bottom of CLAUDE.md to:

```markdown
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
```

Do not change anything else in CLAUDE.md.

---

## STEP 6 — Update WORKFLOW_SKILL.md

Find the **Standard CC intro block** section (used in every CC prompt template).
Update it to:

```markdown
### Standard CC intro block (paste into every prompt)
```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md                              — universal rules (always)
3. .claude/rules/RULES-[domain].md      — replace [domain] with the relevant file for this task
4. PROJECT_STATE.md                      — required for build sessions; skip for hotfix-only sessions

Do NOT read RULES-archive.md unless explicitly told to.
Do NOT read anything in docs/archive/.
Then read and execute: [prompt filename]
```
```

Also update the **REPO DOC STRUCTURE** table in WORKFLOW_SKILL.md to add:

```markdown
| `.claude/rules/RULES-[domain].md` | Domain-specific rules per module | CC — only when working on that module |
| `RULES-archive.md` | Archived rules L001–L060j | CC — only when working on legacy module |
```

---

## STEP 7 — Update PROJECT_STATE.md file inventory

Find the FILE INVENTORY section and update the doc listing at the top:

```
/ (repo root)
├── CLAUDE.md                             ✅ index + stack + 5 rules + domain rule map
├── RULES.md                              ✅ universal rules only (~25 rules, newest first)
├── RULES-archive.md                      ✅ archived L001–L060j (pre-9C, read-only)
├── WORKFLOW_SKILL.md                     ✅ operating model — Chat + Owner only
├── PROJECT_STATE.md                      ✅ this file
└── .claude/
    └── rules/
        ├── RULES-workflow.md             ✅ CC workflow discipline rules
        ├── RULES-dom.md                  ✅ panel init, route guard, input type rules
        ├── RULES-data.md                 ✅ transaction model, API shapes, Airtable patterns
        ├── RULES-cashflow.md             ✅ M2.1 specific rules
        ├── RULES-sales.md                ✅ M2.2, sales, presale, business base rules
        ├── RULES-projects.md             ✅ M3.4, M2.4, project lifecycle rules
        ├── RULES-budget.md               ✅ M2.5 budget matrix and meter rules
        └── RULES-plgen.md                ✅ M4.4 P&L Generator rules (L133–L147)
```

Do not change any other section of PROJECT_STATE.md.

---

## DO NOT TOUCH

- Anything in `public/`
- Anything in `functions/`
- `wrangler.toml`
- `package.json`
- `docs/prompts/` (archived prompts — leave as-is)
- `docs/archive/` (masterseed + lessons_learned — leave as-is)

---

## AFTER ALL STEPS — MANDATORY

1. **Verify completeness** — count rules before and after. Total rule count must be preserved.
   Every L-number from RULES.md must appear in exactly one output file.
   No rule lost. No rule duplicated.

2. **Archive this prompt:**
   Move to `docs/prompts/CC_PROMPT_chore-doc-transformation.md`
   Stamp at top: `✅ COMPLETE — chore/doc-transformation — [date] — Rules split into domain files`

3. **Append to RULES.md** (after rewrite is done):
```
L148  Doc system: RULES.md = universal only. Domain rules live in .claude/rules/RULES-[domain].md.
      CC loads CLAUDE.md + RULES.md every session. Loads domain file only when working on that module.
      RULES-archive.md = L001–L060j pre-9C rules — CC reads only when explicitly instructed.
```

4. **Update PROJECT_STATE.md build phases** — add row:
```
| chore/doc-transformation | Rules system split: RULES.md universal only, .claude/rules/ domain files × 8, RULES-archive.md, L148 | ✅ COMPLETE |
```

5. **Commit in this order:**
```
chore: create .claude/rules/ domain files (RULES-cashflow, sales, projects, budget, plgen, data, dom, workflow)
chore: rewrite RULES.md to universal rules only + create RULES-archive.md
chore: update CLAUDE.md domain rule map + WORKFLOW_SKILL.md CC intro block
chore: update PROJECT_STATE.md file inventory + build phases + L148
```

Branch: `chore/doc-transformation`
Merge to main after completing.

---

## QA CHECKLIST (CC self-verify before merging)

- [ ] Every L-number from original RULES.md appears in exactly one output file
- [ ] RULES.md has ≤ 30 rules — all universal
- [ ] RULES-archive.md has L001–L060j
- [ ] `.claude/rules/` has exactly 8 files
- [ ] CLAUDE.md domain map table is present and accurate
- [ ] WORKFLOW_SKILL.md CC intro block updated with domain rule loading instruction
- [ ] PROJECT_STATE.md file inventory reflects new structure
- [ ] L148 appended to RULES.md
- [ ] This prompt archived to docs/prompts/ stamped ✅ COMPLETE
- [ ] No UI, API, or injector files modified
