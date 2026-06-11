# CC_PROMPT_fix-budget-batch-save-s14.md
> Budget M2.5 — saveBatchChanges() throttle + progress indicator
> Session 14 — 2026-06-11
> Branch: fix/budget-batch-save-s14

---

## CC INTRO

```
New session. Ignore all previous context from other projects.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-budget.md
4. public/assets/js/budget-panel.injector.js  ← full file, every line

Then read and execute: CC_PROMPT_fix-budget-batch-save-s14.md
```

---

## CONTEXT

Owner tried to save ~64 budget changes at once (full year cleanup session).
`saveBatchChanges()` fires all requests via `Promise.allSettled` simultaneously —
no throttle, no queue. Result: Cloudflare Worker concurrency overload + Airtable
5 req/sec ceiling exceeded → multiple 500 errors, partial saves.

This has never been caught before because normal sessions are 10–20 edits.
Fix is in `budget-panel.injector.js` only. No API changes needed.

---

## FIX — saveBatchChanges(): sequential queue with progress indicator

**Observed:** 64 simultaneous fetch calls → 500 errors on budget override saves.

**Suggested cause:** `Promise.allSettled(requests)` launches all N requests in parallel.
CC must verify the exact implementation in the live file before acting.

**Required outcome after fix:**

1. **Sequential execution** — requests fire one at a time, not all at once.
   Use a simple `for...of` loop over entries — `await` each fetch call before starting the next.

2. **210ms delay between requests** — add `await new Promise(r => setTimeout(r, 210))`
   after each request completes. This keeps throughput at ~4 req/sec,
   safely below Airtable 5/sec ceiling.

3. **Live progress label** — the Save button (id="bud-save-btn" or equivalent —
   CC must verify exact id from live file) must update its text on every iteration:
   `Saving… 1 / 64` → `Saving… 2 / 64` → … → `Saved 64 changes ✓`
   
   - Set button to disabled + `Saving… 0 / N` before the loop starts
   - Update text after each completed request: `Saving… X / N`
   - On completion: call existing `showFlash('Saved N changes ✓')` and re-enable button
   - On any individual failure: log to console, continue loop (do not abort remaining saves),
     count failures separately
   - After loop completes: if failures > 0, call `showFlash(failures + ' save(s) failed — check console', 'error')`

4. **isSubmitting guard** — set a module-level `isSaving` flag to true before loop,
   false in finally block. If Save is clicked while already saving, return immediately.
   CC must verify if this guard already exists — do not add a duplicate.

5. **No other changes** — do not touch any other function, data logic, or render path.

---

## PERMANENT RULES — add to RULES.md and .claude/rules/RULES-budget.md

```
L211  Budget saveBatchChanges() must use sequential for...of loop — never Promise.allSettled for writes.
      Delay 210ms between each request. Update Save button text to "Saving… X / N" after each call.
      Individual failures are logged and counted — loop continues. Final flash shows total failures if any.
      isSaving guard prevents double-submit. Pattern applies to any injector batch-write function.
```

Add L211 to TOP of RULES.md (newest first).
Add L211 to RULES-budget.md (newest first).

---

## AFTER FIX — MANDATORY

1. Move this prompt → `docs/prompts/` stamped:
   `✅ COMPLETE — [date] — Budget batch save: sequential throttle + progress label`

2. Update `PROJECT_STATE.md` — CURRENT STATE: note budget batch save is now throttled,
   safe for large edit sessions.

3. Commit:
```
fix(budget): saveBatchChanges sequential throttle — 210ms delay, Saving X/N progress label
docs: RULES.md + RULES-budget.md L211
docs: archive CC_PROMPT_fix-budget-batch-save-s14.md
```

Branch: `fix/budget-batch-save-s14`
Merge to main after QA checklist passes.

---

## QA CHECKLIST (CC self-verify before merge)

- [ ] saveBatchChanges uses for...of loop, not Promise.allSettled
- [ ] 210ms delay exists between each request
- [ ] Save button shows "Saving… X / N" during save
- [ ] Save button re-enables and shows flash on completion
- [ ] Individual 500 errors do not abort the loop — remaining saves continue
- [ ] isSaving guard prevents double-submit
- [ ] No other functions modified
- [ ] L211 added to RULES.md (top)
- [ ] L211 added to RULES-budget.md (top)
