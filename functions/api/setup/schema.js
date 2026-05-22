import { jsonResponse } from '../_airtable.js';

const META = 'https://api.airtable.com/v0/meta/bases';
const AIRTABLE_BASE = 'https://api.airtable.com/v0';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function createTable(apiKey, baseId, def) {
  const res = await fetch(`${META}/${baseId}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(def)
  });
  if (res.status === 422 || res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const msg = (body?.error?.message || body?.message || JSON.stringify(body)).toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate') || res.status === 409) {
      return { status: 'already_exists', table: def.name };
    }
    return { status: 'error', table: def.name, error: JSON.stringify(body) };
  }
  if (!res.ok) {
    return { status: 'error', table: def.name, error: await res.text() };
  }
  const data = await res.json();
  return { status: 'created', table: def.name, id: data.id };
}

// Add a single field to an existing table — simpler validation than table creation
async function addField(apiKey, baseId, tableId, fieldDef) {
  const res = await fetch(`${META}/${baseId}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fieldDef)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body?.error?.message || '').toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate')) return { status: 'already_exists' };
    return { status: 'error', error: JSON.stringify(body) };
  }
  return { status: 'created' };
}

async function getTableIds(apiKey, baseId) {
  const res = await fetch(`${META}/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries((data.tables || []).map(t => [t.name, t.id]));
}

// Batch create up to 10 records per request
async function batchCreate(apiKey, baseId, tableName, recordsFields) {
  const created = [];
  for (let i = 0; i < recordsFields.length; i += 10) {
    const chunk = recordsFields.slice(i, i + 10);
    const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chunk.map(fields => ({ fields })) })
    });
    if (!res.ok) throw new Error(`Batch create ${tableName} error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    created.push(...data.records);
    if (i + 10 < recordsFields.length) await delay(200);
  }
  return created;
}

// Batch delete up to 10 records per request
async function batchDelete(apiKey, baseId, tableName, ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const qs = chunk.map(id => `records[]=${id}`).join('&');
    const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}?${qs}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (res.ok) deleted += chunk.length;
    if (i + 10 < ids.length) await delay(200);
  }
  return deleted;
}

function linkedField(name, tableId) {
  if (tableId) {
    return {
      name,
      type: 'multipleRecordLinks',
      options: { linkedTableId: tableId }
    };
  }
  return { name, type: 'singleLineText' };
}

// ── Table definitions ─────────────────────────────────────────────────────────
// IMPORTANT: The FIRST field in each table becomes Airtable's primary field.
// Linked-record fields cannot be primary — always put a text/date field first.

const PHASE1_TABLES = [
  {
    name: 'Categories',
    fields: [
      { name: 'name', type: 'singleLineText' },
      { name: 'group', type: 'singleSelect', options: { choices: [
        { name: 'Loan' }, { name: 'Family' }, { name: 'Basic Living' }, { name: 'Car' },
        { name: 'Service' }, { name: 'Personal' }, { name: 'Basic IT' }, { name: 'Bus IT' },
        { name: 'Business' }, { name: 'Per-earn' }, { name: 'Bus-earn' }, { name: 'Investment' }
      ]}},
      { name: 'type', type: 'singleSelect', options: { choices: [
        { name: 'Earn' }, { name: 'Expense' }, { name: 'Loan' }, { name: 'Investment' }
      ]}},
      { name: 'expense_type', type: 'singleSelect', options: { choices: [
        { name: 'FP-FV' }, { name: 'FP-VV' }, { name: 'VP-FV' }, { name: 'VP-VV' }, { name: 'Surprise' }
      ]}},
      { name: 'is_business', type: 'checkbox', options: { color: 'blueBright', icon: 'check' } },
      { name: 'cash_flow', type: 'singleSelect', options: { choices: [
        { name: 'Cash In' }, { name: 'Cash Out' }, { name: 'Cash In+Out' }
      ]}},
      { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } }
    ]
  },
  {
    name: 'Liabilities',
    fields: [
      { name: 'name', type: 'singleLineText' },
      { name: 'creditor_type', type: 'singleSelect', options: { choices: [
        { name: 'Bank' }, { name: 'Family' }, { name: 'Friend' }, { name: 'Other' }
      ]}},
      { name: 'loan_size', type: 'number', options: { precision: 0 } },
      { name: 'interest_rate', type: 'number', options: { precision: 2 } },
      { name: 'monthly_payment', type: 'number', options: { precision: 0 } },
      { name: 'current_balance', type: 'number', options: { precision: 0 } },
      { name: 'start_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
      { name: 'notes', type: 'multilineText' }
    ]
  },
  {
    name: 'Assets',
    fields: [
      { name: 'name', type: 'singleLineText' },
      { name: 'category', type: 'singleSelect', options: { choices: [
        { name: 'Property' }, { name: 'Vehicle' }, { name: 'Furniture' }, { name: 'Electronics' },
        { name: 'Collection-Knife' }, { name: 'Collection-Vice' }, { name: 'Collection-Plant' },
        { name: 'Collection-Doll' }, { name: 'Business' }, { name: 'Inventory' }, { name: 'Other' }
      ]}},
      { name: 'cost_price', type: 'number', options: { precision: 0 } },
      { name: 'estimated_value', type: 'number', options: { precision: 0 } },
      { name: 'date_acquired', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'status', type: 'singleSelect', options: { choices: [
        { name: 'Holding' }, { name: 'For Sale' }, { name: 'Sold' }, { name: 'Invested' }
      ]}},
      { name: 'velocity', type: 'singleSelect', options: { choices: [
        { name: 'Fast move' }, { name: 'Slow move' }, { name: 'Illiquid' }
      ]}},
      { name: 'notes', type: 'multilineText' },
      { name: 'cloudinary_image_url', type: 'url' },
      { name: 'sold_price', type: 'number', options: { precision: 0 } },
      { name: 'sold_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'sold_via', type: 'singleLineText' }
    ]
  },
  {
    name: 'Diary',
    fields: [
      { name: 'title', type: 'singleLineText' },
      { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'content', type: 'multilineText' },
      { name: 'entry_type', type: 'singleSelect', options: { choices: [
        { name: 'Story' }, { name: 'Idea' }, { name: 'Blog' }, { name: 'Finance note' }
      ]}},
      { name: 'tags', type: 'singleLineText' },
      { name: 'publish_to_web', type: 'checkbox', options: { color: 'blueBright', icon: 'check' } },
      { name: 'published_url', type: 'url' },
      { name: 'connected_concept', type: 'singleLineText' },
      { name: 'cloudinary_image_url', type: 'url' }
    ]
  },
  {
    name: 'AI_Chats',
    fields: [
      { name: 'session_id', type: 'singleLineText' },
      { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'topic', type: 'singleLineText' },
      { name: 'messages_json', type: 'multilineText' },
      { name: 'summary', type: 'multilineText' }
    ]
  },
  {
    name: 'Drop_Zone_Queue',
    fields: [
      { name: 'date_received', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'file_type', type: 'singleSelect', options: { choices: [
        { name: 'Receipt' }, { name: 'Transfer slip' }, { name: 'Product photo' },
        { name: 'Handwriting' }, { name: 'Quote image' }, { name: 'Other' }
      ]}},
      { name: 'cloudinary_url', type: 'url' },
      { name: 'ai_extracted_text', type: 'multilineText' },
      { name: 'ai_description', type: 'multilineText' },
      { name: 'ai_suggested_type', type: 'singleSelect', options: { choices: [
        { name: 'Transaction' }, { name: 'Asset' }, { name: 'Diary' }, { name: 'Quote' }, { name: 'Ignore' }
      ]}},
      { name: 'ai_prefilled_json', type: 'multilineText' },
      { name: 'status', type: 'singleSelect', options: { choices: [
        { name: 'Pending' }, { name: 'Approved' }, { name: 'Rejected' }
      ]}},
      { name: 'approved_record_id', type: 'singleLineText' }
    ]
  },
  {
    name: 'Quotes',
    fields: [
      { name: 'text', type: 'multilineText' },
      { name: 'author', type: 'singleLineText' },
      { name: 'source', type: 'singleLineText' },
      { name: 'date_added', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'mood_tag', type: 'singleSelect', options: { choices: [
        { name: 'Motivation' }, { name: 'Wisdom' }, { name: 'Funny' }, { name: 'Business' }, { name: 'Life' }
      ]}},
      { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
      { name: 'cloudinary_image_url', type: 'url' }
    ]
  }
];

function buildPhase3Tables(catTableId, liabTableId) {
  return [
    {
      name: 'Transactions',
      fields: [
        { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        // type must be singleSelect — NOT linked. Used to filter Income vs Expense.
        { name: 'type', type: 'singleSelect', options: { choices: [
          { name: 'Income' }, { name: 'Expense' }
        ]}},
        linkedField('category_id', catTableId),
        { name: 'amount', type: 'number', options: { precision: 0 } },
        { name: 'description', type: 'singleLineText' },
        { name: 'entity', type: 'singleLineText' },
        { name: 'note', type: 'singleLineText' },
        { name: 'source', type: 'singleSelect', options: { choices: [
          { name: 'Manual' }, { name: 'DropZone' }, { name: 'LiabilityPayment' }
        ]}}
      ]
    },
    {
      // Utilities tracks electricity and water per month separately
      name: 'Utilities',
      fields: [
        { name: 'month', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'electricity_units', type: 'number', options: { precision: 2 } },
        { name: 'electricity_charge', type: 'number', options: { precision: 0 } },
        { name: 'water_units', type: 'number', options: { precision: 2 } },
        { name: 'water_charge', type: 'number', options: { precision: 0 } },
        { name: 'notes', type: 'multilineText' }
      ]
    },
    {
      name: 'Budgets',
      fields: [
        // label is the primary field — linked fields cannot be primary
        { name: 'label', type: 'singleLineText' },
        linkedField('category_id', catTableId),
        { name: 'amount', type: 'number', options: { precision: 0 } },
        { name: 'period', type: 'singleSelect', options: { choices: [
          { name: 'Monthly' }, { name: 'Annual' }, { name: '3x-year' }, { name: 'One-time' }, { name: 'Open-end' }
        ]}},
        { name: 'start_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'end_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
        { name: 'notes', type: 'multilineText' }
      ]
    },
    {
      name: 'Liability_Payments',
      fields: [
        // date is the primary field — linked fields cannot be primary
        { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        linkedField('liability_id', liabTableId),
        { name: 'total_payment', type: 'number', options: { precision: 0 } },
        { name: 'principal', type: 'number', options: { precision: 0 } },
        { name: 'interest', type: 'number', options: { precision: 0 } },
        { name: 'notes', type: 'singleLineText' }
      ]
    }
  ];
}

// ── Seed data ──────────────────────────────────────────────────────────────────

const CATEGORY_SEEDS = [
  { name: 'Tisco', group: 'Loan', type: 'Loan', expense_type: 'FP-FV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Watch interest', group: 'Loan', type: 'Loan', expense_type: 'FP-FV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Thai credit', group: 'Loan', type: 'Loan', expense_type: 'FP-FV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Credit Kasikorn', group: 'Loan', type: 'Loan', expense_type: 'FP-FV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Credit KTC', group: 'Loan', type: 'Loan', expense_type: 'FP-FV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Friend and Family loan', group: 'Loan', type: 'Loan', expense_type: 'VP-VV', cash_flow: 'Cash In+Out', active: true },
  { name: 'Kid school', group: 'Family', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Kid training', group: 'Family', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Wife salary', group: 'Family', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Kid salary', group: 'Family', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Travel activities', group: 'Family', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Coffee', group: 'Basic Living', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Food super', group: 'Basic Living', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Food restaurant', group: 'Basic Living', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Electricity', group: 'Basic Living', type: 'Expense', expense_type: 'FP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Home water', group: 'Basic Living', type: 'Expense', expense_type: 'FP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Fuel', group: 'Basic Living', type: 'Expense', expense_type: 'FP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Drinking water', group: 'Basic Living', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'AIS net', group: 'Basic IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'My AIS', group: 'Basic IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Netflix/Disney', group: 'Basic IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Youtube music', group: 'Basic IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'iCloud', group: 'Basic IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Car insurance', group: 'Car', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Battery replacement', group: 'Car', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Car services', group: 'Car', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Tires', group: 'Car', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Maid', group: 'Service', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Gym', group: 'Personal', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', active: true },
  { name: 'Cigarette', group: 'Personal', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Medicine', group: 'Personal', type: 'Expense', expense_type: 'Surprise', cash_flow: 'Cash Out', active: true },
  { name: 'Personal need', group: 'Personal', type: 'Expense', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Unplanned buy', group: 'Personal', type: 'Expense', expense_type: 'Surprise', cash_flow: 'Cash Out', active: true },
  { name: 'Flow account', group: 'Bus IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Cloudflare', group: 'Bus IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Canva', group: 'Bus IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Anthropic', group: 'Bus IT', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Accountant', group: 'Business', type: 'Expense', expense_type: 'FP-FV', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Project investment', group: 'Investment', type: 'Investment', expense_type: 'VP-VV', cash_flow: 'Cash Out', active: true },
  { name: 'Old stocks sale', group: 'Per-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', active: true },
  { name: 'Collection sale', group: 'Per-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', active: true },
  { name: 'Stock earn', group: 'Per-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', active: true },
  { name: 'Pilates I-Flex', group: 'Bus-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', is_business: true, active: true },
  { name: 'Satu Sale', group: 'Bus-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', is_business: true, active: true },
  { name: 'Ploikong sale', group: 'Bus-earn', type: 'Earn', expense_type: 'VP-VV', cash_flow: 'Cash In', is_business: true, active: true }
];

const LIABILITY_SEEDS = [
  { name: 'Tisco', creditor_type: 'Bank', loan_size: 400000, interest_rate: 0, monthly_payment: 14000, current_balance: 400000, active: true },
  { name: 'Watch interest', creditor_type: 'Other', loan_size: 50000, interest_rate: 2, monthly_payment: 1000, current_balance: 50000, active: true },
  { name: 'Thai credit', creditor_type: 'Bank', loan_size: 2800000, interest_rate: 0, monthly_payment: 12750, current_balance: 2800000, active: true },
  { name: 'Credit Kasikorn', creditor_type: 'Bank', loan_size: 50000, interest_rate: 0, monthly_payment: 5000, current_balance: 50000, active: true },
  { name: 'Credit KTC', creditor_type: 'Bank', loan_size: 50000, interest_rate: 0, monthly_payment: 5000, current_balance: 50000, active: true },
  { name: 'Friend and Family', creditor_type: 'Family', loan_size: 200000, interest_rate: 0, monthly_payment: 0, current_balance: 200000, active: true }
];

// catName → actual Categories.name where they differ
const BUDGET_CAT_MAP = {
  'Travel': 'Travel activities',
  'Unplanned': 'Unplanned buy'
};

const BUDGET_SEEDS = [
  { catName: 'Kid school', amount: 140000, period: '3x-year' },
  { catName: 'Kid training', amount: 12000, period: 'Monthly' },
  { catName: 'Wife salary', amount: 20000, period: 'Monthly' },
  { catName: 'Kid salary', amount: 2000, period: 'Monthly' },
  { catName: 'Travel', amount: 300000, period: 'Annual' },
  { catName: 'Coffee', amount: 2000, period: 'Monthly' },
  { catName: 'Food super', amount: 5000, period: 'Monthly' },
  { catName: 'Food restaurant', amount: 8000, period: 'Monthly' },
  { catName: 'Electricity', amount: 4000, period: 'Monthly' },
  { catName: 'Home water', amount: 250, period: 'Monthly' },
  { catName: 'Fuel', amount: 5000, period: 'Monthly' },
  { catName: 'Drinking water', amount: 1500, period: 'Monthly' },
  { catName: 'AIS net', amount: 900, period: 'Monthly' },
  { catName: 'My AIS', amount: 1000, period: 'Monthly' },
  { catName: 'Netflix/Disney', amount: 290, period: 'Monthly' },
  { catName: 'Youtube music', amount: 189, period: 'Monthly' },
  { catName: 'iCloud', amount: 99, period: 'Monthly' },
  { catName: 'Car insurance', amount: 25000, period: 'Annual' },
  { catName: 'Battery replacement', amount: 2400, period: 'Annual' },
  { catName: 'Car services', amount: 5000, period: 'Monthly' },
  { catName: 'Tires', amount: 25000, period: 'Annual' },
  { catName: 'Maid', amount: 2000, period: 'Monthly' },
  { catName: 'Gym', amount: 3000, period: 'Monthly' },
  { catName: 'Cigarette', amount: 2700, period: 'Monthly' },
  { catName: 'Medicine', amount: 10000, period: 'Annual' },
  { catName: 'Personal need', amount: 2000, period: 'Monthly' },
  { catName: 'Unplanned', amount: 100000, period: 'Annual' },
  { catName: 'Cloudflare', amount: 1200, period: 'Annual' },
  { catName: 'Canva', amount: 290, period: 'Monthly' },
  { catName: 'Anthropic', amount: 700, period: 'Monthly' },
  { catName: 'Accountant', amount: 12500, period: 'Annual' }
];

// ── Main handler ──────────────────────────────────────────────────────────────
// phase=tables  → create all 11 tables (~10-15s, safe)
// phase=seed    → seed categories, liabilities, budgets (~10-15s, safe)
// (no phase)    → defaults to tables — setup.html calls both separately

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const phase = url.searchParams.get('phase') || 'tables';

  const BASE_ID = env.AIRTABLE_BASE_ID || 'apphBGWfSPL45oSFd';
  const apiKey = env.AIRTABLE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AIRTABLE_API_KEY not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  /* ── PHASE: tables ────────────────────────────────────────────────────────── */
  if (phase === 'tables') {
    const results = [];

    // Step 1: create Categories, Liabilities, Assets, Diary, AI_Chats, Drop_Zone_Queue, Quotes
    for (const def of PHASE1_TABLES) {
      results.push(await createTable(apiKey, BASE_ID, def));
      await delay(250);
    }

    // Step 2: fetch table IDs to pass linked table references
    await delay(300);
    const tableIds = await getTableIds(apiKey, BASE_ID);
    const catTableId = tableIds['Categories'];
    const liabTableId = tableIds['Liabilities'];

    // Step 3: create Transactions, Utilities, Budgets, Liability_Payments with linked fields inline
    const phase3Tables = buildPhase3Tables(catTableId, liabTableId);
    for (const def of phase3Tables) {
      results.push(await createTable(apiKey, BASE_ID, def));
      await delay(250);
    }

    return jsonResponse({ phase: 'tables', results });
  }

  /* ── PHASE: dedup ────────────────────────────────────────────────────────── */
  // Removes duplicate category records — keeps first of each name, deletes rest
  if (phase === 'dedup') {
    const res = await fetch(
      `${AIRTABLE_BASE}/${BASE_ID}/Categories?maxRecords=500`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return jsonResponse({ error: 'Could not fetch categories' }, 500);
    const data = await res.json();
    const allRecords = data.records || [];

    const seen = new Set();
    const toDelete = [];
    allRecords.forEach(r => {
      const name = r.fields.name || '';
      if (seen.has(name)) {
        toDelete.push(r.id);
      } else {
        seen.add(name);
      }
    });

    let deleted = 0;
    if (toDelete.length > 0) {
      deleted = await batchDelete(apiKey, BASE_ID, 'Categories', toDelete);
    }

    return jsonResponse({
      phase: 'dedup',
      total_before: allRecords.length,
      duplicates_deleted: deleted,
      kept: allRecords.length - deleted
    });
  }

  /* ── PHASE: seed ──────────────────────────────────────────────────────────── */
  if (phase === 'seed') {
    async function countExisting(table) {
      const res = await fetch(
        `${AIRTABLE_BASE}/${BASE_ID}/${encodeURIComponent(table)}?maxRecords=1`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!res.ok) return 0;
      const d = await res.json();
      return (d.records || []).length;
    }

    // Seed Categories — skip if already populated
    let catRecords = [];
    const existingCats = await countExisting('Categories');
    if (existingCats > 0) {
      // Already seeded — just fetch IDs for budget linking
      const res = await fetch(
        `${AIRTABLE_BASE}/${BASE_ID}/Categories?maxRecords=200`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const d = await res.json();
      catRecords = d.records || [];
    } else {
      try {
        catRecords = await batchCreate(apiKey, BASE_ID, 'Categories', CATEGORY_SEEDS);
      } catch (e) {
        return jsonResponse({ phase: 'seed', error: 'Categories seed failed: ' + e.message }, 500);
      }
    }
    const catIdByName = {};
    catRecords.forEach(r => { catIdByName[r.fields.name] = r.id; });

    // Seed Liabilities — skip if already populated
    let liabSeeds = { status: 'ok', count: 0, skipped: false };
    const existingLiabs = await countExisting('Liabilities');
    if (existingLiabs > 0) {
      liabSeeds = { status: 'ok', count: existingLiabs, skipped: true };
    } else {
      try {
        const recs = await batchCreate(apiKey, BASE_ID, 'Liabilities', LIABILITY_SEEDS);
        liabSeeds = { status: 'ok', count: recs.length };
      } catch (e) {
        liabSeeds = { status: 'error', error: e.message };
      }
    }

    // Seed Budgets — skip if already populated
    let budgetSeeds = { status: 'ok', count: 0, skipped: false };
    const existingBudgets = await countExisting('Budgets');
    if (existingBudgets > 0) {
      budgetSeeds = { status: 'ok', count: existingBudgets, skipped: true };
    } else {
      const today = new Date().toISOString().split('T')[0];
      const budgetFields = BUDGET_SEEDS.map(b => {
        const actualName = BUDGET_CAT_MAP[b.catName] || b.catName;
        const catId = catIdByName[actualName];
        const fields = { label: actualName, amount: b.amount, period: b.period, start_date: today, active: true };
        if (catId) fields.category_id = [catId];
        return fields;
      });
      try {
        const recs = await batchCreate(apiKey, BASE_ID, 'Budgets', budgetFields);
        budgetSeeds = { status: 'ok', count: recs.length };
      } catch (e) {
        budgetSeeds = { status: 'error', error: e.message };
      }
    }

    return jsonResponse({
      phase: 'seed',
      categories: { seeded: catRecords.length, skipped: existingCats > 0 },
      liabilities: liabSeeds,
      budgets: budgetSeeds
    });
  }

  /* ── PHASE: seed-budgets ─────────────────────────────────────────────────── */
  // Use when categories + liabilities are already seeded but budgets failed
  if (phase === 'seed-budgets') {
    // Fetch existing category records to get their IDs
    let catRecords;
    try {
      const res = await fetch(
        `${AIRTABLE_BASE}/${BASE_ID}/${encodeURIComponent('Categories')}?maxRecords=200`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!res.ok) throw new Error(`Fetch categories error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      catRecords = data.records || [];
    } catch (e) {
      return jsonResponse({ phase: 'seed-budgets', error: 'Could not fetch categories: ' + e.message }, 500);
    }

    const catIdByName = {};
    catRecords.forEach(r => { catIdByName[r.fields.name] = r.id; });

    const today = new Date().toISOString().split('T')[0];
    const budgetFields = BUDGET_SEEDS.map(b => {
      const actualName = BUDGET_CAT_MAP[b.catName] || b.catName;
      const catId = catIdByName[actualName];
      const fields = { label: actualName, amount: b.amount, period: b.period, start_date: today, active: true };
      if (catId) fields.category_id = [catId];
      return fields;
    });

    let budgetSeeds = { status: 'ok', count: 0 };
    try {
      const recs = await batchCreate(apiKey, BASE_ID, 'Budgets', budgetFields);
      budgetSeeds = { status: 'ok', count: recs.length };
    } catch (e) {
      budgetSeeds = { status: 'error', error: e.message };
    }

    return jsonResponse({ phase: 'seed-budgets', budgets: budgetSeeds });
  }

  return jsonResponse({ error: `Unknown phase: ${phase}. Use ?phase=tables, ?phase=seed, or ?phase=seed-budgets` }, 400);
}
