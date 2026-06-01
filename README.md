# Chaijohn Dashboard

A private personal financial diary and command center for one Thai entrepreneur in Rayong, Thailand.

## Features

- Finance dashboard with cashflow analytics, Pareto spending charts, debt tracking, and net worth visualization
- Expense/income entry with category tracking and budget progress bars
- Diary + blog with AI writing assistant (refine, expand, summarize, tag suggestions)
- Collection asset management with photo uploads and social sharing (Facebook + Instagram)
- AI strategy advisor powered by Claude — loads your live financial snapshot
- Drop Zone: drag-and-drop any image/receipt for AI extraction and review
- Budget tracking with real-time vs-actual progress indicators
- Utility tracking (electricity + water) with rate calculations
- Sales aggregation — reads live revenue from business operations system
- Random quote banner pulled from your quotes library

## Tech Stack

- **Cloudflare Pages** — static hosting + Functions for all API routes
- **Airtable (chaijohn-core)** — personal database (all personal tables)
- **Airtable (Janis Business DB)** — business operations database (read-only from this dashboard)
- **Cloudinary** — image storage (assets, diary, drop zone)
- **Anthropic Claude API** — AI features (drop zone OCR, diary assist, AI advisor)
- **Cloudflare KV** — session storage (HttpOnly cookie auth)
- **Vanilla JS** — no frameworks, no build step

## Environment Variables

Set these in Cloudflare Pages → Settings → Environment Variables:

| Variable | Description |
|---|---|
| `AIRTABLE_API_KEY` | Personal Access Token from Airtable |
| `AIRTABLE_BASE_ID` | Base ID of chaijohn-core personal base (`apphBGWfSPL45oSFd`) |
| `AIRTABLE_BUSINESS_BASE_ID` | Janis Business DB base ID (`appMBjlfYyVd8I7ML`) — used for Sales data read + Blog push |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name (e.g. `dfiomi0lb`) |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `CHAIJOHN_KV` | Cloudflare KV namespace binding name |

> **Note:** `AIRTABLE_BASE_ID` and `CLOUDINARY_CLOUD_NAME` are already set as plain vars in `wrangler.toml`. All others must be added as **encrypted secrets** in the Cloudflare Pages dashboard.

> **Business Base note:** `AIRTABLE_BUSINESS_BASE_ID` points to the Janis Business DB — a full business operations database containing Products, Sale records, Customer data, Quotes, and Blog content across 5 business units (BUS00–BUS04). This dashboard reads from it but never writes to it (except Blog push). All writes to business data are handled by the separate Operational Dashboard system.

## Setup Steps

### 1. Airtable Setup

1. Log in to [Airtable](https://airtable.com)
2. Create a new workspace: "Chaijohn Personal"
3. Create a new base: "chaijohn-core"
4. Get your Base ID from the URL: `https://airtable.com/apphBGWfSPL45oSFd/...` (the `appXXX` part)
5. Get an API key: Account → Developer hub → Create Personal Access Token
   - Scopes: `data.records:read`, `data.records:write`, `schema.bases:write`, `schema.bases:read`
   - Access: your new workspace

### 2. Cloudflare KV Setup

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Workers & Pages → KV
3. Create namespace: `CHAIJOHN_KV`
4. Copy the namespace ID
5. In `wrangler.toml`, replace `"placeholder"` in `[[kv_namespaces]]` with your namespace ID
6. In Pages → Settings → Functions → KV namespace bindings, bind `CHAIJOHN_KV` to your namespace

### 3. Cloudinary Setup

1. Log in to [Cloudinary](https://cloudinary.com)
2. Dashboard → API Keys → copy Cloud Name, API Key, and API Secret

### 4. Deploy to Cloudflare Pages

1. Fork or clone this repo to your GitHub account
2. Log in to Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git
3. Select this repo
4. Build settings:
   - Framework preset: **None**
   - Build command: _(leave empty)_
   - Build output directory: `public`
5. Add all environment variables (see table above)
6. Click **Deploy**

### 5. First-time Setup (Post-Deploy)

1. Visit `https://your-pages-url.pages.dev/setup.html`
2. **Step 1** — Create your PIN (4–6 digits)
3. **Step 2** — Click "Initialize Schema" to create all Airtable tables:
   - Creates: Categories, Transactions, Debts, Assets, Diary, AI_Chats, Utilities, Quotes, Drop_Zone_Queue, Budgets
   - Seeds Categories with pre-configured expense/income categories
4. Visit `/dashboard.html` to start using the app

### 6. Import Historical Data (Optional)

> Do **NOT** import financial transaction history. Start fresh from today.
> The Excel cashflow sheets are for reference only. Only asset and utility data is imported.

**Install Node.js dependencies first:**

```bash
npm install
```

**Import utility records** (from `My_house_Expense_control_tracking_x_8_24.xlsx`):

```bash
AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node import-utilities.js path/to/file.xlsx
```

**Import asset/collection records** (from `Fin_Track_2025.xlsx` and `Fin_Track_2026.xlsx`):

```bash
AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node import-assets.js Fin_Track_2025.xlsx Fin_Track_2026.xlsx
```

Both scripts skip records that already exist in Airtable (by name / month) to prevent duplicates.

## Usage Guide

### Authentication

- Single PIN protects the entire app
- Set up at `/setup.html` on first visit
- Session lasts 7 days (HttpOnly cookie stored in Cloudflare KV)

### Drop Zone

- Fixed 📥 button on every protected page (bottom-right)
- Drag receipts, photos, handwritten notes, or quote images onto the panel
- Claude Vision analyzes the image and pre-fills form fields
- Review and approve or reject each detected item
- Supports: Transactions, Assets, Diary entries, Quotes

### Adding Transactions

- Go to Entry page → Transactions tab
- Toggle EARN / EXPENSE
- Fill date, amount, category, entity, description
- Click Save — appears immediately in the list below
- Tap any row in the list to open inline editing

### Blog Publishing

- Create a Diary entry with type set to **Blog**
- Check "Publish to web" before saving
- The entry is pushed to Janis Business DB (`AIRTABLE_BUSINESS_BASE_ID`, table: `Blogs`)
- Your Cloudflare Workers on janishammer-central and i-flexthailand.com can query this table

### Sales Panel

- Aggregates revenue from all streams: active businesses, project revenue, personal asset sales
- Business revenue is read-only — sourced from the Operational Dashboard's Airtable base
- Manual income entries via Entry button (EARN tab) with Income Source dropdown
- AR tracking: outstanding balances shown with overdue items in red
- All confirmed payments automatically inject into Cashflow

### Collection Sharing

Each asset card has a **Share** button with three options:

- **Facebook** — opens Facebook share dialog using the Cloudinary image URL, copies caption to clipboard
- **Instagram** — copies a formatted caption with hashtags, opens Instagram in a new tab
- **Ploikong Sync** — logs the asset for Ploikong platform sync (available in v2)

### AI Advisor

- Automatically loads your live financial snapshot (net worth, debts, cashflow)
- Ask Claude about cashflow, debt strategy, asset sales, spending habits
- Conversations auto-save to Airtable after 30 minutes of inactivity
- Use suggested prompts (chips below input) to get started quickly

### Budgets

- Create budgets with a label (matching a category name), amount, and period
- Dashboard and entry pages show real-time actual vs budget with color-coded progress bars
- Green = under 80%, Amber = 80–100%, Red = over budget

## Architecture

```
public/                        ← Static files (Cloudflare Pages CDN)
  index.html                   ← Single-page shell (sidebar + panels + entry drawer)
  dashboard.html               ← Redirect to /#dashboard
  entry.html                   ← Redirect to /
  diary.html                   ← Diary + Blog editor
  collection.html              ← Collection asset management
  ai-advisor.html              ← AI strategy chat
  setup.html                   ← One-time setup wizard
  assets/
    css/
      global.css               ← Shared styles, design tokens
    js/
      auth.js                  ← Auth check + login form on all pages
      dropzone.js              ← Drop Zone component (all pages)
      cashflow.injector.js     ← M2.1 Cashflow — DEF CON 5, simulation, 3 budget types
      expenses.injector.js     ← M2.3 Expenses — trend+pareto, period selector
      liabilities-panel.injector.js ← M2.6 Liabilities — charts + static cards
      budget-panel.injector.js ← M2.5 Budget — 12-mo matrix, GAP rows
      ideas-panel.injector.js  ← M3.1 Ideas — KPI strip, AI toggle, pin
      dash-overview.injector.js← M1.1 Dashboard overview
      entry.injector.js        ← Entry drawer — all 4 tabs
      diary.injector.js        ← Diary editor + AI assist
      collection.injector.js   ← Collection grid + modals + gallery
      projects.injector.js     ← M3.4 Projects (9C — in progress)
      sales.injector.js        ← M2.2 Sales (9D — planned)
      ai.injector.js           ← AI advisor chat

functions/                     ← Cloudflare Pages Functions (server-side API)
  _middleware.js               ← Auth guard for all /api/* routes
  _airtable.js                 ← Shared Airtable helpers
  api/
    auth.js + auth/check.js    ← POST /api/auth/verify|setup|logout
    transactions.js            ← CRUD /api/transactions
    categories.js              ← CRUD /api/categories
    debts.js                   ← CRUD /api/debts
    assets.js                  ← CRUD /api/assets + ploikong-sync
    liabilities.js             ← CRUD /api/liabilities
    liabilities/[id].js        ← PATCH/payment /api/liabilities/:id
    diary.js                   ← CRUD /api/diary
    utilities.js               ← GET/POST /api/utilities
    quotes.js                  ← CRUD /api/quotes + random
    budgets.js + budgets/[id].js ← CRUD /api/budgets
    cashflow-sync.js           ← GET/POST KV sync point
    active-strategy.js         ← GET/POST KV DEF CON 5 state
    dropzone.js                ← POST /api/dropzone + approve
    upload-image.js            ← POST /api/upload-image (Cloudinary)
    ai-chat.js                 ← POST /api/ai-chat (SSE streaming)
    export-social.js           ← POST /api/export-social
    projects.js                ← CRUD /api/projects (9C)
    project-tasks.js           ← CRUD /api/project-tasks (9C)
    project-resources.js       ← CRUD /api/project-resources (9C)
    sales.js                   ← GET/POST /api/sales (9D — planned)
    setup/schema.js            ← POST /api/setup/schema (one-time init)
```

## Airtable Schema

### chaijohn-core (personal base)

| Table | Key Fields |
|---|---|
| `Categories` | name, group, type (Earn/Expense/Loan/Investment), fixed_variable (Bus-earn/Per-earn/etc) |
| `Transactions` | date, type, amount, budget_id, category_id (legacy), entity, description, note, source |
| `Debts` | creditor_name, creditor_type, original_amount, current_balance, interest_rate, monthly_payment |
| `Liabilities` | name, creditor_type, loan_size, interest_rate, monthly_payment, current_balance, active |
| `Liability_Payments` | liability_id, date, amount, note |
| `Assets` | name, category, cost_price, estimated_value, status, velocity, date_acquired, sold_price, sold_date, cloudinary_image_url |
| `Diary` | date, title, content, entry_type, tags, publish_to_web, connected_concept, cloudinary_image_url |
| `AI_Chats` | session_id, messages_json, topic, created_at |
| `Utilities` | month, electricity_units, electricity_charge, water_units, water_charge, notes |
| `Quotes` | text, author, source, date_added, mood_tag, active |
| `Drop_Zone_Queue` | cloudinary_url, filename, mime_type, status, ai_result, suggested_type |
| `Budgets` | label, category_id, amount, period, start_date, end_date, active, backlog_type, period_due_day |
| `Projects` | name, type, current_phase, sales_forecast_sent, finance_opened, target_revenue_monthly |
| `ProjectPhases` | project_id, phase_code, status, exit_checklist_complete |
| `ProjectMilestones` | project_id, phase_id, name, auto_date, status |
| `ProjectTasks` | project_id, phase_id, title, finish_by, status, priority, depends_on_task_id |
| `ProjectResources` | project_id, item, cost, status |

### Janis Business DB (business base — read-only from this dashboard)

| Table | Used for |
|---|---|
| `Business ID` | Registry of all businesses — drives dynamic Sales lanes |
| `Products` | Product catalog — sale card images and pareto display |
| `Sale_record` | All invoices + payment stages — primary M2.2 Sales data |
| `customer` | Customer names for AR display |
| `quote` | Open quotes/proposals for Sales summary bubbles |
| `Blogs` | Blog push destination (write-only from Diary) |

## Security Notes

- Single-user app: one PIN protects everything
- Session stored in Cloudflare KV server-side, not in client localStorage
- Cookie is `HttpOnly`, `Secure`, `SameSite=Strict` — cannot be read by JavaScript
- No API keys are ever exposed to the frontend browser
- All Airtable, Cloudinary, and Anthropic API calls are made server-side in Functions
- PIN is hashed with SHA-256 + random salt before storage in KV
- All `/api/*` routes are protected by `_middleware.js` auth check
- Business base access is read-only — no writes except Blog push

## Development Notes

To test locally with Wrangler:

```bash
npm install -g wrangler
wrangler pages dev public --compatibility-date=2024-01-01
```

Set local secrets in `.dev.vars` file (never commit this):

```
AIRTABLE_API_KEY=xxx
AIRTABLE_BASE_ID=xxx
AIRTABLE_BUSINESS_BASE_ID=xxx
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
ANTHROPIC_API_KEY=xxx
```

For KV in local dev, create a preview binding in your `wrangler.toml`.
