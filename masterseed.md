# 🌱 MASTERSEED — Chaijohn Personal Diary (CPD)
> Last Updated: 2026-05-27 — Fix 9E-R2 complete; budget custom start month + GAP actual/cumulative fix; ideas panel full redesign (KPI strip full-width, resizable list, Write/AI toggle, 3-dot pin)

---

## PROJECT IDENTITY

**Full name:** Chaijohn Personal Diary (CPD)
**What it is:** A private, AI-powered command center for one Thai entrepreneur in Rayong.
Not just a dashboard — it is a complete personal operating system replacing: paper diary, scattered project notes, Excel cashflow tracker, Obsidian, Google Photos receipts, and every fragmented tool that buries ideas.

**Who it's for:** Owner only. Single user. PIN-protected. No one else has access.

**The pain points it solves:**
- Paper diary I can't keep up with
- Ideas that get buried and never executed
- No clear picture of true asset/liability/cashflow status
- Can't decide: pay debt first or fund next project?
- Project notes are scattered across apps
- Collection assets undocumented — if owner dies, daughter can't find or liquidate them
- Quotes and ideas saved in social media platforms I'll forget in a week

**The freedom goal:** One hard build → free forever from fragmented thinking.

**Live URL:** https://chaijohn-dashboard.pages.dev
**Repo:** https://github.com/Csmittee/chaijohn-personal (main branch — merged 2026-05-24)

---

## THE FIVE PILLARS (Vision)

### Pillar 1 — Finance Command Center
Clear, honest view of cashflow, debt, assets, and project funding capability.
- Cashflow charts: speed (trend), limits (meters), top offenders (Pareto), patterns (Paynter)
- Debt tracker: true current balance per liability, payment history, payoff timeline
- Asset net worth: collection + property, separated from liabilities
- Decision support: can I fund this project? Should I pay Thai credit or invest in Ploikong first?
- Drop Zone: photograph any receipt → AI reads → approve to Transactions in one tap
- Budget tools: set limits by category, see real-time actual vs budget

### Pillar 2 — Knowledge & Diary (Obsidian replacement)
Personal memory system that survives and works for AI agents in the future.
- Entry types: Story / Idea / Blog / Project / Skill
- AI assist: expand, refine, translate, summarize, suggest tags
- Blog publish: check "Publish to web" → auto-pushes to business Airtable → appears on websites
- Quote collection: drop a photo of a quote → auto-extracted → randomly plays back on login
- Connected Concept field: links entries to knowledge graph (future Obsidian sync)
- Social inject: from diary, push selected content to FB/IG with image assembly (future: Canva/image-gen)
- Future: all diary content readable by AI agents as permanent global memory

### Pillar 3 — Collection Asset Registry
Owner's personal valuable collection: knives, vices, plants, dolls.
- Full record per item: photo (Cloudinary), price paid, estimated value, condition, tags
- Potential buyer tags: mark who might want which piece
- Social share: one-click FB/IG share with Cloudinary image URL + auto-caption
- Ploikong.com integration: future auto-sync to collector marketplace (50% built separately)
- Emergency legacy: daughter can liquidate without owner present — everything documented

### Pillar 4 — AI Strategy Advisor
Personal AI that knows everything about the owner's finances, assets, and ideas.
- Auto-loads live financial snapshot on every session: cashflow, debts, net worth, assets for sale
- Permanent memory: all diary entries, decisions, ideas are context for AI
- Strategic questions: debt paydown vs project funding, which assets to sell, what to build next
- Session history saved to Airtable — never loses a conversation
- Future: agents can read this diary as global memory to serve owner across all tools

### Pillar 5 — Project Management Hub (NOT YET BUILT)
Full lifecycle management for every business idea from spark to launch.
- Stages: Idea → Market Research → Prototype → Costing → Marketing → Operations → Launch
- Financial modeling: estimated cost, funding source, projected revenue
- AI assist at each stage: generate brief, research market, draft operations plan
- Auto-website creation and social media control center
- Timeline + funding readiness linked to Pillar 1 finance data
- May require a dedicated app later — tracked here until scope is clear

---

## FUTURE INTEGRATIONS (Roadmap items, not built)

| What | When | Dependency |
|---|---|---|
| Janis business earnings inject | After business tools stable | i-flexthailand D1/AT already structured |
| Stock portfolio earnings inject | After stock tools stable | Trade-simulation D1 already structured |
| Instagram/FB → diary clip tool | When Pillar 2 is complete | Browser extension or mobile share-to |
| Ploikong.com auto-sync | When Ploikong 50%→100% | Ploikong.com separate project |
| AI agent global memory | When Pillar 2 content is rich | Anthropic API + structured diary export |
| Canva/image-gen for social | After Pillar 2 publish works | Canva API or image generation tool |

---

## OPERATING MODEL

CC-era workflow defined in `WORKFLOW_SKILL.md`:
- **Owner** describes goals, QAs live results, reports back
- **Chat** reads repo → diagnoses → writes CC prompts → saves to docs/prompts/
- **CC** reads fresh from repo → writes complete replacement files → commits → archives prompts → updates docs

Chat reads `masterseed.md` + `lessons_learned.md` at every session start.
CC reads both + all relevant source files fresh before writing anything.

---

## STACK

| Layer | Technology | Notes |
|---|---|---|
| Hosting | Cloudflare Pages | Static frontend + Pages Functions for all API |
| Database | Airtable | chaijohn-core (personal) + Janis Business db (blog push) |
| Image storage | Cloudinary | Drop zone, collection assets, diary images |
| AI | Anthropic Claude API | claude-sonnet-4-20250514 — diary assist, drop zone OCR, advisor |
| KV | Cloudflare KV (CHAIJOHN_KV) | Sessions, PIN hash, cashflow sync point |
| Charts | Chart.js | CDN loaded — no npm, no build step |
| Frontend | Vanilla JS + CSS variables | No React, no Vue, no Tailwind, no Bootstrap |
| Auth | Single PIN (4-6 digits) | SHA-256 + salt, stored in KV |
| Currency | THB (฿) | No decimals for amounts >100 |

---

## DEPLOYMENT

**Frontend:** Cloudflare Pages — auto-deploys from GitHub `main` branch
**Build output dir:** `public/`
**Worker files:** User pastes manually into Cloudflare Worker editor → Save & Deploy (L010)
**Airtable:** Schema init via POST /api/setup/schema (two phases: tables, then seed)
**Env vars:** Set in Cloudflare Pages dashboard — never in code

### Environment Variables
```
AIRTABLE_API_KEY              ← Personal Access Token (encrypted secret)
AIRTABLE_BASE_ID              = apphBGWfSPL45oSFd  (in wrangler.toml)
AIRTABLE_BUSINESS_BASE_ID     = appMBjlfYyVd8I7ML  (in wrangler.toml)
CLOUDINARY_CLOUD_NAME         = dfiomi0lb           (in wrangler.toml)
CLOUDINARY_API_KEY            ← encrypted secret
CLOUDINARY_API_SECRET         ← encrypted secret
ANTHROPIC_API_KEY             ← encrypted secret
CHAIJOHN_KV                   ← KV namespace binding (id: 7e2dcb214e17435c9ec808cb6e3b7e74)
```

---

## AIRTABLE SCHEMA (chaijohn-core: apphBGWfSPL45oSFd)

11 tables created by /api/setup/schema:

| Table | Key Fields | Notes |
|---|---|---|
| `Categories` | name, group, type (Earn/Expense/Loan/Investment), expense_type (FP-FV/FP-VV/VP-FV/VP-VV/Surprise), is_business, cash_flow, active | ~40 seeded rows |
| `Transactions` | date, type, amount, budget_id→Budgets (NEW — source of truth for expenses), category_id→Categories (LEGACY — read-only for old records), entity, description, note, source (Manual/DropZone/Import), fixed_variable, period | Core financial record |
| `Liabilities` | name, creditor_type, loan_size, interest_rate, monthly_payment, current_balance, active | 6 seeded: Tisco, Watch interest, Thai credit, Kasikorn, KTC, Friend&Family |
| `Liability_Payments` | liability_id→Liabilities, date, amount, note | Payment history per liability |
| `Assets` | name, category (Collection-Knife/Vice/Plant/Doll etc), cost_price, estimated_value, status, velocity, date_acquired, sold_price, sold_date, cloudinary_image_url, notes | Collection registry |
| `Diary` | date, title, content, entry_type (Story/Idea/Blog/Project/Skill), tags, publish_to_web, connected_concept, cloudinary_image_url | Knowledge pillar |
| `AI_Chats` | session_id, messages_json, topic, created_at, summary | Advisor session history |
| `Utilities` | month (first of month), electricity_units, electricity_charge, water_units, water_charge, notes | Monthly utility readings |
| `Quotes` | text, author, source, date_added, mood_tag, active, cloudinary_image_url | Quote collection |
| `Drop_Zone_Queue` | cloudinary_url, filename, mime_type, status (Pending/Approved/Rejected), ai_result, suggested_type | AI inbox |
| `Budgets` | label, category_id→Categories, amount, period, start_date, end_date, active | ~31 seeded rows |

**Business base (appMBjlfYyVd8I7ML):** Receives blog push when diary entry has publish_to_web=true AND entry_type=Blog → Blogs table (title, content, tags, date, published_url). One-way only — personal base never receives from business.

**Category groups (actual seeded):** Loan / Family / Basic Living / Car / Service / Personal / Basic IT / Bus IT / Business / Per-earn / Bus-earn / Investment

---

## FILE INVENTORY (actual repo structure)

```
/                                        ← repo root
├── masterseed.md                        ⬜ to be added (this file)
├── lessons_learned.md                   ⬜ to be added
├── WORKFLOW_SKILL.md                    ✅ exists
├── README.md                            ✅ exists
├── wrangler.toml                        ✅ exists
├── package.json                         ✅ exists
├── import-utilities.js                  ✅ exists (root — move to /scripts/ future)
├── import-assets.js                     ✅ exists (root — move to /scripts/ future)
├── docs/
│   ├── LESSONS.md                       ✅ exists (legacy — superseded by lessons_learned.md)
│   ├── DECISIONS.md                     ✅ exists
│   ├── PROGRESS.md                      ✅ exists
│   └── prompts/                         ✅ CC_PROMPT_fix9A + fixA–fixG archived
└── public/                              ← Cloudflare Pages serves this
    ├── index.html                       ✅ Chairit OS sidebar shell (9B — full M2 panels + entry drawer + collection + AI + time management)
    ├── dashboard.html                   ✅ redirects to /#dashboard
    ├── entry.html                       ✅ redirects to / (entry drawer in shell)
    ├── diary.html                       ✅ working after Phase 4 fixes
    ├── collection.html                  ⬜ built, not tested
    ├── ai-advisor.html                  ⬜ built, not tested
    ├── setup.html                       ✅ schema init working
    └── assets/
        ├── css/
        │   └── global.css              ✅
        └── js/
            ├── auth.js                 ✅
            ├── dropzone.js             ✅
            ├── dashboard.injector.js   ✅ (retired from shell — kept for reference)
            ├── entry.injector.js       ✅ (embedded in drawer; budget delete requires typed confirm)
            ├── diary.injector.js       ✅
            ├── collection.injector.js  ✅ (embedded in panel-collection)
            ├── ai-advisor.injector.js  ✅ (embedded in panel-ai)
            ├── cashflow.injector.js    ✅ NEW — IIFE, lazy via panelactivated
            ├── expenses.injector.js    ✅ NEW — IIFE, lazy via panelactivated
            ├── liabilities-panel.injector.js ✅ NEW — IIFE, lazy via panelactivated
            ├── budget-panel.injector.js ✅ 9E-R2 — custom start month selector, GAP actual (no debtMonthly, — for empty months), GAP cumulative row
            ├── ideas-panel.injector.js  ✅ 9E-R2 — full redesign: KPI strip full-width, resizable list panel (drag handle), Write/AI tab toggle, 3-dot pin-to-top
            └── dash-overview.injector.js ✅ NEW — IIFE, lazy via panelactivated, stat spans populated 9E
functions/
├── _middleware.js                       ✅
├── _airtable.js                         ✅ shared helpers
└── api/
    ├── auth.js                          ✅
    ├── auth/check.js                    ✅
    ├── transactions.js                  ✅ (GET/POST — PATCH/DELETE check pending)
    ├── categories.js                    ✅
    ├── debts.js                         ✅
    ├── liabilities.js                   ✅ (E3 — loan received creates Income tx)
    ├── liabilities/[id].js              ✅ (E3 — payment creates Expense tx)
    ├── cashflow-sync.js                 ✅ (E4 — GET/POST KV sync point)
    ├── admin/cleanup.js                 ✅ (E3 — deletes test liability tx records)
    ├── assets.js                        ✅
    ├── diary.js                         ✅
    ├── utilities.js                     ✅ (ft_note pending Fix 16)
    ├── quotes.js                        ✅
    ├── budgets.js                       ✅ (PATCH/DELETE pending Fix 21)
    ├── debts/[id]/history.js            🔴 new file needed (Fix 19)
    ├── dropzone.js                      ✅
    ├── upload-image.js                  ✅
    ├── ai-chat.js                       ✅
    ├── export-social.js                 ✅
    └── setup/schema.js                  ✅ two-phase: tables + seed
```

---

## BUILD PHASES

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Full initial build — all 5 modules in one CC pass | ✅ COMPLETE |
| Phase 1–4 | LESSONS.md + Dashboard fixes 1–8 + Risk Simulator + Diary fixes 9–13 | ✅ COMPLETE |
| Fix A | Fix 18 (Liabilities collapse form) + Fix 21 (Budgets inline edit) | ✅ COMPLETE |
| Fix B | Fix 19 (Liabilities expandable row + payment history) + Fix 22 (Budgets card/group view) | ✅ COMPLETE |
| Fix C | Fix 14 (Budget meter proportional scale) + Fix 15–17 (Utilities YoY charts + FT note + import script v2) | ✅ COMPLETE |
| Fix D | D1 Dropzone text files · D2 Diary AI undo · D3 Forecast cashflow · D4 Alert bubbles · D5 Category create · D6 One-time budget + T4 panel | ✅ COMPLETE |
| Fix E | E1 Category hierarchy + free-text group (Meta API) · E2 Entity autocomplete · E3 Liability cashflow direction · E4 KV cashflow sync point · E5 In-vs-out view toggle · E6 Period-aware budget meters · E7 4-panel top-row layout | ✅ COMPLETE |
| Fix F | F1 Category group 422 fix · F2 Debts liability→Income tx · F3 Transaction DELETE button · F4 Budget meter active/period filter · F5-F6 Dashboard graph train (horizontal scroll) + dynamic content zone (T1 Cashflow / T2 Expense / T3 Debt / T4 Annual Plan) | ✅ COMPLETE |
| Fix G | G1 Transactions API reads/writes budget_id (GET enriches budget_label+category via budget; POST requires budget_id for Expense; PATCH accepts budget_id) · G2 Budgets API returns category_name/group/type + expense_only filter · G3 Transaction expense dropdown → Budget list grouped by category_group · G4 Transaction list display uses server-enriched budget fields + legacy fallback · G5 Budget creation enforces unique label+category_id (API 400 + UI keeps form on error) · G6 Budget category dropdown = Expense only; section renamed to "Add Budget Item" · G7 Dashboard resolves category via budget_id using resolveCatId() helper | ✅ COMPLETE |
| Fix 9A | Sidebar Shell Part 1 — Chairit OS layout, hash routing, 15 route panels, auth overlay, theme toggle; replaced index.html | ✅ COMPLETE |
| Fix 9B | Sidebar Shell Part 2 — M2 panel stat chips + charts + cards wired; entry drawer (pin-able, context-aware); dashboard overview + mini charts; Time Management stub; redirects for dashboard.html + entry.html; budget delete typed confirm | ✅ COMPLETE |
| Fix 9B2 | QA fixes: F1a/b/c cashflow toggle+range+view; F2a-d expenses chart order+period+responsive+view; F3a liabilities chart swap; F4a/b entry utility chart toggle+collapse | ✅ COMPLETE |
| Fix 9B3 | Card section bands (CASH IN/OUT, expense group, liability type), proportional card sizing, Bundle/Details toggle, bar chart single-month, entry FAB fixed top-right, frosted glass drawer, utility chart 220px | ✅ COMPLETE |
| Fix 9E | E1: Budget panel full redesign — 12-mo FY/Rolling matrix, analysis collapsible at top (Thai tax), graph filter zone (above chart: view/period/data), data filter zone (below chart: sps/card, dtype, edit mode), edit mode batch save (PATCH budget + POST actual w/ "mass update by owner"), pending changes bar, card view · E2: Diary Memo type + count badges + thumbnails + dist buttons + AI bottom pane · Ideas panel (M3.1) full diary editor embedded in shell (ideas-panel.injector.js IIFE) · Dashboard mini-chart stat spans populated · Sidebar Entry nav link removed | ✅ COMPLETE |
| Fix 9E-R2 | Budget: Custom start month picker (Custom button + month input in period toggle, fetches from customStart if earlier than rolling window) · GAP Actual row: remove debtMonthly from actual, show — for months with no transaction data · GAP Cumulative row added (running month-over-month actual) · Ideas panel full redesign: KPI strip full-width at top, left 20% resizable list panel (drag handle, 160–480px), right 80% editor with Write/AI tab toggle (✏ Write / ✨ AI), 3-dot pin-to-top per entry, theme-compliant btn-outline buttons, removed old AI bottom pane | ✅ COMPLETE |
| Pillar 3 | Collection module — full test + buyer tags + social share | ⬜ NEXT |
| Pillar 4 | AI Advisor — full test + permanent memory context | ⬜ NEXT |
| Pillar 5 | Project Management Hub — design first, build later | ⬜ FUTURE |

---

## CURRENT STATE

**Working and confirmed:**
- PIN auth, sessions (KV)
- Schema: all 11 tables + seeded categories/liabilities/budgets
- Sidebar shell (9B): hash-routed panels, panelactivated lazy-init, entry drawer (pin-able, context-aware tabs), Time Management placeholder, dashboard overview mini charts ✅
- M2 panels wired (9B2 + 9B3 QA applied):
  - Cashflow: 1M/3M/6M range toggle, 30/70 date window, list/card view toggle; card view = CASH IN / CASH OUT section bands + proportional sizing ✅
  - Expenses: trend left + pareto right, current/3M/6M period selector, responsive min-width:0; list/card/bundle/details toggle; details = group section bands + proportional cards; bar chart for single-month period ✅
  - Liabilities: trend left + bar right; static cards grouped by creditor_type (Bank→Family→Friend→Other) with section bands, interest on card face, proportional sizing ✅
  - Budget: 4 stat chips + 12-month FY/Rolling/Custom matrix with graph/data filter zones (separate); analysis collapsible at top (Thai tax); GAP section = Budget Plan row + Actual row (no debtMonthly, — for empty months) + Cumulative row; custom start month picker shows month input on Custom button; spreadsheet mode (EARN/EXPENSES/DEBT/GAP sections, editable cells); card mode (expense budget cards with progress bars); edit mode with batch PATCH/POST save; pending changes bar ✅ 9E-R2
- Dashboard overview: 4 stats + TODAY PRIORITY placeholder + 4 mini charts (click → M2 panel) + stat spans (cash balance, expenses/mo, total debt, budget gap/mo) ✅ 9E
- Entry drawer: embedded in shell (all 4 tabs), context-aware (cashflow→transactions, expenses/budget→budgets, liabilities→liabilities), pin-able, frosted glass background ✅
- Entry FAB: ⊕ Entry button fixed top-right (position:fixed, z-index:400) always accessible from all panels ✅
- Budget delete: requires typing budget label to confirm; other deletes use confirm() ✅
- Collection + AI panels: embedded in shell via collection.injector.js + ai-advisor.injector.js ✅
- Entry: Transactions (entity autocomplete datalist, inline edit + DELETE button, budget_id for expense) ✅, Utilities (YoY charts, FT note) ✅, Liabilities (collapse form + expandable row + payment history) ✅, Budgets (inline edit + card/group view + category create) ✅
- Diary (diary.html): list + editor + preview + AI modal assist + AI bottom pane + Undo + Memo type + type count badges + thumbnail in list + dist buttons (Blog/Idea/Story/Project) ✅ 9E
- Ideas panel (M3.2 in shell): KPI strip full-width at top (Entries, Dist 1mo, Dist 6mo); left resizable list panel (160–480px, drag handle, 3-dot pin-to-top per entry, search + type filters); right editor panel with Write/AI tab toggle (✏ Write = form fields; ✨ AI = Refine/Expand/Summary/Tags output + Use in Content/Append); AI comparison panel in write pane; theme-compliant btn-outline buttons ✅ 9E-R2
- Sidebar nav: Entry link removed (FAB top-right is the only entry point) ✅ 9E
- Drop Zone: image/PDF upload + AI extract ✅, text/markdown file support ✅, Approve → Airtable ✅
- Import scripts: import-utilities.js, import-assets.js ✅

**Pending / untested:**
- Collection module: embedded in shell, needs end-to-end QA
- AI Advisor: embedded in shell, needs end-to-end QA
- Time Management: placeholder only (future build)
- Sales, Projects, Ideas, Hard Assets, Proj Assets: stub panels (future build)

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

---

## ROADMAP

**Immediate (next):**
1. Fix 9C — Full M3.4 Projects module (Airtable schema, API endpoints, projects.injector.js, index.html panel)
2. Expense pareto cut-off date input (deferred from 9B3) — combine with next fix session
3. Cashflow budget simulation / hold zone (drag-to-pause budget items) — deferred from 9B3, needs separate design session
3. Collection module full test + buyer tags
4. AI Advisor full test + verify financial context loads

**After that:**
4. Diary → social push (FB/IG) with image capability

**Medium term:**
5. Project Management Hub — design session with Chat first, then build
6. Ploikong.com sync from Collection (when Ploikong reaches 100%)

**Long term:**
7. Business earnings inject (Janis i-flex → this diary)
8. Stock earnings inject (Trade-simulation → this diary)
9. Instagram/FB → diary clip tool (mobile share extension)
10. AI agent global memory — diary as structured context for all AI tools

---

## CRITICAL RULES

1. **Read before write** — CC reads masterseed + lessons_learned + ALL source files fresh before any write
2. **Complete files only** — never patches, never diffs, always full file replacement
3. **Worker deploy = manual** — user pastes into Cloudflare editor; CC never auto-deploys
4. **Airtable multipleRecordLinks** — use ONLY `{ linkedTableId: id }` at table creation, nothing else (L001)
5. **Airtable checkbox colors** — always `greenBright`/`blueBright`, never `green`/`blue` (L002)
6. **Batch creates** — 10 records per POST, never one-by-one (L003)
7. **Shared helpers** — all in `functions/_airtable.js`, relative import `'../_airtable.js'` (L004)
8. **One injector per page** — never put shared logic in a page injector loaded everywhere
9. **No frameworks** — pure CSS variables + vanilla JS only, always
10. **Archive prompts** — move completed CC_PROMPT files to docs/prompts/ stamped ✅ COMPLETE
11. **Self-document** — CC updates masterseed + lessons_learned after every session
