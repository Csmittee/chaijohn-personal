# CC_PROMPT_hotfix-pl-nav.md
> Hotfix: P&L Generator nav routing mismatch + dashboard bleed in panel
> Branch: hotfix/pl-nav
> Fast fix — index.html only

---

## CC INTRO
```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md

Then execute: CC_PROMPT_hotfix-pl-nav.md
Branch: hotfix/pl-nav
```

---

## READ FIRST
1. `index.html` — find: P&L Generator nav item, Tools nav group children, panel-pl-generator div, panel routing/switch logic, pl-generator.injector.js script tag

Read the full file before touching anything. This is the only file being changed.

---

## CONFIRMED FACTS
- Panel ID is `panel-pl-generator` (confirmed in RULES.md L126)
- Injector file is `pl-generator.injector.js` (merged in PR #55)
- Nav item currently uses `data-route="pl-gen"` — WRONG
- Dashboard content is bleeding into the panel — caused by wrong route not triggering injector init
- Tools nav group children currently does NOT contain the P&L nav item correctly

---

## THE TWO PROBLEMS

### Problem 1 — Route mismatch
The nav item has `data-route="pl-gen"` but the panel and injector expect `data-route="pl-generator"`.
When user clicks the nav, the router activates `panel-pl-gen` (doesn't exist) so it falls through
to whatever panel was last active — causing the dashboard bleed.

### Problem 2 — Nav item outside Tools children
The P&L nav item `<div class="nav-item" data-route="pl-gen">` is outside the
`#group-tools .nav-group-children` div. It renders in the sidebar but doesn't collapse
with the Tools group and has no group association.

---

## FIX — index.html only, two changes

### Change 1: Fix nav item — move inside Tools children + correct route

Find the current P&L nav item (it looks like):
```html
<div class="nav-item" data-route="pl-gen"><span class="nav-icon">◉</span><span class="nav-label">P&L Generator <span style="...soon badge...">soon</span></span></div>
```

This line should be INSIDE `#group-tools .nav-group-children`, after the Time Management item.
If it is already there but has wrong route — fix the route.
If it is outside the children div — move it inside.

**Correct version:**
```html
<div class="nav-item" data-route="pl-generator"><span class="nav-icon">◉</span><span class="nav-label">P&L Generator <span style="font-size:0.55rem;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;border-radius:3px;padding:0.05rem 0.3rem;vertical-align:middle">soon</span></span></div>
```

Key change: `data-route="pl-gen"` → `data-route="pl-generator"`

### Change 2: Fix panel — clear dashboard bleed, wire injector

Find `<div id="panel-pl-generator"` in index.html.
It currently has dashboard injector content bleeding in (wrong content inside).

Replace the entire div with:
```html
<div id="panel-pl-generator" class="panel" style="display:none"></div>
```

The injector (`pl-generator.injector.js`) already handles building all content inside this div
when the panel activates — the div must be empty so the injector can take over cleanly.

### Verify: script tag exists
Confirm `<script src="/assets/js/pl-generator.injector.js">` is present near bottom of index.html
alongside other injector script tags. If missing — add it. If present — leave it.

### Verify: panel routing
Find the panel switch function in index.html (handles `data-route` clicks → shows correct panel).
Confirm it maps `pl-generator` route → `panel-pl-generator` panel div.
If it uses a naming convention like `panel-${route}` automatically — no change needed.
If it has an explicit map — add `'pl-generator': 'panel-pl-generator'` if missing.

---

## DO NOT TOUCH
- `pl-generator.injector.js` — injector is correct, do not modify
- `functions/api/pl-generator.js` — API is correct, do not modify
- `functions/api/pl-generator/[id].js` — do not modify
- Any other injector or API file
- Any other panel or nav item

---

## AFTER FIX — MANDATORY
1. Archive → `docs/prompts/` stamped ✅ COMPLETE — hotfix pl-nav routing
2. No new RULES.md entries needed — this is a routing correction not a new pattern
3. Update PROJECT_STATE.md — note hotfix/pl-nav applied
4. Commit: `hotfix(nav): fix pl-generator route data-route and panel bleed`

## COMMIT ORDER
```
hotfix(nav): fix pl-generator data-route pl-gen→pl-generator, clear panel bleed
docs: PROJECT_STATE hotfix-pl-nav complete
```
Branch: hotfix/pl-nav
Merge to main immediately after owner confirms P&L panel loads correctly.

## QA CHECKLIST
- [ ] Click P&L Generator in Tools nav → P&L panel opens (not dashboard bleed)
- [ ] P&L panel shows KPI strip + sidebar tabs + output area
- [ ] Dashboard panel still works correctly after nav change
- [ ] No console errors on panel switch
