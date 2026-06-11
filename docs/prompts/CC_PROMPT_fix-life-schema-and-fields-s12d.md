# CC_PROMPT_fix-life-schema-and-fields-s12d.md
> Life panel — definitive schema fix + new fields + collapsed cell scoring
> Session 12d — 2026-06-11

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
Then read and execute: CC_PROMPT_fix-life-schema-and-fields-s12d.md
```

---

## CONTEXT

Owner has updated Airtable LifeTimeline field types manually.
This is the definitive schema — do not assume anything from previous code.
Read `functions/api/life-timeline/batch.js` and `life.injector.js` fresh before writing.

---

## DEFINITIVE LIFETIMELINE FIELD SCHEMA

| Field | Type | Notes |
|---|---|---|
| name | Single line text | Primary |
| year | Number integer | |
| month | Number integer | |
| age | Number integer | |
| financial_earn | Number integer | |
| happiness_factor | Number integer | |
| health | Number integer | |
| location | Single line text | |
| knowledge_earn | Single line text | comma-separated skill entries |
| relationship | Single line text | comma-separated entries |
| creation | Single line text | comma-separated entries |
| achievement | Single line text | comma-separated entries |
| a_impact | Long text | |
| failure | Single line text | comma-separated entries |
| f_impact | Long text | |
| travel | Single line text | comma-separated entries |
| t_impact | Long text | |
| hobby | Single line text | comma-separated entries |
| h_impact | Long text | |
| decision | Long text | |
| tags | Single line text | |
| story | Long text | |
| people | Single line text | |
| story_refs | Single line text | comma-separated Airtable record IDs |
| company-school | Single line text | new — where owner was that year |
| title | Single line text | new — owner's role/position that year |

**Total: 26 fields**

---

## FIX 1 — batch.js: correct field type mapping

**File:** `functions/api/life-timeline/batch.js`

Current `buildFields()` has wrong type arrays — it was written before the schema was finalised.
Rewrite the field arrays to match the definitive schema exactly:

```javascript
const NUM_FIELDS  = [
  'year', 'month', 'age', 'financial_earn', 'happiness_factor', 'health'
];

const TEXT_FIELDS = [
  'name', 'location', 'knowledge_earn', 'relationship', 'creation',
  'achievement', 'failure', 'travel', 'hobby', 'tags', 'people',
  'story_refs', 'company-school', 'title'
];

const LONG_TEXT_FIELDS = [
  'a_impact', 'f_impact', 't_impact', 'h_impact', 'decision', 'story'
];
```

`buildFields()` must:
- Cast NUM_FIELDS values with `Math.round(Number(v))` — never send decimals
- Skip any NUM_FIELDS value that is null, empty string, or `isNaN`
- Pass TEXT_FIELDS and LONG_TEXT_FIELDS as raw strings
- Skip any text field that is null or empty string
- Add `typecast: true` to the Airtable PATCH body so Airtable coerces instead of hard-rejecting

Also apply same fix to `functions/api/life-timeline/[id].js` — same field arrays needed there.

---

## FIX 2 — life.injector.js: GROUPS array update

**File:** `public/assets/js/life.injector.js`

Read the live GROUPS array. Update to match definitive schema:

### Performance group — add two new fields at end
```
company-school  (type: text, label: 'Company / School')
title           (type: text, label: 'Title / Role')
```
These appear as editable text inputs in expanded Performance group.
They do NOT contribute to the Performance collapsed % score — descriptive only.

### Strength group
- `knowledge_earn` is now **text** (comma-separated skills) — update type in GROUPS if currently set to 'num'
- `relationship` is now **text** (comma-separated) — update type in GROUPS if currently set to 'num'
- Strength collapsed % score:
  - `happiness_factor`: (value/10) × 25% — Number field, unchanged
  - `health`: (value/10) × 25% — Number field, unchanged
  - `relationship`: count comma-separated entries × some weight, capped 25%
  - `knowledge_earn`: count comma-separated entries × 5% each, capped 25%

### Experience group
- `hobby`, `travel`, `creation` are now **text** (comma-separated) — update type in GROUPS
- Experience collapsed: count comma-separated entries in each field
  - hobby count + travel count + creation count = total points → display `Np`
  - Never treat these as numbers — always split by comma
- `h_impact`, `t_impact` remain long text — no change

### Story group
- No field changes
- Collapsed: count comma-separated IDs in `story_refs` only → `N refs`

---

## FIX 3 — Collapsed cell scoring (final correct logic)

**Performance collapsed:**
- `financial_earn` % of dataset max (compute `_finMax` once on load from all records)
- Each comma-separated item in `achievement` = 20% bonus, capped so total ≤ 100%
- Display as `XX%` or `—` if both empty

**Strength collapsed:**
- `happiness_factor`: `(val/10) × 25` → up to 25%
- `health`: `(val/10) × 25` → up to 25%
- `relationship`: comma-split count × some weight capped at 25%
- `knowledge_earn` (Skill): comma-split count × 5% each, capped at 25%
- Total capped at 100%, display as `XX%` or `—`

**Experience collapsed:**
- `hobby` comma-split count + `travel` comma-split count + `creation` comma-split count
- Display as `Np` (e.g. `5p`) or `—` if all empty
- Hover tooltip: `Xh Yt Zc` breakdown

**Story collapsed:**
- Count comma-separated IDs in `story_refs` only
- Display as `N refs` or `—`

---

## FIX 4 — NaN guard (carry over from PR #99 if not already applied)

In collapsed cell render and save path:
- Any value read from a text field that is expected to be split: guard with `|| ''` before split
- Any numeric display: guard with `isNaN(v) ? '—' : v`
- Save All: skip fields where value `=== ''` or `isNaN` for number fields
- `_dirty` cleared per record only after its batch succeeds — not on error

---

## PERMANENT RULES — update RULES.md

```
L201  Life panel scroll: #panel-life.active uses calc(100vh - 3rem) viewport height —
      does not depend on parent height. min-height:0 on all flex children in chain.
      (already written — verify still accurate after this PR)

L202  LifeTimeline definitive field types (2026-06-11):
      Number integer: year, month, age, financial_earn, happiness_factor, health.
      Single line text (comma-separated): knowledge_earn, relationship, creation,
      achievement, failure, travel, hobby, location, tags, people, story_refs,
      company-school, title.
      Long text: a_impact, f_impact, t_impact, h_impact, decision, story.
      Any code sending wrong type to Airtable causes 500. Always match this list.
      Owner will never change field types manually again — CC uses schema:write scope.

L203  Life story_refs PATCH: read-append-write always. Never overwrite.
      story_refs is Single line text — comma-separated record IDs.

L204  Life Entry View Performance group fields (in order): financial_earn, achievement,
      a_impact, failure, f_impact, company-school, title.
      company-school and title are descriptive — do not include in collapsed % score.

L205  Airtable field type rule: before writing any API function that sends data to
      Airtable, CC must check the definitive field schema in RULES.md L202.
      Always add typecast:true to PATCH/POST body. Always Math.round() number fields.
      Never comma-split a number field. Never send a decimal to an integer field.
```

---

## QA CHECKLIST

- [ ] batch.js NUM_FIELDS, TEXT_FIELDS, LONG_TEXT_FIELDS match L202 exactly
- [ ] batch.js sends `typecast:true` in PATCH body
- [ ] batch.js Math.round() on all number fields, skips NaN
- [ ] [id].js same field arrays updated
- [ ] Performance group shows company-school + title as text inputs
- [ ] Experience collapsed: comma-splits hobby/travel/creation correctly, shows Np
- [ ] Strength collapsed: knowledge_earn and relationship comma-split counted correctly
- [ ] Story collapsed: story_refs comma-split count only
- [ ] No NaN anywhere in collapsed cells
- [ ] Save All: values persist after save, dirty cleared only on success
- [ ] Mount to Life: no 500, story_refs appended correctly
- [ ] RULES.md L202–L205 written

---

## COMMIT ORDER

```
fix(api): batch.js + [id].js definitive field type arrays + typecast:true
feat(life): Performance group — add company-school + title fields
fix(life): GROUPS array field types corrected for text fields
fix(life): collapsed cell scoring — correct comma-split logic per field type
fix(life): NaN guards on all collapsed cells and save path
docs: RULES.md L202–L205 definitive schema locked
```

Branch: `fix/life-schema-and-fields-s12d`
Merge to main after QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_fix-life-schema-and-fields-s12d.md`.
