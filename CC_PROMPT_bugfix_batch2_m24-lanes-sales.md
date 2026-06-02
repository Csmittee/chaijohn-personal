# CC_PROMPT_bugfix_batch2_m24-lanes-sales.md
> Batch fix — 6 confirmed issues from QA session 2026-06-02.
> All root causes confirmed. Read, fix, commit.

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

Then read and execute: docs/prompts/CC_PROMPT_bugfix_batch2_m24-lanes-sales.md
```

---

## CONFIRMED FACTS

**GET /api/projects returns:**
```json
{ "records": [ {...}, {...} ] }
```
It returns `{ records: [] }` — an object with a records key — NOT a plain array.
Both projects confirmed: type='Active', all phases/tasks/resources linked correctly.
`finance_opened` field does not exist in Airtable yet — that is expected.

**Two Active projects confirmed:**
- Ploikong: investment_total=30000, target_revenue_monthly=1000000, days_to_launch=38
- Satu 1.0: investment_total=80000, target_revenue_monthly=300000, days_to_launch=null

---

## BUG 1 — M2.4 Finance Projects shows empty (CRITICAL)

**Root cause confirmed:** `project-finance.injector.js` calls `.map()` directly
on the API response. But `/api/projects` returns `{ records: [...] }` not `[...]`.
So `allProjects.map is not a function` → panel shows empty state incorrectly.

**Fix in `public/assets/js/project-finance.injector.js`:**

Read the file fresh. Find where the fetch result is assigned to `allProjects`.
Change from:
```javascript
allProjects = await res.json();
```
To:
```javascript
const data = await res.json();
allProjects = data.records || data || [];
```

This handles both `{ records: [] }` shape and plain array as fallback.

Also check: does `project-finance.injector.js` filter projects by
`type === 'Active'` OR `finance_opened === true`?
Since `finance_opened` does not exist in Airtable yet, it will be undefined.
The filter must include projects where `finance_opened` is undefined/falsy
as long as `type === 'Active'`:

```javascript
const visibleProjects = allProjects.filter(p =>
  p.type === 'Active' || p.finance_opened === true
);
```

After this fix, Finance → Projects must show boundary cards for
Ploikong (฿1,000,000/mo, ฿30,000 investment) and
Satu 1.0 (฿300,000/mo, ฿80,000 investment).

---

## BUG 2 — "Update + Active" button has black text (unreadable)

**In `public/assets/js/projects.injector.js`:**

Read fresh. Find the "Update + Active" / "Push Active" button rendering.
It uses a light/accent background but inherits dark text color making it
unreadable on the dark theme.

Fix: explicitly set `color: #0a0a10` (dark) on any button with a light
background (yellow, green, accent). Never rely on inherited color.

Same fix applies to any other button showing black text on dark background
found while reading the file. Fix all in one pass.

---

## BUG 3 — Lane view missing phase color bands

**In `public/assets/js/projects.injector.js`:**

Read fresh. Find `renderLaneView()`. Phase bands should be colored segments
behind each project lane showing which phase the project is currently in.

Phase colors (from L054f — locked, never change):
- DS = #3b82f6 (blue)
- PT = #8b5cf6 (purple)
- PD = #06b6d4 (teal)
- PV = #f59e0b (amber)
- LA = #22c55e (green)

The lane rows currently show as plain dark bars with no color fill.
Check if phase band rendering code exists but has a data mapping issue —
the API returns `ProjectPhases` as an array of record IDs (not objects).
If the code expects phase objects with `phase_code` field but gets only IDs,
the color lookup will fail silently.

Fix: if phase bands require phase detail data, fetch `/api/project-tasks?project_id=X`
or check if the projects API can be enhanced to return phase details inline.
For now: fall back to showing the current_phase as a single solid color band
across the full lane width if detailed phase timing is unavailable.

---

## BUG 4 — Lane view missing milestone diamonds

**In `public/assets/js/projects.injector.js`:**

Read fresh. Find milestone diamond rendering in `renderLaneView()`.
Milestones are returned as record IDs only in the projects list response.
The diamond marker requires a `target_date` or `auto_date` to position it
on the timeline.

Check: does the API return milestone dates in the enriched project list?
If not, the diamond cannot be positioned and is silently skipped.

Fix options (in order of preference):
A) Fetch milestone details via `/api/projects/:id` for each visible project
   (use Promise.all, not sequential)
B) Use `days_to_launch` as a proxy — position a single launch diamond at
   today + days_to_launch on the timeline
C) Show milestone count as text label on the lane instead of diamonds

Use option B as minimum viable fix if A requires significant API changes.
For Ploikong: days_to_launch=38 → position diamond at today + 38 days.
For Satu 1.0: days_to_launch=null → no diamond shown.

---

## BUG 5 — M2.2 Sales missing Personal asset sales lane

**In `public/assets/js/sales.injector.js`:**

Read fresh. Find the `renderLanes()` function.
The API response includes `personal.asset_sales` array.
Check if the Personal section is being rendered.

If `personal.asset_sales` is empty (no sold assets yet), the section
should still show with an empty state message — not be hidden entirely.

Check `functions/api/sales.js` GET handler:
Assets are fetched WHERE `status='Sold'`. Verify the field name is correct
in the chaijohn-core Assets table. The field should be `status` with value `Sold`.

If the personal section render is gated on `hasSold || hasManual` and both
are false, the entire section is hidden. Fix to always show the Personal
section with an empty state when no data exists.

**Personal section structure to render when empty:**
```
PERSONAL
  Asset Sales
  — No sold assets yet
  Manual entries
  — No manual earn entries yet
```

---

## BUG 6 — M2.2 Sales missing Projects presale lane

**In `public/assets/js/sales.injector.js`:**

Read fresh. Find where the Projects section is rendered.
The API returns `projects` array — Projects WHERE `sales_forecast_sent=true AND type='Active'`.

Currently neither Ploikong nor Satu 1.0 has `sales_forecast_sent=true`
(owner has not clicked Send to Sales yet) — so the projects array is empty
and the Projects section is hidden.

Fix: always render the Projects section with an empty state when no projects
have been sent to sales yet:
```
PROJECTS (forecast)
  — No projects sent to Sales yet.
  To add a project: go to Finance → Projects → Send to Sales
```

This makes the section visible and educates owner on the flow.

---

## DO NOT TOUCH

- functions/api/auth.js, functions/_middleware.js
- cashflow.injector.js, expenses.injector.js, liabilities-panel.injector.js
- budget-panel.injector.js
- The projects API response shape — do not change `{ records: [] }` format
  as other things may depend on it. Fix the consumer (injector) instead.

---

## AFTER ALL FIXES — MANDATORY

1. Move prompt → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — batch2: M2.4 records shape, button CSS, lane bands, 
   milestone diamonds, personal lane, projects lane`

2. Append to `RULES.md` (next L-number after current highest):
   - API response shape: /api/projects returns `{ records: [] }` not a plain
     array. All consumers must use `data.records || data || []` when reading.
     Never assume array shape from a paginated Airtable endpoint.
   - Always render section empty states — never hide entire sections when
     data is empty. Owner needs to know the section exists even with no data.

3. Update `PROJECT_STATE.md` CURRENT STATE:
   - M2.4: boundary cards showing after records shape fix
   - M3.4 lane view: phase bands and milestone diamonds improved
   - M2.2: personal and projects sections always visible

---

## COMMIT ORDER

```
fix(m24): project-finance.injector.js — handle {records:[]} response shape
fix(m34): projects.injector.js — Update+Active button text color
fix(m34): projects.injector.js — phase color bands fallback using current_phase
fix(m34): projects.injector.js — milestone diamond using days_to_launch
fix(m22): sales.injector.js — always render Personal section with empty state
fix(m22): sales.injector.js — always render Projects section with empty state
docs: update RULES.md and PROJECT_STATE.md
```

Branch: `fix/batch2-qa`
Merge to main after owner confirms:
- [ ] Finance → Projects shows Ploikong and Satu 1.0 boundary cards
- [ ] Update + Active button text readable
- [ ] Lane view shows colored phase band on each project row
- [ ] Lane view shows milestone diamond at days_to_launch position
- [ ] Finance → Sales shows Personal section (empty state OK)
- [ ] Finance → Sales shows Projects section (empty state OK)
