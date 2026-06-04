# RULES-cashflow.md — Chaijohn OS
> Domain: M2.1 Cashflow panel (route: cashflow, panel: panel-cashflow)
> Load this file when: working on cashflow.injector.js, forecast engine, DEF CON 5, or simulation
> Last updated: 2026-06-04

---

L114  M2.1 cashflow list view: group by section (INCOME / EXPENSES / PROJECT FUNDING) with
      collapsible headers + section totals. Collapsed state stored in _cfListCollapsed module var.
      Same pattern as card view sections. Default all expanded.

L107  Cashflow M2.1 display must never filter by source or budget_id — show ALL transactions.
      The cashflow init() must call loadAndRender() on EVERY panelactivated event, not just on first init.
      One-time DOM setup (CSS injection, toggle bindings) stays inside the initialized guard;
      loadAndRender() is called unconditionally after the guard so fresh data is fetched every navigation.

L049  Cashflow simulation: ghost line = original forecast (dashed), solid = simulated — never mutate original txData or stats for simulation; offset only

L048  Parallel fetch pattern for card view: budgets + liabilities + projects fetched simultaneously with Promise.allSettled — never block on one fetch
L048b cashflow-sync API uses `amount` field (not `balance`) — injector must send `{ amount, date }` on POST and read `syncPoint.amount` on GET
L048c Cut-button delegation: attach once in init() on the permanent zone element — never add per-render to avoid listener accumulation

L053  Cashflow: all card amounts must prorate via prorateAmount() — never use raw budget.amount for display or forecast
L053b Cashflow: buildForecast() is the single source of truth — never calculate running balance anywhere else
L053c Cashflow: 3 budget types — standard (daily burn fixed per calendar month), one-day-bound (lump on start_date), force-pay (lump on period_due_day each month)
L053d Cashflow: daily_burn = monthly_prorated / total_days_in_month (fixed rate) — NEVER divide by days remaining
L053e Cashflow: debt payments booked only on payment_due_day — no spreading, default 5th if missing
L053f DEF CON: checkFirewall() runs after every buildForecast() completion — never manually triggered
L053g DEF CON: exit test uses GROSS budget amounts (no intents, no on-hold) — honest test only
L053h Carry debt: budget backlog_type field — 'carry' accumulates as family debt, 'forgive' disappears; default 'forgive' if missing
L053i Simulation: state persists in CF module object — never localStorage; dies on panel nav or Reset
L053j Cashflow: active-strategy GET/POST uses KV key 'active_strategy' — not cashflow_sync

L023  Liability cashflow direction: loan received=Income tx, loan payment=Expense tx — both non-fatal (try/catch)
