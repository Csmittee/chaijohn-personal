# 🎯 WORKFLOW SKILL — Chaijohn OS
> Version 2.0 — 2026-06-02
> Universal operating model for Chat + CC sessions.
> Copy this file to every project root as `WORKFLOW_SKILL.md`.

---

## ⚠️ BEFORE EVERY NEW CHAT — OWNER CHECKLIST

Do these TWO things before typing anything else. Without them, Chat is blind.

```
1. Project → Files → GitHub sync checkbox → CONFIRM IT IS CHECKED
   (it resets to OFF every new chat — always re-check)

2. Paste the CHAT_HANDOFF doc from last session into your first message
```

If Chat says it can't find files or asks you to upload source code — STOP.
Re-check the sync box. Do not proceed without it.
This saves 5–7 wasted messages per session.

---

## THE THREE ROLES

### 👤 OWNER
- Describes goals and QAs live results
- Reports back to Chat with screenshots or description — never pastes code
- Never edits source files manually
- Never acts as messenger between Chat and CC

### 🧠 CHAT (this session)
- Reads repo files directly via project knowledge — never asks owner to upload source files
- Diagnoses before acting — never guesses
- Writes CC prompts, updates handoff docs
- Does NOT write to the repo

### 🤖 CC (Claude Code)
- Reads all files fresh from repo before writing anything
- Writes complete replacement files — never patches or diffs
- Commits with descriptive messages, merges to main before ending session
- Archives prompt + updates RULES.md + PROJECT_STATE.md after every fix

---

## THE LOOP

```
Owner describes goal or QA result
        ↓
Chat reads repo → diagnoses → writes CC_PROMPT → owner pushes to repo root
        ↓
Owner runs CC: "Read CLAUDE.md, RULES.md, PROJECT_STATE.md. Then execute: [prompt filename]"
        ↓
CC reads fresh → fixes → commits → archives prompt → updates docs → merges to main
        ↓
Owner QAs live site → reports back to Chat (screenshot or pass/fail list)
        ↓
Chat reviews → next prompt or done
```

---

## CHAT RULES — NON-NEGOTIABLE

1. **Never guess** — if a file is needed to diagnose, request it via project knowledge search. Do not theorize from partial information.
2. **Never use project folder files as source of truth for live code** — always treat repo (GitHub sync) as the actual state. Project knowledge may lag.
3. **Read before diagnosing** — check CLAUDE.md + RULES.md + the specific injector/API file before forming any opinion on a bug.
4. **One CC prompt per session goal** — batch all related fixes into one prompt. Never write one-fix-per-prompt for related issues.
5. **Never re-explain project history in CC prompts** — CC reads CLAUDE.md + RULES.md. Prompts contain only: objective, files to read, exact fixes, commit order.
6. **Do not trust your own memory for field names, table names, or API shapes** — always read RULES.md first. All confirmed facts live there.

---

## HOW CHAT HANDLES QA REPORTS

When owner reports QA results (screenshots or pass/fail):

1. Map each failure to a file + root cause — do not guess, read the file if needed
2. Group all fixes by file — one CC prompt covers all related files
3. State the root cause clearly before writing the fix spec
4. Include a confirmation checklist in the prompt matching exactly what owner reported

**QA report format to ask for if not provided:**
```
Module → Feature: ✅ pass / ❌ fail / ⚠️ partial
Notes: [what was seen]
```

---

## HOW TO WRITE A CC PROMPT

### Naming
```
CC_PROMPT_[phaseCode]-[objective].md
```
Examples:
- `CC_PROMPT_bugfix-m24-empty-panel.md`
- `CC_PROMPT_feat9E-hard-assets.md`
- `CC_PROMPT_qa-batch3-sales-projects.md`

Phase codes: `bugfix` · `feat[phase]` · `qa` · `chore` · `hotfix`

### File location
- **Before CC runs:** repo root
- **After CC runs:** `docs/prompts/` stamped `✅ COMPLETE — [date] — [summary]`

### Required prompt structure

```markdown
# CC_PROMPT_[name].md
> [one line objective]

## CC INTRO
[paste the standard CC intro block — see below]

## READ FIRST (before touching any file)
[list every file CC must read fresh — be specific]

## CONFIRMED FACTS
[data confirmed from RULES.md or owner QA — no assumptions]

## BUG / TASK [N] — [short name]
**Root cause:** [confirmed, not guessed]
**File:** [exact path]
**Fix:** [exact change — code block if needed]

## DO NOT TOUCH
[list files CC must not modify]

## AFTER ALL FIXES — MANDATORY
1. Archive this prompt → docs/prompts/ stamped ✅ COMPLETE
2. Append new lessons to RULES.md (next L-number)
3. Update PROJECT_STATE.md current state
4. Commit docs: `docs: update after [prompt name]`

## COMMIT ORDER
[list commits in order — one per file group]
Branch: [branch name]
Merge to main after owner confirms: [checklist]
```

### Standard CC intro block (paste into every prompt)
```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 6 rules (required always)
2. RULES.md         — compact lessons L001–L083+ (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory (required for build sessions)

Do NOT read masterseed.md or lessons_learned.md — they are archived.
Then read and execute: [prompt filename]
```

---

## CC GOLDEN RULES (what CC follows — Chat enforces these in prompts)

| Rule | What it means |
|---|---|
| Read fresh | Read every source file from repo before writing. Never rely on prompt description of file contents. |
| Complete files only | Full replacement. No diffs, no patches, no "add this function". |
| No shared bundles | One injector per panel. Never put panel logic in a shared file. |
| No React / No Tailwind | Pure CSS vars + vanilla JS only. |
| Explicit color on light buttons | `color:#0a0a10` always when background is var(--yellow) or white. |
| Panel display via CSS class | Never `panel.style.cssText = 'display:flex'`. Use `#panel-xxx.active { display:flex }` via ensureStyles(). |
| Route guard first | `if (e.detail !== 'route-name') return;` as FIRST line of panelactivated handler. |
| External Airtable = Meta API first | Any base other than chaijohn-core: call Meta API to verify field names before writing code. (L077) |
| API shape | `/api/projects` returns `{ records: [] }` pre-flattened. Use `data.records \|\| []`. Never re-spread `r.fields`. (L082) |
| Archive + document | After every fix: move prompt → docs/prompts/, append RULES.md, update PROJECT_STATE.md, commit docs separately. |

---

## REPO DOC STRUCTURE (what lives where)

| File | Purpose | Who reads it |
|---|---|---|
| `CLAUDE.md` | Project brief, stack, 6 rules, key files | CC — every session |
| `RULES.md` | All lessons L001–L083+, newest at top | CC — every session |
| `PROJECT_STATE.md` | Phase status, roadmap, file inventory | CC — build sessions |
| `WORKFLOW_SKILL.md` | This file — operating model | Chat + Owner |
| `docs/prompts/` | Archived CC prompts stamped ✅ COMPLETE | Reference only |
| `docs/archive/` | Old masterseed + lessons_learned | Do not read |

**masterseed.md and lessons_learned.md are ARCHIVED** — do not update them.
All new lessons go to RULES.md. All new state goes to PROJECT_STATE.md.

---

## END OF CHAT SESSION — OWNER ACTIONS

Before closing any Chat session that involved fixes:

1. **Confirm CC merged to main** — check GitHub, last commit should be on main
2. **Save updated handoff** — Chat will provide `CHAT_HANDOFF_[date].md`
3. **Keep this file in Claude project folder** — WORKFLOW_SKILL.md must stay synced

Handoff doc format (Chat generates this at session end):
```markdown
# CHAT HANDOFF — [date]

## WHAT WAS DONE
[bullets of fixes merged]

## CURRENT STATE ✅
[confirmed working modules]

## CURRENT BUGS 🔴/🟡
[table: bug | file | fix | status]

## CC PROMPT READY
[filename if prompt written, or NONE]

## NEXT SESSION CHECKLIST
[owner actions + QA items outstanding]

## KEY RULES TO CARRY
[any L-numbers or facts critical for next session]
```
