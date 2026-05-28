# CC_PROMPT_fix9C_m34-project-asset.md
> Part 3 of 3 — Build M3.4 Project Asset module from scratch
> New Airtable tables + new injector + new panel in sidebar shell

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 5 rules (required always)
2. RULES.md         — compact lessons, read before every task (required always)
3. PROJECT_STATE.md — phases, roadmap, file inventory (required for build sessions)

Do NOT read masterseed.md or lessons_learned.md — they are archived.

Then read and execute: docs/prompts/CC_PROMPT_fix9C_m34-project-asset.md
```

---

## OBJECTIVE

Build M3.4 Project Asset — the central command module for all projects.
This module is the origin of all project activity. It feeds M2.4 Finance
Projects (not built yet — that is Part 4). It connects to M3.1 Ideas
(already exists) as a project source.

This is a full build: Airtable schema + API endpoints + injector + UI panel.
Branch: `feat/m34-project-asset`

---

## READ FIRST

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md` — already read from CC INTRO above
2. `public/index.html` — the sidebar shell (Phase 9b result)
3. `public/assets/js/dashboard.injector.js` — understand existing patterns
4. `public/assets/js/entry.injector.js` — understand form patterns
5. `functions/api/` — all existing API files, understand the pattern
6. Current Airtable base — list all existing tables before creating new ones

---

## PART 1 — AIRTABLE SCHEMA

Create these tables in the existing Airtable base.
Check existing tables first — do not duplicate.

### Table: Projects
| Field | Type | Notes |
|---|---|---|
| project_id | Auto number | PK |
| name | Single line text | Required |
| idea | Long text | Core concept |
| customer_group | Single line text | Target customer |
| problem_solved | Long text | What problem this solves |
| competitor_url | URL | Optional |
| type | Single select | Active · Draft · Pause |
| current_phase | Single select | DS · PT · PD · PV · LA |
| life_goal_link | Single line text | Link to M5 Life goal (text for now) |
| idea_source_id | Single line text | Source idea ID from M3.1 if pushed from Ideas |
| repo_url | URL | GitHub repo link |
| sga_pct | Number | Default 10 — SG&A % deducted from earn forecast |
| target_revenue_monthly | Currency (THB) | From P&L |
| investment_total | Currency (THB) | Sum of all resources |
| payback_years | Number | Calculated |
| finance_opened | Checkbox | True when pushed to M2.4 |
| created_at | Date | Auto |
| updated_at | Date | Auto |
| notes | Long text | Decision log — appended never overwritten |

### Table: ProjectPhases
| Field | Type | Notes |
|---|---|---|
| phase_id | Auto number | PK |
| project_id | Linked to Projects | FK |
| phase_code | Single select | DS · PT · PD · PV · LA |
| phase_name | Single line text | Design · Prototyping · Process dev · Prod develop · Launch |
| status | Single select | Not started · In progress · Complete |
| exit_checklist_complete | Checkbox | All exit criteria met |
| completed_at | Date | Auto-set when exit checklist complete |

### Table: ProjectMilestones
| Field | Type | Notes |
|---|---|---|
| milestone_id | Auto number | PK |
| project_id | Linked to Projects | FK |
| phase_id | Linked to ProjectPhases | FK |
| name | Single line text | Exit gate name |
| milestone_type | Single select | Design exit · Prototype exit · Process exit · SOP exit · Launch |
| auto_date | Date | Calculated — latest due_date of tasks in that phase |
| status | Single select | Pending · Reached · Blocked |

### Table: ProjectTasks
| Field | Type | Notes |
|---|---|---|
| task_id | Auto number | PK |
| project_id | Linked to Projects | FK |
| phase_id | Linked to ProjectPhases | FK |
| title | Single line text | Required |
| finish_by | Date | |
| assigned_to | Single line text | Default "Me" |
| measure | Single line text | How success is measured |
| status | Single select | Open · In progress · Done · Delayed |
| priority | Single select | High · Medium · Low |
| depends_on_project_id | Linked to Projects | Cross-project dependency — optional |
| depends_on_task_id | Linked to ProjectTasks | Cross-project task dependency — optional |
| dependency_active | Checkbox | True while parent task not yet done |
| last_updated | Date | Auto |
| notes | Long text | |

### Table: ProjectResources
| Field | Type | Notes |
|---|---|---|
| resource_id | Auto number | PK |
| project_id | Linked to Projects | FK |
| item | Single line text | What is needed |
| time_needed | Single line text | e.g. "2 weeks" |
| cost | Currency (THB) | Investment amount |
| status | Single select | Planned · Purchased · In use |

---

## PART 2 — API ENDPOINTS

Create these files in `functions/api/`:

### `functions/api/projects.js`
Handles: GET all projects · GET single project · POST create · PATCH update · DELETE (soft — set type to Draft)

GET /api/projects
- Returns all projects with their phases, milestone dates (auto-calculated
  from latest task due_date per phase), resource totals, task counts
- Include: total_tasks, delayed_tasks, pending_tasks, investment_total
- Include: days_to_launch (days from today to latest milestone auto_date
  of LA phase) — null if no LA tasks defined

GET /api/projects/:id
- Full project record + all phases + all milestones + all tasks + all resources

POST /api/projects
- Creates project record
- Auto-creates 5 phase records (DS/PT/PD/PV/LA) linked to the project
- Auto-creates 4 milestone records linked to the project phases

PATCH /api/projects/:id
- Updates any field
- If type changes to "Active" and finance_opened is false:
  return flag `{ finance_ready: true }` — UI uses this to prompt
  "Open M2.4 Finance?" — does NOT auto-open, owner decides

### `functions/api/project-tasks.js`
Handles: GET tasks by project · POST create task · PATCH update · DELETE

GET /api/project-tasks?project_id=X
- Returns all tasks for a project grouped by phase
- Include dependency info: depends_on_project name + task title

POST /api/project-tasks
- Creates task, auto-sets status to Open
- If depends_on_task_id provided: sets dependency_active = true

PATCH /api/project-tasks/:id
- When status → Done: check if all tasks in phase are done
  → if yes: auto-set phase status → Complete, milestone status → Reached,
  milestone auto_date → today
- When status → Delayed: this triggers heartbeat RED for the project

### `functions/api/project-resources.js`
Handles: GET by project · POST · PATCH · DELETE

---

## PART 3 — INJECTOR

Create: `public/assets/js/projects.injector.js`

This injector handles the entire M3.4 panel.
Load it in `public/index.html` alongside other injectors.
It boots on `DOMContentLoaded` and targets `#panel-projects`.

### Data flow
On load: fetch `/api/projects` → render panel
On project create/update: re-fetch and re-render

### State managed by injector
```javascript
let allProjects = [];
let currentView = 'lane';    // 'lane' | 'card'
let currentFilter = 'all';   // 'all' | 'Active' | 'Draft' | 'Pause'
let selectedProjectId = null; // null = overview, number = focused project
let formOpen = false;
let weekOffset = 0;          // for sliding the week timeline
```

---

## PART 4 — UI PANEL

Wire into `#panel-projects` in `public/index.html`.

### Panel anatomy

```
┌─────────────────────────────────────────────┐
│ CONCLUSION ROW — 4 stat chips               │
│ Active projects · Tasks pending/total       │
│ Tasks delayed (with health bar) · Nearest   │
│ launch in days                              │
├─────────────────────────────────────────────┤
│ FILTER BAR                                  │
│ [+ Create project] [View ▾ dropdown]        │
│ [Lane | Card toggle]                        │
├─────────────────────────────────────────────┤
│ ZONE — projects display                     │
│ Lane view OR Card view (see below)          │
└─────────────────────────────────────────────┘
```

### Stat chips
- Active projects: count of type=Active
- Tasks pending / total: count open+in-progress / total
- Tasks delayed: count with status=Delayed — show as number with
  red health bar (delayed / total as %)
- Nearest launch: min days_to_launch across all Active projects

### Filter bar
View dropdown options: All · Active · Draft · Pause
Lane/Card toggle: two buttons, active state on selected

### + Create project button
Opens a right-side drawer (same pattern as entry drawer from Phase 9b).
Drawer width: 560px. Slides in from right. Backdrop closes it.

#### Project entry drawer — 3 sections

**Section 1 — Concept** (always expanded)
- Project name (required)
- Core idea — what is this?
- Target customer group
- What problem does this solve? (textarea)
- Competitor website URL (optional)

**Section 2 — Resources** (collapsible)
Header when collapsed shows: "N resources · ฿X,XXX total"
Header when expanded shows: "Resources — becomes startup cost"
Content: unlimited rows, each row has:
  Item name | Time needed | Cost (฿) | [−] remove button
[+ Add resource] button below rows
Auto-totals investment as rows are filled

**Section 3 — Key tasks** (collapsible)
Header when collapsed: "N tasks defined"
Header when expanded: "Key tasks"
Content: unlimited rows, each row has:
  Task title | Finish by (date) | Who | Measure | Phase (DS/PT/PD/PV/LA)
  [▼ Connect] toggle — when clicked expands inline:
    Depends on project: [dropdown of all projects]
    Depends on task: [dropdown of tasks in selected project]
    This creates the cross-project dependency on save
  [−] remove button
[+ Add task] button below rows

**Bottom buttons (3)**
- Save draft — saves with type=Draft, closes drawer, card appears in Draft state
- Push — saves with type=Active, finance_opened=false, closes drawer,
  card appears in Active state with green frame + heartbeat
  Show inline prompt after push: "Open M2.4 Finance for this project?"
  [Yes — go to Finance] [Later]
- AI inquiry — opens inline sub-menu with 3 options:
  1. Feasibility assessment (sendPrompt with project data)
  2. Generate task list (sendPrompt)
  3. Extend the idea (sendPrompt)
- Edit button (shown when editing existing) — same form, pre-filled

### Lane view

Week timeline header: shows 12 weeks starting from (today − 2 weeks)
Week labels: "W22 Jun 2" format (week number + date of Monday)
[◀] [▶] buttons to slide the window — each click shifts by 4 weeks
Today line: thin vertical red line at today's position

Per project lane:
```
[color dot] [Project name]    [phase badge]  [hb dot]  |--milestone--|
[                    week bar with phase fills and milestone diamonds      ]
[tasks count · delayed count · investment]
```

Phase fills: colored band behind the week bar for each phase's span
(DS = blue, PT = purple, PD = teal, PV = amber, LA = green)

Milestone diamonds (◆):
- Position: at auto_date column on the week bar
- Color: green if Reached, red if Blocked, gray if Pending
- Hover tooltip: milestone name + auto_date + status

Cross-project connection lines:
- Thin dashed curved SVG path between milestone diamonds across lanes
- Color: matches the source project color
- Animated pulse dot moving along the line while dependency_active=true
- When dependency completes (parent task=Done): line becomes solid, no pulse
- Only shown when "Show connections" toggle is ON (default OFF — not to
  overwhelm on first view)

Heartbeat dot (right of phase badge):
- Green pulsing: type=Active AND no delayed tasks
- Red pulsing: type=Active AND one or more delayed tasks
- No dot: type=Draft or Pause
- Hover tooltip:
  GREEN: "On plan · Last task: [title] · [N] days ago"
  RED: "Delayed · [task title] · overdue [N] days · Clear requires checklist"

Click anywhere on lane → focus view (replaces main area, breadcrumb back)

### Card view

Grid: `repeat(auto-fill, minmax(280px, 1fr))`

Per project card:
- Color frame border matching project type:
  Active = green border (1px)
  Draft = gray border (0.5px dashed)
  Pause = amber border (0.5px)
- Header: color dot · project name · phase badge · heartbeat dot
- Milestone progress bar: 4 segments (DS/PT/PD/PV), filled = complete
- Summary line: tasks · delayed · investment
- P&L hint: ฿X/mo · X.XX yr payback
- 4 icon buttons (hover shows label):
  ti-whistle = Startup cost
  ti-crane = Tasks
  ti-currency-dollar = P&L
  ti-settings = Settings (opens entry drawer pre-filled for edit + downgrade option)

Click card body → focus view

### Focus view (click any project)

Replaces the main panel content.
Breadcrumb: "Projects / [Project name]"

Shows:
- Full project header: name · phase · heartbeat · type badge
- Phase timeline: 5 phase pills (DS/PT/PD/PV/LA) with current highlighted
- Milestone status: 4 exit gate chips showing auto_date and status
- Task list grouped by phase — each task shows:
  title · finish_by · who · measure · status badge
  If dependency set: shows "→ [Project name] / [Task title]" link
  Red banner on delayed tasks
- Resource list: all items with cost and status
- P&L summary card: investment · monthly revenue · SG&A · net · payback
- Action buttons: Edit · Push/Downgrade · Open Finance (if not yet opened)

### Red clearance drawer

When user clicks a red heartbeat dot:
Slides in from right (same drawer pattern).
Shows:
- Why red: list of delayed tasks with days overdue
- Auto-generated checklist based on delayed task types:
  "Decision made on [task title]" for decision tasks
  "New date set for [task title]" for execution tasks
  "Blocker resolved or removed" if dependency was blocking
- Evidence field: text area "What happened and what is the new plan"
- Only when all checkboxes checked: "Mark resolved" button unlocks
- On submit: appends to project notes field with timestamp,
  clears delayed status on selected tasks, recalculates heartbeat

---

## PART 5 — INTEGRATION POINTS

### From M3.1 Ideas (existing)
- Ideas module can push an idea to Projects
- When pushed: pre-fills Section 1 of project entry form
- Not blocking — M3.1 push to M3.4 can be built as a later enhancement
- For now: note in masterseed that this connection is planned

### To M2.4 Finance Projects (not yet built)
- When Push button clicked AND owner confirms "Open Finance":
  Navigate to #finance-projects panel (placeholder for now)
  Pass project_id in URL hash: `#finance-projects?project=${id}`
- M2.4 will read this and pre-create the funding structure
- For now: just navigate, M2.4 handles the rest in Phase 9D

### To M2.2 Sales (not yet built)
- When LA phase reaches SOP exit:
  Surface a prompt: "Send revenue forecast to Sales pipeline?"
  If yes: store flag on project record (sales_forecast_sent = true)
  M2.2 will read this later
- For now: just store the flag

### To M4.3 Time Management (not yet built)
- All tasks with finish_by = today or overdue feed the Today view
- The API endpoint already returns this data
- M4.3 will call /api/project-tasks?due_today=true when built

---

## CONSTRAINTS

- Do NOT change any existing injector files
- Do NOT change any existing API files
- Do NOT change `functions/api/auth.js` or `functions/api/kv*.js`
- Card style baseline: use existing `.liab-content-card` dimensions
  as reference for portrait ratio cards — not wide and flat
- All monetary values: Thai Baht (฿), format with toLocaleString()
- All dates: display as "D MMM YYYY" (e.g. "5 Jun 2026")
- Repo is source of truth — if anything conflicts with what you find,
  use the repo and note the deviation

---

## AFTER ALL PARTS — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — M3.4 Project Asset: schema + API + injector + UI`

2. Update `PROJECT_STATE.md`:
   - Mark Phase 9C ✅ COMPLETE
   - Update FILE INVENTORY: add all new files created
   - Update CURRENT STATE: describe what M3.4 now does
   - Update ROADMAP: note M2.4 Finance Projects as next (Phase 9D)
   - Add integration notes: M3.1→M3.4 planned, M3.4→M2.4 wired, M3.4→M2.2 flag set

3. Prepend new rules to TOP of `RULES.md` (one line each, L-number = next after current highest):
   - Cross-project dependency pattern used in ProjectTasks
   - Auto-calculated milestone date from latest task due_date per phase
   - Phase auto-creation on project create (5 phases + 4 milestones)
   - Any Airtable schema decisions made during build

4. Commit: `docs: update PROJECT_STATE and RULES after phase9c`

List all files changed at end of response.

---

## COMMIT ORDER

```
feat(schema): Projects, ProjectPhases, ProjectMilestones, ProjectTasks, ProjectResources tables
feat(api): projects.js — CRUD + milestone auto-calc
feat(api): project-tasks.js — CRUD + phase completion trigger
feat(api): project-resources.js — CRUD
feat(m34): projects.injector.js — full panel, lane view, card view, drawer
feat(m34): entry drawer — 3-section form, save/push/AI buttons
feat(m34): lane view — week timeline, phase fills, milestone diamonds, heartbeat
feat(m34): cross-project connections — dependency lines, pulse animation
feat(m34): focus view — full project detail, task list, P&L summary
feat(m34): red clearance drawer — checklist, evidence, decision log
feat(m34): wire #panel-projects in index.html
docs: update PROJECT_STATE and RULES after phase9c
```

Branch: `feat/m34-project-asset`
Merge to `main` only after owner QA confirms all outcomes pass.
Debug session: owner works directly with Chat for any failures.
