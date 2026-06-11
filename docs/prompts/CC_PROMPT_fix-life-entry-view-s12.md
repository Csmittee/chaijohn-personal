# CC_PROMPT_fix-life-entry-view-s12.md
> Life Entry View — 5 fixes + group redesign
> Session 12 — 2026-06-10

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md
4. .claude/rules/RULES-data.md

Do NOT read RULES-archive.md unless explicitly told to.
Do NOT read anything in docs/archive/.
Then read and execute: CC_PROMPT_fix-life-entry-view-s12.md
```

---

## CONTEXT

All fixes are in `public/assets/js/life.injector.js` only.
No API changes. No Airtable schema changes. No other files touched.
Read the full live injector before writing anything.

---

## PROBLEM 1 — Fixed header row

**Observed:** Entire Entry View table scrolls including the group header row and field label row. After scrolling a few years down, the owner cannot see which column they are editing.

**Suggested cause:** The two `<thead>` rows have `position:sticky; top:0` and `top:28px` in CSS, but the scroll container may not be the correct overflow parent, or the sticky context is broken. CC must verify against the live CSS in the injector's style block.

**Required outcome:** Both header rows (group names row + field labels row) remain fixed and visible at all times. Only the `<tbody>` data rows scroll beneath them.

---

## PROBLEM 2 — Age column missing / NaN showing

**Observed:** First column (leftmost sticky column) shows "NaN" for some years and no age at all. Owner expects to see their age alongside the year.

**Suggested cause:** An age calculation may have been partially introduced but uses a bad source value. The correct formula is simply `year − 1971`. No Airtable field read needed — compute inline from the row's `year` value.

**Required outcome:** The sticky left column shows two lines: `year` (bold, yellow if has data) and `age` below it (dimmed, small, e.g. "age 14"). Age = row.year − 1971. Always a clean integer. Never NaN.

---

## PROBLEM 3 — Year View shows field counts instead of input cells

**Observed:** When groups are collapsed, each group column shows a raw integer (1, 2, 3, 4…). These appear to be counts of how many fields have data. Owner cannot edit anything.

**Suggested cause:** The collapsed cell renders `vals` (a count of non-null fields). This is the wrong behaviour. When a group is collapsed, the cell should show a **visual score indicator** specific to that group — not a raw count.

**Required outcome:** Collapsed group cells show a meaningful summary per the group scoring rules below. When expanded, individual input cells render as before. See PROBLEM 4 for the scoring definitions.

---

## PROBLEM 4 — Group rename + collapsed display logic

### Renames (UI labels only — no Airtable field key changes)

| Old group label | New group label |
|---|---|
| Emotional | Strength |
| Hobby | Experience |
| `knowledge_earn` field label | Skill |

Performance and Story labels stay the same.

### Collapsed cell display — one compact cell per group per row

**Performance (collapsed):**
- Show a mini progress bar or score text representing completeness
- Base: `financial_earn` presence counts as the financial anchor
- Each `achievement` item entered counts as 20% of the group score bandwidth
- Logic: if achievement field has value, parse comma-separated items, count N items. Score = min(N × 20, 100)%. If financial_earn also has a value, it confirms the band — if financial_earn is zero or null but achievement count is 5, score is still 100%.
- Display: show as `N▸` where N = achievement item count, or `—` if empty

**Strength (collapsed):**
- Four fields share 25% each: happiness_factor, health, relationship, knowledge_earn (Skill)
- First three (happiness_factor, health, relationship): each contributes up to 25% based on their 1–10 value. Formula per field: `(value / 10) × 25`
- Skill (knowledge_earn): count comma-separated new skills entered. Each new skill = 5%, capped at 25%
- Total = sum of four contributions, capped at 100%
- Display: show as percentage rounded to nearest integer, e.g. `73%`, or `—` if all empty

**Experience (collapsed):**
- No numeric score — just a count summary
- Count comma-separated entries in: `hobby`, `travel`, `creation`
- Display: `Xh Yt Zc` where X = hobby count, Y = travel count, Z = creation count. Omit any that are 0. If all zero: `—`

**Story (collapsed):**
- Count how many of the Story group fields have any text: decision, story, people, tags, location
- Display: `N entries` where N is the count, or `—` if all empty

---

## PROBLEM 5 — NaN in Age + visual cleanup

Already covered in Problem 2. Additionally:
- The `NaN` display must be completely eliminated — if `row.year` is not a valid integer for any reason, show `—` not `NaN`
- Age column should be visually distinct: smaller font, `var(--text-dim)` color, below the year number in the same sticky cell

---

## PERMANENT RULES — add to RULES.md

```
L195  Life Entry View groups: Performance, Strength (was Emotional), Experience (was Hobby), Story.
      knowledge_earn field label = Skill in UI only. Airtable field key unchanged.

L196  Life Entry View collapsed cells: each group shows a meaningful summary, not a raw field count.
      Performance = achievement item count (N▸). Strength = weighted % score across 4 fields.
      Experience = Xh Yt Zc item counts. Story = N entries count.

L197  Life Entry View year column: shows year + age on two lines in sticky left cell.
      Age = row.year − 1971. Always integer. Never NaN. Age styled dim + small below year.
```

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] Header row (group names + field labels) stays fixed when table body scrolls
- [ ] Sticky year column shows year + age (year − 1971), no NaN ever
- [ ] Collapsed Performance cell: shows achievement item count as `N▸` or `—`
- [ ] Collapsed Strength cell: shows weighted % or `—`
- [ ] Collapsed Experience cell: shows `Xh Yt Zc` counts or `—`
- [ ] Collapsed Story cell: shows `N entries` or `—`
- [ ] Expanded groups still show individual input cells exactly as before
- [ ] Group label "Emotional" → "Strength" in header row
- [ ] Group label "Hobby" → "Experience" in header row
- [ ] Field label "Knowledge" → "Skill" in expanded Strength group
- [ ] No other injector files modified
- [ ] RULES.md updated with L195, L196, L197

---

## COMMIT ORDER

```
fix(life): sticky header — both thead rows fixed, only tbody scrolls
fix(life): age column in sticky year cell, eliminate NaN
fix(life): collapsed group cells show score summary not field counts
fix(life): rename Emotional→Strength, Hobby→Experience, Knowledge→Skill label
docs: RULES.md L195–L197
```

Branch: `fix/life-entry-view-s12`
Merge to main after QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_fix-life-entry-view-s12.md`.
