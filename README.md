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
- Random quote banner pulled from your quotes library

## Tech Stack

- **Cloudflare Pages** — static hosting + Functions for all API routes
- **Airtable** — database (all tables)
- **Cloudinary** — image storage (assets, diary, drop zone)
- **Anthropic Claude API** — AI features (drop zone OCR, diary assist, AI advisor)
- **Cloudflare KV** — session storage (HttpOnly cookie auth)
- **Vanilla JS** — no frameworks, no build step

## Environment Variables

Set these in Cloudflare Pages → Settings → Environment Variables:

| Variable | Description |
|---|---|
| `AIRTABLE_API_KEY` | Personal Access Token from Airtable |
| `AIRTABLE_BASE_ID` | Base ID of your chaijohn-core base (e.g. `apphBGWfSPL45oSFd`) |
| `AIRTABLE_BUSINESS_BASE_ID` | Business base ID for blog push (e.g. `appMBjlfYyVd8I7ML`) |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name (e.g. `dfiomi0lb`) |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `CHAIJOHN_KV` | Cloudflare KV namespace binding name |

> **Note:** `AIRTABLE_BASE_ID` and `CLOUDINARY_CLOUD_NAME` are already set as plain vars in `wrangler.toml`. All others must be added as **encrypted secrets** in the Cloudflare Pages dashboard.

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
- The entry is pushed to your business Airtable base (`AIRTABLE_BUSINESS_BASE_ID`, table: `Blogs`)
- Your Cloudflare Workers on janishammer-central and i-flexthailand.com can query this table

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
  index.html                   ← PIN login page
  dashboard.html               ← Finance dashboard
  entry.html                   ← Data entry (Transactions, Utilities, Debts, Budgets)
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
      dashboard.injector.js    ← Dashboard charts + analytics
      entry.injector.js        ← Data entry tabs
      diary.injector.js        ← Diary editor + AI assist
      collection.injector.js   ← Collection grid + modals
      ai.injector.js           ← AI advisor chat

functions/                     ← Cloudflare Pages Functions (server-side API)
  _middleware.js               ← Auth guard for all /api/* routes
  _airtable.js                 ← Shared Airtable helpers
  api/
    auth.js                    ← POST /api/auth/verify|setup|logout
    auth/
      check.js                 ← GET /api/auth/check
    transactions.js            ← CRUD /api/transactions
    categories.js              ← CRUD /api/categories
    debts.js                   ← CRUD /api/debts (with payments)
    assets.js                  ← CRUD /api/assets + ploikong-sync
    diary.js                   ← CRUD /api/diary
    utilities.js               ← GET/POST /api/utilities
    quotes.js                  ← CRUD /api/quotes + random
    budgets.js                 ← CRUD /api/budgets
    dropzone.js                ← POST /api/dropzone + approve
    upload-image.js            ← POST /api/upload-image (Cloudinary)
    ai-chat.js                 ← POST /api/ai-chat (SSE streaming) + save + context
    export-social.js           ← POST /api/export-social
    setup/
      schema.js                ← POST /api/setup/schema (one-time init)

import-utilities.js            ← Node.js script: import utility records from Excel
import-assets.js               ← Node.js script: import asset records from Excel
```

## Airtable Schema

| Table | Key Fields |
|---|---|
| `Categories` | name, type (Income/Expense), fixed_variable |
| `Transactions` | date, type, amount, category_name, entity, description, note, source |
| `Debts` | creditor_name, creditor_type, original_amount, current_balance, interest_rate, monthly_payment, due_date, status |
| `Assets` | name, category, cost_price, estimated_value, status, velocity, date_acquired, sold_price, sold_date, sold_via, cloudinary_image_url, notes |
| `Diary` | date, title, content, entry_type, tags, publish_to_web, connected_concept, cloudinary_image_url |
| `AI_Chats` | session_id, messages_json, topic, created_at |
| `Utilities` | month, electricity_units, electricity_charge, water_units, water_charge, notes |
| `Quotes` | text, author, source, date_added, mood_tag, active |
| `Drop_Zone_Queue` | cloudinary_url, filename, mime_type, status, ai_result, suggested_type |
| `Budgets` | label, amount, period, start_date, end_date, active |

## Security Notes

- Single-user app: one PIN protects everything
- Session stored in Cloudflare KV server-side, not in client localStorage
- Cookie is `HttpOnly`, `Secure`, `SameSite=Strict` — cannot be read by JavaScript
- No API keys are ever exposed to the frontend browser
- All Airtable, Cloudinary, and Anthropic API calls are made server-side in Functions
- PIN is hashed with SHA-256 + random salt before storage in KV
- All `/api/*` routes are protected by `_middleware.js` auth check

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
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
ANTHROPIC_API_KEY=xxx
```

For KV in local dev, create a preview binding in your `wrangler.toml`.
