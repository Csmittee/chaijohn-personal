✅ COMPLETE — 2026-05-26 — Sidebar shell Phase 1: Chairit OS layout, hash routing, theme toggle, auth overlay, 15 route panels

---

# CC_PROMPT — Phase 9a: Sidebar Shell (Part 1 of 3)

## Objective

Replace `public/index.html` with a full Chairit OS sidebar shell.
Part 1 scope: layout, navigation groups, hash-based routing, theme toggle, auth overlay.
No injector changes. No functional data wiring. Placeholder content in all panels.

## Design Tokens

Dark default. `[data-theme="light"]` for light mode.

**Fonts (Google):** IBM Plex Mono 400/500/600 · Space Grotesk 300/400/500/600/700 · Syne 700/800

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0d0d14` | `#f0f0f5` |
| `--bg-raised` | `#13131f` | `#ffffff` |
| `--bg-card` | `#1a1a2e` | `#ffffff` |
| `--border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` |
| `--border-strong` | `rgba(255,255,255,0.16)` | `rgba(0,0,0,0.16)` |
| `--text` | `#e8e8f0` | `#1a1a2e` |
| `--text-dim` | `rgba(232,232,240,0.45)` | `rgba(26,26,46,0.4)` |
| `--text-muted` | `rgba(232,232,240,0.65)` | `rgba(26,26,46,0.6)` |
| `--yellow` | `#f5c518` | (same) |
| `--sidebar-bg` | `#0a0a10` | (same — sidebar stays dark) |

## Layout

```
body: display:grid; grid-template-columns: 220px 1fr;
#sidebar: position:fixed; width:220px; height:100vh; flex column
#main: margin-left:220px; min-height:100vh; padding:1.5rem
```

## Brand

App name: **CHAIJOHN OS** — `var(--font-display)` weight 800, color `var(--yellow)`
Sub: `personal finance · life` — `var(--font-mono)` 9px, color `var(--text-dim)`

## Navigation

| Group | Section label | State | Children |
|---|---|---|---|
| M1 | — | standalone | dashboard |
| M2 | FINANCE | open by default | cashflow, sales, expenses, projects, budget, liabilities, entry |
| M3 | ASSETS | collapsed | ideas, collection, hard-assets, proj-assets |
| M4 | TOOLS | collapsed | ai, mindmap |
| M5 | LIFE | standalone | life |

Active nav item: `background: var(--nav-active-bg)`, `color: var(--yellow)`, `border-left: 2px solid var(--yellow)`

## Theme Toggle

Bottom of sidebar. `localStorage` key: `chaijohn-theme`. Values: `dark` / `light`.
Icon: 🌙 dark / ☀️ light. `document.documentElement.setAttribute('data-theme', ...)`.

## Route Panels (15 total)

Routes: `dashboard, cashflow, sales, expenses, projects, budget, liabilities, entry, ideas, collection, hard-assets, proj-assets, ai, mindmap, life`

Each panel structure:
```html
<div class="route-panel" id="panel-{route}">
  <div class="panel-header">...</div>
  <div class="conclusion-row"><!-- stat chips --></div>
  <div class="filter-bar">filter · range · options — coming in Part 2</div>
  <div class="detail-section">
    <div class="coming-soon">{route} — coming in Part 2</div>
  </div>
</div>
```

Default route: `#dashboard`

## Auth Overlay

Full-screen overlay (`position:fixed; inset:0; z-index:1000`) shown until authenticated.
Contains: `CHAIJOHN OS` logo, PIN input (`#pin-input`), form (`#pin-form`), submit (`#enter-btn`).
On success: overlay gets `.hidden` class; shell reveals at hash route.
On load: `GET /api/auth/check` — if 200, bypass overlay immediately.

## Inline JS (no external scripts except fonts)

1. Theme init (runs before paint, reads localStorage)
2. Theme toggle click handler
3. Collapsible group toggle (`.nav-group-header` click → `.nav-group.open`)
4. `navigate(route)` — updates `.route-panel.active` + `.nav-item.active` + hash
5. `hashchange` listener
6. Auth flow: `POST /api/auth/verify` → `revealShell()` on success

## Files Changed

- `public/index.html` — REPLACED (full new file)
- `docs/prompts/CC_PROMPT_phase9a_sidebar-shell.md` — created (this file, stamped ✅)
- `masterseed.md` — updated (Phase 9a added, roadmap updated)
- `lessons_learned.md` — updated (L039 appended)

## Commit

`feat(shell): sidebar shell Part 1 — layout, routing, theme toggle`
Branch: `feat/sidebar-shell`
