# CHAIJOHN OS — Project Brief

**Stack:** Cloudflare Pages · Airtable (apphBGWfSPL45oSFd) · Vanilla JS · Chart.js CDN · Cloudinary · Anthropic API
**Auth:** PIN → chaijohn_session cookie → _middleware.js checks all /api/*
**Deploy:** Frontend = Cloudflare Pages auto from main. Workers = paste manually into Cloudflare editor.
**Branch rule:** Always develop on a feature branch. Create PR to main. Merge to main before ending session.

## Key files
```
public/index.html              → single-page shell (sidebar + panels + entry drawer)
public/assets/js/              → one IIFE injector per panel (never shared bundle)
functions/_airtable.js         → ALL shared Airtable helpers (import with '../_airtable.js')
functions/api/                 → one file per endpoint (Cloudflare Pages Functions)
```

## Panel init pattern
`navigate()` dispatches `panelactivated` CustomEvent → each injector lazy-inits on first activation.
Check `panel-xxx.classList.contains('active')` at IIFE parse time for direct hash navigation.

## 5 rules — never break
1. Read RULES.md before every task — no exceptions
2. Complete replacement files only — never patches or diffs
3. One injector per panel — never put logic in a shared file loaded everywhere
4. No React, no Tailwind — pure CSS variables + vanilla JS only
5. Read all relevant source files fresh from repo before writing anything

## Read next
- `RULES.md` — compact lessons (required before every task)
- `PROJECT_STATE.md` — phases, roadmap, file inventory (required for Build Mode only)
