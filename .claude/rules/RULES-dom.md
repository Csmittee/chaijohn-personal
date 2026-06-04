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

L025  Chart.js view toggle: store mode in module-level var, render function branches on mode, destroy/recreate chart each render
L016  Chart.js v4 inline plugins: use top-level `plugins:[]` array in config — do NOT use `Chart.register()` for one-off plugins
