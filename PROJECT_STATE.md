# PROJECT STATE — Chaijohn OS
> Last updated: 2026-05-28 — System migration from masterseed to new lean system

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
5. Project Management Hub — full lifecycle from idea to launch (NOT YET BUILT)

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
| Fix 9C | Full M3.4 Projects module (schema, API, projects.injector.js, panel) — SCHEDULED NEXT WEEK | ⬜ SCHEDULED |
| Pillar 3 | Collection module — full test + buyer tags + social share | ⬜ FUTURE |
| Pillar 4 | AI Advisor — full test + permanent memory context | ⬜ FUTURE |
| Pillar 5 | Project Management Hub — design first, build later | ⬜ FUTURE |

---

## CURRENT STATE

**Working (confirmed):**
- PIN auth, sessions (KV)
- Schema: all 11 tables + seeded categories/liabilities/budgets
- Sidebar shell (9B): hash-routed panels, panelactivated lazy-init, entry drawer, Time Management placeholder
- M2 panels: Cashflow (range toggle, date window, list/card view) · Expenses (trend+pareto, period selector, responsive, list/card/bundle/details) · Liabilities (trend+bar, static cards with proportional sizing) · Budget (12-month matrix, analysis collapsible, GAP rows, edit mode, pending bar, card view, custom start month) ✅
- Dashboard overview: 4 stats + TODAY PRIORITY placeholder + 4 mini charts + stat spans ✅
- Entry drawer: all 4 tabs, context-aware, pin-able, frosted glass ✅
- Ideas panel: KPI strip, resizable list, Write/AI tab toggle, 3-dot pin-to-top ✅
- Drop Zone: image/PDF + text/markdown support, AI extract, Approve → Airtable ✅
- Collection panel: FAB centered, Sync button in filter bar, gallery hover with arrows + counter on cards ✅ (collection-gallery-sync)
- AI panel: embedded in shell ✅ (not end-to-end tested)
- Diary (diary.html): list + editor + preview + AI modal + AI bottom pane + Undo + Memo type ✅

**In progress / broken:**
- None currently known

**Pending phases:**
- Fix 9C: Projects module (next week)

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

## FILE INVENTORY

```
/                                         ← repo root (keep clean)
├── CLAUDE.md                             ✅ NEW — primary CC entry point (30 lines)
├── RULES.md                              ✅ NEW — compact one-liner rules (L001–L067)
├── PROJECT_STATE.md                      ✅ NEW — this file, phases + roadmap + inventory
├── WORKFLOW_SKILL.md                     ✅ operating model reference
├── README.md                             ✅
├── wrangler.toml                         ✅
├── package.json                          ✅
├── docs/
│   ├── archive/
│   │   ├── masterseed_archived_2026-05-28.md     ✅ archived (was masterseed.md)
│   │   └── lessons_learned_archived_2026-05-28.md ✅ archived (was lessons_learned.md)
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
            ├── cashflow.injector.js      ✅ IIFE, lazy via panelactivated
            ├── expenses.injector.js      ✅ IIFE, lazy via panelactivated
            ├── liabilities-panel.injector.js ✅ IIFE, lazy via panelactivated
            ├── budget-panel.injector.js  ✅ 9E-R2 — 12-mo matrix, GAP rows, edit mode
            ├── ideas-panel.injector.js   ✅ 9E-R2 — KPI strip, resizable list, Write/AI toggle
            ├── dash-overview.injector.js ✅ IIFE, lazy via panelactivated
            ├── entry.injector.js         ✅ binds entry drawer form
            ├── diary.injector.js         ✅
            ├── collection.injector.js    ✅ embedded in panel-collection
            ├── ai.injector.js            ✅ embedded in panel-ai
            └── dashboard.injector.js     ✅ retired from shell, kept for reference
functions/
├── _middleware.js                        ✅ auth check for all /api/*
├── _airtable.js                          ✅ ALL shared Airtable helpers
└── api/
    ├── auth.js + auth/check.js           ✅
    ├── transactions.js                   ✅ GET/POST (PATCH/DELETE check pending)
    ├── categories.js                     ✅
    ├── liabilities.js                    ✅ loan received → Income tx
    ├── liabilities/[id].js               ✅ payment → Expense tx
    ├── cashflow-sync.js                  ✅ GET/POST KV sync point
    ├── budgets.js                        ✅ GET/POST with period duplicate check
    ├── budgets/[id].js                   ✅ PATCH/DELETE
    ├── assets.js                         ✅
    ├── diary.js                          ✅
    ├── utilities.js                      ✅
    ├── quotes.js                         ✅
    ├── debts.js                          ✅
    ├── dropzone.js                       ✅
    ├── upload-image.js                   ✅
    ├── ai-chat.js                        ✅
    └── setup/schema.js                   ✅ two-phase: tables + seed
```

---

## AIRTABLE TABLES

**Base ID:** `apphBGWfSPL45oSFd` (chaijohn-core)
**Business Base:** `appMBjlfYyVd8I7ML` (blog push only — one-way)

| Table | Key Fields |
|---|---|
| Categories | name, group, type (Earn/Expense/Loan/Investment), expense_type, is_business, cash_flow, active |
| Transactions | date, type, amount, budget_id→Budgets, category_id→Categories (legacy), entity, description, note, source, fixed_variable, period |
| Liabilities | name, creditor_type, loan_size, interest_rate, monthly_payment, current_balance, active |
| Liability_Payments | liability_id→Liabilities, date, amount, note |
| Assets | name, category, cost_price, estimated_value, status, velocity, date_acquired, sold_price, sold_date, cloudinary_image_url, notes |
| Diary | date, title, content, entry_type (Story/Idea/Blog/Project/Skill), tags, publish_to_web, connected_concept, cloudinary_image_url |
| AI_Chats | session_id, messages_json, topic, created_at, summary |
| Utilities | month, electricity_units, electricity_charge, water_units, water_charge, notes |
| Quotes | text, author, source, date_added, mood_tag, active, cloudinary_image_url |
| Drop_Zone_Queue | cloudinary_url, filename, mime_type, status, ai_result, suggested_type |
| Budgets | label, category_id→Categories, amount, period, start_date, end_date, active |

**Category groups (seeded):** Loan / Family / Basic Living / Car / Service / Personal / Basic IT / Bus IT / Business / Per-earn / Bus-earn / Investment

---

## ROADMAP

**Immediate next:**
1. Fix 9B4 — Cashflow card restoration + X-days due window tool + cut cost simulation
2. Expense pareto cut-off date input (deferred from 9B3)

**Next week:**
3. Fix 9C — Full M3.4 Projects module (Airtable schema, API endpoints, projects.injector.js, panel)

**After that:**
4. Collection module full test + buyer tags + social share
5. AI Advisor full test + verify financial context loads
6. Diary → social push (FB/IG) with image capability

**Medium term:**
7. Project Management Hub — design session with Chat first, then build
8. Ploikong.com sync from Collection (when Ploikong reaches 100%)

**Long term:**
9. Business earnings inject (Janis i-flex → this diary)
10. Stock earnings inject (Trade-simulation → this diary)
11. AI agent global memory — diary as structured context for all AI tools

---

## CRITICAL RULES

(All in CLAUDE.md rules 1–5 + RULES.md L001–L067. No additional rules beyond those.)

**Environment vars (Cloudflare Pages dashboard):**
- AIRTABLE_API_KEY (secret) · CLOUDINARY_API_KEY/SECRET (secrets) · ANTHROPIC_API_KEY (secret)
- CHAIJOHN_KV binding id: 7e2dcb214e17435c9ec808cb6e3b7e74

**Deployment reminder:** Cloudflare Pages auto-deploys from main. Never merge broken code to main.
