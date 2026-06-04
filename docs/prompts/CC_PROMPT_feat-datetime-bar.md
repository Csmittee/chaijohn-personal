# CC_PROMPT_feat-datetime-bar.md
> ✅ COMPLETE — feat/datetime-bar — 2026-06-04 — Global datetime display in top bar, auto-timezone, updates every minute
> Branch: feat/datetime-bar
> New file: public/assets/js/datetime.injector.js
> Minor change: public/index.html (inject mount point near Entry button)
> Merge to main after QA — can be done in same session as fix/time-management or separately

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. public/index.html  ← find the top bar / Entry button area

Then execute this prompt.
```

---

## WHAT TO BUILD

A global datetime display that appears in the top bar on every page,
near the Entry button. Auto-detects local timezone. Updates every minute.
No API. No Airtable. No panelactivated. Pure DOM + JS.

---

## FIX 1 — index.html: add mount point

Find the top bar area in index.html. It contains the Entry button
(something like `<button ... id="open-entry-btn">Entry</button>` or similar).

Add a `<span>` or `<div>` mount point immediately BEFORE the Entry button:

```html
<span id="tm-datetime-display" style="
  font-size: 0.72rem;
  color: var(--text-secondary, #888);
  font-weight: 500;
  letter-spacing: 0.02em;
  margin-right: 0.75rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
"></span>
```

Do not change the Entry button or any other top bar element.

---

## FIX 2 — New file: `public/assets/js/datetime.injector.js`

```javascript
/* datetime.injector.js — global top bar clock
   Auto-detects local timezone. Updates every minute.
   No panelactivated — fires on DOMContentLoaded. */

(function () {
  function render() {
    const el = document.getElementById('tm-datetime-display');
    if (!el) return;

    const now = new Date();
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const datePart = now.toLocaleDateString('en-GB', {
      timeZone: tz,
      weekday: 'short',
      day:     'numeric',
      month:   'short'
    }); // e.g. "Wed, 4 Jun"

    const timePart = now.toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false
    }); // e.g. "17:34"

    el.textContent = datePart + ' · ' + timePart;
    el.title = 'Local time (' + tz + ')';
  }

  function start() {
    render();
    // Align tick to next full minute for accuracy
    const now    = new Date();
    const msLeft = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(function () {
      render();
      setInterval(render, 60000);
    }, msLeft);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
```

---

## FIX 3 — index.html: add script tag

Add near the bottom of index.html, alongside other injector script tags:

```html
<script src="/assets/js/datetime.injector.js"></script>
```

---

## DO NOT TOUCH

- Any other injector file
- Any panel div
- Entry button functionality
- Auth or routing logic

---

## AFTER BUILD — MANDATORY

1. Move this prompt to `docs/prompts/` stamped ✅ COMPLETE
2. No new RULES.md entries needed — this is a self-contained UI utility
3. Update PROJECT_STATE.md file inventory — add `datetime.injector.js`
4. Commit: `feat(ui): global datetime display in top bar, auto-timezone`
5. Merge to main
