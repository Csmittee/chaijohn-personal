# CC_PROMPT_bugfix_projectphases-schema.md
> Single targeted fix — ProjectPhases table creation fails due to invalid primary field.
> Read, fix one line, commit, run schema endpoint, done.

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md

Then read and execute: docs/prompts/CC_PROMPT_bugfix_projectphases-schema.md
```

---

## CONFIRMED FACTS

**Error from live run of POST /api/setup/schema-projects:**
```json
{
  "status": "error",
  "name": "ProjectPhases",
  "error": "INVALID_TABLE_OR_PRIMARY_FIELD_FOR_CREATE:
  Invalid options for ProjectPhases.phase_code:
  Invalid type for primary field"
}
```

**Root cause:** Airtable requires the primary field (first field in the array)
to be `singleLineText`. The ProjectPhases table definition currently has
`phase_code` (type: `singleSelect`) as its first field — Airtable rejects this.

**All other tables already exist** — Projects, ProjectMilestones, ProjectTasks,
ProjectResources all show `already_exists`. Only ProjectPhases is missing.

**The linked-field errors** (phase_id on ProjectMilestones and ProjectTasks)
are downstream — they fail because ProjectPhases doesn't exist yet.
Once ProjectPhases is created, run the endpoint again and they will succeed.

---

## THE FIX — one change in `functions/api/setup/schema-projects.js`

Read the file fresh. Find the ProjectPhases table definition (the `r2 = await createTable(...)` block).

The fields array currently starts with `phase_code` (singleSelect).
Add a `name` field as the FIRST field (singleLineText) before phase_code:

**Before:**
```javascript
const r2 = await createTable(key, {
  name: 'ProjectPhases',
  fields: [
    { name: 'phase_code', type: 'singleSelect', options: { choices: [...] } },
    ...
  ]
});
```

**After:**
```javascript
const r2 = await createTable(key, {
  name: 'ProjectPhases',
  fields: [
    { name: 'name', type: 'singleLineText' },   // ← ADD THIS as first field (primary field)
    { name: 'phase_code', type: 'singleSelect', options: { choices: [{ name:'DS' },{ name:'PT' },{ name:'PD' },{ name:'PV' },{ name:'LA' }] } },
    { name: 'phase_name', type: 'singleLineText' },
    { name: 'status', type: 'singleSelect', options: { choices: [{ name:'Not started' },{ name:'In progress' },{ name:'Complete' }] } },
    { name: 'exit_checklist_complete', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
    { name: 'completed_at', type: 'date', options: { dateFormat: { name: 'iso' } } }
  ]
});
```

No other changes. Do NOT touch any other table definitions.
Do NOT touch any other files.

---

## AFTER THE FIX — MANDATORY

1. Commit directly to main (this is a one-line hotfix):
   ```
   fix(schema): ProjectPhases primary field must be singleLineText not singleSelect
   ```

2. Append to `RULES.md` (next L-number after current highest):
   - Airtable primary field rule: the first field in any new table definition
     MUST be type singleLineText. singleSelect, number, date, checkbox are
     all rejected as primary field types. Always start table definitions with
     `{ name: 'name', type: 'singleLineText' }`.

3. Update `PROJECT_STATE.md` — note this fix and that owner must now re-run
   `POST /api/setup/schema-projects` to create ProjectPhases.

4. Do NOT move to docs/prompts/ — commit directly to main, no branch needed.

---

## OWNER ACTION AFTER CC COMMITS

Run in browser console (logged into dashboard):
```javascript
fetch('/api/setup/schema-projects', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)));
```

Expected result: ProjectPhases shows `"status": "created"`.
All linked fields (phase_id on ProjectMilestones and ProjectTasks) should
now also succeed.
