import { createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const META_BASE_URL = 'https://api.airtable.com/v0/meta/bases';

async function createTable(apiKey, baseId, tableDefinition) {
  const res = await fetch(`${META_BASE_URL}/${baseId}/tables`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(tableDefinition)
  });

  if (res.status === 422 || res.status === 409) {
    // Distinguish "table already exists" from "invalid field definition"
    const body = await res.json().catch(() => ({}));
    const msg = (body?.error?.message || body?.message || JSON.stringify(body)).toLowerCase();
    if (msg.includes('already exist') || msg.includes('duplicate') || res.status === 409) {
      return { status: 'already_exists', table: tableDefinition.name };
    }
    return { status: 'error', table: tableDefinition.name, error: JSON.stringify(body) };
  }
  if (!res.ok) {
    const errText = await res.text();
    return { status: 'error', table: tableDefinition.name, error: errText };
  }
  return { status: 'created', table: tableDefinition.name };
}

export async function onRequestPost(context) {
  const { env } = context;

  const BASE_ID = env.AIRTABLE_BASE_ID || 'apphBGWfSPL45oSFd';
  const apiKey = env.AIRTABLE_API_KEY;

  const tables = [
    {
      name: 'Categories',
      fields: [
        { name: 'name', type: 'singleLineText' },
        { name: 'type', type: 'singleSelect', options: { choices: [{ name: 'Income' }, { name: 'Expense' }] } },
        { name: 'fixed_variable', type: 'singleSelect', options: { choices: [{ name: 'Fixed' }, { name: 'Variable' }] } },
        { name: 'budget_limit_monthly', type: 'currency', options: { precision: 0, symbol: '฿' } },
        { name: 'period', type: 'singleSelect', options: { choices: [{ name: 'Daily' }, { name: 'Weekly' }, { name: 'Monthly' }, { name: 'Annual' }] } },
        { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } }
      ]
    },
    {
      name: 'Transactions',
      fields: [
        { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'type', type: 'singleSelect', options: { choices: [{ name: 'Income' }, { name: 'Expense' }] } },
        { name: 'amount', type: 'number', options: { precision: 0 } },
        { name: 'entity', type: 'singleLineText' },
        { name: 'description', type: 'singleLineText' },
        { name: 'note', type: 'singleLineText' },
        { name: 'fixed_variable', type: 'singleSelect', options: { choices: [{ name: 'Fixed' }, { name: 'Variable' }] } },
        { name: 'period', type: 'singleSelect', options: { choices: [{ name: 'One-time' }, { name: 'Daily' }, { name: 'Weekly' }, { name: 'Monthly' }, { name: 'Annual' }] } },
        { name: 'source', type: 'singleSelect', options: { choices: [{ name: 'Manual' }, { name: 'DropZone' }, { name: 'Import' }] } }
      ]
    },
    {
      name: 'Debts',
      fields: [
        { name: 'creditor_name', type: 'singleLineText' },
        { name: 'creditor_type', type: 'singleSelect', options: { choices: [{ name: 'Bank' }, { name: 'Family' }, { name: 'Other' }] } },
        { name: 'original_amount', type: 'number', options: { precision: 0 } },
        { name: 'current_balance', type: 'number', options: { precision: 0 } },
        { name: 'interest_rate', type: 'number', options: { precision: 2 } },
        { name: 'monthly_payment', type: 'number', options: { precision: 0 } },
        { name: 'due_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'last_payment_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'notes', type: 'multilineText' },
        { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } }
      ]
    },
    {
      name: 'Assets',
      fields: [
        { name: 'name', type: 'singleLineText' },
        {
          name: 'category', type: 'singleSelect', options: {
            choices: [
              { name: 'Property' }, { name: 'Vehicle' }, { name: 'Furniture' }, { name: 'Electronics' },
              { name: 'Collection-Knife' }, { name: 'Collection-Vice' }, { name: 'Collection-Plant' },
              { name: 'Collection-Doll' }, { name: 'Business' }, { name: 'Inventory' }, { name: 'Other' }
            ]
          }
        },
        { name: 'cost_price', type: 'number', options: { precision: 0 } },
        { name: 'estimated_value', type: 'number', options: { precision: 0 } },
        { name: 'date_acquired', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'status', type: 'singleSelect', options: { choices: [{ name: 'Holding' }, { name: 'For Sale' }, { name: 'Sold' }, { name: 'Invested' }] } },
        { name: 'velocity', type: 'singleSelect', options: { choices: [{ name: 'Fast move' }, { name: 'Slow move' }, { name: 'Illiquid' }] } },
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
        { name: 'date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'title', type: 'singleLineText' },
        { name: 'content', type: 'multilineText' },
        { name: 'entry_type', type: 'singleSelect', options: { choices: [{ name: 'Story' }, { name: 'Idea' }, { name: 'Blog' }, { name: 'Finance note' }] } },
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
      name: 'Quotes',
      fields: [
        { name: 'text', type: 'multilineText' },
        { name: 'author', type: 'singleLineText' },
        { name: 'source', type: 'singleLineText' },
        { name: 'date_added', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'mood_tag', type: 'singleSelect', options: { choices: [{ name: 'Motivation' }, { name: 'Wisdom' }, { name: 'Funny' }, { name: 'Business' }, { name: 'Life' }] } },
        { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } },
        { name: 'cloudinary_image_url', type: 'url' }
      ]
    },
    {
      name: 'Drop_Zone_Queue',
      fields: [
        { name: 'date_received', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'file_type', type: 'singleSelect', options: { choices: [{ name: 'Receipt' }, { name: 'Transfer slip' }, { name: 'Product photo' }, { name: 'Handwriting' }, { name: 'Quote image' }, { name: 'Other' }] } },
        { name: 'cloudinary_url', type: 'url' },
        { name: 'ai_extracted_text', type: 'multilineText' },
        { name: 'ai_description', type: 'multilineText' },
        { name: 'ai_suggested_type', type: 'singleSelect', options: { choices: [{ name: 'Transaction' }, { name: 'Asset' }, { name: 'Diary' }, { name: 'Quote' }, { name: 'Ignore' }] } },
        { name: 'ai_prefilled_json', type: 'multilineText' },
        { name: 'status', type: 'singleSelect', options: { choices: [{ name: 'Pending' }, { name: 'Approved' }, { name: 'Rejected' }] } },
        { name: 'approved_record_id', type: 'singleLineText' }
      ]
    },
    {
      name: 'Budgets',
      fields: [
        { name: 'label', type: 'singleLineText' },
        { name: 'amount', type: 'number', options: { precision: 0 } },
        { name: 'period', type: 'singleSelect', options: { choices: [{ name: 'Monthly' }, { name: 'Annual' }, { name: 'One-time' }] } },
        { name: 'start_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'end_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'active', type: 'checkbox', options: { color: 'greenBright', icon: 'check' } }
      ]
    }
  ];

  const results = [];

  // Create tables sequentially with delay to stay under Airtable Meta API rate limit
  for (const tableDef of tables) {
    const result = await createTable(apiKey, BASE_ID, tableDef);
    results.push(result);
    await new Promise(r => setTimeout(r, 300));
  }

  // Seed Categories
  const categorySeeds = [
    // Expense Fixed
    { name: 'Tisco loan', type: 'Expense', fixed_variable: 'Fixed', active: true },
    { name: 'Thai credit', type: 'Expense', fixed_variable: 'Fixed', active: true },
    { name: 'AIS fiber', type: 'Expense', fixed_variable: 'Fixed', active: true },
    { name: 'Watch interest', type: 'Expense', fixed_variable: 'Fixed', active: true },
    { name: 'Child school', type: 'Expense', fixed_variable: 'Fixed', active: true },
    // Expense Variable
    { name: 'Electricity', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Water', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Food routine', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Fine dining >500', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Car service', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Coffee', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Cigarette', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Business investment', type: 'Expense', fixed_variable: 'Variable', active: true },
    { name: 'Collection purchase', type: 'Expense', fixed_variable: 'Variable', active: true },
    // Income
    { name: 'Salary', type: 'Income', active: true },
    { name: 'Daje sale', type: 'Income', active: true },
    { name: 'EDC collection sale', type: 'Income', active: true },
    { name: 'Vending machine', type: 'Income', active: true },
    { name: 'Other business', type: 'Income', active: true },
    { name: 'Loan repaid', type: 'Income', active: true }
  ];

  const seedResults = [];
  for (const cat of categorySeeds) {
    try {
      const record = await createRecord(apiKey, BASE_ID, 'Categories', cat);
      seedResults.push({ name: cat.name, status: 'seeded', id: record.id });
    } catch (err) {
      // Category might already exist — that's fine
      seedResults.push({ name: cat.name, status: 'skipped', error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    results,
    seed_results: seedResults
  });
}
