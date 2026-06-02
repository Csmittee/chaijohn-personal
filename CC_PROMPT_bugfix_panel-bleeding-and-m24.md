# CC_PROMPT_bugfix_panel-bleeding-and-m24.md
> Fix panel content bleeding across M2.2 / M2.4 / M3.4.
> Collect and fix CSS issues in M2.2 Sales.
> Commit directly to main. No branch needed.

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. PROJECT_STATE.md

Then read and execute: docs/prompts/CC_PROMPT_bugfix_panel-bleeding-and-m24.md
```

---

## WHAT IS BROKEN — confirmed from owner screenshots

### Problem 1 — Sales panel content bleeding into other panels (CRITICAL)

Finance → Projects (#panel-projects) shows:
- Sales chart + Pareto at the top
- Then M2.4 message "No active or finance-opened projects yet" below

Assets → Project Assets (#panel-proj-assets) shows:
- Sales chart + Pareto + business lanes at the top
- Then M3.4 Projects panel below

Finance → Sales (#panel-sales) shows correctly.

**Root cause to investigate in `public/assets/js/sales.injector.js`:**

Read the file fresh. Find the init function.
The recent fix added `panel.innerHTML = ''` to clear the placeholder.
Check if the panel reference is scoped correctly:

```javascript
// CORRECT — scoped to the specific panel
const panel = document.getElementById('panel-sales');
panel.innerHTML = '';
// render into panel only

// WRONG — renders into wrong element or loses scope
document.querySelector('#panel-sales .some-child').innerHTML = '';
// or renders into body/main accidentally
```

Also check the `panelactivated` event listener:
```javascript
// CORRECT
window.addEventListener('panelactivated', e => {
  if (e.detail === 'sales') init();
});

// WRONG — fires on every panel activation
window.addEventListener('panelactivated', e => {
  init(); // no route check — renders on every navigation
});
```

If init() runs on every panelactivated event regardless of route,
it re-renders the Sales content into whatever panel is currently active.

Fix: ensure init() only runs when `e.detail === 'sales'`.
Ensure all DOM manipulation is scoped to `document.getElementById('panel-sales')`.
Never use `document.querySelector` or `document.body` for panel content.

### Problem 2 — Finance → Projects (M2.4) shows Sales content

Same bleeding issue. `project-finance.injector.js` targets `#panel-projects`.
But Sales content is appearing there too.

Read `public/assets/js/project-finance.injector.js` fresh.
Apply same diagnosis — check panelactivated route guard and DOM scope.

The correct M2.4 content is: "No active or finance-opened projects yet.
Create a project in Project Assets and set it Active."
This message IS appearing — but below the leaked Sales content.
Once bleeding is fixed, M2.4 will show correctly.

### Problem 3 — Assets → Project Assets (M3.4) shows Sales content + M3.4 below

Read `public/assets/js/projects.injector.js` fresh.
Same diagnosis — check panelactivated route guard.
M3.4 route is `proj-assets`, not `projects` or `sales`.

After bleeding fix: M3.4 should show ONLY the Projects panel
(active: 0, Card/Lane view, + Create project button).

---

## CSS FIXES — M2.2 Sales panel

Collect and fix these in the same session:

**Fix 1 — Filter buttons: text invisible on dark background**
The period/business filter buttons show black text when active.
The active state uses a light background but text color is not set to dark.

Find the filter button active styles in `sales.injector.js`.
The active button likely has `background: var(--yellow)` or similar light color
but is inheriting `color: var(--text)` which is light on dark theme.

Fix:
```javascript
// When rendering active filter button:
style="background:var(--yellow);color:#0a0a10;..."
// NOT:
style="background:var(--yellow);color:var(--text);..."
```

Color `#0a0a10` is the dark background — always readable on yellow/light backgrounds.
Check all toggle buttons (period: 6m/12m/all, business filter buttons).

**Fix 2 — Pareto chart frame not balanced with trend chart**
The two chart containers (trend left, pareto right) have different heights or padding.
Find the chart zone grid in sales.injector.js.
Ensure both containers have identical height, same border, same padding.
Both should use `height: 220px` with `position: relative` (L060i).

---

## WHAT M2.4 SHOULD SHOW (for reference — do not rebuild, just unblock)

Once bleeding is fixed, Finance → Projects (#panel-projects) should show:
- Summary strip: pipeline count, total CAPEX, expected monthly revenue, avg payback
- Body: boundary cards for projects WHERE type='Active' OR finance_opened=true
- Empty state: "No active or finance-opened projects yet. Create a project
  in Project Assets and set it Active." ← this is already working correctly

The empty state IS correct — owner has no Active projects with finance_opened=true yet.
M2.4 is working. It just has leaked Sales content on top of it.

---

## WHAT M3.4 SHOULD SHOW (for reference — do not rebuild)

Once bleeding is fixed, Assets → Project Assets (#panel-proj-assets) should show:
- Stat chips: active, tasks pending, delayed, nearest launch
- Card/Lane toggle
- + Create project button
- Project cards (currently empty — owner deleted test records)
← this is already showing correctly BELOW the leaked content

---

## DO NOT TOUCH

- cashflow.injector.js, expenses.injector.js, liabilities-panel.injector.js
- budget-panel.injector.js, entry.injector.js
- functions/api/* — no API changes needed for this fix
- The Sales panel content itself — it is correct, just scoping is wrong

---

## AFTER ALL FIXES — MANDATORY

1. Move prompt → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — fix panel bleeding, sales filter CSS, pareto height`

2. Append to `RULES.md` (next L-number):
   - Panel init scope rule: ALWAYS guard panelactivated with exact route check
     `if (e.detail !== 'route-name') return;` as FIRST line of handler.
     Never init or render without this guard — causes content to bleed into
     every panel on navigation.
   - Panel DOM scope: ALL innerHTML manipulation must use the specific panel
     element returned by `getElementById('panel-xxx')`. Never lose this
     reference. Never render into document.body or document.main.
   - Active button text color: always set explicit `color:#0a0a10` when
     button background is light (yellow, white, green). Never rely on
     inherited color from dark theme.

3. Update `PROJECT_STATE.md` CURRENT STATE:
   - Panel bleeding: fixed
   - M2.2 Sales: filter button CSS fixed, pareto height fixed
   - M2.4 Finance Projects: unblocked, showing correct empty state
   - M3.4 Project Assets: unblocked, showing correctly

---

## COMMIT ORDER

```
fix(sales): scope panelactivated guard to 'sales' route only
fix(proj-assets): scope panelactivated guard to 'proj-assets' route only  
fix(proj-finance): scope panelactivated guard to 'projects' route only
fix(sales): filter button active text color — use #0a0a10 on light backgrounds
fix(sales): equalise trend and pareto chart container heights
docs: update RULES.md and PROJECT_STATE.md after panel bleeding fix
```

All commits directly to main.

Owner confirms fix when:
- [ ] Finance → Sales shows ONLY Sales content (chart + business lanes)
- [ ] Finance → Projects shows ONLY M2.4 content (empty state or boundary cards)
- [ ] Assets → Project Assets shows ONLY M3.4 content (stat chips + Card/Lane)
- [ ] Sales filter buttons: text visible on active state
- [ ] Sales chart and Pareto same height, same frame
