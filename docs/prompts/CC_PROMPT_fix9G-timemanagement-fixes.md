✅ COMPLETE — 2026-06-05
Summary: Executed on branch fix/timemanagement-fixes. Fixed B1 (DO IT strip), B2 (BuyPay cancel reload), B3 (KPI schedule hit null-date), B4 (project tasks today chip). Added F1 (project toggle), F2 (bidirectional project task done/delete sync), F3 (BuyPay dropdown unique labels + liabilities), F4 (schedule end_time), F5 (active routine blink yellow), F6 (BuyPay ghost recurring payments). Added RULES-dom.md L156 update + L158. Merged to main.

---

# CC_PROMPT_fix9G-timemanagement-fixes.md
> Branch: fix/timemanagement-fixes
> File to modify: public/assets/js/timemanagement.injector.js
> File to modify: functions/api/daily-items/[id].js
> File to modify: functions/api/project-tasks.js (bidirectional delete)
> Merge to main after owner QA

---

## ⚠️ OWNER ACTION REQUIRED BEFORE RUNNING CC

None this session — table already exists. Just push this prompt to repo root and run CC.

---

## CC INTRO

```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md
4. .claude/rules/RULES-data.md
5. public/assets/js/timemanagement.injector.js   ← primary file to fix
6. functions/api/daily-items/[id].js             ← PATCH/DELETE logic
7. functions/api/project-tasks.js                ← need DELETE handler check
8. functions/api/budgets.js                      ← GET response shape, label field
9. functions/api/liabilities.js                  ← GET response shape, payment_due_day field

Read ALL before writing a single line.
Then execute this prompt. Branch: fix/timemanagement-fixes
```

---

## CONTEXT

Fix 9F (Time Management) was deployed and passes most QA.
This prompt fixes 4 bugs and adds 6 features found in first owner test.
Only modify the files listed above — do not touch any other injector or API.

---

## BUGS TO FIX

### B1 — DO IT strip missing

The `renderDoIt()` function exists in the injector but is never rendered or visible.
Likely cause: either the function returns empty HTML, or the CSS hides it, or wireEvents
does not handle its buttons.

Fix: Audit renderDoIt(). It must render a horizontal strip of up to 5 high-priority
items from DO pane (high_impact=true OR force=true AND date=today OR overdue).
Show max 5 cards in a scrollable row. Each card: title (truncated 16 chars) + date badge
+ done button + delete button. If zero qualifying items: hide the entire strip.
Wire done/delete buttons in wireEvents under the existing delegation block.

### B2 — BuyPay cancel reloads page

In the BuyPay inline add form, the Cancel button triggers a full page reload.
Cause: button inside a form tag submitting, or missing `e.preventDefault()`.

Fix: Find cancel button handler in wireEvents. Add `e.preventDefault()` on click.
The cancel action must only collapse/remove the inline form and re-render the pane —
never navigate or reload.

### B3 — Schedule done does not update KPI hit counter

When owner clicks done on a Schedule item, markDone() PATCHes Airtable and updates
items[] in memory. But renderKpi() reads `i.date === todayStr` which may not match
because Schedule items use `date` field set to the scheduled date.

Fix: After markDone() updates items[], call renderPanel() — this already happens.
The real bug: KPI counter filters `i.pane === 'Schedule' && i.date === todayStr`.
Schedule items added for today may have date=null (no date set). 

Fix renderKpi() Schedule Hit logic:
```javascript
// Count Schedule items as "today" if date===today OR (date===null AND item was created today)
// Use created_at field (Airtable returns this) as fallback:
const todayItems = items.filter(i =>
  i.pane === 'Schedule' && (
    i.date === todayStr ||
    (!i.date && (i.created_at || '').startsWith(todayStr))
  )
);
```

### B4 — PROJECT TASKS TODAY chip shows `—`

The KPI chip reads `items` filtered by `source === 'project' && date === todayStr`.
But ProjectTask `finish_by` dates from Airtable may arrive as `"2026-06-05"` while
todayStr is `"2026-06-05"` — they should match. Check the actual field name.

Fix: In `injectProjectTasks()`, log `task.finish_by` to confirm field exists.
Also check: ProjectTasks API — does it return `finish_by` or `due_date` or similar?
Read functions/api/project-tasks.js to confirm the field name, then fix the injection
to use the correct field. After fix, KPI chip must show total count (not per-project
breakdown for now — just a single number: N tasks due today).

KPI chip updated spec:
```
PROJECT TASKS TODAY
  [N]   ← total count of project-sourced DailyItems where date=today and done=false
```

---

## FEATURES TO ADD

### F1 — Calendar: toggle Projects on/off in DO lane

Add a toggle button `[Projects ON/OFF]` in the calendar strip header (right side,
next to Month/Week toggle).

State: `let showProjectTasks = true;` at module level (default on).

When OFF:
- DO pane hides all items where source==='project'
- DO pane count badge reflects visible count only
- Flow strip hides project-sourced high_impact nodes
- KPI PROJECT TASKS chip grays out (still shows number, just muted style)

When ON: restore all. Toggle persists only in memory (resets on panel reload).

Button style: same as existing period-btn pattern. Active=yellow, inactive=muted.

---

### F2 — Project task sync: bidirectional done + delete

**REPLACE L156 in RULES-dom.md with this new rule:**

```
L156  Project task sync — bidirectional:
      DONE: clicking done on DailyItem (source=project) → PATCH /api/project-tasks/{project_task_id}
            status=Done. If project_task_id missing or PATCH 404s → skip silently (task was
            deleted from project side). Done on ProjectTask side is handled by M3.4 injector —
            TM panel does not listen for that direction.
      DELETE: clicking delete on DailyItem (source=project) → DELETE /api/project-tasks/{project_task_id}
              first, then DELETE /api/daily-items/{id}. If project DELETE fails → still delete
              DailyItem (orphan cleanup). Confirm dialog: "Delete from both Time Management and
              Project? This cannot be undone."
      INJECTION: one-time per task. New tasks added to ProjectTasks auto-inject on next TM
                 panel load. Already-injected tasks (project_task_id exists in items[]) are
                 never re-injected.
      FALLBACK: if a DailyItem with source=project has no matching project task (user deleted
                from project panel without TM knowing) — it stays in DO list with a ⚠ icon
                appended to title. Owner can manually delete it.
```

**Implementation in injector:**

In `removeItem()`, add:
```javascript
// If project-sourced, delete project task first
const item = items.find(i => i.id === id);
if (item?.source === 'project' && item?.project_task_id) {
  if (!confirm(`Delete from both Time Management and Project?\nThis cannot be undone.`)) return;
  try {
    await fetch(`/api/project-tasks/${item.project_task_id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Project task delete failed, continuing with DailyItem delete:', err.message);
  }
} else {
  if (!confirm(`Remove "${item?.title || id}"?`)) return;
}
```

In `markDone()`, after successful PATCH of DailyItem, add:
```javascript
const updatedItem = data.record;
if (updatedItem?.source === 'project' && updatedItem?.project_task_id) {
  try {
    await fetch(`/api/project-tasks/${updatedItem.project_task_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Done' })
    });
  } catch (err) {
    console.warn('ProjectTask sync failed (silently ignored):', err.message);
  }
}
```

In `renderDoIt()` and item card rendering, detect orphaned items:
```javascript
// item has source=project but no project_task_id (or task_id exists but we can't verify)
// Just append ⚠ to title display — do not block any action
const titleDisplay = (item.source === 'project' && !item.project_task_id)
  ? item.title + ' ⚠'
  : item.title;
```

**Also update functions/api/project-tasks.js:**
Check if it already has a DELETE handler (`onRequestDelete`). If not, add:
```javascript
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  if (!id) return errorResponse('ID required');
  try {
    await deleteRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    return jsonResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
```
If DELETE handler already exists, leave it unchanged.

---

### F3 — BuyPay budget dropdown: unique labels + Liabilities + ProjectResources

**Data load change:**
Add liabilities fetch to `loadData()`:
```javascript
const [itemsRes, tasksRes, budgetsRes, liabRes] = await Promise.allSettled([
  fetch('/api/daily-items').then(r => r.json()),
  fetch('/api/project-tasks?due_today=true').then(r => r.json()),
  fetch('/api/budgets').then(r => r.json()),
  fetch('/api/liabilities').then(r => r.json())
]);
liabilities = liabRes.status === 'fulfilled' ? (liabRes.value.records || []) : [];
```
Add `let liabilities = [];` to module state.

**Dropdown builder** (replace existing budget select in BuyPay add form):
```javascript
function buildBudgetDropdown(selectedId) {
  // Group 1: Budgets — unique label only, active=true
  const budgetOpts = budgets
    .filter(b => b.active !== false)
    .map(b => ({ id: b.id, label: b.label || b.name || b.id, group: 'Budget' }));

  // Deduplicate by label (keep first occurrence)
  const seen = new Set();
  const uniqueBudgets = budgetOpts.filter(b => {
    if (seen.has(b.label)) return false;
    seen.add(b.label); return true;
  });

  // Group 2: Liabilities — active only
  const liabOpts = liabilities
    .filter(l => l.active !== false)
    .map(l => ({ id: l.id, label: l.name || l.id, group: 'Debt Payment' }));

  const toOption = (o) =>
    `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${o.label}</option>`;

  return `<select class="tm-budget-select" name="budget_id">
    <option value="">— Budget —</option>
    <optgroup label="Budget">${uniqueBudgets.map(toOption).join('')}</optgroup>
    <optgroup label="Debt Payment">${liabOpts.map(toOption).join('')}</optgroup>
  </select>`;
}
```

Note: ProjectResources group is deferred — owner will add later when project purchase
flow is defined. Leave a TODO comment in code.

---

### F4 — Schedule: add end time / duration

In the Schedule inline add form, after the existing `schedule_time` input, add:

```html
<input type="time" name="end_time" placeholder="End time (optional)" style="...same style as start time...">
```

Store as `end_time` field on DailyItem. This field does not exist in Airtable schema yet.
Add it as a singleLineText field via a schema migration: in `daily-items-schema.js`,
add `end_time: singleLineText` — but since the table already exists, CC must use the
Airtable Meta API to add the field:

```javascript
// In daily-items-schema.js onRequestGet — after table existence check, add missing fields
// Add end_time field if not present:
async function addFieldIfMissing(apiKey, tableId, fieldDef) {
  const res = await fetch(`${META}/${BASE_ID}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fieldDef)
  });
  // 422 = already exists → treat as ok
  return res.status === 422 || res.ok;
}
```

Owner calls `GET /api/setup/daily-items-schema` once after deploy to add the field.
⚠️ OWNER ACTION — see bottom of this prompt.

**Flow strip ordering:** Sort flow nodes by `schedule_time` ASC, then by `end_time` ASC
as secondary sort. Nodes without time sort to end.

**Flow node display:** If both `schedule_time` and `end_time` set, show as:
`09:00–10:30` in the node pill. If only start time: `09:00`.

---

### F5 — Schedule routine: blink yellow when in active time slot

A routine item is "active" when current time is between `schedule_time` and `end_time`
(if end_time set), OR within 15 minutes after `schedule_time` (if no end_time).

**In flow strip nodes:** Active routine node gets CSS class `tm-node-active-routine`:
```css
.tm-node-active-routine {
  animation: tm-blink-yellow 1s step-start infinite;
  border: 2px solid var(--yellow);
}
@keyframes tm-blink-yellow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

**In Schedule pane rows:** Active routine row gets a yellow left border:
`border-left: 3px solid var(--yellow);`

**Active check function:**
```javascript
function isActiveRoutine(item) {
  if (item.pane !== 'Schedule' || item.schedule_type !== 'Routine') return false;
  if (!item.schedule_time) return false;
  const now = new Date();
  const [sh, sm] = item.schedule_time.split(':').map(Number);
  const start = new Date(); start.setHours(sh, sm, 0, 0);
  const end = new Date();
  if (item.end_time) {
    const [eh, em] = item.end_time.split(':').map(Number);
    end.setHours(eh, em, 0, 0);
  } else {
    end.setHours(sh, sm + 15, 0, 0); // 15-min window fallback
  }
  return now >= start && now <= end;
}
```

Re-check every 60 seconds: add `setInterval(renderPanel, 60000)` in init()
— only when panel is active (check `initialized` flag).

---

### F6 — BuyPay: auto-surface recurring payments

**Logic:** On panel load, generate ghost BuyPay items from:

Source A — Liabilities where `payment_due_day` is set and `active=true`:
- Calculate next due date from `payment_due_day` (day of month)
- Show if due date is within: (today - 30 days) to (today + 21 days)
  → this catches overdue + current + upcoming in one window

Source B — Budgets where `period_due_day` is set (field may be named differently —
read the actual Budgets API response to confirm field name before using):
- Same window logic

**Period label (critical — each item must show its period clearly):**
```javascript
function getPeriodLabel(dueDate, todayStr) {
  if (dueDate < todayStr) return `OVERDUE · ${formatMonth(dueDate)}`;
  if (dueDate === todayStr) return `DUE TODAY`;
  const daysAhead = Math.ceil((new Date(dueDate) - new Date(todayStr)) / 86400000);
  if (daysAhead <= 7)  return `DUE SOON · ${formatDay(dueDate)}`;
  return `UPCOMING · ${formatMonth(dueDate)}`;
}
// formatMonth: "May 2026", formatDay: "Jun 12"
```

**Ghost item rendering:** These are NOT stored in DailyItems until owner confirms.
They appear in BuyPay pane above regular items with a distinct style:
- Light dashed border, muted background
- Shows: liability/budget name + amount (if known) + period label badge
- Two buttons: `[Book]` and `[Skip]`
  - Book → opens BuyPay add form pre-filled with name + amount + budget_id/liability_id
  - Skip → hides this ghost item for current session only (in-memory, not persisted)

**State:** `let skippedGhosts = new Set();` — stores IDs of skipped ghost items.
Ghost item ID = `ghost-${source}-${recordId}-${dueDate}` (stable for session).

**Module-level state additions:**
```javascript
let liabilities = [];
let showProjectTasks = true;
let skippedGhosts = new Set();
```

---

## RULES TO UPDATE

In `.claude/rules/RULES-dom.md`, replace L156 with the new bidirectional sync rule
defined in F2 above. Add L158:

```
L158  BuyPay ghost items: auto-surfaced from Liabilities.payment_due_day and
      Budgets.period_due_day within window (today-30d to today+21d). Ghost items
      are never stored until owner clicks Book. Skip hides for session only.
      Each ghost shows a period label: OVERDUE, DUE TODAY, DUE SOON, or UPCOMING.
```

---

## ⚠️ OWNER ACTION REQUIRED AFTER DEPLOY

Call once to add `end_time` field to existing DailyItems table:
```
GET https://chaijohn-dashboard.pages.dev/api/setup/daily-items-schema
```
Expected: `{"status":"ok","field_added":true}` or `{"status":"exists"}` if already present.

---

## QA CHECKLIST (CC self-verify before commit)

- [ ] DO IT strip renders when high_impact or force+overdue items exist
- [ ] DO IT strip hidden when no qualifying items
- [ ] BuyPay cancel does NOT reload page — only collapses form
- [ ] Schedule done → KPI Schedule Hit counter increments correctly
- [ ] PROJECT TASKS TODAY chip shows total count (number, not `—`)
- [ ] Calendar Projects toggle hides/shows project tasks in DO pane
- [ ] Delete on project-sourced item → confirm dialog → deletes both DailyItem + ProjectTask
- [ ] Done on project-sourced item → syncs status=Done to ProjectTask (silent fail if 404)
- [ ] Orphaned project items (no project_task_id) show ⚠ in title
- [ ] BuyPay dropdown shows unique budget labels + Liabilities group
- [ ] Schedule add form has start time + end time fields
- [ ] Flow nodes show time range "09:00–10:30" when both times set
- [ ] Active routine items blink yellow in flow strip AND pane row
- [ ] Ghost recurring payments appear in BuyPay with period labels
- [ ] Ghost OVERDUE items show red period badge
- [ ] Ghost Book → pre-fills add form
- [ ] Ghost Skip → hides for session, reappears on reload
- [ ] No other injector files modified
- [ ] No index.html changes needed (no new script tags)

---

## COMMIT ORDER

```
fix(tm): B1-B4 bugs — DO IT strip, cancel reload, KPI schedule hit, project task count
feat(tm): F1 project task toggle in calendar strip
feat(tm): F2 bidirectional project task sync on done and delete
feat(tm): F3 BuyPay dropdown unique labels + liabilities group
feat(tm): F4 schedule end time field + flow strip ordering
feat(tm): F5 active routine blink yellow in flow + pane
feat(tm): F6 recurring payment ghost items with period labels
docs: update RULES-dom.md L156 + add L158 after fix9G
```

Merge to main after owner confirms QA checklist above.
