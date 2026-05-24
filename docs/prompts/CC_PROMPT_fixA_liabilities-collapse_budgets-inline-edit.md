# ✅ COMPLETE — archived 2026-05-24

Before writing any code, read these files:
/docs/LESSONS.md, /docs/DECISIONS.md, /docs/PROGRESS.md
Summarize what you understand before proceeding.

If DECISIONS.md or PROGRESS.md do not exist, create them now
using the content below before touching any other file.

─── CREATE /docs/DECISIONS.md ───────────────────────────────
# Key Decisions — Chaijohn Dashboard

- No Canva API — Cloudinary only for image storage
- Blog push: when publish_to_web=true AND entry_type=Blog,
  push copy to AIRTABLE_BUSINESS_BASE_ID → Blogs table
  (title, content, tags, date, published_url)
  Personal base never receives from business base.
- Liability payments auto-split principal vs interest
- Expense types: FP-FV / FP-VV / VP-FV / VP-VV / Surprise
- Investment shown separately with toggle on cashflow
- Connected Concept field links to Obsidian knowledge graph
- Drop Zone: process files in parallel, spinner per file
- Session stored in KV: key="chat_session_{uuid}", 7-day expiry
- Currency: THB (฿). Language: English UI.
- No React/Vue/SPA — Vanilla JS + CSS variables only
- Each page has exactly one dedicated injector JS file

─── CREATE /docs/PROGRESS.md ────────────────────────────────
# Progress Log — Chaijohn Dashboard

## Built and working
- Cloudflare Pages: chaijohn-dashboard.pages.dev
- PIN auth + KV sessions
- 11 Airtable tables in chaijohn-core base
- Dashboard: T1/T2/T3 charts, Budget Meters, Risk Simulator,
  Solution Playroom, Alert chips
- Entry: Transactions, Utilities, Liabilities, Budgets tabs
- Diary: working (Parts 1-4 fixes applied)
- Drop Zone: uploads + AI reads receipts
  (Approve fix applied in Part 2 — verify on live test)
- Collection, AI Advisor: built, not fully tested

## Completed by CC
- Part 1: LESSONS.md created
- Part 2: Dashboard fixes 1-8
- Part 3: Risk Simulator redesign
- Part 4: Diary fixes 9-13

## Pending
- Session A: Fix 18, Fix 21
- Session B: Fix 19, Fix 22
- Session C: Fix 14, Fix 15, Fix 16, Fix 17

## Constants
REPO: github.com/Csmittee/chaijohn-personal
BRANCH: claude/build-chaijohn-dashboard-6LTTy
AIRTABLE PERSONAL: apphBGWfSPL45oSFd
AIRTABLE BUSINESS: appMBjlfYyVd8I7ML
CLOUDINARY: dfiomi0lb
─────────────────────────────────────────────────────────────

SCOPE FOR THIS SESSION: Fix 18 and Fix 21 only.
Do not touch any other file.

─────────────────────────────────────────────
FIX 18 — LIABILITIES: COLLAPSE ADD NEW FORM
─────────────────────────────────────────────
File: entry.html + entry.injector.js

Wrap the "Add New Liability" form section in a collapsible panel:
  Default state: collapsed (form hidden)
  Header row: "＋ Add New Liability" — full width, clickable
  Right side of header: chevron icon ▼ rotates to ▲ when open
  Form slides open with CSS max-height transition (300ms ease)
  When open, clicking header again collapses it

Do not change any form fields or save logic inside the form.
Do not touch Log a Payment section above it.
Do not touch the active debts summary table below it.

─────────────────────────────────────────────
FIX 21 — BUDGETS: INLINE EDIT PER ROW
─────────────────────────────────────────────
File: entry.html + entry.injector.js + functions/api/budgets.js

In the Active Budgets list, add a pencil icon ✏️ to the 
right side of each budget row.

Click ✏️ → expands an inline edit panel below that row:
  Pre-filled editable fields:
    Label (text input)
    Category (dropdown — same options as create form)
    Amount ฿ (number input)
    Period (select: Monthly/Annual/One-time)
    Start Date (date input)
    End Date (date input, optional)
    Active (checkbox toggle)
  
  Three buttons at bottom of panel:
    Save → PATCH /api/budgets/{id} → collapse panel → 
           refresh budget list
    Cancel → collapse panel, no changes saved
    Delete → show confirm dialog "Delete this budget? 
             Cannot be undone." → on confirm: 
             DELETE /api/budgets/{id} → remove row from list

Only one edit panel open at a time — opening a new one 
closes any currently open panel.

Add PATCH handler to /api/budgets.js:
  Read id from URL params
  Accept body: {label, category_id, amount, period, 
                start_date, end_date, active}
  PATCH Airtable Budgets record
  Return updated record

Add DELETE handler to /api/budgets.js:
  Read id from URL params
  DELETE Airtable Budgets record
  Return {success: true}

Do not touch: dashboard files, diary, collection, 
ai-advisor, schema.js, auth files, Drop Zone.

Push to branch: claude/build-chaijohn-dashboard-6LTTy
List all files changed at the end.