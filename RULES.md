# RULES.md — Chaijohn OS
> Universal rules — apply to every session regardless of module.
> Newest first. CC reads this every session.
> For module-specific rules: load .claude/rules/RULES-[domain].md

---

L170  Dashboard asset leverage = market_value ÷ cost_basis shown as multiplier (X.Xx).
      Not a percentage. House example: 7M ÷ 2.9M = 2.41×.

L169  Dashboard South row: House, Car, Family/Friends, +slot. Family/Friends = amber dashed,
      no-interest but visible obligation. New liabilities always added to South row.

L168  Dashboard earn = Income transactions excluding LiabilityCreation source.
      Total revenue is NOT the correct measure for KPI cell 1. Business revenue→profit
      separation is a future task.

L167  Dashboard KPI strip: 5 cells — Income sufficiency, Expense discipline, Liability load,
      Asset leverage, Project conversion. Order and color locked. Do not reorder.

L166  Dashboard business nodes: 4 nodes (i-Flex, Daje, Satu, Ploikong). Toggle active/inactive
      in JS memory only — no Airtable write. Active state = animated earn trace to M2.2.

L165  Dashboard M1.0: circuit board compass layout — North=biz, West=M2.1 boundary
      (M2.2 top + M2.3 bottom), East=M3 assets, South=YOU liabilities. Counter-clockwise flow.
      SVG viewBox: 0 0 680 490. Pure vanilla JS, no Chart.js.
L171 — CC file read: if github get_file_contents returns token exceeded error, skip that file immediately. Never retry or chunk-read. Use existing context and proceed.
---

L148  Doc system: RULES.md = universal only. Domain rules live in .claude/rules/RULES-[domain].md.
      CC loads CLAUDE.md + RULES.md every session. Loads domain file only when working on that module.
      RULES-archive.md = L001–L060j pre-9C rules — CC reads only when explicitly instructed.

L147  Panel header integrity: any injector that uses p.innerHTML = renderPanel()
      overwrites the full panel div including index.html header. The panel header
      (title h2 + subtitle) MUST be rendered inside renderPanel() itself.
      Never assume index.html header survives after injector runs.
      When writing or reviewing any injector — always confirm header is in output.

L133  Data entry inputs: NEVER use type="number". Always use type="text" inputmode="numeric" pattern="[0-9.]*".
      Browser spinners waste space and are never needed. User types values directly.
      Apply to all existing and future injectors. No exceptions unless explicitly specified.

---

## PANEL INIT & DOM SCOPE

L083  Always render section empty states — never hide entire sections when data
      is empty. Owner needs to see the section exists even with no data. Use a clear
      instructional empty state: "No X yet. To add: go to Y → do Z."

L082  /api/projects returns { records: [] } where each record is ALREADY FLATTENED
      ({ id, name, type, ... }) — not raw Airtable { id, fields: {} } shape. Do NOT
      re-spread r.fields on consumer side. Use `data.records || []` directly.
      Any paginated Airtable endpoint wrapped in jsonResponse follows this shape.

L081  var(--accent) is NOT defined in chaijohn-core theme — it resolves to nothing.
      Use `var(--yellow)` (#f5c518) for all interactive highlights, active states, and
      primary buttons. Never use var(--accent) in injector files.

L080  Active button text color: always set explicit `color:#0a0a10` when button
      background is var(--yellow), white, or any light color. Never use `color:#000` or
      `color:var(--text)` — the text variable is light on dark theme. Always use #0a0a10.

L079  Panel DOM scope: ALL innerHTML and style manipulation must use the specific
      panel element from `getElementById('panel-xxx')`. Never set `panel.style.cssText`
      with `display:flex/block` — this overrides the `.route-panel { display:none }` CSS
      and makes the panel permanently visible. Instead, add `#panel-xxx.active { display:flex; }`
      via ensureStyles() so visibility stays under class control.

L078  panelactivated route guard: ALWAYS guard the panelactivated handler with
      `if (e.detail !== 'route-name') return;` as the FIRST line. Never init or render
      without this guard — causes content to bleed into every panel on navigation.
      Guard already exists in all injectors — preserve it on every edit.

---

## SAVE / SUBMIT GUARDS

L070  Panel init must call panel.innerHTML = '' or set innerHTML to loading state before rendering. Clears any placeholder .coming-soon div left in HTML. Never append to placeholder.

L068  panelactivated event is dispatched on window (not document) with detail = route string (e.g. 'sales'). Always use window.addEventListener, match e.detail === routeString. Never check e.detail?.panelId.

L067  Harvest-before-add — call readDrawerData() before pushing new row. Re-render full innerHTML from state array (not +=). Prevents existing values from being lost when new row is added.

L066  POST dedup — case-insensitive name filter: LOWER({name})=LOWER("name"). Return 409 with existing_id if found. Injector handles 409 by showing inline error, keeping drawer open.

L065  isSubmitting guard on all save buttons. Set true on first click, disable all save buttons, show "Saving…". Re-enable only on error. Reset in finally block. Prevents duplicate records on slow Cloudflare cold start.

L064  Secondary auto-creates (phases, milestones, tasks, resources) must be individually wrapped in try/catch. Primary record save must ALWAYS return 201. Secondary failures log to console + return in warnings array. Never let a missing table block the primary save.

L063  403 from Airtable on table create/read = table does not exist, NOT a permissions error. Token is full access. Check table existence first. Call POST /api/setup/schema-projects to provision missing tables.
