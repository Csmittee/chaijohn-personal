# CC_PROMPT_fix-life-entry-view-s12b.md
> Life Entry View — Round 2 fixes (QA from S12 owner test)
> Session 12b — 2026-06-10

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

Do NOT read RULES-archive.md unless explicitly told to.
Do NOT read anything in docs/archive/.
Then read and execute: CC_PROMPT_fix-life-entry-view-s12b.md
```

---

## CONTEXT

All fixes are in `public/assets/js/life.injector.js` only.
No API changes. No schema changes. No other files touched.
Read the full live injector before writing anything.
This is a follow-up to the S12 fix. Several items passed QA, these 6 did not.

---

## PROBLEM 1 — Age calculation off by one

**Observed:** Year 1972 shows age 1. Owner was born in 1972, so age in 1972 should be 0.

**Suggested cause:** Formula is `row.year − 1971`. Correct formula is `row.year − 1972`.

**Required outcome:** Age column shows `row.year − 1972`. Year 1972 = age 0. Year 2026 = age 54.

---

## PROBLEM 2 — Location must be a sticky second column, not inside Story group

**Observed:** Location is currently a field inside the Story group (expanded/collapsed with it).
Owner needs to see location at all times regardless of group state — same as year/age.

**Required outcome:** Location becomes the **second sticky column** immediately after the year/age cell.
- Sticky left position: after the year cell (e.g. `left: [year cell width]`)
- Always visible — never collapses with any group
- Remove `location` field from the Story group fields array entirely
- Location cell in each row: editable text input, same style as other text inputs, but inside a sticky `<td>`
- Location header: sticky `<th>` in both header rows (group row + field label row), labeled "Location"
- Background must be `var(--bg)` to prevent content showing through when scrolling horizontally

---

## PROBLEM 3 — Header rows still scroll with the page

**Observed:** Both group header row and field label row scroll away when owner scrolls down.
The S12 fix used `border-collapse:separate` but the sticky context is still broken.

**Suggested cause:** The scroll container for the table is `.life-grid-wrap` which has `overflow:auto`.
For `position:sticky` on `<thead>` `<th>` elements to work, the sticky positioning must be
relative to the scrolling ancestor — the `<th>` elements need their `top` values to be correct
AND the `<thead>` must not itself have any transform or overflow that breaks the stacking context.
CC must verify the live CSS and the panel container chain (panel → life-entry-body → life-grid-wrap → table)
to find exactly what is breaking sticky and fix it correctly.

**Required outcome:** Group header row locked at top of `.life-grid-wrap` scroll area.
Field label row locked immediately below group header row.
Only `<tbody>` rows scroll. This must work in Chrome (Cloudflare Pages production).

---

## PROBLEM 4 — Performance collapsed cell: must use financial_earn as primary measure

**Observed:** Performance collapsed cell shows achievement item count only. Financial earn is ignored.

**Required outcome:**
- Primary measure = `financial_earn` as a percentage of the **maximum financial_earn across all loaded year rows**
- Formula: `fin_pct = (row.financial_earn / maxFinancialEarn) × 100`, clamped 0–100
- Secondary: each comma-separated item in `achievement` field adds 20% bonus, capped so total never exceeds 100%
- If financial_earn is null/zero AND achievement is empty → show `—`
- Display format: show as a compact bar or percentage text, e.g. `82%`
- `maxFinancialEarn` must be computed once from `_allRecords` at render time (same pattern as `_finMax` already in module state)

---

## PROBLEM 5 — Experience group collapsed cell: needs a measurable

**Observed:** Experience collapsed shows `Xh Yt Zc` counts but owner says "no measurable."
Owner wants a sense of richness — how full this year's experience was.

**Required outcome:**
- Count total comma-separated entries across all three Experience fields: `hobby`, `travel`, `creation`
- Each entry = 1 point. Display as a simple score: total points shown as `Np` (N points), e.g. `5p`
- If all three fields empty → show `—`
- Keep the breakdown visible on hover tooltip if possible: e.g. `2h 1t 2c`

---

## PROBLEM 6 — Story collapsed cell: count only story_refs entries

**Observed:** Story collapsed counts all 5 fields including location, people, decision etc. Wrong.

**Required outcome:**
- Story collapsed cell counts ONLY the `story_refs` field
- `story_refs` is a comma-separated string of Airtable record IDs (mounted from M3.1)
- Count = number of comma-separated IDs in `story_refs` (split by comma, trim, filter empty)
- If `story_refs` is null or empty → show `—`
- Display: `N refs` e.g. `3 refs`
- No other Story group field contributes to the collapsed count

---

## PERMANENT RULES — add to RULES.md

```
L198  Life Entry View age formula: row.year − 1972. Year 1972 = age 0. Never row.year − 1971.

L199  Life Entry View location: second sticky column always visible. Never inside a collapsible group.
      Sticky left offset = width of year/age cell. Background var(--bg). Editable text input per row.

L200  Life Entry View collapsed summaries (final):
      Performance = financial_earn % of dataset max + achievement bonus, display as %. 
      Strength = weighted % across happiness/health/relationship/skill.
      Experience = total comma-separated entry count across hobby+travel+creation as Np.
      Story = count of comma-separated IDs in story_refs only, display as N refs.
```

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] Year 1972 shows age 0. Year 2026 shows age 54.
- [ ] Location column is sticky, always visible, second column after year/age
- [ ] Location removed from Story group fields
- [ ] Both header rows stay fixed when tbody scrolls — verified in Chrome
- [ ] Performance collapsed: shows financial_earn % of max, or — if empty
- [ ] Experience collapsed: shows total entry count as Np, or —
- [ ] Story collapsed: counts story_refs IDs only, shows N refs or —
- [ ] No other injector files modified
- [ ] RULES.md updated with L198, L199, L200

---

## COMMIT ORDER

```
fix(life): age formula corrected to row.year − 1972
fix(life): location as sticky second column, removed from Story group
fix(life): sticky header — diagnose and fix scroll context for Chrome
fix(life): Performance collapsed = financial_earn % of max + achievement bonus
fix(life): Experience collapsed = total entry count Np
fix(life): Story collapsed = story_refs ID count only
docs: RULES.md L198–L200
```

Branch: `fix/life-entry-view-s12b`
Merge to main after QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_fix-life-entry-view-s12b.md`.
