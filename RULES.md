# RULES.md — Chaijohn OS
> Universal rules — apply to every session regardless of module.
> Newest first. CC reads this every session.
> For module-specific rules: load .claude/rules/RULES-[domain].md

---

L190 — Life Timeline life_score formula: normalize financial across dataset min/max to −10/+10.
        Normalize 1–10 fields to −10/+10. Weight: happiness×3, health×2, relationship×1.5,
        achievement weighted by a_impact, failure weighted by f_impact (negative). Clamp −10/+10.
        Recompute on every data load — never cache or store in Airtable.

L189 — Life Timeline entry view: spreadsheet-style grid, groups collapsible (Performance,
        Emotional, Hobby, Story). All numeric inputs use type="text" inputmode="numeric" (L133).
        Drag-fill down to copy value across rows. One batch Save All — never per-row saves.
        No spinner arrows. No single-field form modals.

L188 — Life Timeline connections: MindMapEdges.from_id and to_id can hold LifeTimeline
        record IDs as well as MindMapNode IDs. This is the universal connection system
        across time and the present moment. Never create a separate LifeConnections table.

L187 — Life Timeline panel: route=life, panel=#panel-life,
        injector=life.injector.js. Airtable table: LifeTimeline (year 1972–2037 pre-seeded).
        No life_score field in Airtable — computed client-side on every load.
        Connections to MindMapNodes use existing MindMapEdges table — no new connection table.

L186 — Utility billing month ≠ payment date: when auto-writing utility charges from a
        Transaction, always use the billing month (which period the bill covers), NOT the
        transaction date (when the owner paid). Bills are paid in arrears — paying June 5th
        is usually for May's electricity. The entry form shows a "Utility billing month"
        picker (defaults M-1) when electricity/water budget selected. Pass this date to
        autoWriteUtilityCharge(), not the raw transaction date.

L185 — SVG height="auto" is invalid: browsers reject it with "Expected length, auto".
        When an SVG uses viewBox + width="100%", omit the height attribute entirely —
        aspect ratio is controlled by viewBox. Never set height="auto" on SVG elements.

L184 — Budget dropdown filter: never use expense_only=true on the /api/budgets call
        from entry.injector.js. The expense_only filter requires category_type='Expense'
        which is only present if the budget has a category_id AND the enrichment succeeded.
        Budgets without a linked category are silently filtered out → empty dropdown.
        Use active_only=true only. All budgets in this system are expense budgets.

L183 — /api/kv endpoint is required for any front-end KV read/write: Worker bindings
        (env.CHAIJOHN_KV) are only accessible server-side. Client-side injectors call
        /api/kv?key=X (GET) and POST {key, value} via HTTP. The file
        functions/api/kv.js must exist — without it every KV call 404s silently and
        features that save layout positions, strategies, or node positions will reset
        on every page load with no error shown.

L182 — Airtable date field comparison: use DATESTR({field})='YYYY-MM-DD' NOT
        {field}='YYYY-MM-DD'. Plain string equality on a Date-type field returns 0
        records → upsert creates a duplicate row instead of updating. Always use
        DATESTR() when filtering by date field value. GET-side formulas should use
        date functions (YEAR, MONTH) or IS_SAME — never raw string match.

L181 — Utility auto-charge: when a Transaction is saved with a budget label containing
        "electric" or "water" → auto-write that amount to Utilities table for that month
        (electricity_charge or water_charge). Never overwrite existing non-zero values.
        Never auto-write units (kWh / litres). Always silent fail — never blocks transaction save.
        Match is case-insensitive on budget label (not category name).

L180 — Dashboard M3.4 project placement rule: if project record has business_id field set
        → render as solid active North circle (not East sub-node). business_id is set when
        owner clicks "launch" on a project. South entity circles are liability creators only.

L179 — Dashboard meter cards: use IDENTICAL HTML structure and CSS classes as
        expenses.injector.js top-4 card grid. No custom inline styles on meter cards.
        Labels/colors: Net worth (purple), Days to ฿0 (red), Total debt (amber), Project value (green).

L178 — Dashboard sub-asset circles (M3.3/M3.2/M3.4/MindMap) default position RIGHT of
        East boundary (x≈855). They inject left into Asset block right edge. All draggable.
        MindMap→M3.4: static dashed line only, no animation.

L177 — Dashboard liability 3 summary lines: ① Bank debt sum, ② F/F debt sum, ③ Owner ฿0.
        All sub-text in all 4 blocks: minimum 8px, fill=#9ca3af. Never dark-on-dark text.

L176 — Dashboard expense 3 branches: ① life drain exits bottom-left (no destination),
        ② interest lines go to HOUSE and CAR only — NO line to Family/Friends (zero interest),
        ③ owner invest line (orange #f97316) goes to Liability left-mid directly.
        This is the correct expense flow model — never merge these into one line.

L175 — Dashboard focus blink algorithm:
        earn < expense → blink "⚡ EARN TOO SMALL" near Earn block
        assetLeverage < 2.0 → blink "⚡ BUILD ASSETS" near Asset block
        liabBal > totalAssets × 0.5 → blink "⚡ DEBT HIGH" near Liability block
        earn >= expense AND surplus > 0 → blink "✓ SURPLUS" near YOU
        Animation: opacity 1↔0.1, 1.4s ease-in-out infinite. 8px monospace blink labels.

L174 — Dashboard draggable nodes: North circles + South circles + right-side sub-asset circles.
        ALL positions stored in nodePos{}. redrawCircuit() rebuilds full SVG innerHTML on every
        drag frame — every line endpoint uses nodePos[key].x/y, no hardcoded coords in lines.
        KV key: dashboard:node-positions as JSON delta objects { nodeKey: { dx, dy } }.
        Load on init, save on pointerup. /api/kv absent → session-only, no error shown.

L173 — Dashboard YOU hands: 4 static lines stroke-width=3 from YOU (cx=450 cy=350)
        to exact midpoints: Earn(215,267) Expense(215,432) Asset(685,267) Liability(685,432).
        Never eyeball — always compute from block x/y/w/h.

L172 — Dashboard circuit SVG viewBox="0 0 900 700", overflow:visible on both svg and container.
        4 main blocks FIXED and CENTERED: Earn x=40 y=190, Expense x=40 y=355,
        Asset x=685 y=190, Liability x=685 y=355. All w=175 h=155. YOU cx=450 cy=350.
        These coordinates are the locked layout — never adjust without owner approval.

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

---

## LIFE TIMELINE (M5.1)

L191  LifeTimeline location display — two distinct layers:
      Year-level rows (month=null): render as horizontal colored swimlane bars BELOW the baseline.
      Consecutive years with identical location are merged into one bar. Each location gets a
      deterministic color from LOC_COLORS palette via locColor(str) hash function.
      Month-level rows (month=1–12): render as small orange (#f97316) floating dots ABOVE the baseline.
      No label. Tooltip shows location + month + year.

L192  Index principle: when a thing exists in the system, store only its record ID as a pointer.
      Never copy or duplicate content across tables. Everything lives once. Everything else points.
      Applied in story_refs: only record IDs from other tables are stored — never copied text.

L193  story_refs field: singleLineText in LifeTimeline. Stores comma-separated Airtable record IDs
      from any table (currently: diary/ideas entries). Append-only — PATCH handler reads current
      value, appends new ID, deduplicates, writes back. Never overwrite the full list.
      Rendered as purple 6×6px square nodes above the year node with a dashed stem.
      Clicking a node fetches /api/diary/{id} on demand. Content cached in _ideasCache
      for session reuse. Display shows [Ideas · Story] badge + title + content.

L197  Life Entry View year column: shows year + age on two lines in sticky left cell.
      Age = row.year − 1971. Always integer. Never NaN. Age styled dim + small below year.
      For Month View rows, age = _entryYear − 1971 (same for all rows in that view).

L196  Life Entry View collapsed cells: each group shows a meaningful summary, not a raw field count.
      Performance = achievement item count (N▸). Strength = weighted % score across 4 fields
      (happiness, health, relationship, skill each 25%). Experience = Xh Yt Zc item counts.
      Story = N entries count.

L195  Life Entry View groups: Performance, Strength (was Emotional), Experience (was Hobby), Story.
      knowledge_earn field label = Skill in UI only. Airtable field key unchanged.

L194  Month View inheritance: when a month-level entry field is empty and a year-level record
      exists for that year, the year's value appears as a dimmed placeholder (opacity:0.35, italic)
      via HTML placeholder attribute — never as value. Empty input with placeholder = not sent to API.
      Clearing a filled input back to empty reverts to placeholder state (no API call).

L063  403 from Airtable on table create/read = table does not exist, NOT a permissions error. Token is full access. Check table existence first. Call POST /api/setup/schema-projects to provision missing tables.
