# RULES-dom.md — Chaijohn OS
> Domain: Panel init patterns, DOM scope, Chart.js, input types, shell/injector patterns
> Load this file when: building or debugging any panel injector, chart, or shell interaction
> Last updated: 2026-06-04

---

L098  M3.3 Hard Assets: each card must have a Delete button. Ghost records (blank name) show
      Delete-only (no Edit/Sell). Delete calls DELETE /api/hard-assets/:id (soft delete → status=Disposed).
      Client-side: confirm dialog, then filter allAssets in memory, call renderPanel().

L047  Collapse+summary pattern: default collapsed, show 1-line summary above toggle, guard with `_utilToggleInit` flag to prevent double-bind
L046  Chart.js in grid: add `min-width:0` to ALL direct grid children containing charts — prevents overflow beyond column
L045  Panel injector init: TWO checks — (1) `panelactivated` listener for future nav, (2) immediate `if panel.classList.contains('active')` at IIFE parse time for direct hash nav
L044  Toggle groups: query buttons by their EXACT CSS class — `.range-btn` and `.period-btn` are different; check HTML before writing toggle logic
L043  Entry drawer: embed full form HTML in shell — entry.injector.js binds by ID, always in DOM, no changes needed; `--nav-height:0px` in shell tokens
L042  CSS compat bridge: re-declare `.btn .card .tabs .tab-btn .period-toggle .modal` etc inside shell `<style>` using shell tokens — do not import global.css
L041  Per-panel IIFE injectors: lazy init via `panelactivated` event — never init charts when panel is `display:none`
L040  Sidebar always-dark: re-declare dark token values on `#sidebar` directly — never hardcode colors, use token override
L039  Sidebar shell auth: inline script handles full auth lifecycle — do NOT load auth.js; call `/api/auth/check` on load, show overlay by default

L158  BuyPay ghost items: auto-surfaced from Liabilities.payment_due_day and
      Budgets.period_due_day within window (today-30d to today+21d). Ghost items
      are never stored until owner clicks Book. Skip hides for session only.
      Each ghost shows a period label: OVERDUE, DUE TODAY, DUE SOON, or UPCOMING.

L157  high_impact items blink red (tm-blink animation) until done=true.
      They accumulate across days — never filter out overdue high_impact items.
      They appear in Flow strip regardless of schedule_time.

L156  Project task sync — bidirectional:
      DONE: clicking done on DailyItem (source=project) → PATCH /api/project-tasks/{project_task_id}
            status=Done. If project_task_id missing or PATCH 404s → skip silently (task was
            deleted from project side). Done on ProjectTask side is handled by M3.4 injector —
            TM panel does not listen for that direction.
      DELETE: clicking delete on DailyItem (source=project) → DELETE /api/project-tasks/{project_task_id}
              first, then DELETE /api/daily-items/{id}. If project DELETE fails → still delete
              DailyItem (orphan cleanup). Confirm dialog: "Delete from both Time Management and
              Project? This cannot be undone."
      INJECTION: one-time per task. New tasks added to ProjectTasks auto-inject on next TM
                 panel load. Already-injected tasks (project_task_id exists in items[]) are
                 never re-injected.
      FALLBACK: if a DailyItem with source=project has no matching project task (user deleted
                from project panel without TM knowing) — it stays in DO list with a ⚠ icon
                appended to title. Owner can manually delete it.

L155  DailyItems done=true on BuyPay: POST to Transactions with description='book from task',
      date=today (override any target date), source=Manual, budget_id from item.budget_id.
      Set booked=true on DailyItems record after successful booking.

L154  Time Management panel: route=timemanagement, panel=#panel-timemanagement,
      injector=timemanagement.injector.js. DailyItems table stores all personal tasks.
      Project tasks are injected on load — never duplicated (check project_task_id first).
      Routine types — two completely separate types:
      Type A = Flow Routine: pane=Schedule, schedule_type=Routine, NO date.
               Shows in Flow strip only. No done button. Not measured. Not in KPI.
               Created from ⚙ Routine modal only. End time optional.
      Type B = Period Schedule: pane=Schedule, date set, period_end set.
               Shows in Schedule pane AND Flow strip. Done = daily hit logged in hit_log.
               KPI Schedule Hit counts Type B hits for today from hit_log field.

L159  Schedule entry validation — 4 valid states only:
      (1) date only = all-day event
      (2) start_time + date = instance
      (3) start_time + end_time + date = instance with duration
      (4) start_time + date + period_end = Type B period schedule
      Invalid (block save with inline error):
        start_time without date → "Start time requires a date"
        period_end without date → "End date requires a start date"
        period_end < date       → "End date must be after start date"
        period_end without start_time → "Period schedule requires a start time"

L160  Type B done = daily hit only. Stored as JSON date array in hit_log field (multilineText).
      Double-click safe: check log includes today before appending.
      Client resets daily: isTodayDone() checks hit_log for Type B, item.done for all others.
      done field is NOT set on Type B items — only hit_log and done_at are updated.
      PATCH body for Type B hit: { hit_log: JSON.stringify(log), done_at: todayStr }
      period_end field is date type. hit_log is multilineText type in Airtable.

L025  Chart.js view toggle: store mode in module-level var, render function branches on mode, destroy/recreate chart each render
L016  Chart.js v4 inline plugins: use top-level `plugins:[]` array in config — do NOT use `Chart.register()` for one-off plugins
