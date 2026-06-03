# CC_PROMPT_fix-batch9.md
✅ COMPLETE — 2026-06-03 — AI non-stream mode, focus view event delegation, P&L nav moved to Tools, RULES L128–L129
> Batch 9 — AI inquiry streaming fix, task/resource collapse delegation, P&L nav+panel fix
> Branch: fix/batch9

## FIXES APPLIED

### FIX 1 — ai-chat.js: non-streaming mode
- Added `if (body.stream === false)` path: calls Claude API with `stream: false`, returns `{ reply }`
- Streaming path unchanged (used by AI panel chat UI)
- `runAiInquiry()` in projects.injector.js now passes `stream: false` in body

### FIX 2 — projects.injector.js: event delegation
- Added `_resCollapsed`, `_currentTasks`, `_currentPhaseCodeMap` module vars
- Changed `_taskFilter` from string to object keyed by projectId
- Extracted `buildTaskZone(tasks, pid)` function — builds phase section HTML independently
- Task sections use `data-task-sec`, `data-task-body` attributes
- Resources section uses `data-res-sec`, `data-res-body` attributes
- ONE delegated `click` listener on zone via `zone._focusBound` flag
- ONE delegated `change` listener on zone for status selects
- Collapse/filter now DOM-manipulates directly — NO API call, NO full re-render
- Filter updates only `[data-task-zone]` innerHTML via `buildTaskZone(_currentTasks, pid)`

### FIX 3 — index.html
- Removed P&L Generator nav from Finance group
- Added P&L Generator nav to Tools group (after Time Management)
- Panel content cleaned to spec placeholder: header + centered "coming soon" message

### RULES L128–L129 appended
