# RULES-projects.md — Chaijohn OS
> Domain: M3.4 Project Assets (route: proj-assets) + M2.4 Finance Projects (route: projects)
> Load this file when: working on projects.injector.js, project-finance.injector.js, or any /api/project* endpoint
> Last updated: 2026-06-04

---

L129  Focus view event delegation: ALL click handlers (collapse, filter) must use ONE delegated
      listener on zone container — never bind directly to innerHTML elements.
      Direct binding is lost on every re-render. Delegation survives because zone element persists.
      Bound once via zone._focusBound flag. Status select uses change event delegation on same zone.
      _resCollapsed module var tracks resource section collapse state across renders.

L128  ai-chat.js: when body.stream === false, return buffered JSON { reply } (non-streaming).
      AI panel chat UI always uses streaming (no stream key in body).
      Project AI inquiry (runAiInquiry) must pass stream: false in body — never use SSE path for inquiry.

L119  AI "Generate tasks" prompt must request JSON array ONLY — no markdown, no explanation.
      Parse with try/catch. Strip ```json``` fences before parsing. On success show "Add N tasks"
      button that POSTs each task to /api/project-tasks. On parse fail fall back to pre-wrap text.

L118  M2.4 payback display: < 12 months → "N mo payback", >= 12 months → "N.N yr payback", null → "—".
      Apply to both per-card payback AND avg payback strip bubble. Never show raw years when < 1yr.

L117  Phase auto-exit dates: computePhaseExits(tasks) — latest finish_by per phase_code + 3 days.
      Client-side display only in phase pills. Never write auto_date back to Airtable from injector.

L116  M3.4 focus view tasks: table layout with grid 56px|1fr|80px|110px. Phase badge in col 1.
      Collapsible per-phase sections with _taskSectionCollapsed[projId+'_'+pc] state.
      Filter buttons (All/DS/PT/PD/PV/LA) above tasks — _taskFilter module var, default 'all'.

L115  M2.4 budget cards + presale record cards: max-width:220px, inline-flex, flex-wrap container.
      Multiple cards per row — same density as expense card layout. Width never full panel.

L095  Focus view task rows (F1): Each task row uses 4 columns — title (flex:1), date (90px right),
      assigned_to (70px center), status select (90px). The second line (assigned · date · measure)
      is removed. Measure is shown as a tooltip (title attribute) on the title div.

L094  Lane view phase segments: renderLane() renders 5 equal-width phase segments (DS/PT/PD/PV/LA)
      across the timeline band. Done phases show 44% opacity fill, current phase shows 87% fill,
      future phases show ~7% fill. A today dot (6px red circle) is overlaid at current position.
      This requires NO extra API calls — uses p.current_phase from list data.

L093  Inline presale form in M2.4: The expanded project card now has a "+ Add presale" button
      that reveals an inline form. On save: POST /api/transactions with source='presale',
      project_id, category_id from cached 'Pre-sale' category. After save, reload only the
      presale list for that project — do NOT full re-render unless presale total changes.
      Both loadPresaleCategory() and loadAll() must be called at init.

L090  Edit drawer pre-fetches /api/projects/:id before opening — pre-fills drawerResources and
      drawerTasks from res.resources and res.tasks. Never open edit drawer with empty state arrays.
      Field mapping: resource {id,item,time_needed,cost,status}, task {id,title,finish_by,assigned_to,measure,phase_code}.

L089  Phase auto-create: name field MUST be set to "{projectName} — {phaseName}" (e.g. "Ploikong — Design").
      Blank name leaves the primary field empty — Airtable shows "Unnamed record" everywhere the
      phase appears as a linked record. Always populate `name` in the createRecord call.

L084  sales_forecast_sent and finance_opened are checkbox fields — must exist in Airtable before PATCH.
      The [id].js PATCH handler must call ensureCheckboxFields() via Meta API on first use.
      If fields are missing, Airtable returns NOT_FOUND / UNKNOWN_FIELD_NAME — create then retry.

L062  Panel ID mapping (PERMANENT): M3.4 Project Assets = #panel-proj-assets (route: proj-assets). M2.4 Finance Projects = #panel-projects (route: projects). These are fixed — never swap them again.
L062b M3.4↔M2.4 propose/approve rule: M3.4 PROPOSES resources/costs → M2.4 APPROVES. Resources created in M3.4 appear as Planned budget cards in M2.4. Owner confirms in M2.4 (status→Purchased). M2.4 never receives surprise changes — they always come from M3.4 first.
L062c M2.4 boundary card: collapsed shows name, phase badge, P&L, funding bar, presale total, days to revenue. Expanded shows budget cards (from ProjectResources), presale cards (Transactions WHERE source=presale AND project_id=X), and actions (Send to Sales, View Project).
L062d Presale transaction pattern: source='presale' + project_id (singleLineText) in Transactions table. One record simultaneously feeds M2.1 (all Transactions), M2.2 presale_total on project lane, and M2.4 presale cards section. No new table needed.
L062e Entry drawer conditional field: when Income Source = Pre-sale category, show #presale-project-row with project select dropdown. Fetch /api/projects?type=Active once, cache in module scope. On save: body.source='presale', body.project_id=selectedProjectId. Hide row when switching to Expense.
L062f Pre-sale category (OWNER ACTION required): must exist in Airtable Categories table — name='Pre-sale', group='Bus-earn', type='Earn', active=true. Also requires project_id field (Single line text) added to Transactions table. CC cannot create these automatically — owner must do it once in Airtable UI or via /api/setup call.
L062g project-finance.injector.js filters: shows projects WHERE type='Active' OR finance_opened=true. Draft projects without finance_opened do NOT appear in M2.4 — they live in M3.4 only until owner clicks Push → Open Finance.

L054  Projects: schema-projects.js must be called once by owner (POST /api/setup/schema-projects) before the panel works — it creates 5 Airtable tables in two phases (tables first, linked-record fields second)
L054b Projects: when a project is created, auto-create 5 phases (DS/PT/PD/PV/LA), 4 exit milestones (FTS/PI/PL/PX), and seed tasks + resources for the detected type
L054c Projects: when a task status→Done, check if ALL tasks in the same phase are Done — if so, auto-set phase status=Complete and milestone status=Reached with auto_date=today
L054d Projects: depends_on_project_id is a linked-record field to Projects (cross-project dependency) — dependency_active=true blocks the dependent project; set to false when source project reaches 'Active'
L054e Projects: auto_date field on milestones is a formula-type field in Airtable — do not attempt to write it; it auto-calculates from phase completion. The API returns it read-only
L054f Projects: phase colors are fixed — DS=#3b82f6, PT=#8b5cf6, PD=#06b6d4, PV=#f59e0b, LA=#22c55e; do not invent new phases
L054g Projects: renderLaneView() uses a 12-week window from Monday of (today + weekOffset*7); phase bands are drawn as percentage spans across the lane; launch diamond marker is always shown
L054h Projects: openRedClearance(id) is the DEF CON equivalent for projects — shown when type=Active and health=critical; checklist must all be checked before "Mark resolved" unlocks
L054i Projects: AI inquiry (runAiInquiry) calls /api/ai-chat with a structured prompt; types: 'feasibility', 'tasks', 'extend' — extend takes duration_weeks param
L054j Projects: GET /api/projects returns enriched records with computed fields: total_tasks, delayed_tasks, pending_tasks, investment_total, days_to_launch — never compute these in the injector
