# CC_PROMPT_fix-life-hotfix-s12c.md
> Life panel — 3 hotfixes (scroll, Experience NaN, Mount to Life 500)
> Session 12c — 2026-06-10

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md

Do NOT read RULES-archive.md unless explicitly told to.
Do NOT read anything in docs/archive/.
Then read and execute: CC_PROMPT_fix-life-hotfix-s12c.md
```

---

## CONTEXT

Three issues remain after S12b merge. All fixes confined to:
- `public/assets/js/life.injector.js`
- `functions/api/life-timeline/[id].js`

Read both files fresh before writing anything.

---

## FIX 1 — Scroll still breaks — entire page scrolls, not tbody

**Observed:** Header rows still scroll away. Full page scrolls instead of only the table body.

**Root cause (confirmed from Chrome DevTools):** The flex chain from `#panel-life` down to
`.life-grid-wrap` has no bounded height. Without `min-height:0` on each flex child in the
chain, the browser does not constrain children to available space — so the scroll container
expands to content height and the page scrolls instead.

**The fix — apply to the injector style block:**

The entire chain needs these properties verified and corrected:

```
#panel-life.active         → display:flex; flex-direction:column; height:100%; overflow:hidden
.life-entry-body           → flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0
.life-grid-wrap            → flex:1; overflow:auto; min-height:0
```

CC must read the live injector style block and the `global.css` `.route-panel` rule to check
what `#panel-life` actually receives. If `.route-panel.active` in global.css does not set
`height:100%` and `overflow:hidden`, the injector must inject those properties for
`#panel-life` specifically via its own style block.

The `life-header`, `life-kpi-strip`, `life-mode-toggle`, `life-entry-controls` divs must all
have `flex-shrink:0` so they never compress — only `.life-grid-wrap` scrolls.

**Required outcome:** Both thead rows stay locked. Only tbody rows scroll.
Verified working in Chrome on the live Cloudflare Pages URL.

---

## FIX 2 — Experience collapsed cell shows NaN

**Observed:** Experience collapsed cell shows NaN when owner saves data.

**Root cause (confirmed):** The collapsed Experience score counts comma-separated entries in
`hobby`, `travel`, `creation` fields. But `hobby`, `travel`, `t_impact`, `h_impact` are
**number fields** in Airtable — not text. Splitting a number by comma returns NaN.

**The fix:**
- For Experience collapsed display: only count comma-separated entries in fields that are
  `type:'text'` in the GROUPS definition
- `hobby`, `travel`, `creation` — CC must check the live GROUPS array to confirm which of
  these are `type:'num'` vs `type:'text'`
- For `type:'num'` fields: count as 1 point if the value is non-null and non-zero (not comma-split)
- For `type:'text'` fields: count comma-separated items as before
- Total = sum of all points → display as `Np`
- Hover tooltip: break down by field name and count

**Required outcome:** No NaN ever. Experience collapsed shows a clean integer with `p` suffix
or `—` if all Experience fields are empty.

---

## FIX 3 — Mount to Life returns 500 error

**Observed:** Clicking Mount in M3.1 Ideas panel returns HTTP 500 from
`/api/life-timeline/[id]`.

**Root cause (confirmed from live code):** In `functions/api/life-timeline/[id].js`,
the PATCH handler receives `story_refs` as a raw record ID string (e.g. `"recABC123"`).
The handler must:
1. Fetch the current record from Airtable to read existing `story_refs` value
2. Append the new ID (deduplicate)
3. Write the merged string back

If step 1 is missing or the field name `story_refs` is not in the `TEXT_FIELDS` array
inside `buildFields()`, the PATCH body will either overwrite or drop `story_refs` entirely,
causing the 500.

CC must read the live `functions/api/life-timeline/[id].js` and verify:
- `story_refs` is in TEXT_FIELDS (or equivalent) so it passes through `buildFields()`
- When `story_refs` is present in the PATCH body, the handler reads the current Airtable
  record value first, appends the new ID (comma-separated), deduplicates, then writes
  the full merged string — never a raw overwrite
- The fetch-read-append-write pattern must be atomic within the single PATCH request

**Required outcome:** Mount to Life succeeds. `story_refs` field in Airtable contains
the appended record ID. No 500 errors.

---

## PERMANENT RULES — add to RULES.md

```
L201  Life panel scroll chain: #panel-life.active needs height:100%; overflow:hidden injected
      by the injector if global.css .route-panel does not supply it. Every flex ancestor of
      .life-grid-wrap must have min-height:0. This is the min-height:0 rule for Life panel.

L202  Life Experience collapsed: hobby/travel/creation are number fields — count as 1 point
      each if non-null/non-zero. Never comma-split a number field. Only text fields get
      comma-split counting. NaN in any collapsed cell = this rule was violated.

L203  Life story_refs PATCH: always read-append-write. Never overwrite. Read current value
      from Airtable first, append new ID, deduplicate, write merged string.
      story_refs must be in TEXT_FIELDS in buildFields() or it will be silently dropped.
```

---

## QA CHECKLIST

- [ ] Scroll: header rows locked, only tbody scrolls — confirmed in Chrome
- [ ] Experience collapsed: no NaN, shows Np or —
- [ ] Mount to Life: no 500, story_refs updated correctly in Airtable
- [ ] No other files modified
- [ ] RULES.md updated with L201, L202, L203

---

## COMMIT ORDER

```
fix(life): scroll chain — min-height:0 on flex ancestors, height:100% on panel
fix(life): Experience collapsed — number fields counted as 1pt, no comma-split
fix(api): life-timeline PATCH — story_refs read-append-write, never overwrite
docs: RULES.md L201–L203
```

Branch: `fix/life-hotfix-s12c`
Merge to main after QA checklist passes.
Archive this prompt to `docs/prompts/CC_PROMPT_fix-life-hotfix-s12c.md`.
