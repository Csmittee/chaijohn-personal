# RULES-budget.md — Chaijohn OS
> Domain: M2.5 Budget panel (route: budget, panel: panel-budget)
> Load this file when: working on budget-panel.injector.js or /api/budgets
> Last updated: 2026-06-11

---

L211  Budget saveBatchChanges() must use sequential for...of loop — never Promise.allSettled for writes.
      Delay 210ms between each request. Update Save button text to "Saving… X / N" after each call.
      Individual failures are logged and counted — loop continues. Final flash shows total failures if any.
      isSaving guard prevents double-submit. Pattern applies to any injector batch-write function.

L153  Budget panel default period = FY (financial year Jan–Dec). Never default to rolling.
      FY ensures Jan is always visible. loadAndRender() sets start = currentYear + '-01-01' when graphPeriod === 'fy'.

L152  Earn rows in budget grid are always read-only. No inputs in edit mode.
      Earn is owned by M2.2 — budget panel is display only for earn section.

L151  Actual expense cell save: check txData in memory for existing tx with same
      budget_id + month before POSTing. If found → PATCH existing. Never create duplicates.

L150  Budget per-month override: saving a single month cell POSTs a NEW budget record
      with start_date = end_date = that month. Never PATCHes the base record.
      Base record is permanent — only Budget/mo column PATCH touches it.

L149  Budget grid month priority: when multiple budget records share same label+category
      and cover the same month, render the one with the shortest date range (most specific).
      Spanning base record = default. Single-month override = takes priority for that month only.

L037  Category uniqueness: POST /api/categories checks case-insensitive name match before create — returns 400 if duplicate

L026  Budget period normalisation: Annual÷12 for monthly display, show "Annual" badge — One-time only if today within start_date–end_date

L022  UI naming: call `group` field "Category", call `name` field "Item Name" — never expose Airtable field names in UI

L020  One-time budget filter: use Airtable formula with date-range AND period check — pass `?active_only=true`
