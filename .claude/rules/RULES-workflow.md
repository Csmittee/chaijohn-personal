# RULES-workflow.md — Chaijohn OS
> Domain: CC workflow discipline, session hygiene, commit order, deployment
> Load this file when: working on docs-only tasks, or as a reference for workflow discipline
> Last updated: 2026-06-04

---

L091  Entry drawer is expense-only from P2 onwards. The EARN/EXPENSE toggle buttons are removed.
      Cash injections (savings top-ups, transfers in) use the separate Cash In tab (source='cash_in').
      Hard asset sales use the M3.3 Sell modal (source='hard_asset_sale'). Pre-sale transactions
      are created directly in the M2.4 Finance Projects inline form (source='presale').

L074  Cloudflare Pages env var deployment: Retry-deployment reuses cached
      build and does NOT pick up new env vars. New env vars require a fresh build
      triggered by a new commit to main. Tell owner this explicitly when adding
      new env vars.

L069  AI chat payload must be: { messages: [{ role:'user', content: promptString }], session_id: string }. Field is 'messages' (array), not 'message' (string). Sending wrong shape returns "messages array is required".

L014  CC ends every session: merge branch to main, verify Cloudflare production URL updated

L012  Prompt archive: move CC_PROMPT file to docs/prompts/, stamp ✅ COMPLETE + date + summary at top

L011  Complete files only: never patches, never diffs — full replacement always

L010  Read before write: read CLAUDE.md + RULES.md + PROJECT_STATE.md + ALL relevant source files fresh before writing anything
