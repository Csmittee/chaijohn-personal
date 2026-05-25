✅ COMPLETE — 2026-05-25 — F1 category group 422 fix, F2 debts liability→Income tx, F3 transaction DELETE endpoint + delete button, F4 budget meter active/period filter fix, F5-F6 dashboard graph train (horizontal scroll) + dynamic content zone (T1 Cashflow/T2 Expense/T3 Debt/T4 Annual Plan). All committed directly to main.

# CC_PROMPT_fixF_bugfixes-dashboard-structure

Before writing any code, read fresh from repo:
- masterseed.md
- lessons_learned.md
- public/assets/js/dashboard.injector.js
- public/assets/js/entry.injector.js
- public/dashboard.html
- functions/api/categories.js
- functions/api/debts.js
- functions/api/transactions.js
- functions/api/liabilities.js

Summarize what you understand about each file before proceeding.
Execute all fix groups in order. Commit after each group.
Branch: main — commit directly. Merge to main before ending session.

═══════════════════════════════════════════════════════
CONTEXT — PAGE STRUCTURE (read this first)
═══════════════════════════════════════════════════════

The dashboard has exactly TWO zones:

GRAPH ZONE (top):
- One horizontally scrollable row containing T1, T2, T3, T4 panels
- User swipes/scrolls LEFT-RIGHT to see all 4 charts
- Height is fixed — no vertical movement in this zone
- All 4 panels remain as charts — T4 stays as a chart panel

CONTENT ZONE (bottom):
- Vertically scrollable area below the graph zone
- Content REPLACES entirely when user clicks a different T panel
- Default on page load: T1 content is shown
- No horizontal scrolling in content zone

Period toggle buttons (1M / 3M / 6M / 12M) are shared UI
but their MEANING differs per active panel — see each fix below.

═══════════════════════════════════════════════════════
FIX F1 — BUG: Category 422 error on new group name
═══════════════════════════════════════════════════════
File: functions/api/categories.js

PROBLEM: ensureGroupChoice() PATCH body sends existing choices as
{ id, name, color } — if color is undefined for any choice, Airtable
rejects the entire PATCH with 422.

FIX: Change the existing choices mapping to send ONLY { name }:
  choices: [
    ...existingChoices.map(c => ({ name: c.name })),
    { name: groupValue }
  ]

Remove id and color from the mapping entirely.
No other changes to this file.

═══════════════════════════════════════════════════════
FIX F2 — BUG: New liability must create cash-in transaction
═══════════════════════════════════════════════════════
File: functions/api/debts.js

PROBLEM: Creating a new liability records the debt but does NOT
create a corresponding Income transaction. Loan received = cash IN.

FIX: After successfully creating the liability record in Airtable,
also create a Transaction record:
  - date: today (new Date().toISOString().split('T')[0])
  - type: 'Income'
  - amount: body.loan_size (if provided and > 0)
  - description: 'Loan received — ' + creditor_name
  - source: 'LiabilityCreation'
  - entity: creditor_name

To create the transaction, POST to Airtable Transactions table
directly (same BASE_ID, table name 'Transactions') using
createRecord from _airtable.js.

Only create the transaction if loan_size > 0.
If transaction creation fails, still return the liability record
successfully — do not roll back. Log the error to console only.

═══════════════════════════════════════════════════════
FIX F3 — BUG: Add DELETE to transactions + delete button in UI
═══════════════════════════════════════════════════════
Files: functions/api/transactions/[id].js (create if not exists)
       public/assets/js/entry.injector.js

PART A — API:
Check if functions/api/transactions/[id].js exists.
If it has PATCH but no DELETE, add DELETE handler:
  export async function onRequestDelete(context) {
    const { env, params } = context;
    const id = params.id;
    // DELETE from Airtable
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Transactions/${id}`,
      { method: 'DELETE',
        headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
    );
    if (!res.ok) return errorResponse('Delete failed', res.status);
    return jsonResponse({ deleted: true });
  }

PART B — UI in entry.injector.js:
In showEditForm(), add a delete button next to Save and Cancel:
  <button class="btn ef-delete" data-id="${txId}"
    style="flex:1;font-size:0.82rem;padding:0.3rem;
    background:#ef4444;color:white;border:none;border-radius:var(--radius);
    cursor:pointer">🗑 Delete</button>

Wire the delete button:
  row.querySelector('.ef-delete').addEventListener('click', async () => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await api(`/api/transactions/${txId}`, { method: 'DELETE' });
      loadTransactions();
    } catch (err) {
      // show error in ef-msg
    }
  });

═══════════════════════════════════════════════════════
FIX F4 — BUG: Budget meters showing wrong/missing budgets
═══════════════════════════════════════════════════════
File: public/assets/js/dashboard.injector.js

PROBLEM: budgetMatchesPeriodFilter() excludes budgets where
b.active is undefined (Airtable sometimes omits the field when true).

FIX in renderMeters():
Change: budgets.filter(b => b.active !== false && budgetMatchesPeriodFilter(b))
To: budgets.filter(b => b.active !== false && b.active !== 0 && budgetMatchesPeriodFilter(b))

Also fix budgetMatchesPeriodFilter() — period field may come back
from Airtable as undefined for older records. Treat undefined as 'Monthly':
  function budgetMatchesPeriodFilter(b) {
    const period = b.period || 'Monthly';
    if (meterPeriodFilter === 'all') return true;
    if (meterPeriodFilter === 'monthly') return period === 'Monthly';
    if (meterPeriodFilter === 'annual') return period !== 'Monthly' && period !== 'One-time';
    if (meterPeriodFilter === 'onetime') return period === 'One-time';
    return true;
  }

═══════════════════════════════════════════════════════
FIX F5 — DASHBOARD STRUCTURE: Graph zone horizontal scroll
═══════════════════════════════════════════════════════
Files: public/dashboard.html + public/assets/css/global.css

CURRENT: T1/T2/T3 are in a flex row. T4 is somewhere else.

TARGET: All 4 panels (T1, T2, T3, T4) in one horizontally
scrollable container. Page frame does not move.

HTML structure for graph zone:
  <div id="graph-zone">
    <div id="graph-train">
      <div class="graph-panel" id="t1-panel" data-panel="t1">...</div>
      <div class="graph-panel" id="t2-panel" data-panel="t2">...</div>
      <div class="graph-panel" id="t3-panel" data-panel="t3">...</div>
      <div class="graph-panel" id="t4-panel" data-panel="t4">...</div>
    </div>
  </div>

CSS for graph zone:
  #graph-zone {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    border-bottom: 1px solid var(--border);
  }
  #graph-train {
    display: flex;
    flex-direction: row;
    gap: 1rem;
    padding: 1rem;
    min-width: max-content;
  }
  .graph-panel {
    width: 420px;          /* fixed width per panel */
    min-width: 320px;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .graph-panel:hover { border-color: var(--color-primary); }
  .graph-panel.active { border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
  .graph-panel canvas { height: 180px !important; }

On mobile (< 768px): panel width = 85vw so user can see edge of next panel.

Each panel header shows: title + small subtitle. Canvas height: 180px fixed.
Clicking a panel: adds .active class to that panel, removes from others,
then calls loadContentZone(panelId).

═══════════════════════════════════════════════════════
FIX F6 — DASHBOARD STRUCTURE: Content zone with T1/T2/T3/T4 views
═══════════════════════════════════════════════════════
File: public/assets/js/dashboard.injector.js + public/dashboard.html

CONTENT ZONE HTML (below graph zone):
  <div id="content-zone">
    <div id="content-controls">
      <!-- period filter + view toggles rendered here by JS -->
    </div>
    <div id="content-body">
      <!-- content rendered here by JS -->
    </div>
  </div>

CSS:
  #content-zone {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }
  #content-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

On page load: call loadContentZone('t1') automatically.

PERIOD FILTER (shared UI, different meaning):
  Buttons: [1M] [3M] [6M] [12M]
  Stored in: let contentPeriod = '1m';
  T1: rolling forward from today
  T2: rolling backward from today
  T3: rigid Jan–Dec of selected year (show year selector instead of period)
  T4: rigid Jan–Dec of selected year (same year selector)

── T1 CONTENT VIEW ──
Title: "Cashflow Breakdown"
Period: rolling forward (same as T1 chart period)

Fetch transactions for the period.
Group into two sections:

CASH IN section:
  - All transactions where type = 'Income' AND source != 'LiabilityCreation'
    → label: income/sales entries
  - All transactions where source = 'LiabilityCreation'
    → label: "Loan received — [entity]"
  Show each as a row: date | description | entity | +฿amount (green)
  Section total at top: "Cash In: ฿X"

CASH OUT section:
  Sub-group A — True Expenses:
    transactions where type = 'Expense' AND source != 'LiabilityPayment'
    Show each row: date | category | description | -฿amount (red)
  Sub-group B — Loan Paybacks:
    transactions where source = 'LiabilityPayment'
    Show each row: date | liability name | -฿amount (orange)
  Sub-group C — Project Funding: (placeholder)
    Show: "฿0 — No project funding recorded yet"
  Section total: "Cash Out: ฿X"

Net at bottom: "Net: ฿X" (green if positive, red if negative)

Toggle: [Row view] [Card view]
Row view: compact list as described above
Card view: each item as a small card with same fields

── T2 CONTENT VIEW ──
Title: "Expense Intelligence"
Period: rolling backward from today

Toggle buttons (filter the content below, also changes chart):
  [All] [Pure Expense] [Loan Payback] [Project Funding]

For the selected filter, show budget comparison cards:
  Each card: budget label | category | budget amount |
             actual spent this period | % used | meter bar
  Color: green < 80%, amber 80-100%, red > 100%
  Sort: by % used descending (worst discipline first)

Also show:
  "Unbudgeted expenses" section — transactions with no budget match
  These are surprise spends — show as amber cards with ⚡ icon

Summary line: "X budgets over limit · Y unbudgeted items · Total spent ฿Z"

── T3 CONTENT VIEW ──
Title: "Debt Overview"
Period: rigid Jan–Dec (show year selector: [2025] [2026])

One card per liability:
  Card shows: name | creditor type | original loan | current balance |
              interest rate | monthly payment | % paid off bar
  Click card to expand: show last 6 payments with date + amount
  Sort: by current_balance descending

Summary: "Total debt: ฿X across N loans | Monthly obligation: ฿Y"

── T4 CONTENT VIEW ──
Title: "Annual Financial Plan"
Period: rigid Jan–Dec (same year selector as T3)

Four sections, each collapsible:

INCOME PLAN:
  All Earn-type categories with their budget vs actual YTD
  Each row: category | budget/month | months elapsed |
            expected YTD | actual YTD | variance

EXPENSE PLAN:
  All Expense-type budgets vs actual YTD
  Same row format

LOAN OBLIGATIONS:
  All active liabilities | annual payment obligation | paid YTD | remaining

PROJECT FUNDING: (placeholder)
  "No projects defined yet — coming soon"

Grand summary: Total expected in | Total expected out | Net plan | Actual net YTD

═══════════════════════════════════════════════════════
COMMIT INSTRUCTIONS
═══════════════════════════════════════════════════════
Commit after each fix group:
  "fix(F1): category 422 — send only name in choices patch"
  "fix(F2): liability creation creates income transaction"
  "fix(F3): transaction delete API + UI button"
  "fix(F4): budget meter active field + period filter"
  "fix(F5-F6): dashboard graph train + content zone structure"

Branch: main — commit directly.
Do NOT create a new branch. If created, merge to main before ending.

After all fixes:
1. Move this file to docs/prompts/ stamped ✅ COMPLETE
2. Update masterseed.md — current state, phase status
3. Append new lessons to lessons_learned.md (next L-number after L024)
4. Commit: "docs: update after fixF"

List all files changed at end of response.
