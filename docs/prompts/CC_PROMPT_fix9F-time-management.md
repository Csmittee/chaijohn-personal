# ✅ COMPLETE — 2026-06-05 — Fix 9F: M4.3 Time Management built. DailyItems table, 4-pane board (Do/Follow/BuyPay/Schedule), flow strip (today/week), mini calendar (month/week), KPI strip, project task injection, BuyPay transaction booking, routine modal, event delegation throughout. RULES L154-L157 added.

# CC_PROMPT_fix9F-time-management.md
> Branch: fix/time-management
> New panel: M4.3 Time Management (route: timemanagement, panel: panel-timemanagement)
> New Airtable table: DailyItems
> New files: timemanagement.injector.js, functions/api/daily-items.js, functions/api/daily-items/[id].js
> Merge to main after owner QA

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
5. public/index.html               ← panel-timemanagement div + ROUTES array
6. functions/api/transactions.js   ← POST shape for BuyPay booking
7. functions/api/project-tasks.js  ← GET ?due_today=true pattern
8. functions/api/budgets.js        ← GET response shape

Read all before writing a single line.
Then execute this prompt.
```

---

## CONTEXT

Build M4.3 Time Management panel from scratch.
The panel shell already exists in index.html as `#panel-timemanagement` (route: `timemanagement`).
Replace all `.coming-soon` placeholder content — the injector owns everything inside.

This is a large build. Read the full prompt before starting.
Do NOT cut corners on any section — owner uses this panel daily.

---

## PART 1 — AIRTABLE SETUP

### New table: `DailyItems`

Call `POST /api/setup/daily-items-schema` (create this endpoint — see Part 2A).
Schema to create:

| Field | Airtable type | Notes |
|---|---|---|
| `title` | Single line text | Primary field |
| `pane` | Single select | Options: Do, Follow, BuyPay, Schedule |
| `amount` | Number | BuyPay pane only — what owner writes |
| `force` | Checkbox | Requires date if checked |
| `high_impact` | Checkbox | Blinks red in Flow until done |
| `done` | Checkbox | BuyPay: auto-books transaction on check |
| `done_at` | Date | Set to today when done is checked |
| `date` | Date | Target date (required when force=true) |
| `budget_id` | Single line text | Airtable record ID — BuyPay pane only |
| `schedule_time` | Single line text | "HH:MM" — Schedule pane only |
| `schedule_type` | Single select | Options: Routine, General |
| `source` | Single select | Options: manual, project |
| `project_task_id` | Single line text | Airtable record ID — project-injected tasks only |
| `project_id` | Single line text | Airtable record ID — for project tasks |
| `project_name` | Single line text | Cached project name for display |
| `booked` | Checkbox | True after BuyPay transaction is posted |

---

## PART 2 — API ENDPOINTS

### 2A — Schema setup: `functions/api/setup/daily-items-schema.js`

`GET /api/setup/daily-items-schema`
Creates `DailyItems` table with all fields above using Airtable Meta API.
Same two-phase pattern as schema-projects.js (tables first, then verify).
Return `{ status: 'ok', created: true }` or `{ status: 'exists' }` if table already present.
Owner calls this once manually after deploy.

### 2B — CRUD: `functions/api/daily-items.js`

**GET /api/daily-items**
- Fetch all records from DailyItems, sorted by created_time desc
- Accept query params: `?pane=Do` (filter by pane), `?date=YYYY-MM-DD` (filter by date)
- Return `{ records: [ { id, ...fields } ] }` — flattened, same shape as /api/projects

**POST /api/daily-items**
- Required: `title`, `pane`
- Optional: all other fields
- If `pane === 'BuyPay'` and `done === true` on creation → trigger transaction booking (see booking logic below)
- Return `{ record: { id, ...fields } }` 201

### 2C — Item update/delete: `functions/api/daily-items/[id].js`

**PATCH /api/daily-items/[id]**
- Accept any subset of DailyItems fields
- Special: if `done: true` is sent AND `booked !== true`:
  - If pane === 'BuyPay': execute transaction booking → set `booked: true`, `done_at: today`
  - If pane === 'Do' AND `project_task_id` exists: PATCH `/api/project-tasks/{project_task_id}` with `{ status: 'Done' }`
  - For all panes: set `done_at: today`
- Return `{ record: { id, ...fields } }`

**DELETE /api/daily-items/[id]**
- Hard delete from Airtable
- NEVER touch project-tasks table on delete — only DailyItems record is removed
- Return `{ deleted: true }`

### BuyPay transaction booking logic (used in PATCH when done=true)

```javascript
// POST to Transactions table
const txFields = {
  date: today,                        // always today, regardless of item.date
  type: 'Expense',
  amount: Number(item.amount || 0),
  source: 'Manual',
  description: 'book from task',
  budget_id: item.budget_id ? [item.budget_id] : undefined
};
// budget_id required — if missing, log warning but do not crash
```

---

## PART 3 — INJECTOR: `public/assets/js/timemanagement.injector.js`

Full IIFE, same pattern as budget-panel.injector.js.
Route guard: `if (e.detail !== 'timemanagement') return;`
Panel: `document.getElementById('panel-timemanagement')`

### Module-level state

```javascript
let initialized = false;
let items = [];           // all DailyItems records
let projectTasks = [];    // due today from /api/project-tasks?due_today=true
let budgets = [];         // from /api/budgets
let flowView = 'today';   // 'today' | 'week'
let calView = 'month';    // 'month' | 'week'
let calSelected = null;   // YYYY-MM-DD or YYYY-WW selected in mini calendar
```

### Data load (parallel)

```javascript
const [itemsRes, tasksRes, budgetsRes] = await Promise.allSettled([
  fetch('/api/daily-items').then(r => r.json()),
  fetch('/api/project-tasks?due_today=true').then(r => r.json()),
  fetch('/api/budgets').then(r => r.json())
]);
```

---

## PART 4 — PANEL LAYOUT (top to bottom)

### 4A — KPI STRIP

Four stat chips in a row:

| Chip | Value |
|---|---|
| Schedule Hit | Count of Schedule items where done=true AND date=today / total schedule items for today |
| Delayed Tasks | Count of items where done=false AND date < today AND force=true — accumulated, never resets |
| High Impact Open | Count of high_impact=true AND done=false |
| Project Tasks | One bubble per project: "{project_name} · {N}" — only show projects with tasks due today |

### 4B — FLOW STRIP

Toggle: `[Today]` `[This Week]`

**Today view:** horizontal scrollable row of nodes ordered by `schedule_time`.
Only items that have `schedule_time` set OR `high_impact=true` appear as nodes.

**Week view:** 7-column grid, Sunday first. Current day has light yellow background.
Weekdays (Mon–Fri) get slightly lighter background than weekend columns.
Each day column shows its nodes stacked vertically.

**Node types:**
- 🔴 Red node = `high_impact=true` AND `done=false`
  - CSS: `animation: tm-blink 1s step-start infinite` — never stops until done
  - Accumulates across days — if overdue and not done, still shows in today's flow
- 🟡 Yellow node = Schedule item with `schedule_type=General`
- 🔵 Blue node = Schedule item with `schedule_type=Routine`

**Node display:** compact pill — icon + truncated title (max 12 chars) + time if set.
Hover → tooltip showing full title + pane + date.

**[⚙ Routine] button** → modal overlay listing all Schedule items where schedule_type=Routine.
Modal allows add/edit/remove routine items. Standard modal pattern (backdrop + card).

**[Setup routine] button:** right side of flow strip header.

### 4C — DO IT! STRIP

Two columns side by side:

**Left — Do Today (max 5):**
- Items where `pane=Do` AND (`date=today` OR `high_impact=true` AND `done=false`)
- Sorted: high_impact first, then by date
- Show: compact card — symbol badges + title (truncated 24 chars, hover for full)
- If 0 items: hide the column entirely (don't show empty)

**Right — Buy/Pay Today (max 5):**
- Items where `pane=BuyPay` AND (`date=today` OR `high_impact=true` AND `done=false`)
- Same sort and truncation rules
- If 0 items: hide the column entirely

**Symbol badges (compact, no text — hover shows tooltip):**
- `⚡` = force
- `●` red = high_impact
- `✓` = done (click → triggers done action)
- `✕` = remove (click → confirm dialog)

### 4D — MINI CALENDAR

Toggle: `[Month]` `[Week]`

**Month view:** standard 7-col calendar grid for current month.
Days that have items → show colored dot (red=high_impact, yellow=schedule, blue=routine).
Click a day → filters body panes to show only that day's items.

**Week view:** 7-col week strip, Sunday first.
Same dot indicators. Click a day → filter body panes.

Clicking the calendar does NOT reload data — just sets `calSelected` and re-renders panes.

### 4E — BODY — 4 PANES

**Layout:** CSS grid, `repeat(4, minmax(180px, 1fr))` — Schedule and BuyPay panes slightly wider via `minmax(220px, 1.3fr)`.
Panes are resizable (same `wireResizer()` pattern as pl-generator if exists, else use CSS resize on a handle div).
Vertical scroll on pane body only — header and KPI/flow/doIt/calendar zones are NOT scrollable.

**Pane filter:** when `calSelected` is set, each pane shows only items matching that date.
When no filter: show all items sorted newest first, with overdue/high_impact floated to top.

**Each pane has:**
- Pane header: icon + name + item count badge + `[+ Add]` button
- Pane body: scrollable list of item cards
- Empty state: "Nothing here. Tap + to add."

**Item card:**

```
[⚡●] Title text (truncated, click/hover = full tooltip)
      [sub: date if set · time if schedule · budget label if BuyPay]
[✓] [✕]
```

All badges use symbol only. Hover tooltip on each:
- `⚡` → "Force — must complete by date"
- `●` (red) → "High Impact — appears in Flow"
- `✓` → "Mark done"
- `✕` → "Remove"

**Project-injected task cards** (source=project):
- Blue left border (3px, `var(--blue, #3b82f6)`)
- Title in blue text
- Sub-line: "{project_name} · due {date}"
- `✓` done → also PATCHes project task in M3.4
- `✕` remove → removes from DailyItems only, does NOT touch M3.4
- Cannot be edited — read-only except for done/remove

**Long title:** truncate at 28 chars. Click card → show full title in tooltip or inline expand.

**BuyPay pane — extra fields in add form:**
- Amount field (type="text" inputmode="numeric")
- Budget dropdown (from `budgets` array, grouped by category_group)
- When done is checked AND amount > 0 → auto-book transaction

**Schedule pane — extra fields:**
- Time field (type="text" placeholder="HH:MM")
- Type toggle: `[Routine]` `[General]`
- Date field

**Add item flow (all panes):**
- Click `[+ Add]` → inline form appears at top of pane body (not a modal)
- Form fields: title (textarea, 2 rows) + pane-specific extras + checkbox row
- `[Save]` `[Cancel]` buttons
- isSubmitting guard on Save

**Checkbox row in add/edit form:**
```
☐ ⚡ Force    ☐ ● High Impact    ☐ ✓ Done    ☐ ✕ Remove
```
Force checked → date field appears (required before save).
Each checkbox is compact — label is the symbol only, hover shows full text.

---

## PART 5 — PROJECT TASK INJECTION

On `loadAndRender()`:
1. Fetch `/api/project-tasks?due_today=true` → `projectTasks`
2. For each project task:
   - Check if DailyItems already has a record with `project_task_id === task.id`
   - If NOT: POST to `/api/daily-items` with:
     ```
     { title: task.title, pane: 'Do', source: 'project',
       project_task_id: task.id, project_id: task.project_id,
       project_name: task.project_name || '',
       date: task.finish_by || null }
     ```
   - If already exists: skip (no duplicate)
3. These injected items appear in the Do pane with blue styling
4. If task has no `finish_by` date: show it always (undated)
5. If task `finish_by` is within this week or this month: show prominently
6. Done on injected item → also PATCH project task status=Done via `/api/project-tasks/{id}`

---

## PART 6 — STYLES

Inject via `ensureStyles()` pattern (one `<style>` tag, id=`tm-styles`).

Key styles needed:
```css
@keyframes tm-blink { 50% { opacity: 0.2; } }
.tm-high-impact { animation: tm-blink 1s step-start infinite; }
.tm-node-red    { background: #ef4444; color: #fff; }
.tm-node-yellow { background: var(--yellow); color: #0a0a10; }
.tm-node-blue   { background: #3b82f6; color: #fff; }
.tm-project-card { border-left: 3px solid #3b82f6; }
.tm-project-title { color: #3b82f6; }
.tm-pane-body   { overflow-y: auto; flex: 1; }
/* weekday light bg in week flow view */
.tm-weekday-col { background: rgba(255,255,255,0.03); }
.tm-today-col   { background: rgba(245,197,24,0.08); }
```

---

## PART 7 — index.html changes

1. Confirm `timemanagement` is in ROUTES array — if not, add it
2. Confirm `<script src="/assets/js/timemanagement.injector.js"></script>` is near other injector tags — add if missing
3. Clear the `.coming-soon` placeholder inside `#panel-timemanagement` — injector takes over
4. Do NOT change the panel div ID or any other panel

---

## PERMANENT RULES — add to `.claude/rules/RULES-dom.md`

```
L154  Time Management panel: route=timemanagement, panel=#panel-timemanagement,
      injector=timemanagement.injector.js. DailyItems table stores all personal tasks.
      Project tasks are injected on load — never duplicated (check project_task_id first).

L155  DailyItems done=true on BuyPay: POST to Transactions with description='book from task',
      date=today (override any target date), source=Manual, budget_id from item.budget_id.
      Set booked=true on DailyItems record after successful booking.

L156  Project task injection: done on DailyItem with source=project → also PATCH
      /api/project-tasks/{project_task_id} with status=Done.
      Delete on DailyItem with source=project → delete DailyItem only, never touch project task.

L157  high_impact items blink red (tm-blink animation) until done=true.
      They accumulate across days — never filter out overdue high_impact items.
      They appear in Flow strip regardless of schedule_time.
```

---

## AFTER BUILD — MANDATORY

1. Owner must call `GET /api/setup/daily-items-schema` once after deploy to create Airtable table
2. Move this prompt to `docs/prompts/` stamped ✅ COMPLETE
3. Append L154–L157 to `.claude/rules/RULES-dom.md`
4. Update PROJECT_STATE.md:
   - Add `DailyItems` to Airtable tables section
   - Add `timemanagement.injector.js` to file inventory
   - Add `functions/api/daily-items.js` + `functions/api/daily-items/[id].js` to file inventory
   - Add `functions/api/setup/daily-items-schema.js` to file inventory
   - Mark `Fix 9F` as ✅ COMPLETE in build phases
5. Commit in this order:
   ```
   feat(api): daily-items CRUD + schema setup endpoint
   feat(tm): timemanagement.injector.js — full M4.3 build
   chore(index): wire timemanagement route + script tag
   docs: PROJECT_STATE + RULES L154-L157 after Fix 9F
   ```
6. Merge to main

---

## QA CHECKLIST (CC self-verify)

- [ ] Panel loads without console errors on navigation
- [ ] KPI strip renders 4 chips (even if all zero)
- [ ] Flow strip renders today/week toggle
- [ ] High impact items blink red
- [ ] Routine/General nodes show correct color (blue/yellow)
- [ ] DO IT! strip shows max 5 per column, hides column if empty
- [ ] Mini calendar renders month/week toggle, clicking day filters panes
- [ ] 4 panes render with correct widths (Schedule+BuyPay slightly wider)
- [ ] Pane vertical scroll works — top zones do not scroll
- [ ] Add item inline form works for each pane
- [ ] Force checkbox shows date field
- [ ] BuyPay add: amount + budget dropdown present
- [ ] Schedule add: time + type toggle + date present
- [ ] Project tasks injected with blue border/text
- [ ] Done on project task → M3.4 also updated
- [ ] Delete on project task → DailyItem removed, M3.4 untouched
- [ ] BuyPay done → transaction booked, booked=true set
- [ ] No UI files other than timemanagement.injector.js and index.html modified
- [ ] No injector files for other panels modified
