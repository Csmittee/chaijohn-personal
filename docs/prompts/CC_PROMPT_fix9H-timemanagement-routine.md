✅ COMPLETE — 2026-06-05
Summary: Executed on branch fix/timemanagement-routine. Fixed B3 (KPI Schedule Hit — null date + period_end support) and B4 (project tasks today chip + DO lane hide toggle). Redesigned routine system into Type A (Flow Routine — no date, flow strip only) and Type B (Period Schedule — date + period_end, measured, hit_log). Added schedule entry validation (4 valid states), markTypeBDone() with hit_log, isTodayDone(), time conflict detection (amber blink), 60s refresh loop, project task inline attribute editor. Updated RULES-dom.md L154 + added L159, L160.

---

# CC_PROMPT_fix9H-timemanagement-routine.md
> Branch: fix/timemanagement-routine
> File to modify: public/assets/js/timemanagement.injector.js ONLY
> No API changes needed. No index.html changes needed.
> Merge to main after owner QA

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
5. public/assets/js/timemanagement.injector.js   ← only file to modify
6. functions/api/project-tasks.js                ← confirm finish_by field + due_today filter

Read ALL before writing a single line.
Branch: fix/timemanagement-routine
```

---

## CONTEXT

This prompt refines M4.3 Time Management after first owner QA.
Two remaining bugs (B3 KPI Schedule Hit, B4 Project Tasks Today) plus
a full routine system redesign based on owner decision.
Only `timemanagement.injector.js` is modified — no API files, no index.html.

---

## PART 1 — BUG FIXES

### B3 — KPI Schedule Hit counter always 0/0

Root cause: Schedule items added without a date have `date=null`.
`renderKpi()` filters `i.pane === 'Schedule' && i.date === todayStr` — misses null-date items.

Fix `renderKpi()` Schedule Hit logic:
```javascript
const todayStr = today();
const todayItems = items.filter(i => {
  if (i.pane !== 'Schedule') return false;
  // Count if date matches today, OR no date and created today
  if (i.date === todayStr) return true;
  if (!i.date && (i.created_at || '').startsWith(todayStr)) return true;
  // Count Type B period schedules active today
  if (i.date && i.period_end) {
    return i.date <= todayStr && i.period_end >= todayStr;
  }
  return false;
});
const schedHit = todayItems.filter(i => {
  // For Type B: check hit_log contains today
  if (i.period_end) {
    try {
      const log = JSON.parse(i.hit_log || '[]');
      return log.includes(todayStr);
    } catch { return false; }
  }
  return i.done === true;
}).length;
const schedTotal = todayItems.length;
```

### B4 — PROJECT TASKS TODAY chip shows `—`

Root cause: `injectProjectTasks()` uses `task.finish_by` to set `item.date`.
But the `due_today` API filter uses `finish_by <= today` — returns ALL overdue tasks,
not just today's. So DO lane gets 20+ project tasks (all overdue).

Two fixes needed:

**Fix 1 — KPI chip:** Count project-sourced items where date <= today (not just === today):
```javascript
const projDueCount = items.filter(i =>
  i.source === 'project' && !i.done && i.date && i.date <= todayStr
).length;
```
KPI chip shows single number: total due/overdue project tasks not done.

**Fix 2 — DO lane overpopulation:** Add a `showProjectTasks` toggle (already added in 9G).
When ON: show all project tasks. When OFF: hide all source=project items.
Default: ON but show a visual indicator on the DO pane header:
`DO [23] ← N project tasks` so owner knows why the count is high.
Add a small `[hide projects]` link next to the count badge in DO pane header
that toggles `showProjectTasks` without needing the calendar toggle.

---

## PART 2 — ROUTINE SYSTEM REDESIGN

### Two types — completely separated

**Type A — Flow Routine** (simple reminder, no dates)
- Created from: Flow strip ⚙ Routine modal only
- Fields used: `title`, `schedule_time`, `end_time`, `pane=Schedule`,
  `schedule_type=Routine`, NO `date`, NO `period_end`
- Stored in: DailyItems (same table, filtered by no-date rule)
- Shows in: Flow strip ONLY — ordered by `schedule_time` ASC
- Never shows in Schedule pane (filter: hide Routine items with no date)
- No done button — not measured, not counted in KPI
- Yellow blink when current time is within active window
- If time conflicts with a Type B item: BOTH blink (no priority enforcement yet)

**Type B — Period Schedule** (measured, with dates)
- Created from: Schedule pane + Add button
- Fields used: `title`, `schedule_time`, `end_time`, `date` (period start),
  `period_end`, `pane=Schedule`, `schedule_type=Routine` or `General`
- Also all standard attributes: `high_impact`, `force`
- Shows in: Schedule pane AND Flow strip
- Has done button = "hit for today"
- Done resets daily (check `done_at < today` → treat as undone on render)
- Hit log = JSON array in `hit_log` field

### Schedule pane filter rule (CRITICAL)

```javascript
// Schedule pane shows:
// 1. All non-Routine Schedule items (General, one-day events, instances)
// 2. Type B Routines (Routine WITH date set)
// Schedule pane HIDES:
// 3. Type A Routines (Routine with NO date)
function isSchedulePaneVisible(item) {
  if (item.pane !== 'Schedule') return false;
  if (item.schedule_type === 'Routine' && !item.date) return false; // Type A — Flow only
  return true;
}
```

### Flow strip content (CRITICAL)

Flow strip shows ALL of these, ordered by `schedule_time` ASC:
1. Type A routines (no date) — always show, yellow blink when active
2. Type B period schedules active today (date <= today <= period_end) — yellow blink when active
3. High impact items (any pane, any date) — red blink until done
4. One-day Schedule items for today — normal display

Conflict detection:
```javascript
function hasTimeConflict(itemA, itemB) {
  if (!itemA.schedule_time || !itemB.schedule_time) return false;
  const toMins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const aStart = toMins(itemA.schedule_time);
  const aEnd   = itemA.end_time ? toMins(itemA.end_time) : aStart + 30;
  const bStart = toMins(itemB.schedule_time);
  const bEnd   = itemB.end_time ? toMins(itemB.end_time) : bStart + 30;
  return aStart < bEnd && bStart < aEnd;
}
// Before rendering each flow node, check all other nodes for conflict
// If conflict found: add class tm-node-conflict → blinks amber, not yellow/blue
```

### Schedule entry validation (CRITICAL — 4 valid states only)

In the Schedule pane + Add form, enforce these rules on Save:

| start_time | end_time | date | period_end | Result |
|---|---|---|---|---|
| ❌ | ❌ | ✅ | ❌ | Valid — one-day event (all day) |
| ✅ | ❌ | ✅ | ❌ | Valid — instance (specific time, one day) |
| ✅ | ✅ | ✅ | ❌ | Valid — instance with duration |
| ✅ | any | ✅ | ✅ | Valid — Type B period schedule |

**Invalid states — show inline error, block save:**
- `start_time` set but no `date` → "Start time requires a date"
- `period_end` set but no `date` → "End date requires a start date"
- `period_end` < `date` → "End date must be after start date"
- `period_end` set but no `start_time` → "Period schedule requires a start time"

**Add `period_end` date input to Schedule form** (after existing date input):
```html
<input type="date" name="period_end" placeholder="End date (for period schedule)">
```
Label it: "End date (optional — creates period schedule)"

### Type B done behavior

When owner clicks done on a Type B item (has `period_end`):

```javascript
async function markTypeBDone(id, btn) {
  const todayStr = today();
  const item = items.find(i => i.id === id);
  if (!item) return;

  // Parse existing log
  let log = [];
  try { log = JSON.parse(item.hit_log || '[]'); } catch {}

  // Idempotent — double-click safe
  if (log.includes(todayStr)) {
    showFlash('Already counted for today', 'info');
    return;
  }

  log.push(todayStr);

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/daily-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hit_log: JSON.stringify(log),
        done_at: todayStr
        // Note: do NOT set done=true — Type B resets daily
      })
    });
    const data = await res.json();
    if (data.record) {
      const idx = items.findIndex(i => i.id === id);
      if (idx >= 0) items[idx] = data.record;
    }
    renderPanel();
  } catch (err) {
    if (btn) btn.disabled = false;
  }
}
```

**Daily reset logic (client-side, no API call):**
```javascript
function isTodayDone(item) {
  if (!item.period_end) return item.done === true; // Type B or standard
  // Type B: check hit_log for today
  try {
    const log = JSON.parse(item.hit_log || '[]');
    return log.includes(today());
  } catch { return false; }
}
```

Use `isTodayDone(item)` everywhere instead of `item.done` for Schedule items.

**Type B item display in Schedule pane:**
- Show hit counter: `Hit: N / total days in period`
  ```javascript
  function hitCount(item) {
    try {
      const log = JSON.parse(item.hit_log || '[]');
      const start = item.date, end = item.period_end;
      return log.filter(d => d >= start && d <= end).length;
    } catch { return 0; }
  }
  function totalDays(item) {
    const ms = new Date(item.period_end) - new Date(item.date);
    return Math.ceil(ms / 86400000) + 1;
  }
  ```
- Show as: `Hit 3/7` badge next to title
- Done button label: `+1` (not ✓) — clearer that it's counting

### Routine modal (Type A) — updated

The ⚙ Routine modal (Flow strip) manages Type A items only.
When adding from modal:
```javascript
// POST to /api/daily-items with:
{
  title,
  pane: 'Schedule',
  schedule_type: 'Routine',
  schedule_time: startTime,
  end_time: endTime,      // optional
  source: 'manual'
  // NO date field — this is what makes it Type A
}
```

Modal list shows all items where `pane=Schedule && schedule_type=Routine && !date`.
Delete from modal: hard delete from DailyItems.

---

## PART 3 — PROJECT TASK ATTRIBUTE EDITING

Project-sourced DO items currently have no edit capability.
Add an inline attribute editor triggered by the pencil icon (already shown as ⚙ button).

When pencil clicked on a project-sourced item, show an inline mini-form below the row:
```
[⚡ High impact] toggle  [📌 Force] toggle  [📅 Date: ____]  [Save] [Cancel]
```

On Save: PATCH `/api/daily-items/{id}` with `{ high_impact, force, date }`.
Do NOT sync these attributes back to ProjectTask — they are TM-only overrides.
On success: update items[] in memory, re-render.

This same pencil edit works for ALL item types (project and manual).
For non-project items, pencil also allows title edit.
For project-sourced items, title is read-only (synced from project).

---

## PART 4 — ACTIVE ROUTINE DETECTION (refresh loop)

Active window check runs on render AND on a 60-second interval:

```javascript
function isActiveNow(item) {
  if (!item.schedule_time) return false;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const toMins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const start = toMins(item.schedule_time);
  const end = item.end_time ? toMins(item.end_time) : start + 15;
  return nowMins >= start && nowMins <= end;
}
```

In `init()`, after first render:
```javascript
// Refresh active state every 60s (only while panel is visible)
setInterval(() => {
  const p = panel();
  if (p && p.classList.contains('active')) renderPanel();
}, 60000);
```

CSS for conflict state (add to `ensureStyles()`):
```css
@keyframes tm-blink-amber {
  0%, 100% { opacity: 1; border-color: var(--yellow); }
  50% { opacity: 0.5; border-color: transparent; }
}
.tm-node-conflict {
  animation: tm-blink-amber 0.8s step-start infinite;
  border: 2px solid var(--yellow) !important;
  filter: brightness(0.7);
}
```

---

## RULES TO UPDATE

In `.claude/rules/RULES-dom.md`, update:

```
L154  (update) Time Management routine types:
      Type A = Flow Routine: pane=Schedule, schedule_type=Routine, NO date.
               Shows in Flow strip only. No done. Not measured.
      Type B = Period Schedule: pane=Schedule, date set, period_end set.
               Shows in Schedule pane + Flow strip. Done = daily hit logged in hit_log.
               KPI Schedule Hit counts Type B hits for today from hit_log.

L159  Schedule entry validation — 4 valid states only:
      (1) date only = all-day event
      (2) start_time + date = instance
      (3) start_time + end_time + date = instance with duration
      (4) start_time + date + period_end = Type B period schedule
      Invalid: start_time without date, period_end without date,
               period_end < date, period_end without start_time.

L160  Type B done = daily hit only. Stored as JSON date array in hit_log field.
      Double-click safe: check log includes today before appending.
      Client resets daily: isTodayDone() checks hit_log, not done field.
      done field is NOT set on Type B items — only hit_log updated.
```

---

## ⚠️ OWNER ACTION REQUIRED BEFORE RUNNING CC

Confirm these 2 fields exist in DailyItems Airtable table:
- `hit_log` — Long text
- `period_end` — Date

Owner confirmed adding these before CC runs. No schema endpoint call needed.

---

## QA CHECKLIST (CC self-verify)

- [ ] KPI Schedule Hit counts correctly for today's Schedule items (null date + date=today)
- [ ] KPI PROJECT TASKS TODAY shows total number (not `—`)
- [ ] DO pane header shows `[hide projects]` link — toggles project tasks visibility
- [ ] Type A routines: created from ⚙ modal, NO date set, hidden from Schedule pane
- [ ] Type A routines: appear in Flow strip ordered by start_time, yellow blink when active
- [ ] Type A routines: NO done button, not counted in KPI
- [ ] Type B period schedules: appear in both Schedule pane AND Flow strip
- [ ] Type B done = `+1` button, updates hit_log, double-click safe
- [ ] Type B shows "Hit N/total" badge in Schedule pane
- [ ] Type B resets daily (isTodayDone checks hit_log not done field)
- [ ] Schedule add form has period_end date input
- [ ] All 4 invalid entry states blocked with inline error message
- [ ] Time conflict between any two flow items → both blink amber
- [ ] Pencil on project-sourced item shows mini attribute editor (high_impact, force, date)
- [ ] Pencil on manual item allows full edit including title
- [ ] 60-second refresh loop updates active routine highlighting
- [ ] No API files modified
- [ ] No index.html modified

---

## COMMIT ORDER

```
fix(tm): B3 KPI schedule hit — null date + period_end support
fix(tm): B4 project tasks today chip shows count + DO lane hide toggle
feat(tm): routine type A vs B separation — flow vs period schedule
feat(tm): schedule entry validation — 4 valid states enforced
feat(tm): Type B hit_log daily done — double-click safe + reset daily
feat(tm): project task inline attribute editor (high_impact, force, date)
feat(tm): time conflict detection — both nodes blink amber
feat(tm): 60s refresh loop for active routine highlighting
docs: RULES-dom.md L154 update + L159 + L160
```

Merge to main after owner confirms QA checklist.
