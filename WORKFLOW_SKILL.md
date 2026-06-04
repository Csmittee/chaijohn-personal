# 🎯 WORKFLOW SKILL — Chaijohn OS
> Version 3.0 — 2026-06-04
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
- Think of CC as Chat but with ability to read and write every live file —
  Chat provides direction and problem framing, CC owns verification and solution

### 🤖 CC (Claude Code)
- Reads all files fresh from repo before writing anything
- Writes complete replacement files — never patches or diffs
- Commits with descriptive messages, merges to main before ending session
- Archives prompt + updates RULES.md + PROJECT_STATE.md after every fix
- Is NOT bound by Chat's suggested solution — CC verifies the real cause
  from live files and fixes it the best way CC judges

---

## THE LOOP

```
Owner describes goal or QA result
        ↓
Chat reads repo → diagnoses → writes CC_PROMPT → owner pushes to repo root
        ↓
Owner runs CC: "Read CLAUDE.md, RULES.md, .claude/rules/RULES-[domain].md, PROJECT_STATE.md. Then execute: [prompt filename]"
        ↓
CC reads fresh → verifies cause → fixes → commits → archives prompt → updates docs → merges to main
        ↓
Owner QAs live site → reports back to Chat (screenshot or pass/fail list)
        ↓
Chat reviews → next prompt or done
```

---

## CHAT RULES — NON-NEGOTIABLE

1. **Never guess** — if a file is needed to diagnose, request it via project knowledge search.
2. **Sync before critical diagnosis** — when verifying a root cause or a repeat issue,
   ask owner to confirm GitHub sync is refreshed so project knowledge reflects live files.
   Never diagnose a repeat bug from stale snapshot data.
3. **Read before diagnosing** — check CLAUDE.md + RULES.md + the specific injector/API
   file before forming any opinion on a bug.
4. **One CC prompt per session goal** — batch all related fixes into one prompt.
5. **Never re-explain project history in CC prompts** — CC reads CLAUDE.md + RULES.md.
6. **Do not trust your own memory for field names, table names, or API shapes** —
   always read RULES.md first. All confirmed facts live there.
7. **Permanent behaviour = permanent rule** — if a fix or behaviour must survive every
   future CC session, it must be written into RULES.md, not just the CC prompt body.
   Prompts are one-session instructions. RULES.md is permanent memory.

---

## HOW CHAT WRITES A CC PROMPT

### Prompt structure — lean by default

CC is stronger than Chat at reading live files. Chat's job is to frame the problem,
not prescribe the solution. Overly detailed solutions constrain CC's thinking and
cause blind execution of wrong fixes.

**Default prompt structure:**

```markdown
## PROBLEM N — [short name]

**Observed:** [what the owner saw — exact behaviour]

**Suggested cause:** [Chat's hypothesis from project knowledge snapshot —
CC must verify this against the live file before acting]

**Required outcome:** [what must be true after the fix]
```

This gives CC:
- The symptom to reproduce
- A starting hypothesis to verify (not blindly follow)
- A clear success definition

**When to add more detail:** Only when Chat has confirmed the cause from
a fresh sync AND the fix is unambiguous (e.g. a wrong string value, a missing
route in an array). In that case Chat may include a specific code change.
Even then — mark it clearly as "confirmed fix, not a suggestion."

### Permanent rules section — always include

Every CC prompt that changes a behaviour that must persist must include:

```markdown
## PERMANENT RULES — add to RULES.md

L[next number]  [rule text — one compact line per rule]
```

CC must write these to RULES.md as part of the mandatory post-fix steps.
If a behaviour has been requested more than once and keeps reverting —
it was never in RULES.md. Add it now.

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

### RULES.md file management

- All new universal rules go to the TOP of RULES.md (newest first)
- Domain-specific rules go to the matching `.claude/rules/RULES-[domain].md` file
- `RULES-archive.md` — pre-9C rules, CC reads only when explicitly instructed

---

## HOW CHAT HANDLES QA REPORTS

When owner reports QA results (screenshots or pass/fail):

1. If it is a repeat issue (same bug came back) — request a GitHub sync refresh
   before diagnosing. The previous fix may not have landed in RULES.md.
2. Map each failure to a file + suggested cause — read the file if needed
3. Group all fixes by file — one CC prompt covers all related files
4. Include a checklist in the prompt matching exactly what owner reported

**QA report format to ask for if not provided:**
```
Feature: ✅ pass / ❌ fail / ⚠️ partial
Notes: [what was seen]
```

---

## CC GOLDEN RULES (Chat enforces these in every prompt)

| Rule | What it means |
|---|---|
| Read fresh | Read every source file from repo before writing. Never rely on prompt description. |
| Verify before fix | Chat's suggested cause is a hypothesis. CC confirms from live file before acting. |
| Complete files only | Full replacement. No diffs, no patches. |
| No shared bundles | One injector per panel. |
| No React / No Tailwind | Pure CSS vars + vanilla JS only. |
| Explicit color on light buttons | `color:#0a0a10` when background is var(--yellow). |
| Panel display via CSS class | Never inline `style.display`. Use `#panel-xxx.active { display:flex }` via injected style block. |
| Route guard first | `if (e.detail !== 'route-name') return;` as first line of panelactivated handler. |
| Archive + document | After every fix: move prompt → docs/prompts/, append RULES.md, update PROJECT_STATE.md. |
| Permanent = RULES.md | Any behaviour that must survive next session goes into RULES.md. Not just the prompt. |

---

## REPO DOC STRUCTURE

| File | Purpose | Who reads it |
|---|---|---|
| `CLAUDE.md` | Project brief, stack, constraints | CC — every session |
| `RULES.md` | Universal rules only (~20 rules, newest at top) | CC — every session |
| `.claude/rules/RULES-[domain].md` | Domain-specific rules per module | CC — only when working on that module |
| `RULES-archive.md` | Archived rules L001–L060j | CC — only when working on legacy module |
| `PROJECT_STATE.md` | Phase status, roadmap, file inventory | CC — build sessions |
| `WORKFLOW_SKILL.md` | This file — operating model | Chat + Owner |
| `docs/prompts/` | Archived CC prompts stamped ✅ | Reference only |
| `docs/archive/` | Old masterseed + lessons_learned | Do not read |

---

## END OF CHAT SESSION — OWNER ACTIONS

Before closing any Chat session that involved fixes:

1. **Confirm CC merged to main** — check GitHub, last commit on main
2. **Save updated handoff** — Chat provides `CHAT_HANDOFF_[date].md`
3. **Next session** — paste handoff + confirm sync checkbox ON

---

## PANEL HEADER INTEGRITY RULE (L147)

Every injector that calls `p.innerHTML = renderPanel()` replaces the entire
panel div including any header defined in index.html.

**Rule:** If an injector uses `p.innerHTML` to render the full panel:
- The panel header (title + subtitle) MUST be included inside `renderPanel()`
- Never assume the header survives in index.html after an injector runs
- When reviewing any injector, always confirm the header is present in its output

**Audit command CC can run:**
```bash
grep -l "p.innerHTML\|panel.innerHTML" public/assets/js/*.injector.js
```
Then for each hit — confirm that injector's renderPanel() includes a header block.

This rule applies to ALL injectors, present and future.
Add to RULES.md as L147.
