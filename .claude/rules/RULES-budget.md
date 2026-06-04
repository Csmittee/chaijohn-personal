# RULES-budget.md — Chaijohn OS
> Domain: M2.5 Budget panel (route: budget, panel: panel-budget)
> Load this file when: working on budget-panel.injector.js or /api/budgets
> Last updated: 2026-06-04

---

L037  Category uniqueness: POST /api/categories checks case-insensitive name match before create — returns 400 if duplicate

L026  Budget period normalisation: Annual÷12 for monthly display, show "Annual" badge — One-time only if today within start_date–end_date

L022  UI naming: call `group` field "Category", call `name` field "Item Name" — never expose Airtable field names in UI

L020  One-time budget filter: use Airtable formula with date-range AND period check — pass `?active_only=true`
