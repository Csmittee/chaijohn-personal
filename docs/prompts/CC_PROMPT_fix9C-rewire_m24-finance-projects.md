# CC_PROMPT_fix9C-rewire_m24-finance-projects.md
> ✅ COMPLETE — 2026-06-01 — M2.4 Finance Projects + M3.4 rewire + presale bridge
> Fix M3.4 panel location + Build M2.4 Finance Projects + Presale bridge
> All finance-to-operation connections completed in one session

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
- CLAUDE.md
- RULES.md
- PROJECT_STATE.md
- WORKFLOW_SKILL.md

Then read and execute this prompt.

Note: PROJECT_STATE.md has been updated with the full earn architecture
and lifecycle diagram. Read the EARN ARCHITECTURE and IDEA-TO-REVENUE
LIFECYCLE sections carefully before starting — they define how M3.4,
M2.4, M2.2, and M2.1 connect.
```

---

## CRITICAL PRE-READ (fresh from repo before touching anything)

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/index.html` — find ALL panel divs, especially:
   - `#panel-projects` — currently has M3.4 operational content (WRONG)
   - `#panel-project-assets` — currently shows "coming soon" (WRONG)
   - Confirm exact IDs before writing anything
3. `public/assets/js/projects.injector.js` — read fully, understand what was built
4. `functions/api/projects.js` — read fully, note all fields returned
5. `functions/api/project-tasks.js` — read fully
6. `functions/api/project-resources.js` — read fully
7. `functions/api/transactions.js` — read schema, understand source field
8. `functions/api/categories.js` — understand how categories are seeded
9. `public/assets/js/entry.injector.js` — understand Income Source dropdown binding
10. `public/assets/js/sales.injector.js` — understand how Projects lane is fetched

Do NOT write any code until you have read all 10 files.

---

## OBJECTIVE

Three connected fixes in one session:

**Part 1** — Rewire M3.4 to correct sidebar location
**Part 2** — Build M2.4 Finance Projects panel from scratch
**Part 3** — Presale bridge: Entry → Transactions → M2.4 + M2.2 + M2.1

These are not independent. They must be built in order.
Branch: `fix/m24-finance-projects`

---

## PART 1 — REWIRE M3.4 TO CORRECT LOCATION

### The problem
`projects.injector.js` currently targets `#panel-projects` (Finance → Projects).
It should target `#panel-project-assets` (Assets → Project Assets).
`#panel-projects` should become M2.4 Finance Projects.

### What to do

**Step 1 — Read index.html first.** Find the exact panel div IDs.
Confirm: does `#panel-project-assets` exist? Does `#panel-projects` exist?
If IDs differ from above — use what is actually there, do not assume.

**Step 2 — In `projects.injector.js`:**
Change the panel target from `#panel-projects` to `#panel-project-assets`.
Also update the `panelactivated` event listener to match the new panel ID.
No other changes to this file.

**Step 3 — In `index.html`:**
The `#panel-projects` div content (M3.4 HTML if any is hardcoded) stays empty
— M2.4 injector will populate it.
Ensure `<script src="/assets/js/projects.injector.js" defer></script>` is present.
Add `<script src="/assets/js/project-finance.injector.js" defer></script>` alongside it.

**Step 4 — Verify:**
After this change, navigating to `#project-assets` should show the full M3.4 panel.
Navigating to `#projects` should show empty (M2.4 not built yet — that's Part 2).

---

## PART 2 — BUILD M2.4 FINANCE PROJECTS

### Philosophy (read before building)

M3.4 PROPOSES → M2.4 APPROVES.

When owner fills resource/cost in M3.4 entry form, that auto-generates
DRAFT budget cards in M2.4. Owner confirms and activates them in M2.4.
M2.4 is the financial controller — it owns the money.
M3.4 proposes. M2.4 approves.
Any deviation (scope change, new cost, dropped item) must be initiated
from M3.4, which then flags M2.4 to update.
M2.4 never gets a surprise change it didn't see coming from the asset side.

### New file: `public/assets/js/project-finance.injector.js`

Targets `#panel-projects`. Lazy-init via `panelactivated` event (L045).

#### State
```javascript
let allProjects = [];          // projects with finance_opened = true OR type = Active
let expandedProjectId = null;  // which boundary card is expanded
```

#### Data fetch on load
```javascript
// Fetch 1: all projects (reuse /api/projects)
// Fetch 2: presale transactions (new query — see Part 3)
// Both via Promise.allSettled — never block on one
GET /api/projects
GET /api/transactions?source=presale
```

#### Panel anatomy

```
┌─────────────────────────────────────────────┐
│ SUMMARY STRIP (4 bubbles — sticky)          │
│ Projects in pipeline · Total CAPEX          │
│ Expected monthly revenue · Avg payback      │
├─────────────────────────────────────────────┤
│ BODY (scrollable)                           │
│                                             │
│ ▼ [Project name]    [phase badge]  [▼ expand]│  ← boundary card collapsed
│   P&L: ฿XX,XXX/mo · X.X yr payback         │
│   Funding: ████████░░ ฿XX,XXX / ฿XX,XXX    │
│   Presale confirmed: ฿XX,XXX                │
│   Days to first revenue: N days             │
│                                             │
│   EXPANDED:                                 │
│   ┌─ BUDGET CARDS ──────────────────────┐  │
│   │ [Draft budget cards from resources] │  │
│   │ Each card: item · cost · [Confirm]  │  │
│   └─────────────────────────────────────┘  │
│   ┌─ PRESALE CARDS ─────────────────────┐  │
│   │ [presale transaction cards]         │  │
│   │ Each: date · amount · customer      │  │
│   └─────────────────────────────────────┘  │
│   ┌─ ACTIONS ───────────────────────────┐  │
│   │ [Send to Sales ↑] [→ View Project]  │  │
│   └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

#### Which projects appear

Show ALL projects WHERE:
- `type = 'Active'` OR
- `finance_opened = true`

Draft/Pipeline projects with `finance_opened = false` do NOT appear here.
They appear in M3.4 only until owner clicks Push → Open Finance.

Sort: Active first, then by investment_total descending.

#### Collapsed boundary card fields

Per project, read from `/api/projects` response:

```javascript
{
  name: project.name,
  phase: project.current_phase,           // DS/PT/PD/PV/LA badge
  target_revenue_monthly: project.target_revenue_monthly,
  investment_total: project.investment_total,  // sum of ProjectResources
  sga_pct: project.sga_pct || 10,
  net_monthly: target_revenue_monthly * (1 - sga_pct/100),
  payback_years: investment_total / (net_monthly * 12),
  presale_total: sum of transactions WHERE source='presale' AND project_id=X,
  days_to_revenue: project.days_to_launch  // from existing API calc
}
```

Funding bar:
```
spent = sum of ProjectResources WHERE status = 'Purchased' OR 'In use'
required = investment_total (sum of ALL resources)
bar fill % = spent / required
```

#### Expanded view — Budget cards

Read from `ProjectResources` for this project.
Each resource = one budget card:

```
┌──────────────────────────────────────────┐
│ [item name]              [status badge]  │
│ Time needed: [time_needed]               │
│ Cost: ฿XX,XXX                            │
│ [Confirm →] button (if status=Planned)   │
│             changes status to Purchased  │
└──────────────────────────────────────────┘
```

Status badge colors:
- Planned = gray (draft — from M3.4, not yet approved)
- Purchased = amber (confirmed by M2.4)
- In use = green (active)

Confirm button → PATCH `/api/project-resources/:id` with `{ status: 'Purchased' }`
After confirm: re-render this card, update funding bar.

#### Expanded view — Presale cards

Read from Transactions WHERE `source='presale'` AND `project_id = X`:

```
┌──────────────────────────────────────────┐
│ [date]                    +฿XX,XXX       │
│ [entity / customer name]                 │
│ [description]                            │
│ [category badge: Pre-sale]               │
└──────────────────────────────────────────┘
```

Empty state: "No presales yet — use Entry → EARN → Pre-sale to record one"

#### Expanded view — Actions

**[Send to Sales ↑]** button:
- Enabled ONLY when `target_revenue_monthly > 0`
- Disabled with tooltip "Set target revenue in Project Assets first" if = 0
- When clicked: PATCH `/api/projects/:id` with `{ sales_forecast_sent: true }`
- After save: button becomes "Sales Active ✓" badge (not clickable again)
- This makes the project appear as a lane in M2.2 Sales → Projects section

**[→ View Project]** button:
- Navigates to `#project-assets` (M3.4 panel)
- Passes project context: `window.location.hash = '#project-assets'`
- If M3.4 injector supports pre-selection by project_id: pass it
  Check projects.injector.js — if it accepts a selectedProjectId on load, use it

#### Summary strip calculations

```javascript
pipeline_count: allProjects.length
total_capex: sum of investment_total across all projects
total_revenue_monthly: sum of target_revenue_monthly across Active projects only
avg_payback: average of payback_years where net_monthly > 0
```

---

## PART 3 — PRESALE BRIDGE

### Philosophy

A presale is a real cash transaction that happens before the business
officially launches. It uses the existing Entry drawer EARN flow.
It creates ONE record (Transaction) that simultaneously:
1. Appears in M2.1 Cashflow as income (already works — it's a Transaction)
2. Appears in M2.2 Sales → Projects lane (sales.injector reads project lanes)
3. Appears in M2.4 as a presale card for that project

No new table. No new API file. Three small additions to existing files.

### Addition 1 — Transactions table: new field

In `functions/api/transactions.js` POST handler:
Accept a new optional field: `project_id` (string — Airtable record ID of the project)
Store it in the Transactions Airtable record.

In GET handler:
- Support new query param: `?source=presale` — filters transactions WHERE source=presale
- Support new query param: `?project_id=X` — filters by project_id
- Include `project_id` in the returned record shape

Check if `project_id` field already exists in the Transactions Airtable table.
If not: add it via Airtable Meta API before the first POST that uses it.
Field type: Single line text (stores Airtable record ID as string).

### Addition 2 — Categories: seed Pre-sale category

In `functions/api/setup/schema.js` or wherever categories are seeded:
Check if a category named 'Pre-sale' exists in the Bus-earn group.
If not: create it:
```javascript
{
  name: 'Pre-sale',
  group: 'Bus-earn',
  type: 'Earn',
  fixed_variable: 'Bus-earn',
  active: true
}
```

If the seeding file is not the right place (categories already exist in Airtable):
Create it directly via POST `/api/categories` at the end of this session.
Log in commit message: "Pre-sale category created in Airtable — do not re-seed"

### Addition 3 — Entry drawer: project dropdown when Pre-sale selected

In `public/assets/js/entry.injector.js`:

When Income Source dropdown changes to 'Pre-sale':
Show an additional field below the Income Source row:

```html
<div id="presale-project-row" style="display:none">
  <label>Link to project</label>
  <select id="presale-project-select">
    <option value="">— Select project —</option>
    <!-- populated from /api/projects, Active only -->
  </select>
</div>
```

On Income Source change:
```javascript
sourceSelect.addEventListener('change', () => {
  const isPresale = sourceSelect.value === 'Pre-sale';  
  // match exact category name
  presaleRow.style.display = isPresale ? 'block' : 'none';
  if (isPresale && projectOptions.length === 0) {
    fetchActiveProjects(); // fetch once, cache in module scope
  }
});
```

On Save Transaction:
If source = Pre-sale AND project selected:
Include `project_id` in the POST body to `/api/transactions`.

If source = Pre-sale AND no project selected:
Allow save but without project_id (some presales may be general).
Do not block save.

### How M2.2 Sales picks up presales

`sales.injector.js` already fetches Projects WHERE `sales_forecast_sent = true`
for the Projects lane. After this fix, the Projects lane card for each project
should ALSO show presale total:

In `functions/api/sales.js` GET handler:
For each project in the projects array, add:
```javascript
presale_total: // sum of Transactions WHERE source='presale' AND project_id=X
```

This requires one additional Airtable query per project in the sales API.
Use Promise.all to fetch in parallel — do not fetch sequentially.

The sales.injector.js project lane card then displays:
```
[Project name]  [phase badge]  [heartbeat]
Presale: ฿XX,XXX confirmed
Expected: ฿XX,XXX/mo · Launch in N days
Phase progress bar (5 segments)
[Go to Finance ↗]  [Go to Project ↗]
```

---

## CONSTRAINTS

- Do NOT change cashflow.injector.js — presales appear automatically as Transactions
- Do NOT change liabilities files
- Do NOT create new Airtable tables — all data fits in existing schema
- Do NOT change the projects.injector.js business logic — only change the panel target ID
- Complete replacement files only — never patches (L011)
- Read before write — all 10 files listed above (L010)
- No React, no Tailwind — CSS variables + vanilla JS only
- All amounts: Thai Baht (฿) with toLocaleString()
- All dates: "D MMM YYYY" format

---

## FILES TO CREATE/MODIFY

**New files:**
- `public/assets/js/project-finance.injector.js` — M2.4 panel (new)

**Modified files:**
- `public/assets/js/projects.injector.js` — change panel target ID only
- `public/index.html` — add project-finance.injector.js script tag
- `functions/api/transactions.js` — add project_id field support + presale filter
- `functions/api/sales.js` — add presale_total to projects array
- `public/assets/js/entry.injector.js` — add presale project dropdown
- `functions/api/setup/schema.js` OR direct category create — Pre-sale category

---

## AFTER ALL PARTS — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — M2.4 Finance Projects + M3.4 rewire + presale bridge`

2. Update `PROJECT_STATE.md`:
   - Mark Fix 9C-rewire ✅ COMPLETE
   - Mark Fix M2.4 ✅ COMPLETE
   - Add `project-finance.injector.js` to FILE INVENTORY
   - Update CURRENT STATE
   - Update ROADMAP: next = Fix 9E-hard (Hard Assets)
   - Add presale bridge to integration notes

3. Append to `RULES.md` (L061+):
   - Presale transaction pattern: source='presale' + project_id field
   - M2.4 boundary card pattern
   - M3.4↔M2.4 propose/approve rule (document as architectural rule)
   - Entry drawer conditional field show/hide pattern

4. Commit docs: `docs: update PROJECT_STATE and RULES after m24 + presale bridge`

---

## COMMIT ORDER

```
fix(m34): rewire projects.injector.js to #panel-project-assets
feat(m24): project-finance.injector.js — boundary cards, budget cards, presale cards
feat(m24): wire #panel-projects in index.html
feat(presale): transactions.js — add project_id field + presale filter
feat(presale): sales.js — add presale_total to projects lane
feat(presale): entry.injector.js — project dropdown on Pre-sale income source
feat(presale): seed Pre-sale category in Bus-earn group
docs: update PROJECT_STATE and RULES after m24 + presale bridge
```

Branch: `fix/m24-finance-projects`
Merge to main after owner QA confirms:
- [ ] Assets → Project Assets shows full M3.4 panel (lanes, tasks, heartbeat)
- [ ] Finance → Projects shows M2.4 boundary cards
- [ ] Each boundary card shows correct P&L, funding bar, presale total
- [ ] Budget cards from M3.4 resources appear in M2.4 expanded view
- [ ] Confirm button on budget card changes status to Purchased
- [ ] Send to Sales button sets sales_forecast_sent = true
- [ ] After Send to Sales → M2.2 Sales panel shows project in Projects lane
- [ ] Entry drawer → EARN → Pre-sale → project dropdown appears
- [ ] Save presale transaction → appears in M2.4 presale cards
- [ ] Save presale transaction → appears in M2.1 Cashflow as income
- [ ] Save presale transaction → appears in M2.2 Sales Projects lane
