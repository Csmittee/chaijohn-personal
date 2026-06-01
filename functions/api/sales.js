import { listRecords, listAllRecords, createRecord, jsonResponse, errorResponse } from '../_airtable.js';

const CORE_BASE = 'apphBGWfSPL45oSFd';
const TRANSACTIONS = 'Transactions';
const CATEGORIES   = 'Categories';
const ASSETS       = 'Assets';
const PROJECTS_T   = 'Projects';

// ── Business Airtable helpers ─────────────────────────────────────────────────
// Uses AIRTABLE_BUSINESS_BASE_ID env var (separate base from chaijohn-core)
const AIRTABLE_BASE = 'https://api.airtable.com/v0';

async function listBizRecords(apiKey, bizBaseId, tableName, params = {}) {
  const query = new URLSearchParams();
  if (params.filterByFormula) query.set('filterByFormula', params.filterByFormula);
  if (params.sort) params.sort.forEach((s, i) => {
    query.set(`sort[${i}][field]`, s.field);
    query.set(`sort[${i}][direction]`, s.direction || 'asc');
  });
  if (params.maxRecords) query.set('maxRecords', params.maxRecords);
  if (params.offset)     query.set('offset', params.offset);
  const url = `${AIRTABLE_BASE}/${bizBaseId}/${encodeURIComponent(tableName)}?${query}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Biz Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function listAllBizRecords(apiKey, bizBaseId, tableName, params = {}) {
  const all = [];
  let offset;
  do {
    const page = await listBizRecords(apiKey, bizBaseId, tableName, offset ? { ...params, offset } : params);
    all.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return { records: all };
}

// ── Date utilities ────────────────────────────────────────────────────────────
function periodStart(period) {
  const now = new Date();
  if (period === '12m') { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d.toISOString().split('T')[0]; }
  if (period === 'all') return '2000-01-01';
  // default 6m
  const d = new Date(now); d.setMonth(d.getMonth() - 6); return d.toISOString().split('T')[0];
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Cashflow injection: find existing or create Transaction ──────────────────
async function injectTransaction(apiKey, { date, amount, entity, description, category_id, invoice_no }) {
  // Dedup check: exact match on date + amount + entity + source=M2.2
  try {
    const filter = `AND({source}='M2.2',{date}='${date}',{amount}=${amount},{entity}='${entity}')`;
    const existing = await listRecords(apiKey, CORE_BASE, TRANSACTIONS, { filterByFormula: filter, maxRecords: 1 });
    if (existing.records.length > 0) return { injected: false, reason: 'duplicate' };

    const fields = {
      date,
      type:        'Earn',
      amount:      Number(amount),
      entity:      entity || '',
      description: description || '',
      note:        `Auto from ${invoice_no || 'Sales'}`,
      source:      'M2.2'
    };
    if (category_id) fields.category_id = [category_id];

    await createRecord(apiKey, CORE_BASE, TRANSACTIONS, fields);
    return { injected: true };
  } catch (err) {
    return { injected: false, reason: err.message };
  }
}

// ── Resolve Bus-earn category for a given bus_id ─────────────────────────────
async function resolveBusEarnCategory(apiKey, busId, busName) {
  try {
    const cats = await listRecords(apiKey, CORE_BASE, CATEGORIES, {
      filterByFormula: `AND({type}='Earn',{fixed_variable}='Bus-earn',{active}=TRUE())`,
      maxRecords: 50
    });
    const records = cats.records || [];
    const nameLower = (busName || '').toLowerCase();
    // Try matching business name fragments
    const patterns = {
      'BUS01': ['i-flex','pilates','iflex'],
      'BUS02': ['daje','queen','queencatcher'],
      'BUS03': ['jade','coffee'],
      'BUS04': ['flow','board','lifestyle']
    };
    const frags = patterns[busId] || [nameLower.split(' ')[0]];
    const match = records.find(r => frags.some(f => (r.fields.name || '').toLowerCase().includes(f)));
    if (match) return match.id;
    // Fallback: first Bus-earn category
    return records[0]?.id || null;
  } catch { return null; }
}

// ── GET /api/sales ────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const url      = new URL(request.url);
  const period   = url.searchParams.get('period') || '6m';
  const busFilter = url.searchParams.get('bus_id') || 'all';
  const today    = todayStr();
  const startDate = periodStart(period);
  const bizBaseId = env.AIRTABLE_BUSINESS_BASE_ID;

  // ── Parallel fetch: Business ID registry + core data ─────────────────────
  const corePromises = [
    listAllRecords(env.AIRTABLE_API_KEY, CORE_BASE, ASSETS, {
      filterByFormula: `AND({status}='Sold',NOT(IS_BEFORE({sold_date},'${startDate}')))`,
      sort: [{ field: 'sold_date', direction: 'desc' }]
    }),
    listRecords(env.AIRTABLE_API_KEY, CORE_BASE, TRANSACTIONS, {
      filterByFormula: `AND({type}='Earn',{source}='M2.2',NOT(IS_BEFORE({date},'${startDate}')))`,
      sort: [{ field: 'date', direction: 'desc' }],
      maxRecords: 500
    }),
    listAllRecords(env.AIRTABLE_API_KEY, CORE_BASE, PROJECTS_T, {
      filterByFormula: `AND({sales_forecast_sent}=TRUE(),{type}='Active')`
    })
  ];

  const bizPromises = bizBaseId ? [
    listAllBizRecords(env.AIRTABLE_API_KEY, bizBaseId, 'Business ID', {
      filterByFormula: `{Status}='Active'`,
      sort: [{ field: 'Business Name', direction: 'asc' }]
    }),
    listAllBizRecords(env.AIRTABLE_API_KEY, bizBaseId, 'Sale_record', {
      filterByFormula: busFilter !== 'all'
        ? `AND(NOT(IS_BEFORE({sale_date},'${startDate}')),{business_id}='${busFilter}')`
        : `NOT(IS_BEFORE({sale_date},'${startDate}'))`,
      sort: [{ field: 'sale_date', direction: 'desc' }]
    }),
    listAllBizRecords(env.AIRTABLE_API_KEY, bizBaseId, 'Products', { maxRecords: 500 })
  ] : [
    Promise.resolve({ records: [] }),
    Promise.resolve({ records: [] }),
    Promise.resolve({ records: [] })
  ];

  let assetsRes, manualTxRes, projectsRes;
  let bizIdsRes, saleRecordsRes, productsRes;
  let bizUnavailable = false;

  try {
    [assetsRes, manualTxRes, projectsRes] = await Promise.all(corePromises);
  } catch (err) {
    return errorResponse(err.message, 500);
  }

  try {
    [bizIdsRes, saleRecordsRes, productsRes] = await Promise.all(bizPromises);
  } catch {
    bizUnavailable = true;
    bizIdsRes = { records: [] };
    saleRecordsRes = { records: [] };
    productsRes = { records: [] };
  }

  // ── Build product image map ───────────────────────────────────────────────
  const productMap = {};
  (productsRes.records || []).forEach(r => {
    const f = r.fields;
    const key = String(f['id'] || f['bus_id'] || r.id);
    productMap[key] = f;
    // also index by name for lookup
    if (f.name) productMap[String(f.name).toLowerCase()] = f;
  });

  // ── Group Sale_record rows by quote_id → invoices ────────────────────────
  const invoiceMap = {};
  (saleRecordsRes.records || []).forEach(r => {
    const f = r.fields;
    const qid = String(f.quote_id || f['Formatted Sale Order'] || r.id);
    if (!invoiceMap[qid]) {
      invoiceMap[qid] = {
        quote_id:      qid,
        invoice_no:    f['Invoice no.'] || f.invoice_no || '',
        customer_name: f.customer_name  || f['Customer Name'] || '',
        product_name:  f['Product Name'] || f.product_name || '',
        product_image: null,
        invoice_total: Number(f.invoice_total || f['Total sale'] || 0),
        business_id:   f.business_id || '',
        sale_date:     f['Sale date'] || f.sale_date || '',
        due_date:      f.due_date || null,
        payments:      [],
        paid_total:    0
      };
      // resolve product image
      const pName = (f['Product Name'] || '').toLowerCase();
      const prod = productMap[pName];
      if (prod?.main_image) invoiceMap[qid].product_image = prod.main_image;
    }
    const inv = invoiceMap[qid];
    const paid = Number(f['Actual sale'] || f.actual_sale || 0);
    if (paid > 0) {
      inv.payments.push({
        stage:  f.payment_stage || f['Status'] || 'payment',
        amount: paid,
        date:   f['Sale date'] || f.sale_date || ''
      });
      inv.paid_total += paid;
    }
  });

  // Derive AR / overdue status per invoice
  const invoices = Object.values(invoiceMap).map(inv => {
    const balance   = Math.max(0, inv.invoice_total - inv.paid_total);
    const is_ar     = balance > 0 && inv.sale_date <= today;
    const is_overdue = is_ar && inv.due_date && inv.due_date < today;
    const lastPayment = inv.payments.length
      ? inv.payments.slice().sort((a,b) => b.date.localeCompare(a.date))[0]
      : null;
    const days_since_last_payment = lastPayment
      ? Math.floor((new Date(today) - new Date(lastPayment.date)) / 86400000)
      : null;
    const status = inv.paid_total >= inv.invoice_total ? 'Paid'
      : is_overdue ? 'Overdue'
      : is_ar ? (inv.payments.length ? 'Partial' : 'Open')
      : 'Open';
    return { ...inv, balance, is_ar, is_overdue, status, days_since_last_payment };
  });

  // ── Group invoices by business ────────────────────────────────────────────
  const bizRegistry = (bizIdsRes.records || []).map(r => ({
    bus_id:        r.fields.bus_id || r.fields['Business ID (text)'] || '',
    business_name: r.fields['Business Name'] || '',
    brand_name:    r.fields['Brand name'] || r.fields['Tag line'] || '',
    tag_line:      r.fields['Tag line'] || '',
    business_type: r.fields['Business Type'] || ''
  })).filter(b => b.bus_id);

  const injectionLog = [];
  const businesses = await Promise.all(bizRegistry.map(async biz => {
    const bizInvoices = invoices.filter(inv =>
      busFilter === 'all' ? inv.business_id === biz.bus_id : inv.business_id === busFilter && biz.bus_id === busFilter
    );

    // Cashflow injection for confirmed payments
    const catId = await resolveBusEarnCategory(env.AIRTABLE_API_KEY, biz.bus_id, biz.business_name);
    for (const inv of bizInvoices) {
      for (const pmt of inv.payments) {
        if (!pmt.date || !pmt.amount) continue;
        const result = await injectTransaction(env.AIRTABLE_API_KEY, {
          date:        pmt.date,
          amount:      pmt.amount,
          entity:      inv.customer_name,
          description: inv.product_name,
          category_id: catId,
          invoice_no:  inv.invoice_no
        });
        if (result.injected) injectionLog.push({ invoice: inv.invoice_no, stage: pmt.stage, amount: pmt.amount });
      }
    }

    const summary = {
      total_invoiced: bizInvoices.reduce((s, i) => s + i.invoice_total, 0),
      total_received: bizInvoices.reduce((s, i) => s + i.paid_total, 0),
      total_ar:       bizInvoices.filter(i => i.is_ar).reduce((s, i) => s + i.balance, 0),
      total_overdue:  bizInvoices.filter(i => i.is_overdue).reduce((s, i) => s + i.balance, 0),
      invoice_count:  bizInvoices.length
    };
    return { ...biz, invoices: bizInvoices, summary, unavailable: bizUnavailable };
  }));

  // ── Projects section ──────────────────────────────────────────────────────
  const projects = (projectsRes.records || []).map(r => {
    const f = r.fields;
    const launchDate = f.launch_date || null;
    const daysToLaunch = launchDate
      ? Math.ceil((new Date(launchDate) - new Date(today)) / 86400000)
      : null;
    return {
      project_id:              r.id,
      name:                    f.name || '',
      target_revenue_monthly:  Number(f.target_revenue_monthly || 0),
      current_phase:           f.current_phase || '',
      days_to_launch:          daysToLaunch
    };
  });

  // ── Personal: asset sales ─────────────────────────────────────────────────
  const asset_sales = (assetsRes.records || []).map(r => {
    const f = r.fields;
    return {
      asset_id:   r.id,
      name:       f.name || '',
      category:   f.category || '',
      sold_price: Number(f.sold_price || 0),
      sold_date:  f.sold_date || '',
      sold_via:   f.sold_via || '',
      cost_price: Number(f.cost_price || 0),
      image_url:  f.cloudinary_image_url || null,
      gain:       Number(f.sold_price || 0) - Number(f.cost_price || 0)
    };
  });

  const manual_entries = (manualTxRes.records || []).map(r => ({ id: r.id, ...r.fields }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const mtdStart = today.slice(0, 7) + '-01';
  const allPaid = businesses.flatMap(b => b.invoices.flatMap(i =>
    i.payments.filter(p => p.date >= mtdStart).map(p => p.amount)
  ));
  const total_earned_mtd = allPaid.reduce((s, a) => s + a, 0)
    + asset_sales.filter(a => a.sold_date >= mtdStart).reduce((s, a) => s + a.sold_price, 0);

  const total_ar      = businesses.reduce((s, b) => s + b.summary.total_ar, 0);
  const total_overdue = businesses.reduce((s, b) => s + b.summary.total_overdue, 0);
  const ytd_start     = today.slice(0, 4) + '-01-01';
  const ytd_revenue   = businesses.reduce((s, b) => s + b.invoices
    .flatMap(i => i.payments.filter(p => p.date >= ytd_start).map(p => p.amount))
    .reduce((a, v) => a + v, 0), 0)
    + asset_sales.filter(a => a.sold_date >= ytd_start).reduce((s, a) => s + a.sold_price, 0);

  // Open quotes: AR invoices not overdue
  const openQuotesAll = businesses.flatMap(b => b.invoices.filter(i => i.is_ar && !i.is_overdue));
  const open_quotes = openQuotesAll.length;
  const open_quotes_total = openQuotesAll.reduce((s, i) => s + i.balance, 0);

  // by_business totals
  const by_business = {};
  businesses.forEach(b => { by_business[b.bus_id] = b.summary.total_received; });

  // by_month: generate months in period, sum all paid per month
  const by_month = [];
  const mCount = period === 'all' ? 24 : period === '12m' ? 12 : 6;
  for (let i = mCount - 1; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mo = d.toISOString().slice(0, 7);
    const moTotal = businesses.reduce((s, b) =>
      s + b.invoices.flatMap(inv => inv.payments.filter(p => p.date?.startsWith(mo)).map(p => p.amount))
         .reduce((a, v) => a + v, 0), 0)
      + asset_sales.filter(a => a.sold_date?.startsWith(mo)).reduce((s, a) => s + a.sold_price, 0)
      + manual_entries.filter(t => t.fields?.date?.startsWith(mo)).reduce((s, t) => s + Number(t.fields?.amount || 0), 0);
    by_month.push({ month: mo, total: moTotal });
  }

  // Nearest overdue
  const overdueInvs = businesses.flatMap(b => b.invoices.filter(i => i.is_overdue));
  const nearest_overdue = overdueInvs.length
    ? overdueInvs.sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date
    : null;

  return jsonResponse({
    businesses,
    projects,
    personal: { asset_sales, manual_entries },
    summary: {
      total_earned_mtd, total_ar, total_overdue, ytd_revenue,
      open_quotes, open_quotes_total, nearest_overdue,
      by_business, by_month
    },
    biz_unavailable: bizUnavailable,
    injected: injectionLog.length,
    period,
    bus_filter: busFilter
  });
}

// ── POST /api/sales — manual earn entry (source=M2.2) ─────────────────────────
export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON'); }

  const { date, amount, entity } = body;
  if (!date || !amount) return errorResponse('date and amount are required');

  // Resolve category_id by name if provided
  let category_id = null;
  if (body.category_name) {
    try {
      const cats = await listRecords(env.AIRTABLE_API_KEY, CORE_BASE, CATEGORIES, {
        filterByFormula: `LOWER({name})="${body.category_name.toLowerCase()}"`,
        maxRecords: 1
      });
      if (cats.records.length) category_id = cats.records[0].id;
    } catch { /* non-fatal */ }
  }

  const fields = {
    date, type: 'Earn', amount: Number(amount), source: 'M2.2'
  };
  if (entity)           fields.entity      = entity;
  if (body.description) fields.description = body.description;
  if (body.note)        fields.note        = body.note;
  if (category_id)      fields.category_id = [category_id];

  try {
    const record = await createRecord(env.AIRTABLE_API_KEY, CORE_BASE, TRANSACTIONS, fields);
    return jsonResponse({ record }, 201);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
