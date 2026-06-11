# CC_PROMPT_fix-life-story-and-aggregation-s12e.md
> Life panel — Story group redesign + year/month aggregation rules
> Session 12e — 2026-06-11

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
Then read and execute: CC_PROMPT_fix-life-story-and-aggregation-s12e.md
```

---

## CONTEXT

Owner renamed `story` field in Airtable to `note`. This is now the definitive field name.
Read `life.injector.js`, `batch.js`, `[id].js` fresh before writing anything.
This prompt covers two architectural changes:
1. Story group redesign — split into Note + Story Node
2. Year/month aggregation — month data wins over year data when present

---

## CHANGE 1 — Field key update: `story` → `note`

The Airtable field previously called `story` has been renamed to `note` by the owner.

Update every reference to `story` field key in:
- `functions/api/life-timeline/batch.js` — LONG_TEXT_FIELDS array
- `functions/api/life-timeline/[id].js` — field arrays + append logic
- `public/assets/js/life.injector.js` — GROUPS array, all field references

`story_refs` field key is unchanged.

---

## CHANGE 2 — Story group redesign

### Current (wrong)
One collapsed "STORY" group containing: decision, note, people, tags, story_refs
Collapsed cell = count of non-empty fields (wrong — mixes unrelated fields)

### Required — Two distinct visible columns in the Story section

**Column 1: NOTE**
- Airtable field: `note` (Long text)
- Expanded: large text input, label "Note"
- Purpose: owner's free-form yearly remark — never comma-split, contains commas naturally
- Counts as 1 if non-empty, 0 if empty

**Column 2: STORY NODE**
- Airtable field: `story_refs` (Single line text)
- Expanded: read-only display of mounted record IDs + count
- Shows: `N refs` where N = comma-separated ID count
- Purpose: mounted M3.1 Story record IDs — append-only via Mount to Life

### Other Story group fields stay as-is
`decision`, `people`, `tags` remain in the Story group expanded view, unchanged.

### Collapsed Story group cell
- Count = (1 if `note` non-empty, else 0) + (count of IDs in `story_refs`)
- Display: `N refs` where N is the total count above
- If both empty → `—`

---

## CHANGE 3 — Year/month aggregation rules

**Problem observed:** When a Story is mounted to year=2026, month=6, the mount creates
a month-level row. The month view shows `1 refs` correctly. But the year-level row
for 2026 shows `—` because it reads only the year-level record, not the month rows.

### Rule — Month data wins over year data when present

For all fields in Entry View Year View collapsed cells:

**Numeric fields** (financial_earn, happiness_factor, health):
- If any month row for that year has a value → year display = sum of all month values
- If no month rows have data → year display = year-level record value
- Display as before (%, score etc)

**Comma-separated text fields** (achievement, hobby, travel, creation, knowledge_earn,
relationship, failure):
- If any month row for that year has entries → year display = total count across all months
- If no month rows have data → year display = year-level record value

**story_refs:**
- Year display = union of all story_refs IDs across year-level row + all month rows
- Deduplicate, count total unique IDs → display as `N refs`

**note:**
- Year display = 1 if year-level note OR any month note is non-empty, else 0

### Implementation
- When rendering Year View, CC must check if month rows exist for each year
- Month rows are already loaded in `_allRecords` — filter by `year === row.year && month !== null`
- Aggregate on render — no new API calls needed
- This aggregation applies only to collapsed cell display — expanded view unchanged

---

## PERMANENT RULES — update RULES.md + RULES-data.md

```
L206  LifeTimeline field rename: `story` (Long text) renamed to `note` in Airtable.
      UI label = "Note". Never comma-split note field. Counts as 1 if non-empty.
      `story_refs` field key unchanged.

L207  Life Story group architecture:
      - NOTE column: `note` field, free-text yearly remark, long text input
      - STORY NODE column: `story_refs` field, mounted M3.1 IDs, read-only count display
      - Collapsed Story = (note ? 1 : 0) + story_refs ID count → display as N refs
      - decision, people, tags remain in Story group expanded view

L208  Life year/month aggregation rule:
      Year View collapsed cells aggregate from month rows when present.
      Numeric fields: sum of month values, fallback to year-level if no months.
      Text/comma fields: total count across months, fallback to year-level if no months.
      story_refs: union of all IDs across year + all months, deduplicated.
      Aggregation uses _allRecords already loaded — no extra API calls.
```

Update RULES-data.md field schema: replace `story` with `note` in the field list.

---

## QA CHECKLIST

- [ ] `note` field key used everywhere — no remaining `story` references (except `story_refs`)
- [ ] Story group expanded shows: Note input + Story Node read-only + decision + people + tags
- [ ] Story Node column shows count of story_refs IDs as `N refs`
- [ ] Collapsed Story cell = note(0/1) + story_refs count → `N refs` or `—`
- [ ] Year View 2026 collapsed Story shows `1 refs` (aggregated from Jun month row)
- [ ] Year View numeric fields aggregate sum from month rows when present
- [ ] Year View text/comma fields aggregate count from month rows when present
- [ ] No extra API calls on render — uses _allRecords
- [ ] RULES.md L206–L208 written
- [ ] RULES-data.md field list updated: `story` → `note`

---

## COMMIT ORDER

```
fix(api): rename story→note in batch.js, [id].js field arrays
fix(life): rename story→note in GROUPS array and all injector references  
feat(life): Story group — split into Note input + Story Node read-only column
fix(life): year view aggregation — month rows win, sum/count/union on render
docs: RULES.md L206–L208, RULES-data.md field schema updated
```

Branch: `fix/life-story-and-aggregation-s12e`
Merge to main after QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_fix-life-story-and-aggregation-s12e.md`.
