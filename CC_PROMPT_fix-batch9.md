# CC_PROMPT_fix-batch9.md
> Batch 9 — AI inquiry streaming fix, task/resource collapse, P&L nav+panel fix
> Branch: fix/batch9
> Merge to main after owner QA

---

## CC INTRO
```
Read CLAUDE.md, RULES.md, PROJECT_STATE.md first.
Then execute: CC_PROMPT_fix-batch9.md
Branch: fix/batch9
```

---

## READ FIRST
1. `functions/api/ai-chat.js` — confirm if it returns SSE stream or JSON
2. `public/assets/js/projects.injector.js` — runAiInquiry(), renderFocusView() collapse logic
3. `index.html` — find panel-pl-generator, find Tools nav section, find panel routing logic

---

## FIX 1 — AI inquiry: SSE stream → full text response

**Root cause:** `ai-chat.js` returns a streaming SSE response. `runAiInquiry()` tries to `JSON.parse()` the raw stream body → gets `"event: mes"` error.

**Fix in `functions/api/ai-chat.js`:**
Check if the current response is `text/event-stream`. If yes, change to collect full stream and return plain JSON:

```javascript
// Replace streaming return with buffered response:
const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    stream: false,   // ← KEY CHANGE: no streaming
    messages: body.messages
  })
});
const data = await anthropicRes.json();
const reply = data.content?.[0]?.text || '';
return jsonResponse({ reply });
```

**Important:** Only change the AI inquiry path. If there is a separate streaming path used by the AI panel chat UI (`ai.injector.js`), do NOT touch it — check if `ai-chat.js` handles both or if they are separate endpoints. If same endpoint, add a `?stream=false` query param check: non-streaming when `stream=false` passed, streaming otherwise. The project AI inquiry always passes no stream param — add `stream: false` to the `runAiInquiry` fetch call in `projects.injector.js`.

---

## FIX 2 — projects.injector.js: task + resource section collapse in focus view

**Root cause:** Section collapse headers rendered via `innerHTML` — event listeners bound after render are lost on re-render, or binding targets wrong element.

**Fix:** Use event delegation on the focus zone container instead of direct binding:

In `renderFocusView()`, after setting `zone.innerHTML`, add ONE delegated listener on `zone`:

```javascript
zone.addEventListener('click', e => {
  // Task section collapse
  const taskSec = e.target.closest('[data-task-sec]');
  if (taskSec) {
    const key = taskSec.dataset.taskSec;
    _taskSectionCollapsed[key] = !_taskSectionCollapsed[key];
    const body = zone.querySelector(`[data-task-body="${key}"]`);
    const arrow = taskSec.querySelector('.sec-arrow');
    if (body) body.style.display = _taskSectionCollapsed[key] ? 'none' : '';
    if (arrow) arrow.textContent = _taskSectionCollapsed[key] ? '▸' : '▾';
    return;
  }
  // Resource section collapse
  const resSec = e.target.closest('[data-res-sec]');
  if (resSec) {
    _resCollapsed = !_resCollapsed;
    const body = zone.querySelector('[data-res-body]');
    const arrow = resSec.querySelector('.sec-arrow');
    if (body) body.style.display = _resCollapsed ? 'none' : '';
    if (arrow) arrow.textContent = _resCollapsed ? '▸' : '▾';
    return;
  }
  // Task phase filter
  const filterBtn = e.target.closest('[data-task-filter]');
  if (filterBtn) {
    const pid = filterBtn.dataset.projid;
    _taskFilter[pid] = filterBtn.dataset.taskFilter;
    zone.querySelectorAll('[data-task-filter]').forEach(b =>
      b.style.background = b.dataset.taskFilter === _taskFilter[pid] ? 'var(--yellow)' : 'transparent'
    );
    // Re-render only task rows
    const taskZone = zone.querySelector('[data-task-zone]');
    if (taskZone) taskZone.innerHTML = buildTaskRows(currentTasks, pid);
    return;
  }
}, { capture: false });
```

Add `data-task-sec`, `data-task-body`, `data-res-sec`, `data-res-body`, `data-task-zone` attributes to the relevant HTML elements when rendering. Add module-level `let _resCollapsed = false`.

---

## FIX 3 — index.html: P&L Generator nav under Tools + clean panel

**Two problems:**
1. Nav item was added under Finance instead of Tools
2. Panel `#panel-pl-generator` has dashboard injector content bleeding in

**Fix nav placement:** Find the Tools section `<ul>` in the sidebar (contains AI Advisor, Mind Map, Time Management). Move the P&L Generator `<li>` item into that section. Remove it from Finance section if present there.

**Fix panel content:** Find `<div id="panel-pl-generator">`. Clear all its content. Replace with clean placeholder only:

```html
<div id="panel-pl-generator" class="panel" style="display:none">
  <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border)">
    <div style="font-size:0.95rem;font-weight:700">P&L Generator</div>
    <div style="font-size:0.72rem;color:var(--text-dim)">// financial modelling · 12-month · 5-year</div>
  </div>
  <div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.85rem;margin-top:3rem">
    <div style="font-size:1.5rem;margin-bottom:0.5rem">📊</div>
    P&L Generator coming soon<br>
    <span style="font-size:0.72rem">Full build: feat/4.4-pl-generator</span>
  </div>
</div>
```

**Fix panel routing:** Confirm the panel switch function handles `panel-pl-generator` correctly — it should just show/hide like all other panels. No special injector init needed until the full build.

---

## DO NOT TOUCH
- Any other injector files
- Any API files except `ai-chat.js`
- Cashflow, Sales, Expenses, Budget panels
- Any Airtable schema

---

## AFTER FIXES — MANDATORY
1. Archive → `docs/prompts/` stamped ✅
2. Append RULES.md:
```
L128  ai-chat.js: add ?stream=false support. When stream=false query param OR when called from
      project AI inquiry (runAiInquiry passes stream:false in body) — return buffered JSON
      { reply: string } not SSE. AI panel chat UI uses streaming path unchanged.

L129  Focus view event delegation: ALL click handlers (collapse, filter, status change) must use
      ONE delegated listener on zone container — never bind directly to innerHTML elements.
      Direct binding is lost on every re-render. Delegation survives.
```
3. Update PROJECT_STATE.md — batch9 complete
4. Commit: `fix(batch9): AI non-stream mode, focus collapse delegation, P&L nav+panel fix`

## QA CHECKLIST
- [ ] AI inquiry "Feasibility" returns text result (no JSON parse error)
- [ ] AI "Generate tasks" returns parsed task table + Add button
- [ ] Task phase sections collapse/expand on click
- [ ] Resource section collapses/expands on click
- [ ] P&L Generator nav is under Tools section (not Finance)
- [ ] P&L panel shows clean placeholder (no dashboard content)
