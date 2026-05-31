# CC_PROMPT_fix9B5_cashflow-complete-redesign.md
> Complete rewrite of cashflow.injector.js
> Build Mode — one execution, no patches after
> Read everything before writing a single line

---

## CC INTRO

```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md        — project brief, stack, 5 rules
2. RULES.md         — compact lessons, required before every task
3. PROJECT_STATE.md — phases, roadmap, file inventory

Do NOT read masterseed.md or lessons_learned.md — archived.

Then read and execute this file fully.
```

---

## CONTEXT — WHY THIS REWRITE

The cashflow panel has been patched repeatedly without fixing the root
architecture. The card view never had a complete data model — it shows
only actual transactions, missing budget cards, debt cards, and project
funding cards. The forecast calculation uses incomplete data.

This session rewrites cashflow.injector.js completely with a correct
architecture. One file. One execution. No other files touched.

---

## READ FIRST — ALL OF THESE

1. `CLAUDE.md` + `RULES.md` + `PROJECT_STATE.md`
2. `public/assets/js/cashflow.injector.js` — full read, understand all existing logic
3. `functions/api/cashflow.js` — understand data returned
4. `functions/api/budgets.js` — understand budget data shape
5. `functions/api/liabilities.js` — understand liability fields especially:
   `monthly_payment`, `payment_due_date`, `current_balance`, `creditor_type`
6. `functions/api/transactions.js` — understand transaction fields
7. `functions/_airtable.js` — understand shared helpers
8. `public/index.html` — confirm cashflow panel wiring and KV sync

Summarize what the current cashflow.injector.js does before writing anything.
Identify exactly what data is fetched vs missing.

---

## ARCHITECTURE — READ THIS FULLY BEFORE WRITING CODE

### The single calculation engine

All data flows through one calculation engine. No scattered fetches.
No data calculated twice. No data calculated in display functions.

```javascript
// Module-level state — persists while panel is open
const CF = {
  // Raw data (fetched once per panel open)
  transactions: [],      // actual past + future booked transactions
  budgets: [],           // all active budgets with backlog_type field
  liabilities: [],       // all active liabilities
  projects: [],          // active projects (graceful skip if no API)

  // Derived (calculated by buildForecast())
  forecast: [],          // day-by-day {date, balance, type} for selected period
  currentBalance: 0,     // from KV cashflow-sync

  // Simulation state (persists across view/period toggles, clears on Reset)
  simulation: {
    active: false,
    onHold: {},          // { budgetId: true }
    intents: {},         // { budgetId: amount } — pre-committed spend
    actions: [],         // [{ what, amount, byDate }]
    period: { start, end },
    note: ''
  },

  // DEF CON state (read from KV 'active_strategy' key)
  defcon: null,          // null = no active strategy

  // UI state
  view: 'card',          // 'list' | 'card'
  period: '1M',          // '1M' | '3M' | '6M'
  viewMonth: null,       // null = this month, Date = other month
  cardOrder: {},         // { sectionKey: [budgetId, ...] } — drag order saved to localStorage
  dueInDays: null        // X-days tool value
};
```

### Budget proration rule — CRITICAL

Every budget amount shown in card view MUST be prorated to the selected period:

```javascript
function prorateAmount(budget, period) {
  const monthly = budget.period === 'Annual' ? budget.amount / 12
    : budget.period === '3x-yr' ? budget.amount / 4
    : budget.period === '6x-yr' ? budget.amount / 2
    : budget.amount; // Monthly = full amount

  if (period === '1M') return monthly;
  if (period === '3M') return monthly * 3;
  if (period === '6M') return monthly * 6;
  return monthly;
}
```

Show annotation on every budget card:
- Annual: `฿300,000/yr ÷ 12 = ฿25,000/mo`
- 3x/yr: `฿140,000 · 3x/yr ÷ 4 = ฿11,667/mo`
- Monthly: `฿8,000/mo`

### buildForecast() — single source of truth

```javascript
function buildForecast() {
  // 1. Start from currentBalance (KV sync point)
  // 2. Apply all past actual transactions in period
  // 3. Apply all future booked transactions in period
  // 4. Apply prorated budget amounts as future outflows
  //    (skip if onHold, use intent amount if set)
  // 5. Apply monthly_payment for each liability on payment_due_date
  // 6. Apply project funding costs if available
  // Returns: array of { date, balance, isProjected, wouldGoBelow20k }
}
```

Simulation modifies INPUTS to buildForecast() — never the output directly.
Toggling a card on hold → removes that budget from step 4 → rebuilds forecast.
Setting an intent → replaces budget.amount with intent in step 4 → rebuilds forecast.

### Firewall — DEF CON 5 system

Runs on every buildForecast() completion. Never manually triggered.

```javascript
function checkFirewall(forecast) {
  const minBalance = Math.min(...forecast.map(d => d.balance));
  const daysToZero = forecast.findIndex(d => d.balance <= 0);
  const hasNegativeIn90Days = forecast.slice(0, 90).some(d => d.balance < 0);
  const below20k = forecast.slice(0, 90).some(d => d.balance < 20000);

  if (hasNegativeIn90Days) {
    // DEF CON 5 — trigger if not already active
    if (!CF.defcon) triggerDefCon();
  } else if (below20k) {
    // Yellow alert
    showYellowAlert(forecast.find(d => d.balance < 20000));
  } else {
    // Normal — check exit condition if defcon active
    if (CF.defcon) checkDefConExit(forecast);
  }
}

function checkDefConExit(forecast) {
  // Exit condition: lowest point in 90-day projection >= 20,000
  // sustained for 7 consecutive weeks
  // Test: temporarily restore gross budget amounts (not intents)
  // and recheck — only exit if GROSS budget also passes
  // If passes: reduce to WARNING for 1 week, then full exit
}
```

DEF CON state stored in KV key `active_strategy`:
```json
{
  "status": "active",  // "active" | "warning" | "lifted"
  "triggeredAt": "2026-05-28",
  "ticket": {
    "id": "DC5-001",
    "triggerBalance": 56000,
    "triggerDaysToZero": 35,
    "onHold": ["budgetId1", "budgetId2"],
    "intents": {"budgetId3": 4000},
    "actions": [
      {"what": "Get Pilates clients", "amount": 30000, "byDate": "2026-06-15"},
      {"what": "Janis presale", "amount": 20000, "byDate": "2026-06-30"},
      {"what": "Asset sale backup", "amount": 50000, "byDate": "2026-07-31"}
    ],
    "note": "Focus on Pilates studio outreach...",
    "period": {"start": "2026-06-01", "end": "2026-08-31"},
    "carryDebt": [
      {"budgetId": "id1", "label": "Travel activities", "perMonth": 25000, "months": 3, "total": 75000},
      {"budgetId": "id2", "label": "Wife salary", "perMonth": 20000, "months": 3, "total": 60000}
    ]
  }
}
```

New ticket opens automatically on each DEF CON trigger.
Pre-fills from last ticket (saves time — owner adjusts not rewrites).

### backlog_type field on Budgets

Budgets table has a `backlog_type` singleSelect field: `forgive` or `carry`.
- `carry` — unpaid amount during DEF CON accumulates as family debt
- `forgive` — disappears if unused, no debt created

If field missing on a budget record, default to `forgive`.

---

## PART 1 — PANEL LAYOUT AND PERIOD CONTROLS

### Stat row (5 cards)

```
days to ฿0 | balance now | total out (period) | next income | unspent → family reserve
```

- `days to ฿0`: calculated from forecast. Green >90d, Amber 60-90d, Red <90d
- `unspent → family reserve`: sum of unspent `carry` type budget amounts this period
  (only in normal mode, not during DEF CON)

### Period controls

Two separate controls — they work independently:

**View toggle:** `[This month] [Other month ›]`
- This month = current calendar month
- Other month = 3-month sliding window. Show left/right arrows to slide.
  Display: `‹ Apr 2026 | May 2026 | Jun 2026 ›`

**Range toggle:** `[1M] [3M] [6M]`
- Controls how far forward the forecast projects AND how budget amounts prorate
- Applies to both This month and Other month views

### X-axis labels — CRITICAL (old problem)

1M view: show calendar dates `1 May · 7 May · 14 May · 21 May · 28 May`
3M view: show month names only `May 2026 · Jun 2026 · Jul 2026`
6M view: show month names only `Mar · Apr · May · Jun · Jul · Aug`

Never show week numbers. Never show ambiguous date ranges.
Always show `today ◀` marker on current date.
Always show `฿20k floor` as a faint horizontal line on the chart.

When DEF CON simulation active: show TWO lines:
- Original trajectory (dashed, dim blue)
- Simulated trajectory (solid green)

---

## PART 2 — CARD VIEW

### Card layout — DO NOT CHANGE

Preserve exactly what CC built:
- Flex-wrap layout with `min-width` per card
- Height proportional to budget amount (bigger ฿ = taller card)
- Badge top-left, name, sub-label, amount bottom, action buttons bottom-right
- Dark background with subtle colored border by type

### Card types to render

**CASH IN section:**

1. Actual income transactions (already working)
2. Confirmed presale income — badge: `Presale` green
3. New liability received this period — badge: `Borrow` green dashed border

**CASH OUT — DEBT section (P1 priority):**

One card per active liability. Data from `GET /api/liabilities`.
- Badge: `Debt` + `P1 · due Nth` if payment_due_date exists
- Name: liability name
- Sub: creditor_type (Bank / Family / Other) + due date
- Amount: monthly_payment (always monthly — debt doesn't prorate)
- Bottom: `[≥< On Hold]` button (debt can be delayed, not cut)

**CASH OUT — BUDGET section (grouped by category group):**

One card per active budget. Data from `GET /api/budgets?active_only=true`.
Grouped by budget group name (Family, Basic Living, Car, Basic IT etc.)
Group header shows: group name + `▾` toggle + total for group this period.

Each budget card:
- Badge: `Budget` + backlog_type badge (`carry` amber / `forgive` gray)
- Name: budget label
- Sub: category group
- Period annotation: `฿300,000/yr ÷ 12 = ฿25,000/mo` (always shown)
- Spent so far: `spent ฿6,370 · remaining ฿1,630`
- Progress bar: fill proportional to spent/prorated amount
  Green <60%, Amber 60-85%, Red >85%
- Amount (prorated): `-฿25,000` for this period
- Bottom buttons: `[≥< On Hold]` `[Intent ฿ _____]`

**Intent input behavior:**
- When owner types an amount and blurs → treat as pre-committed spend
- Replaces budget amount in forecast for that period
- Shows as future transaction in Airtable view conceptually
- Card shows: strikethrough budget amount + `intent: ฿4,000` in amber
- Forecast rebuilds immediately

**On Hold behavior:**
- Card grays out, amount strikethrough, shows `on hold this period`
- If budget is `carry` type: carry debt counter increments
- Forecast rebuilds immediately
- Button changes to `[↩ Release]`

### Drag to reorder within section

Use HTML5 drag-and-drop on cards within each group section.
Save order to localStorage key `cf_card_order_{groupName}`.
Order persists across sessions. Reset on Clear button.
Dragging between groups is NOT allowed — only within same group.

### X-days due window tool

Shown above card sections, below List/Card toggle:
```
Due in: [___] days  [Check]  [Clear]
```

When active:
- Debt cards due within X days: highlight with red left border accent + `DUE P1` badge
- Project funding cards due within X days: amber left border + `DUE P2` badge
- Summary bar appears below tool:
  ```
  P1 Legal: ฿XX,XXX  |  P2 Projects: ฿XX,XXX  |  Current balance: ฿XX,XXX  →  Days to ฿0: XX
  ```

---

## PART 3 — SIMULATION MODE

Simulation is available always — DEF CON active or not.
Owner uses it to test scenarios before committing.

### Simulation summary box

Appears BELOW the chart, ABOVE the card sections.
Only visible when simulation.active = true.

```
[amber blink] Simulation · N on hold · N intents · saving ฿XX,XXX/mo
─────────────────────────────────────────────────────
On hold — [name]          ฿25,000 → ฿0 this period
Intent — [name]           ฿8,000 → ฿4,000 committed
Period                    Jun – Aug 2026
Monthly saving            +฿36,667
Days to ฿0 before → after 35d → 58d
Gap still needed          ฿42,000 from sales

ACTION PLAN:
┌─────────────────────────┬────────────┬──────────┐
│ Action                  │ Target ฿   │ By when  │
├─────────────────────────┼────────────┼──────────┤
│ [input field]           │ [฿ input]  │ [date]   │
│ [input field]           │ [฿ input]  │ [date]   │
│ [input field]           │ [฿ input]  │ [date]   │
└─────────────────────────┴────────────┴──────────┘
[note textarea]
[⚡ Activate DEF CON 5 — enforce restrictions] button
[Reset simulation] button
```

Action closes ONLY when income transactions prove it:
- System sums income transactions tagged to that period since strategy start
- When sum >= action.amount → action auto-marks complete
- No manual checkbox. Data proves it.

### Simulation state persistence

Survives: period toggle (1M/3M/6M), view toggle (List/Card), month navigation.
Dies: navigate away from cashflow panel, click Reset simulation.
Storage: module-level CF.simulation object — no localStorage needed.

---

## PART 4 — DEF CON 5 SYSTEM

### Firewall banner — shown on Dashboard, Expenses, Cashflow panels

Banner sits between topbar and panel content. Not an overlay. Pushes content down.

**Yellow alert banner (amber):**
```
[amber blink] Low cashflow detected — week of [date] · projected ฿X,XXX · take action now
```

**DEF CON 5 banner (red) — 3 parts:**

```
[red blink] ⚡ DEF CON 5 active since [date] · [N] days active · exits when 90d above ฿20k for 7 weeks  [view plan ›]
─────────────────────────────────────────────────────────────────────────────────────────────────────────
PART 1 · STATUS          │ PART 2 · YOUR ALLOWANCE      │ PART 3 · YOUR COMMITMENTS
─────────────────────────┼──────────────────────────────┼──────────────────────────────
Since [date]             │ Day limit  ฿738/day           │ → Get Pilates ฿30k by 15 Jun
[N] days active          │ Week limit ฿5,167/wk          │   earned ฿0 · 18d left ⚡
Expires when data clears │ Used this week ฿3,200         │ → Janis presale ฿20k by 30 Jun
2 on hold · 1 intent     │ Left this week ฿1,967 ✓       │   earned ฿0 · 33d left
3 committed actions      │ Bills next 7 days:            │ → Asset sale ฿50k by 31 Jul
Carry owed ฿135,000      │ ฿14,000 Tisco · 5th           │   earned ฿0 · backup
                         │ ฿12,750 Thai credit · 25th    │ Week target ฿5,167
                         │                               │ This week ฿0 · 0% · behind ⚡
```

Part 2 — allowance calculation:
```
daily_allowance = (gap_to_close / strategy_period_days)
week_allowance = daily_allowance * 7
used_this_week = sum of expense transactions this calendar week
left_this_week = week_allowance - used_this_week
bills_next_7_days = liabilities with payment_due_date within 7 days
```

Part 3 — action tracking:
Each action shows: name · target amount · by date · earned so far · days remaining.
`earned so far` = sum of income transactions since strategy start date
  where transaction category matches action intent OR all income if untagged.
Heartbeat blink speed increases as deadline approaches and earned < target:
- >14 days left: slow blink (2s)
- 7-14 days: medium blink (1s)  
- <7 days and behind: fast blink (0.5s) + ⚡ icon

### Execute modal (Screen 3)

Opens when owner clicks `⚡ Activate DEF CON 5` button.

Sections:
1. On hold this period (delayed — not cancelled)
2. Intent committed (replaces budget in forecast)
3. Carry debt that will accumulate (carry-type budgets × months × amount)
4. Income target calculator:
   - Safety reserve floor: shown as `฿20,000` (hardcoded, shown as info not editable)
   - Gap to close = total needed to stay above floor
   - Must earn per month / week / day (auto-calculated)
   - Earned so far this week (live from transactions)
5. Committed actions list with dates
6. [Cancel] [Confirm — activate DEF CON 5 now]

On confirm:
- Write `active_strategy` to KV with full ticket data
- Apply onHold and intent restrictions immediately
- Banner appears on Dashboard, Expenses, Cashflow
- Entry drawer enforces restrictions

### Entry drawer enforcement

When DEF CON active, entry.injector.js budget select must:
- Show available budgets normally with remaining amount
- Show reduced budgets with warning `฿X,XXX left (intent set)`
- Collapse on-hold budgets under: `▾ N budgets on hold — tap to see`
- Expanded on-hold items show: budget name + `on hold · [period] · carry debt`
- On-hold items are NOT selectable (pointer-events: none, opacity 0.5)

Add a `GET /api/active-strategy` endpoint that returns the KV value.
Entry drawer calls this on init. Cache result in module variable.

### DEF CON exit condition

Checked daily on panel open (compare last check date in KV):
```
1. Build 90-day forecast using GROSS budget amounts (not intents, not on-hold)
   This is the honest test — can the full dream budget be sustained?
2. Find lowest balance in 90-day window
3. If lowest >= 20,000 for 7 consecutive weeks:
   → Set status to 'warning' for 1 week
   → Show amber banner: "DEF CON 5 may lift — monitoring 7 more days"
4. If warning sustained for 7 more days:
   → Set status to 'lifted'
   → Log ticket close date + duration + lowest balance reached
   → Banner disappears
   → Carry debt items appear as priority budget cards to repay
5. If balance drops below 20,000 during warning:
   → Return to 'active' immediately
   → Log regression
```

---

## PART 5 — LIST VIEW

List view unchanged from current implementation.
Do not modify list view behavior.

---

## WHAT NOT TO TOUCH

- `public/index.html` — do not modify
- `entry.injector.js` — only add API call for active-strategy check
  and budget select enforcement. Nothing else.
- All other injector files — do not touch
- All existing API files except: add `functions/api/active-strategy.js` (new, GET only)
- Airtable table structures — do not rename or remove fields
- The `backlog_type` field on Budgets: CC reads it, never creates it
  (owner sets it manually in Airtable)

---

## NEW FILES TO CREATE

1. `functions/api/active-strategy.js` — GET returns KV `active_strategy` value
   POST updates KV `active_strategy` value (for execute plan)

---

## CLOSING STEPS — MANDATORY

1. Move this file → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — Cashflow complete redesign: forecast engine + DEF CON firewall`

2. Update `PROJECT_STATE.md`:
   - Mark Fix 9B5 ✅ COMPLETE
   - Update FILE INVENTORY: add `functions/api/active-strategy.js`
   - Update CURRENT STATE: describe complete cashflow system

3. Prepend to TOP of `RULES.md` (next L-numbers):
   - Cashflow: all card amounts must prorate via prorateAmount() — never raw budget.amount
   - Cashflow: buildForecast() is single source of truth — never calculate balance elsewhere
   - DEF CON: firewall runs on every buildForecast() completion — never manually triggered
   - DEF CON: exit test uses GROSS budget amounts not intents — honest test only
   - Carry debt: backlog_type field on Budgets — 'carry' accumulates, 'forgive' disappears
   - Simulation state: persists in CF module object — never localStorage for simulation

4. Commit order:
   ```
   feat(cashflow): complete forecast engine with correct proration
   feat(cashflow): all card types — debt, budget, income, presale, borrow
   feat(cashflow): drag-to-reorder cards within sections
   feat(cashflow): X-days due window tool with P1/P2 priority
   feat(cashflow): simulation mode — on hold, intent, action plan
   feat(cashflow): DEF CON 5 firewall — auto trigger, 3-part banner, exit condition
   feat(cashflow): carry debt tracking for non-neglectable budgets
   feat(entry): budget select enforcement under DEF CON 5
   feat(api): active-strategy endpoint for KV read/write
   docs: update PROJECT_STATE and RULES after fix9B5
   ```

5. Branch: `feat/9b5-cashflow-complete`
6. Create PR to main
7. Report: list all files changed with line counts
8. Wait for owner QA before merging

---

## ADDENDUM — 3 CRITICAL POINTS (added after initial review)

### POINT 1 — Parallel data fetch + debt booking (REQUIRED)

Fetch ALL of these in parallel on every panel init. Missing any one makes forecast wrong:

```javascript
const [txData, budgetData, liabilityData, syncData, strategyData] = await Promise.all([
  fetch('/api/transactions').then(r => r.json()),
  fetch('/api/budgets?active_only=true').then(r => r.json()),
  fetch('/api/liabilities').then(r => r.json()),
  fetch('/api/cashflow-sync').then(r => r.json()),
  fetch('/api/active-strategy').then(r => r.json())
]);
CF.currentBalance = syncData.balance;
CF.transactions   = txData.records;
CF.budgets        = budgetData.records;
CF.liabilities    = liabilityData.records;
CF.defcon         = strategyData?.active ? strategyData : null;
```

Debt payback MUST be booked as projected expense on payment_due_date of each month:

```javascript
function buildDebtOutflows(liabilities, forecastStart, forecastEnd) {
  const outflows = [];
  liabilities.forEach(lib => {
    if (!lib.monthly_payment || lib.monthly_payment <= 0) return;
    const dueDay = lib.payment_due_date || 5;
    let cursor = new Date(forecastStart.getFullYear(), forecastStart.getMonth(), 1);
    while (cursor <= forecastEnd) {
      const payDate = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);
      if (payDate >= forecastStart && payDate <= forecastEnd) {
        outflows.push({
          date: payDate,
          amount: -lib.monthly_payment,
          label: lib.name,
          type: 'debt',
          isProjected: true,
          canMove: false
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  });
  return outflows;
}
```

buildForecast() must call buildDebtOutflows() and include result in day-by-day balance.

---

### POINT 2 — Period view amount rule

Card amount shown = total commitment for the ENTIRE viewing window (not just 1 month):

```
1M view: card shows monthly amount      (annual ÷ 12)
3M view: card shows monthly × 3         (3 months of that budget)
6M view: card shows monthly × 6         (6 months of that budget)
```

The chart projects the same window. Card amount and chart use identical prorated value.
prorateAmount() must be called for BOTH card display AND forecast calculation.
Never use raw budget.amount anywhere in display or calculation.

---

### POINT 3 — Date-specific spending rule

Every projected spend has a booking date rule. Priority order:

```
1. DEBT payments:
   Book ONLY on payment_due_date — no spreading, no negotiation
   canMove: false
   Only moveable via explicit "delay payment" action in simulation strategy
   If payment_due_date missing: default to 5th of month

2. BUDGET with intent set:
   Book on intent date specified by owner
   Amount = intent amount (not budget amount)
   canMove: false unless owner changes intent

3. BUDGET without intent:
   Spread evenly across the month as daily burn
   daily_burn = monthly_prorated_amount / days_in_month
   Applied as continuous daily outflow in forecast

4. MOVE DATE — only allowed via simulation strategy action
   Owner clicks "move date" on a debt card in simulation
   Creates a strategy entry type: 'delay'
   Shifts that payment's date forward N days in forecast only
   Does NOT change Airtable data
```

Never auto-move or auto-spread debt payments. Fixed date = fixed date.

---

### POINT 4 — Daily burn rate formula (CRITICAL — previous implementations got this wrong)

```
CORRECT:   daily_burn = monthly_prorated_amount / total_days_in_month
WRONG:     daily_burn = monthly_prorated_amount / days_remaining_in_month
```

The daily burn rate is FIXED from day 1 to the last day of the month.
It never changes mid-month regardless of when the calculation runs.
May has 31 days → every day burns monthly÷31. Always. Non-negotiable.

---

### POINT 5 — Balance sync always available (even during DEF CON 5)

The cashflow sync button `[edit]` that lets owner input real bank balance
MUST remain fully functional and visible at all times.
DEF CON restrictions NEVER lock, hide, or disable the sync function.
Syncing real balance recalculates forecast from that date forward.
Everything before sync date = history. Everything after = recalculated from new real number.

---

### POINT 6 — Three budget types for forecast booking (NOT just one proration rule)

Budgets table needs one new field: `period_due_day` (integer, day of month 1-31).
CC reads this field. Owner sets it manually in Airtable. CC does not create UI for it.

**Type A — Standard budget (no due day, no same-day start/end)**
Example: Food restaurant, Fuel, Coffee
Rule: Prorate to monthly via prorateAmount(). Spread as daily burn across month.
daily_burn = monthly_prorated / total_days_in_month (fixed rate)

**Type B — One-day bound budget (start_date === end_date)**
Example: Car insurance annual (paid once on specific date)
Rule: Book FULL budget amount on start_date ONLY. No proration. No daily spread.
If start_date is outside the current forecast window → does not appear.
If start_date is inside window → books full amount on that exact date.

**Type C — Force pay date budget (period_due_day is set)**
Example: iCloud subscription, Anthropic tokens, Netflix
Rule: Book full monthly amount on period_due_day of each month in forecast window.
Behaves exactly like debt — fixed date, full amount, no spreading.
If period_due_day = 5 → books on 5th of May, 5th of June, 5th of July etc.
Cannot be prorated or spread. Can only be moved via simulation delay strategy.

**Detection logic:**
```javascript
function getBudgetType(budget) {
  if (budget.start_date && budget.end_date &&
      budget.start_date === budget.end_date) return 'one-day-bound';
  if (budget.period_due_day) return 'force-pay';
  return 'standard';
}
```

**Booking in buildForecast():**
```javascript
budgets.forEach(budget => {
  if (CF.simulation.onHold[budget.id]) return; // skip if on hold
  const type = getBudgetType(budget);
  const intentAmount = CF.simulation.intents[budget.id];

  if (type === 'one-day-bound') {
    // Book full amount on start_date if within window
    const payDate = new Date(budget.start_date);
    if (payDate >= windowStart && payDate <= windowEnd) {
      addOutflow(payDate, -(intentAmount || budget.amount), budget);
    }
  } else if (type === 'force-pay') {
    // Book on period_due_day of each month in window
    let cursor = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
    while (cursor <= windowEnd) {
      const payDate = new Date(cursor.getFullYear(), cursor.getMonth(), budget.period_due_day);
      if (payDate >= windowStart && payDate <= windowEnd) {
        const monthly = prorateAmount(budget, '1M');
        addOutflow(payDate, -(intentAmount || monthly), budget);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    // Standard — daily burn spread
    const monthly = prorateAmount(budget, '1M');
    const daysInMonth = new Date(windowStart.getFullYear(), windowStart.getMonth() + 1, 0).getDate();
    const dailyBurn = monthly / daysInMonth; // FIXED RATE — never divide by days remaining
    // Apply dailyBurn to each day in window
    let day = new Date(windowStart);
    while (day <= windowEnd) {
      addOutflow(new Date(day), -dailyBurn, budget);
      day.setDate(day.getDate() + 1);
    }
  }
});
```

---

### POINT 7 — Action plan inputs are free text (not hardcoded)

The action plan in simulation (What · Target ฿ · By when) is:
- Free text input fields — owner types anything
- NOT dropdown, NOT predefined options
- Future enhancement: connect to Sales or Projects module when available
- For now: simple text + number + date inputs

Actions earn tracking: sum ALL income transactions since strategy start date.
If owner later connects a sale or project to an action, that is a future feature.
For now: total income booked after strategy start = progress against all actions combined.
