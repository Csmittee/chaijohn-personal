✅ COMPLETE — 2026-05-28 — Cashflow card restoration (budget/debt/borrow cards) + X-days due window tool + cut cost simulation with ghost chart comparison

# CC_PROMPT_fix9B4_cashflow-cards-simulation.md
> Restore missing cashflow card types + add X-days due window tool + cut cost simulation
> Scope: cashflow.injector.js only — do NOT touch any other injector or API file

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

Then read and execute this file.
```

---

## CONTEXT

The cashflow panel card view previously showed all card types correctly
before the Phase 9B sidebar migration. The migration broke this — now only
actual spent transactions and sales income cards appear.

This session restores all missing card types AND adds a new simulation layer.
Do NOT redesign what is already working. Read cashflow.injector.js fully
before writing a single line — understand what exists, then restore what's missing.

---

## READ FIRST

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/cashflow.injector.js` — full read required
3. `functions/api/cashflow.js` — understand what data is already returned
4. `functions/api/budgets.js` — understand budget data shape
5. `functions/api/liabilities.js` — understand liability data shape, especially `payment_due_date` and `monthly_payment` fields
6. `public/index.html` — confirm how cashflow panel is wired

Summarize what cashflow.injector.js currently renders in card view before writing anything.

---

## PART 1 — RESTORE ALL CARD TYPES IN CARD VIEW

The card view must show ALL of these card types, grouped and sorted correctly.

### Card groups and sort order

```
─── CASH IN ──────────────────────────────────────
  [Actual income transactions — green, solid border]
  [Project presale income — green, lighter]
  [New liability created = cash received — green, dashed border]

─── CASH OUT ─────────────────────────────────────
  [Debt payback cards — one per liability — red, dashed border]
  [Project funding cards — one per active project — amber border]
  [Budget spending cards — one per active budget with remaining balance — red, lighter]
  [Actual spent transactions not matched to budget — red, solid border]
```

### Card designs — match existing card size exactly

**Actual transaction card (already working — do not change):**
- Date · Name · Location
- Amount (green +฿X or red -฿X)

**Budget spending card (restore):**
- Label: budget item name (e.g. "Food restaurant")
- Sub: category group (e.g. "Basic Living")
- Amount: remaining balance this period (planned minus actual spent so far)
- Format: -฿X,XXX remaining
- Badge: "Budget" in small tag

**Debt payback card (restore):**
- Label: liability name (e.g. "Thai credit")
- Sub: lender type (Bank / Family / Other)
- Amount: monthly_payment
- Due: "Due [payment_due_date]th" if payment_due_date exists, else "Monthly"
- Badge: "Debt" in small tag

**Project funding card (restore):**
- Label: project name
- Sub: "Project funding"
- Amount: monthly resource cost for this project
- Badge: "Project" in small tag

**Presale income card (restore):**
- Label: presale description
- Sub: "Confirmed presale"
- Amount: +฿X,XXX
- Badge: "Presale" in small tag — green

**New borrow card (restore):**
- Label: liability name
- Sub: "New loan received"
- Amount: +฿X,XXX (loan_size)
- Badge: "Borrow" in small tag — green dashed

### Data sourcing

Fetch in parallel on card view load:
- Existing cashflow/transaction data (already fetched)
- `GET /api/budgets?active_only=true` — for budget spending cards
- `GET /api/liabilities` — for debt payback cards
- `GET /api/projects?active_only=true` — for project funding cards (if endpoint exists, else skip project cards gracefully)

Calculate remaining balance per budget:
`remaining = budget.amount_per_period - actual_spent_this_period`
Only show budget card if remaining > 0.

---

## PART 2 — "X DAYS" DUE WINDOW TOOL

Add a tool bar below the List/Card toggle, visible only in Card view.

### UI

```
[ Due in: [___] days ]  [Check]
```

Small input (number, default blank) + Check button.
When triggered: filter and highlight cards by priority.

### Priority tiers shown

**Priority 1 — Legal debt (auto, cannot avoid)**
Debt payback cards where `payment_due_date` falls within the next X days.
Highlight: red left border accent, badge "DUE P1"

**Priority 2 — Project funding (auto)**
Project funding cards for active projects with resource costs due within X days.
Highlight: amber left border accent, badge "DUE P2"

**Priority 3+ — All remaining cards**
All other cards listed below with no automatic prioritization.
Owner manually decides what to cut.
Label these: "Review manually"

### Summary bar (appears below tool when active)

```
Due in [X] days:
P1 Legal: ฿XX,XXX  |  P2 Projects: ฿XX,XXX  |  Total committed: ฿XX,XXX
Current balance: ฿XX,XXX  →  Days until empty: XX days (at current burn)
```

Current balance: read from cashflow KV sync (`CHAIJOHN_KV` — `cashflow_sync` key).
Days until empty: `current_balance / average_daily_burn` where
`average_daily_burn = total_cash_out_last_30_days / 30`.

Clear button resets the tool and returns to normal card view.

---

## PART 3 — CUT COST SIMULATION

### How it works

Each card (budget, debt, project) has a simulation toggle.
Actual transaction cards do NOT have simulation toggle — they already happened.

Toggle behavior:
- Click card toggle → card grays out, amount shows as ฿0 (strikethrough original)
- Forecast chart above recalculates immediately — removes this card's amount from future projection
- Summary bar recalculates: days until empty updates live
- Multiple cards can be toggled simultaneously

### UI on each eligible card

Small toggle button bottom-right of card: [✂ Cut] when active, [↩ Restore] when cut.
Cut cards: opacity 0.5, amount strikethrough, gray border.

### Simulation mode indicator

When any card is cut: show banner above card grid:
```
⚠ Simulation active — [N] items cut · Saving ฿XX,XXX/mo  [Reset all]
```

Reset all: restores all cards, recalculates chart, removes banner.

### Forecast chart reaction

When simulation is active:
- Recalculate future trajectory removing cut amounts
- Show original trajectory as thin dashed line (ghost)
- Show simulated trajectory as solid line
- This gives visual comparison of cut vs no-cut

---

## CONSTRAINTS

- Do NOT change list view — list view stays exactly as it is
- Do NOT change the chart rendering logic — only the data feeding into future projection
- Do NOT change any other injector files
- Do NOT change any API files — fetch existing endpoints only
- Do NOT change `public/index.html` structure
- Card size: match existing card dimensions exactly — do not resize
- If project funding API does not exist yet: skip project cards gracefully,
  show placeholder "Project funding cards available after 9C"
- Repo is source of truth — read before writing

---

## AFTER ALL OUTCOMES — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — Cashflow card restoration + X-days tool + cut simulation`

2. Update `PROJECT_STATE.md`:
   - Mark cashflow card restoration ✅ COMPLETE
   - Note simulation layer added
   - Note delay simulation as planned for future session

3. Prepend to TOP of `RULES.md` (one line, next L-number):
   - Cashflow simulation: ghost line = original, solid = simulated — never replace original data
   - Parallel fetch pattern for card view: budgets + liabilities + projects fetched simultaneously

4. Commit: `docs: update PROJECT_STATE and RULES after fix9B4`

---

## COMMIT ORDER

```
feat(cashflow): restore budget spending cards in card view
feat(cashflow): restore debt payback cards in card view
feat(cashflow): restore project funding cards in card view (graceful skip if no API)
feat(cashflow): restore presale and borrow income cards
feat(cashflow): X-days due window tool with P1/P2 auto-priority
feat(cashflow): cut cost simulation with ghost chart comparison
docs: update PROJECT_STATE and RULES after fix9B4
```

Branch: `fix/9b4-cashflow-cards-simulation`
Create PR to main after all parts working.
Merge to main only after owner QA confirms all card types visible and simulation works.
