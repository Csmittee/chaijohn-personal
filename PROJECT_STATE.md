# PROJECT STATE — Chaijohn OS
> Last updated: 2026-06-04 — fix/pl-generator-p1f complete — direct mat/labor persistence (_scalarInputs), resizer wireResizer() pattern, cashflow chart side-by-side P&L, BS imbalance direction, label font bump, root CC_PROMPT cleanup. RULES L145

---

## IDENTITY

**Full name:** Chaijohn Personal Diary (CPD)
**What it is:** A private, AI-powered command center for one Thai entrepreneur in Rayong.
Replaces: paper diary, scattered project notes, Excel cashflow tracker, Obsidian, Google Photos receipts.

**Who it's for:** Owner only. Single user. PIN-protected.

**Live URL:** https://chaijohn-dashboard.pages.dev
**Repo:** https://github.com/Csmittee/chaijohn-personal (main branch)

**The Five Pillars (Vision):**
1. Finance Command Center — cashflow, debt, assets, decision support
2. Knowledge & Diary (Obsidian replacement) — entries, AI assist, blog push
3. Collection Asset Registry — knives, vices, plants, dolls (photo → value → legacy)
4. AI Strategy Advisor — auto-loads live snapshot, strategic questions, session history
5. Project Management Hub — full lifecycle from idea to launch ✅ M3.4 BUILT

---

## EARN ARCHITECTURE (critical — read before touching any earn-related code)

The owner has 4 income streams. All feed M2.1 Cashflow via M2.2 Sales aggregation:

```
1. Personal Asset Sales (M3.2)
   → Assets table WHERE status='Sold' → sold_price feeds M2.2 Personal section

2. Project Revenue (M2.4 → M2.2)
   → Projects WHERE sales_forecast_sent=true → appear in M2.2 Projects section
   → Pre-launch + SOP revenue while project has no dedicated business system
   → Once project matures and joins Business Dashboard → removed from M2.4, gains own lane in M2.2

3. Active Business Revenue (M2.2 Business section)
   → Read from Business Airtable (appMBjlfYyVd8I7ML) Sale_record + Products tables
   → Lanes auto-generated from Business ID table — new business = new lane, zero code change
   → Current active businesses: BUS01 I-Flex Pilates · BUS02 Daje Queencatcher · BUS04 Flow Lifestyle (Board Sports)
   → BUS03 Jade Coffee = project-level (not in Business Airtable sales yet)
   → BUS00 Janis Hammer = root/holding company
   → Each business has its own Operational Dashboard (separate repo, already built)
   → Personal dashboard is READ-ONLY consumer of that data

4. Borrow / Liability as Cashflow Bridge (M2.6)
   → Owner deliberately creates liability to fund cashflow gaps
   → Loan received = EARN transaction in cashflow
   → Repayment = EXPENSE transaction in cashflow
   → KNOWN LIMITATION: current system books full payment as expense; does not split interest vs principal
   → Future fix: Liability_Payments table extended with interest_portion + principal_portion fields
```

**Cashflow formula:**
```
TOTAL IN:  Sales (M2.2 all streams) + Borrow (M2.6)
TOTAL OUT: Expenses (M2.3) + Project funding (M2.4 + M3.4) + Debt repayment (M2.6)
NET:       Monitored by M2.1 Cashflow — DEF CON 5 fires if 90-day window goes negative
```

**3 cashflow actions owner can take:**
1. Expense control — tighten M2.3, DEF CON enforcement in M2.1
2. Create liability — M2.6 borrow as bridge
3. Accelerate project — push M3.4 faster to generate M2.4 income sooner

---

## IDEA-TO-REVENUE LIFECYCLE

```
Life (M5) ──► 10–20 year vision, personal history, relationships
    ↓
Mind Map (M4.2) ──► Obsidian-style node graph of entire personal system
    ↓ (digest / AI suggest)
Ideas (M3.1) ──► capture and refine
    ↓ (push to project)
Project Asset (M3.4) ──► pipeline through DS→PT→PD→PV→LA phases
    ↓ (goes Active → needs funding)
Finance Projects (M2.4) ──► investment tracking, pre-launch revenue home
    ↓ (reaches Launch → matures → joins operational system)
Active Business ──► own Operational Dashboard + Business Airtable
    ↓ (data flows back)
Sales (M2.2) ──► aggregated earn view feeding Cashflow
    ↓
Cash Flow (M2.1) ──► daily cockpit, DEF CON 5 guardian
```

---

## BUILD PHASES

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Full initial build — all 5 modules in one CC pass | ✅ COMPLETE |
| Phase 1–4 | LESSONS.md + Dashboard fixes 1–8 + Risk Simulator + Diary fixes 9–13 | ✅ COMPLETE |
| Fix A | Liabilities collapse form + Budgets inline edit | ✅ COMPLETE |
| Fix B | Liabilities expandable row + payment history + Budgets card/group view | ✅ COMPLETE |
| Fix C | Budget meter proportional scale + Utilities YoY charts + FT note + import script v2 | ✅ COMPLETE |
| Fix D | Dropzone text files · Diary AI undo · Forecast cashflow · Alert bubbles · Category create · One-time budget | ✅ COMPLETE |
| Fix E | Category hierarchy · Entity autocomplete · Liability cashflow direction · KV sync point · In-vs-out toggle · Period-aware budget meters · 4-panel layout | ✅ COMPLETE |
| Fix F | Category group 422 · Debts→Income tx · Transaction DELETE · Budget meter filter · Dashboard graph train + dynamic content zone | ✅ COMPLETE |
| Fix G | Transactions API budget_id · Budgets API category enrichment · Budget dropdown = Expense only · Dashboard resolveCatId | ✅ COMPLETE |
| Fix 9A | Sidebar Shell Part 1 — Chairit OS layout, hash routing, 15 route panels, auth overlay, theme toggle | ✅ COMPLETE |
| Fix 9B | Sidebar Shell Part 2 — M2 panel stat chips + charts + cards; entry drawer; dashboard mini charts; redirects; budget delete typed confirm | ✅ COMPLETE |
| Fix 9B2 | QA fixes: cashflow toggle+range+view; expenses chart order+period+responsive; liabilities chart swap; utility chart toggle+collapse | ✅ COMPLETE |
| Fix 9B3 | Card section bands, proportional card sizing, Bundle/Details toggle, bar chart single-month, FAB fixed, frosted glass drawer | ✅ COMPLETE |
| Fix 9E | Budget panel full redesign — 12-mo matrix, analysis collapsible, graph/data filter zones, edit mode batch save, pending bar, card view · Diary Memo type + badges + thumbnails · Ideas panel full redesign · Dashboard stat spans | ✅ COMPLETE |
| Fix 9E-R2 | Budget: custom start month picker, GAP actual (no debtMonthly, — for empty months), GAP cumulative row · Ideas: KPI strip, resizable list panel, Write/AI tab toggle, 3-dot pin | ✅ COMPLETE |
| Fix budget | Fix budget save (removed window.confirm), entry category dropdown retry, duplicate period check, input font 0.62rem | ✅ COMPLETE |
| Fix 9B4 | Cashflow card restoration + X-days due tool + cut cost simulation | ✅ COMPLETE |
| Collection gallery+sync | FAB centering · Cloudinary sync button · gallery hover arrows + counter on asset cards | ✅ COMPLETE |
| Fix collection-edit | Edit modal save/cancel/delete · image URL pre-fill · summary bar IDs · API cloudinary_gallery_urls | ✅ COMPLETE |
| Fix collection-cache | Cache-first rendering · no reload on edit/add/delete · listAllRecords pagination · KV 5-min cache for assets GET · gallery thumbnails in modal | ✅ COMPLETE |
| Fix 9B5 | Cashflow complete redesign: correct forecast engine (3 budget types, debt on due dates), DEF CON 5 firewall, simulation mode (on hold + intent + action plan), card view with DEBT/BUDGET/INCOME sections, X-days due tool, Other month navigation, entry drawer DEF CON enforcement | ✅ COMPLETE |
| Fix 9C | Full M3.4 Projects module (schema, 6 API endpoints, projects.injector.js, card/lane/focus views, drawers, AI inquiry, sales_forecast_sent bridge) | ✅ COMPLETE |
| Fix 9D | M2.2 Sales module: dynamic lanes from Business ID table, Business Airtable read, AR tracking, cashflow injection, project forecast lanes, personal asset sales | ✅ COMPLETE |
| Fix 9C-rewire | Rewire M3.4 → #panel-proj-assets, build M2.4 Finance Projects, presale bridge (Entry→Transactions→M2.4+M2.2+M2.1) | ✅ COMPLETE |
| Fix QA-blockers | ProjectPhases 403 guard, duplicate save isSubmitting, harvest-before-add rows, sales panel event listener, AI inquiry payload | ✅ COMPLETE |
| QA batch 3 | M3.4 buttons redesign (Edit/Open Finance/Send to Sales), Open Finance hash fix + PATCH finance_opened, sendToSales bug fix, defensive field creation via Meta API, M2.4 Confirm button color fix + hash fix, M2.2 Projects lane removes forecast (shows presale only), M2.2 Personal manual earn source fix (M2.2→Manual), M3.2 Collection sell creates source=collection transaction | ✅ COMPLETE |
| Hotfix M3.4 focus view | Fix /api/projects/:id ARRAYJOIN filter formula (returns names not IDs) — fetch project first then filter by name. Fix phase auto-create missing `name` field. Add POST /api/setup/repair-phase-names. Fix renderFocusView phaseId→phase_code lookup. Resources empty state. M2.4 budget cards unblocked as side-effect. | ✅ COMPLETE |
| P2 sale-origins + hard assets | M3.3 Hard Assets panel (cards/add/edit/sell modal), entry expense-only + Cash In tab, inline presale in M2.4, focus view full-width task rows, lane phase segments | ✅ COMPLETE |
| Fix batch7 | M2.2 asset dedup (Transactions only), summary strip presale+asset totals, Projects lane compact cards, list sub-headers, M2.1 cashflow list grouped sections, M2.4 compact budget+presale cards, RULES L110–L115 | ✅ COMPLETE |
| Fix batch8 | M3.4 focus view task table+filter+collapse, phase auto-exit dates, M2.4 payback months, AI generate tasks JSON+add button, 4.4 P&L Generator placeholder, RULES L116–L120 | ✅ COMPLETE |
| Fix batch9 | AI non-stream inquiry mode, focus view event delegation (no API call on collapse/filter), P&L nav moved to Tools, RULES L128–L129 | ✅ COMPLETE |
| feat/pl-generator | M4.4 P&L Generator: full build (UI, computePL engine, archive, PDF/ODS export, KV storage), RULES L121–L127 | ✅ COMPLETE |
| optim/kv-cache | KV cache on all heavy GETs (categories/budgets/liabilities/transactions/projects/sales), bust counter for tx, ~80% Airtable reduction, RULES L130–L132 | ✅ COMPLETE |
| hotfix/pl-nav | Add 'pl-gen' to ROUTES array in index.html — P&L Generator nav was falling back to dashboard because route was unrecognised | ✅ COMPLETE |
| fix/pl-generator-core | Full P&L Generator fix: rename route/panel to pl-generator, fix panelactivated listener, type=text inputs (no spinners), project selector auto-load KV, resetForm/loadProjectModel, resizer with getBoundingClientRect, RULES L133-L135 | ✅ COMPLETE |
| fix/budget-panel | Budget grid: Jan visibility, dedup actual save, per-month override priority, earn read-only, L149–L153 | ✅ COMPLETE |
| chore/doc-transformation | Rules system split: RULES.md universal only, .claude/rules/ domain files × 8, RULES-archive.md, L148 | ✅ COMPLETE |
| feat/datetime-bar | Global datetime display in top bar (datetime.injector.js), auto-timezone, updates every minute | ✅ COMPLETE |
| Fix 9F | M4.3 Time Management — DailyItems table, 4-pane board, flow strip, calendar, project task injection | ✅ COMPLETE |
| Fix 9G | M4.2 Mind Map — Obsidian-style node graph | ⬜ SCHEDULED |
| Fix 9H | M5 Life — personal timeline, relationships, 10–20yr vision | ⬜ SCHEDULED |
| Fix 9I | M4.1 AI Advisor upgrade — full system context, balance sheet awareness | ⬜ SCHEDULED |
| M1.1 | Dashboard balance sheet — Net Worth = Assets − Liabilities | ⬜ FUTURE |
| Pillar 3 | Collection full test + buyer tags + social share | ⬜ FUTURE |

---

## CURRENT STATE

**Working (confirmed):**
- PIN auth, sessions (KV)
- Schema: all 11 tables + seeded categories/liabilities/budgets
- Sidebar shell (9B): hash-routed panels, panelactivated lazy-init, entry drawer, Time Management placeholder
- M2 panels: Cashflow 9B5 (DEF CON 5, simulation, 3 budget types) · Expenses · Liabilities · Budget (12-mo matrix, GAP rows) ✅
- Dashboard overview: 4 stats + TODAY PRIORITY placeholder + 4 mini charts + stat spans ✅
- Entry drawer: all 4 tabs, context-aware, pin-able, frosted glass ✅
- Ideas panel: KPI strip, resizable list, Write/AI tab toggle, 3-dot pin-to-top ✅
- Drop Zone: image/PDF + text/markdown support, AI extract, Approve → Airtable ✅
- Collection panel: FAB centered, Sync button, gallery hover arrows, edit modal, KV cache ✅
- AI panel: embedded in shell ✅
- Diary (diary.html): list + editor + preview + AI modal + Memo type ✅
- M3.4 Projects: card/lane/focus views, tasks/resources in focus view, button set (Edit + Open Finance + Send to Sales/✓ In Sales), Open Finance PATCHes finance_opened + navigates to M2.4, Send to Sales works with defensive field creation ✅
- M2.4 Finance Projects: project cards with CAPEX bar + presale total, expanded Budget Cards (resources) + Presale Records, Confirm button visible, View Project hash correct ✅
- M2.2 Sales: Projects lane shows pipeline tracker only (presale total + launch date, no forecast revenue), Personal manual earn entries from Entry drawer (source=Manual), Personal Asset Sales from Transactions only (no duplicates) ✅
- M2.2 Sales: Summary strip shows Presale Total + Asset Sales bubbles ✅
- M2.2 Sales: Projects lane card view compact flex-wrap cards (max-width:220px) ✅
- M2.1 Cashflow: list view groups by INCOME / EXPENSES / PROJECT FUNDING with collapsible headers ✅
- M2.4 Finance Projects: budget cards + presale record cards compact inline-flex (multiple per row) ✅
- M3.2 Collection: Sell creates Transaction with source=collection + category_id for M2.2 routing ✅

**Next: CC_PROMPT_feat-sale-origins-and-hard-assets (P2 — new builds)**
- Schema: all 11 tables + seeded categories/liabilities/budgets
- Sidebar shell (9B): hash-routed panels, panelactivated lazy-init, entry drawer, Time Management placeholder
- M2 panels: Cashflow 9B5 (DEF CON 5, simulation, 3 budget types) · Expenses · Liabilities · Budget (12-mo matrix, GAP rows) ✅
- Dashboard overview: 4 stats + TODAY PRIORITY placeholder + 4 mini charts + stat spans ✅
- Entry drawer: all 4 tabs, context-aware, pin-able, frosted glass ✅
- Ideas panel: KPI strip, resizable list, Write/AI tab toggle, 3-dot pin-to-top ✅
- Drop Zone: image/PDF + text/markdown support, AI extract, Approve → Airtable ✅
- Collection panel: FAB centered, Sync button, gallery hover arrows, edit modal, KV cache ✅
- AI panel: embedded in shell ✅
- Diary (diary.html): list + editor + preview + AI modal + Memo type ✅
- Sales panel (M2.2): dynamic lanes, AR tracking, cashflow injection, stacked bar chart + pareto, project forecast lanes, asset sales ✅
- Finance Projects (M2.4): boundary cards, budget cards (Planned/Purchased/In use), presale cards, Send to Sales action ✅
- Save project: isSubmitting guard (no duplicates), 409 name dedup, secondary auto-creates resilient to missing tables ✅
- Sales panel (M2.2): panelactivated listener fixed — was listening on document with wrong event shape ✅
- AI inquiry in Projects drawer: messages payload fixed ✅
- Add resource/task rows: harvest-before-add (existing values preserved) ✅
- Project Assets (M3.4): now correctly at #panel-proj-assets (route: proj-assets) ✅
- Presale bridge: Entry → EARN → Pre-sale → project dropdown → source='presale' + project_id in Transactions ✅

**Working after today's QA fixes:**
- M3.4 Project Assets: panel renders, save guard working, row harvest working ✅
- M2.2 Sales: panel renders, Business Airtable connecting, bus_id mapping fixed ✅
- M2.4 Finance Projects: panel renders, correct empty state ✅
- M3.4 Project Assets: panel unblocked (panel bleeding fixed) ✅
- Sales filter buttons: text visible on active state (var(--yellow) + #0a0a10) ✅
- Sales trend + pareto charts: both 220px, balanced layout (3fr 2fr) ✅
- ProjectPhases: table created in Airtable ✅
- AI inquiry: messages array fixed ✅

**Working after batch2 QA fixes:**
- M2.4 Finance Projects: boundary cards showing (records shape fix — was spreading r.fields on pre-flattened data) ✅
- M3.4 Project Assets: phase bands + milestone diamond already implemented; var(--accent) → var(--yellow) on all buttons ✅
- M2.2 Sales: Personal section always visible, Projects section always visible with empty state ✅

**Still being fixed:**
- None known

**Owner actions completed:**
- AIRTABLE_BUSINESS_BASE_ID set in Cloudflare ✅
- Business ID Status fields set to Active ✅
- ProjectPhases table created via schema endpoint ✅
- Duplicate Ploikong records deleted ✅

**Remaining owner actions:**
- Add project_id (Single line text) field to Transactions table in Airtable
- Create Pre-sale category: name=Pre-sale, group=Bus-earn, type=Earn, active=true

**Pending phases:**
---

## CONFIRMED WORKING — DO NOT BREAK

Every CC session must preserve:
- PIN auth flow — index.html → verify → session cookie → dashboard
- KV session handling — HttpOnly cookie, 7-day expiry
- All 11 Airtable table structures — never rename fields CC didn't create
- Dashboard T1/T2/T3 charts + Risk Simulator
- Drop Zone panel (fixed bottom-right, all pages)
- Transaction create + read + inline edit
- Blog push logic: publish_to_web=true + entry_type=Blog → business base Blogs table
- One dedicated injector JS per page — no shared mega-bundle
- No React, no Tailwind — pure CSS variables + vanilla JS only
- DEF CON 5 cashflow firewall — never bypass or stub

---

## FILE INVENTORY

```
/                                         ← repo root (keep clean)
├── CLAUDE.md                             ✅ index + stack + 5 rules + domain rule map
├── RULES.md                              ✅ universal rules only (~20 rules, newest first)
├── RULES-archive.md                      ✅ archived L001–L059b (pre-9C, read-only)
├── PROJECT_STATE.md                      ✅ this file — phases + roadmap + inventory
├── WORKFLOW_SKILL.md                     ✅ operating model reference
├── README.md                             ✅
├── wrangler.toml                         ✅
├── package.json                          ✅
└── .claude/
    └── rules/
        ├── RULES-workflow.md             ✅ CC workflow discipline rules
        ├── RULES-dom.md                  ✅ panel init, route guard, input type rules
        ├── RULES-data.md                 ✅ transaction model, API shapes, Airtable patterns
        ├── RULES-cashflow.md             ✅ M2.1 specific rules
        ├── RULES-sales.md                ✅ M2.2, sales, presale, business base rules
        ├── RULES-projects.md             ✅ M3.4, M2.4, project lifecycle rules
        ├── RULES-budget.md               ✅ M2.5 budget matrix and meter rules
        └── RULES-plgen.md                ✅ M4.4 P&L Generator rules (L120–L145)
├── docs/
│   ├── archive/
│   │   ├── masterseed_archived_2026-05-28.md     ✅ archived
│   │   └── lessons_learned_archived_2026-05-28.md ✅ archived
│   ├── LESSONS.md                        ✅ legacy, superseded
│   ├── DECISIONS.md                      ✅
│   ├── PROGRESS.md                       ✅
│   └── prompts/                          ✅ all completed CC prompts archived here
└── public/
    ├── index.html                        ✅ single-page shell (sidebar + panels + entry drawer)
    ├── dashboard.html                    ✅ redirect to /#dashboard
    ├── entry.html                        ✅ redirect to /
    ├── diary.html                        ✅ working
    ├── collection.html                   ⬜ built, not tested
    └── assets/
        ├── css/global.css                ✅
        └── js/
            ├── auth.js                   ✅
            ├── dropzone.js               ✅
            ├── cashflow.injector.js      ✅ 9B5 — forecast engine + DEF CON 5 + simulation
            ├── expenses.injector.js      ✅
            ├── liabilities-panel.injector.js ✅
            ├── budget-panel.injector.js  ✅ 9E-R2 — 12-mo matrix, GAP rows, edit mode
            ├── datetime.injector.js      ✅ — top bar clock, auto-timezone, 1-min tick
            ├── ideas-panel.injector.js   ✅ 9E-R2 — KPI strip, resizable list, Write/AI toggle
            ├── projects.injector.js      ✅ 9C — M3.4 Project Assets (#panel-proj-assets, route: proj-assets)
            ├── project-finance.injector.js ✅ 9C-rewire — M2.4 Finance Projects (#panel-projects, route: projects)
            ├── sales.injector.js         ✅ 9D — dynamic lanes, AR tracking, cashflow injection, stacked chart + pareto
            ├── dash-overview.injector.js ✅
            ├── hard-assets.injector.js   ✅ P2 — M3.3 Hard Assets (#panel-hard-assets, route: hard-assets)
            ├── entry.injector.js         ✅ P2 — expense-only mode, Cash In tab (source=cash_in)
            ├── diary.injector.js         ✅
            ├── collection.injector.js    ✅
            ├── ai.injector.js            ✅
            ├── pl-generator.injector.js  ✅ M4.4 — P&L Generator (standalone, CHAIJOHN_KV, computePL engine)
            ├── timemanagement.injector.js ✅ M4.3 — Time Management (DailyItems, flow strip, calendar, 4 panes)
            └── dashboard.injector.js     ✅ retired from shell, kept for reference
functions/
├── _middleware.js                        ✅
├── _airtable.js                          ✅ ALL shared Airtable helpers
└── api/
    ├── auth.js + auth/check.js           ✅
    ├── transactions.js                   ✅
    ├── categories.js                     ✅
    ├── liabilities.js                    ✅
    ├── liabilities/[id].js               ✅
    ├── cashflow-sync.js                  ✅
    ├── active-strategy.js               ✅ 9B5 DEF CON 5
    ├── budgets.js + budgets/[id].js      ✅
    ├── assets.js                         ✅
    ├── diary.js                          ✅
    ├── utilities.js                      ✅
    ├── quotes.js                         ✅
    ├── debts.js                          ✅
    ├── dropzone.js                       ✅
    ├── upload-image.js                   ✅
    ├── ai-chat.js                        ✅
    ├── setup/schema.js                   ✅ two-phase: tables + seed
    ├── setup/schema-projects.js          ✅ 9C — creates 5 project tables (call once)
    ├── projects.js                       ✅ 9C — GET list (enriched) + POST (with auto phases/milestones/tasks/resources)
    ├── projects/[id].js                  ✅ 9C — GET detail + PATCH + DELETE (soft)
    ├── project-tasks.js                  ✅ 9C — GET (by project or due_today) + POST
    ├── project-tasks/[id].js             ✅ 9C — PATCH (auto-complete phase + milestone) + DELETE
    ├── project-resources.js              ✅ 9C — GET + POST
    ├── project-resources/[id].js        ✅ 9C — PATCH + DELETE
    ├── sales.js                          ✅ 9D — GET unified aggregator (biz+projects+personal) + POST manual entry
    ├── hard-assets.js                    ✅ P2 — GET list + POST create (HardAssets table)
    ├── hard-assets/[id].js               ✅ P2 — GET detail + PATCH + DELETE (soft → status=Disposed)
    ├── pl-generator.js                   ✅ M4.4 — GET list (KV prefix pl-generator:) + POST save
    ├── pl-generator/[id].js              ✅ M4.4 — GET single version + DELETE
    ├── daily-items.js                    ✅ M4.3 — GET list + POST create (DailyItems table)
    ├── daily-items/[id].js               ✅ M4.3 — PATCH (done action, BuyPay booking, project task sync) + DELETE
    └── setup/daily-items-schema.js       ✅ M4.3 — GET creates DailyItems table via Airtable Meta API (call once)
```

---

## AIRTABLE TABLES

### chaijohn-core base (`apphBGWfSPL45oSFd`)

| Table | Key Fields |
|---|---|
| Categories | name, group, type (Earn/Expense/Loan/Investment), fixed_variable (Bus-earn/Per-earn/etc), expense_type, is_business, cash_flow, active |
| Transactions | date, type, amount, budget_id→Budgets, category_id→Categories (legacy), entity, description, note, source (Manual/LiabilityPayment/M2.2/presale), project_id (singleLineText, for presale), fixed_variable, period |
| Liabilities | name, creditor_type, loan_size, interest_rate, monthly_payment, current_balance, active |
| Liability_Payments | liability_id→Liabilities, date, amount, note |
| Assets | name, category, cost_price, estimated_value, status, velocity, date_acquired, sold_price, sold_date, cloudinary_image_url, notes |
| Diary | date, title, content, entry_type (Story/Idea/Blog/Project/Skill), tags, publish_to_web, connected_concept, cloudinary_image_url |
| AI_Chats | session_id, messages_json, topic, created_at, summary |
| Utilities | month, electricity_units, electricity_charge, water_units, water_charge, notes |
| Quotes | text, author, source, date_added, mood_tag, active, cloudinary_image_url |
| Drop_Zone_Queue | cloudinary_url, filename, mime_type, status, ai_result, suggested_type |
| Budgets | label, category_id→Categories, amount, period, start_date, end_date, active, backlog_type (carry/forgive), period_due_day |
| Projects | name, type (Active/Draft/Pause), stage, phase_code (DS/PT/PD/PV/LA), start_date, launch_date, investment_budget, sales_forecast_sent, finance_opened, assigned_to, description, notes |
| ProjectPhases | name, project_id→Projects, phase_code, order, status, completed_at |
| ProjectMilestones | name, project_id→Projects, phase_id→ProjectPhases, target_date, status, auto_date |
| ProjectTasks | title, project_id→Projects, phase_id→ProjectPhases, phase_code, assigned_to, finish_by, measure, status, priority, notes, depends_on_project_id→Projects, dependency_active |
| ProjectResources | item, project_id→Projects, time_needed, cost, status |
| HardAssets | name, category (Property/Vehicle/Equipment/Other), purchase_date, purchase_price, current_value, location, notes, status (Active/Sold/Disposed), sold_price, sold_date, image_url |
| DailyItems | title, pane (Do/Follow/BuyPay/Schedule), amount, force, high_impact, done, done_at, date, budget_id, schedule_time, schedule_type (Routine/General), source (manual/project), project_task_id, project_id, project_name, booked |

**Category groups (seeded):**
Loan / Family / Basic Living / Car / Service / Personal / Basic IT / Bus IT / Business / Per-earn / Bus-earn / Investment

**Bus-earn category rules:**
- Only active running businesses appear here (I-Flex, Daje, Flow)
- Projects pushed to 2.4 (sales_forecast_sent=true) appear DYNAMICALLY — fetched from Projects table, NOT seeded as categories
- Do NOT seed Ploikong, Satu, Old stocks sale, Stock earn — these were legacy errors

### Business base (`appMBjlfYyVd8I7ML`) — Janis Business DB

**THIS IS THE FULL BUSINESS OPERATIONS DATABASE — not just for blog.**
Personal dashboard reads from this base but NEVER writes (read-only consumer).
The Operational Dashboard (separate repo: Csmittee/chaijohn-central or similar) owns all writes.

| Table | Role in personal dashboard |
|---|---|
| Business ID | Registry of all businesses — CC reads this to generate Sales lanes dynamically |
| Products | Product catalog per business — used for sale card display and pareto |
| Sale_record | All invoices with payment stages — primary data for M2.2 Sales panel |
| Product_cost | Cost data — not used in personal dashboard yet |
| Blogs | Blog push target — Diary with publish_to_web=true writes here |
| Posts | Marketing content — not used in personal dashboard |
| Contact Messages | Customer inquiries — not used in personal dashboard |
| Case study leads | Sales leads — not used in personal dashboard |
| customer | Customer registry — used for AR display in M2.2 |
| quote | Quotes/proposals — used for Open Quotes bubble in M2.2 |

**Confirmed field names verified 2026-06-02:**
- Business ID table: primary='Business ID', Status='Active'/'Inactive'
- Sale record table: date='Sale date', table name has space not underscore
- See RULES.md L075-L076 for full verified field lists

**Business IDs confirmed:**
- BUS00 — Janis Hammer (Root/holding)
- BUS01 — I-Flex Pilates (Pilates Machines)
- BUS02 — Daje Queencatcher (Vending Machines / Claw)
- BUS03 — Jade Coffee (Coffee Capsules) — Status: Active in registry but project-level revenue; no sale records yet
- BUS04 — Flow Lifestyle (Board Sports — skateboards, surfskates)

---

## ROADMAP

**Now (QA):**
- P2 complete — M3.3 Hard Assets, sale origins (Cash In, hard_asset_sale, inline presale), entry expense-only, focus view task row improvements, lane phase segments

**Owner actions needed after P2:**
- Create HardAssets table in Airtable (apphBGWfSPL45oSFd) with fields: name, category, purchase_date, purchase_price, current_value, location, notes, status, sold_price, sold_date, image_url
- The 'Hard asset sale' category (Per-earn, Earn) and 'Pre-sale' category (Bus-earn, Earn) will be auto-created by the injectors at first panel activation

**Next:**
1. Fix 9F — M4.3 Time Management (today view from project tasks)
2. Fix 9G — M4.2 Mind Map (Obsidian-style node graph)
3. Fix 9H — M5 Life (personal timeline, vision goals)
4. Fix 9I — M4.1 AI Advisor upgrade (full system context)

**Long term:**
8. M1.1 Dashboard — balance sheet (Net Worth = Assets − Liabilities), requires liability interest/principal split
9. Collection full test + buyer tags + social share
10. AI Advisor permanent memory + diary-as-context

---

## CRITICAL RULES

(All in CLAUDE.md rules 1–5 + RULES.md L001–L060j. No additional rules beyond those.)

**Environment vars (Cloudflare Pages dashboard):**
- AIRTABLE_API_KEY (secret) · CLOUDINARY_API_KEY/SECRET (secrets) · ANTHROPIC_API_KEY (secret)
- AIRTABLE_BASE_ID = apphBGWfSPL45oSFd (chaijohn-core)
- AIRTABLE_BUSINESS_BASE_ID = appMBjlfYyVd8I7ML (Janis Business DB — read-only from personal dashboard)
- CHAIJOHN_KV binding id: 7e2dcb214e17435c9ec808cb6e3b7e74

**Deployment reminder:** Cloudflare Pages auto-deploys from main. Never merge broken code to main.
