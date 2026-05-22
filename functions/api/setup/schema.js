import { createRecord, jsonResponse } from '../_airtable.js';

const META = 'https://api.airtable.com/v0/meta/bases';
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
      return { status: 'already_exists', table: def.name, id: null };
    }
    return { status: 'error', table: def.name, error: JSON.stringify(body), id: null };
  }
  if (!res.ok) {
    return { status: 'error', table: def.name, error: await res.text(), id: null };
  }
  const data = await res.json();
  return { status: 'created', table: def.name, id: data.id };
}

async function getTableIds(apiKey, baseId) {
  const res = await fetch(`${META}/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries((data.tables || []).map(t => [t.name, t.id]));
}

// ── Table definitions ────────────────────────────────────────────────────────

const CATEGORIES_DEF = {
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
};

const LIABILITIES_DEF = {
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
};

const ASSETS_DEF = {
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
};

const DIARY_DEF = {
  name: 'Diary',
  fields: [
    { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'title', type: 'singleLineText' },
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
};

const AI_CHATS_DEF = {
  name: 'AI_Chats',
  fields: [
    { name: 'session_id', type: 'singleLineText' },
    { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'topic', type: 'singleLineText' },
    { name: 'messages_json', type: 'multilineText' },
    { name: 'summary', type: 'multilineText' }
  ]
};

const DROP_ZONE_DEF = {
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
};

const QUOTES_DEF = {
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
};

// ── Seed data ───────────────────────────────────────────────────────────────

const CATEGORY_SEEDS = [
  { name: 'Tisco', group: 'Loan', expense_type: 'FP-FV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Watch interest', group: 'Loan', expense_type: 'FP-FV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Thai credit', group: 'Loan', expense_type: 'FP-FV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Credit Kasikorn', group: 'Loan', expense_type: 'FP-FV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Credit KTC', group: 'Loan', expense_type: 'FP-FV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Friend and Family loan', group: 'Loan', expense_type: 'VP-VV', type: 'Loan', cash_flow: 'Cash In+Out', active: true },
  { name: 'Kid school', group: 'Family', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Kid training', group: 'Family', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Wife salary', group: 'Family', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Kid salary', group: 'Family', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Travel activities', group: 'Family', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Coffee', group: 'Basic Living', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Food super', group: 'Basic Living', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Food restaurant', group: 'Basic Living', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Electricity', group: 'Basic Living', expense_type: 'FP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Home water', group: 'Basic Living', expense_type: 'FP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Fuel', group: 'Basic Living', expense_type: 'FP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Drinking water', group: 'Basic Living', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'AIS net', group: 'Basic IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'My AIS', group: 'Basic IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Netflix/Disney', group: 'Basic IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Youtube music', group: 'Basic IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'iCloud', group: 'Basic IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Car insurance', group: 'Car', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Battery replacement', group: 'Car', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Car services', group: 'Car', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Tires', group: 'Car', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Maid', group: 'Service', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Gym', group: 'Personal', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Cigarette', group: 'Personal', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Medicine', group: 'Personal', expense_type: 'Surprise', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Personal need', group: 'Personal', expense_type: 'VP-VV', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Unplanned buy', group: 'Personal', expense_type: 'Surprise', type: 'Expense', cash_flow: 'Cash Out', active: true },
  { name: 'Flow account', group: 'Bus IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Cloudflare', group: 'Bus IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Canva', group: 'Bus IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Anthropic', group: 'Bus IT', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Accountant', group: 'Business', expense_type: 'FP-FV', type: 'Expense', cash_flow: 'Cash Out', is_business: true, active: true },
  { name: 'Project investment', group: 'Investment', expense_type: 'VP-VV', type: 'Investment', cash_flow: 'Cash Out', active: true },
  { name: 'Old stocks sale', group: 'Per-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', active: true },
  { name: 'Collection sale', group: 'Per-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', active: true },
  { name: 'Stock earn', group: 'Per-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', active: true },
  { name: 'Pilates I-Flex', group: 'Bus-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', is_business: true, active: true },
  { name: 'Satu Sale', group: 'Bus-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', is_business: true, active: true },
  { name: 'Ploikong sale', group: 'Bus-earn', expense_type: 'VP-VV', type: 'Earn', cash_flow: 'Cash In', is_business: true, active: true }
];

const LIABILITY_SEEDS = [
  { name: 'Tisco', creditor_type: 'Bank', loan_size: 400000, interest_rate: 0, monthly_payment: 14000, current_balance: 400000, active: true },
  { name: 'Watch interest', creditor_type: 'Other', loan_size: 50000, interest_rate: 2, monthly_payment: 1000, current_balance: 50000, active: true },
  { name: 'Thai credit', creditor_type: 'Bank', loan_size: 2800000, interest_rate: 0, monthly_payment: 12750, current_balance: 2800000, active: true },
  { name: 'Credit Kasikorn', creditor_type: 'Bank', loan_size: 50000, interest_rate: 0, monthly_payment: 5000, current_balance: 50000, active: true },
  { name: 'Credit KTC', creditor_type: 'Bank', loan_size: 50000, interest_rate: 0, monthly_payment: 5000, current_balance: 50000, active: true },
  { name: 'Friend and Family', creditor_type: 'Family', loan_size: 200000, interest_rate: 0, monthly_payment: 0, current_balance: 200000, active: true }
];

// catName → actual Categories.name (for cases where budget seed name differs from category name)
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

// ── Main handler ─────────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const { env } = context;
  const BASE_ID = env.AIRTABLE_BASE_ID || 'apphBGWfSPL45oSFd';
  const apiKey = env.AIRTABLE_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'AIRTABLE_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const results = [];

  // ── Phase 1: tables with no linked fields ─────────────────────────────────
  for (const def of [CATEGORIES_DEF, LIABILITIES_DEF, ASSETS_DEF, DIARY_DEF, AI_CHATS_DEF, DROP_ZONE_DEF, QUOTES_DEF]) {
    results.push(await createTable(apiKey, BASE_ID, def));
    await delay(300);
  }

  // ── Phase 2: fetch table IDs so linked fields can be wired ───────────────
  await delay(300);
  const tableIds = await getTableIds(apiKey, BASE_ID);
  const catTableId = tableIds['Categories'];
  const liabTableId = tableIds['Liabilities'];

  function linkedField(name, tableId) {
    if (tableId) {
      return { name, type: 'multipleRecordLinks', options: { linkedTableId: tableId, prefersSingleRecordLink: true } };
    }
    // Fallback to text if table creation failed
    return { name, type: 'singleLineText' };
  }

  // ── Phase 3: tables with linked fields ───────────────────────────────────
  results.push(await createTable(apiKey, BASE_ID, {
    name: 'Transactions',
    fields: [
      { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      linkedField('category_id', catTableId),
      { name: 'amount', type: 'number', options: { precision: 0 } },
      { name: 'description', type: 'singleLineText' },
      { name: 'entity', type: 'singleLineText' },
      { name: 'note', type: 'singleLineText' },
      { name: 'source', type: 'singleSelect', options: { choices: [{ name: 'Manual' }, { name: 'DropZone' }] } }
    ]
  }));
  await delay(300);

  results.push(await createTable(apiKey, BASE_ID, {
    name: 'Utilities',
    fields: [
      { name: 'month', type: 'date', options: { dateFormat: { name: 'iso' } } },
      linkedField('category_id', catTableId),
      { name: 'units', type: 'number', options: { precision: 2 } },
      { name: 'unit_rate', type: 'formula', options: { formula: 'IF({units}, {charge}/{units}, 0)' } },
      { name: 'charge', type: 'number', options: { precision: 0 } },
      { name: 'notes', type: 'multilineText' }
    ]
  }));
  await delay(300);

  results.push(await createTable(apiKey, BASE_ID, {
    name: 'Budgets',
    fields: [
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
  }));
  await delay(300);

  results.push(await createTable(apiKey, BASE_ID, {
    name: 'Liability_Payments',
    fields: [
      linkedField('liability_id', liabTableId),
      { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
      { name: 'total_paid', type: 'number', options: { precision: 0 } },
      { name: 'interest_portion', type: 'number', options: { precision: 0 } },
      { name: 'principal_portion', type: 'number', options: { precision: 0 } },
      { name: 'note', type: 'singleLineText' }
    ]
  }));
  await delay(300);

  // ── Phase 4: seed Categories ──────────────────────────────────────────────
  const catSeeds = [];
  const catIdByName = {};
  for (const cat of CATEGORY_SEEDS) {
    try {
      const rec = await createRecord(apiKey, BASE_ID, 'Categories', cat);
      catIdByName[cat.name] = rec.id;
      catSeeds.push({ name: cat.name, status: 'seeded' });
    } catch (e) {
      catSeeds.push({ name: cat.name, status: 'error', error: e.message });
    }
    await delay(250);
  }

  // ── Phase 5: seed Liabilities ─────────────────────────────────────────────
  const liabSeeds = [];
  for (const liab of LIABILITY_SEEDS) {
    try {
      const rec = await createRecord(apiKey, BASE_ID, 'Liabilities', liab);
      liabSeeds.push({ name: liab.name, status: 'seeded', id: rec.id });
    } catch (e) {
      liabSeeds.push({ name: liab.name, status: 'error', error: e.message });
    }
    await delay(250);
  }

  // ── Phase 6: seed Budgets (requires category IDs) ─────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const budgetSeeds = [];
  for (const b of BUDGET_SEEDS) {
    const actualName = BUDGET_CAT_MAP[b.catName] || b.catName;
    const catId = catIdByName[actualName];
    const fields = { amount: b.amount, period: b.period, start_date: today, active: true };
    if (catId) fields.category_id = [catId];
    try {
      await createRecord(apiKey, BASE_ID, 'Budgets', fields);
      budgetSeeds.push({ catName: b.catName, status: 'seeded', linked: !!catId });
    } catch (e) {
      budgetSeeds.push({ catName: b.catName, status: 'error', error: e.message });
    }
    await delay(250);
  }

  return jsonResponse({
    success: true,
    tables: results,
    seeds: { categories: catSeeds, liabilities: liabSeeds, budgets: budgetSeeds }
  });
}
