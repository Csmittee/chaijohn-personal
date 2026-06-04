# CC_PROMPT_fix-pl-generator-p1c.md
> ✅ COMPLETE — fix-pl-generator-p1c — 2026-06-04
> Subtitle persistence, save bar cleanup, archive/new-model removed
> Branch: fix/pl-generator-p1c

---

## CC INTRO
```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Read CLAUDE.md and RULES.md first.
Read the full live file before forming any opinion.

Branch: fix/pl-generator-p1c
```

---

## QA FAILURES — fix all four

**1. Save bar at bottom cuts off the left/right panel height.**
The save bar sits at the bottom of the panel as a fixed row. This causes the
sidebar and output area to not stretch to full height — they stop short and
the save bar blocks the bottom. The save bar should not obstruct the working area.
Fix the layout so sidebar and output area fill the full available height.
If moving the save bar, the version note input is sufficient — model name input
is removed (see item 4).

**2. "+ New model" button must be removed.**
It currently creates an unnamed blank model which causes confusion.
Project creation only happens in M3.4 (Project Assets panel).
In P&L Generator the only entry point is selecting an existing project
from the dropdown. Remove the button entirely.

**3. Project dropdown — when a project is selected, the project name must
appear prominently on the top LEFT of the header** (not just as a subtle
subtitle). It should be immediately obvious which project is being modelled.
The current subtitle update exists but is too small/subtle. Make it clear.
Also: the subtitle update from selecting a project is still not confirmed
working by QA — verify and fix if broken.

**4. Save bar — model name input must be removed.**
Replace it with: version note only (short text, e.g. "conservative" or "v2 high growth").
The saved record name must be auto-set to the selected project name.
If no project is selected, name defaults to "Unnamed".
User never types the model name manually.

---

## PERMANENT RULES — add to RULES.md

```
L137  P&L Generator: project creation is NOT allowed inside P&L Generator.
      The "+ New model" button must not exist. Projects are created in M3.4 only.
      P&L Generator only works with existing projects selected from the dropdown.

L138  P&L Generator save: model name is always auto-set from selected project name.
      User never types a model name. Save bar contains: version note input + version
      badge + Save + ODS + PDF only. No model name input field.

L139  P&L Generator header: when a project is selected, the project name must be
      displayed prominently in the top-left area of the panel header — not just as
      a small subtitle. It must be immediately obvious which project is being modelled.
```

---

## AFTER ALL FIXES — MANDATORY

1. Archive → `docs/prompts/` stamped `✅ COMPLETE — fix-pl-generator-p1c — [date]`
2. Add L137, L138, L139 to RULES.md
3. Update PROJECT_STATE.md
4. Commit per fix, merge to main

---

## QA CHECKLIST

- [ ] Sidebar and output area fill full panel height — save bar does not obstruct
- [ ] No "+ New model" button exists anywhere in the panel
- [ ] Select Ploikong from dropdown → project name shows prominently top-left
- [ ] Save bar has version note only (no model name input)
- [ ] Save → record is named after the project automatically
- [ ] All previous fixes still working (tab highlight, no bleed, generate accessible)
