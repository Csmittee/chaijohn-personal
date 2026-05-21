/**
 * entry.injector.js — Data entry page logic.
 * Handles Transactions, Utilities, Debts, and Budgets tabs.
 */

/* ─── Utility helpers ─── */
function formatThb(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '฿—';
  const n = Math.round(Number(amount));
  if (Math.abs(n) >= 100) return '฿' + n.toLocaleString('en-US');
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function currentMonthIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function api(path, options) {
  options = options || {};
  const res = await fetch(path, Object.assign({}, options, {
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    credentials: 'same-origin'
  }));
  if (res.status === 401) { window.location.href = '/index.html'; throw new Error('Unauthorized'); }
  return res;
}

function showFlash(msg, type) {
  type = type || 'success';
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;' +
    'background:' + (type === 'success' ? '#22c55e' : '#ef4444') + ';color:white;font-weight:500;z-index:9999;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Tab switching ─── */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const target = btn.dataset.tab;
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      tabPanels.forEach(function (p) { p.style.display = 'none'; p.classList.remove('active'); });
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + target);
      if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }

      // Lazy load tab data on first activation
      if (target === 'transactions' && !window._txLoaded) { window._txLoaded = true; initTransactions(); }
      if (target === 'utilities' && !window._utilLoaded) { window._utilLoaded = true; initUtilities(); }
      if (target === 'debts' && !window._debtsLoaded) { window._debtsLoaded = true; initDebts(); }
      if (target === 'budgets' && !window._budgetsLoaded) { window._budgetsLoaded = true; initBudgets(); }
    });
  });
}

/* ════════════════════════════════════════
   TRANSACTIONS TAB
════════════════════════════════════════ */
let txCategories = [];
let txType = 'Expense';
let txListPeriod = 'daily';

async function loadCategories(forType) {
  try {
    const res = await api('/api/categories?type=' + (forType || ''));
    if (!res.ok) return [];
    const data = await res.json();
    return data.records || [];
  } catch (e) { return []; }
}

function populateCategorySelect(categories, type) {
  const sel = document.getElementById('tx-category');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Category —</option>';
  const filtered = categories.filter(function (c) {
    return !c.fields.type || c.fields.type.toLowerCase() === type.toLowerCase();
  });
  filtered.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c.fields.name || c.id;
    opt.textContent = c.fields.name || c.id;
    sel.appendChild(opt);
  });
}

function getTxDateRange(period) {
  const now = new Date();
  let start, end;
  if (period === 'daily') {
    start = end = todayIso();
  } else if (period === 'weekly') {
    const day = now.getDay();
    const s = new Date(now); s.setDate(now.getDate() - day);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    start = s.toISOString().split('T')[0];
    end = e.toISOString().split('T')[0];
  } else { // monthly
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }
  return { start, end };
}

async function loadTransactionList() {
  const container = document.getElementById('tx-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.5">Loading…</div>';

  const { start, end } = getTxDateRange(txListPeriod);
  try {
    const res = await api('/api/transactions?start=' + start + '&end=' + end + '&limit=200');
    if (!res.ok) { container.innerHTML = '<div style="color:#ef4444;padding:1rem">Failed to load transactions</div>'; return; }
    const data = await res.json();
    const records = data.records || [];

    if (records.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.5">No transactions for this period</div>';
      return;
    }

    // Group by date
    const byDate = {};
    records.forEach(function (r) {
      const date = r.fields.date || 'Unknown';
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r);
    });

    const sortedDates = Object.keys(byDate).sort(function (a, b) { return b > a ? 1 : -1; });

    let html = '';
    sortedDates.forEach(function (date) {
      const txs = byDate[date];
      const dayTotal = txs.reduce(function (s, t) {
        return s + (t.fields.type === 'Expense' ? -(t.fields.amount || 0) : (t.fields.amount || 0));
      }, 0);

      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const totalClass = dayTotal >= 0 ? 'amount-positive' : 'amount-negative';

      html += `<div class="tx-group">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;background:rgba(255,255,255,0.03);border-radius:8px 8px 0 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <span style="font-size:0.82rem;font-weight:600">${dateLabel}</span>
          <span style="font-size:0.82rem;font-weight:600" class="${totalClass}">${dayTotal >= 0 ? '+' : ''}${formatThb(Math.abs(dayTotal))}</span>
        </div>`;

      txs.forEach(function (tx) {
        const f = tx.fields;
        const isExp = f.type === 'Expense';
        html += `<div class="tx-row" data-id="${tx.id}" style="padding:0.55rem 0.75rem;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:0.5rem;cursor:pointer">
          <div style="flex:1;min-width:0">
            <div style="font-size:0.83rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(f.description || f.category_name || f.entity || '—')}</div>
            <div style="font-size:0.72rem;opacity:0.55;margin-top:0.1rem">${escHtml(f.category_name || '')}${f.entity ? ' · ' + escHtml(f.entity) : ''}</div>
          </div>
          <span style="font-size:0.88rem;font-weight:600;white-space:nowrap" class="${isExp ? 'amount-negative' : 'amount-positive'}">${isExp ? '-' : '+'}${formatThb(f.amount)}</span>
          <button class="tx-delete-btn" data-id="${tx.id}" style="background:none;border:none;color:#ef444488;cursor:pointer;font-size:1rem;padding:0.15rem 0.3rem;flex-shrink:0" title="Delete">✕</button>
        </div>
        <div class="tx-edit-form" id="tx-edit-${tx.id}" style="display:none;padding:0.75rem;background:rgba(0,0,0,0.2);border-radius:0 0 8px 8px;gap:0.5rem">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
            <div>
              <label style="font-size:0.72rem;opacity:0.6;display:block;margin-bottom:0.2rem">Date</label>
              <input type="date" class="form-input tx-edit-date" value="${f.date || ''}" style="width:100%;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:0.72rem;opacity:0.6;display:block;margin-bottom:0.2rem">Amount</label>
              <input type="number" class="form-input tx-edit-amount" value="${f.amount || ''}" min="0" step="0.01" style="width:100%;box-sizing:border-box">
            </div>
          </div>
          <div style="margin-bottom:0.5rem">
            <label style="font-size:0.72rem;opacity:0.6;display:block;margin-bottom:0.2rem">Description</label>
            <input type="text" class="form-input tx-edit-description" value="${escHtml(f.description || '')}" style="width:100%;box-sizing:border-box">
          </div>
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-primary btn-sm tx-edit-save" data-id="${tx.id}">Save</button>
            <button class="btn btn-outline btn-sm tx-edit-cancel" data-id="${tx.id}">Cancel</button>
          </div>
        </div>`;
      });
      html += '</div>';
    });

    container.innerHTML = html;

    // Wire up row clicks for expand/inline edit
    container.querySelectorAll('.tx-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.tx-delete-btn')) return;
        const id = row.dataset.id;
        const editForm = document.getElementById('tx-edit-' + id);
        if (editForm) {
          const isOpen = editForm.style.display !== 'none';
          // Close all other edit forms
          container.querySelectorAll('.tx-edit-form').forEach(function (f) { f.style.display = 'none'; });
          editForm.style.display = isOpen ? 'none' : 'flex';
          editForm.style.flexDirection = 'column';
        }
      });
    });

    // Wire delete buttons
    container.querySelectorAll('.tx-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this transaction?')) return;
        try {
          const res = await api('/api/transactions/' + id, { method: 'DELETE' });
          if (res.ok) { showFlash('Deleted'); loadTransactionList(); }
          else showFlash('Delete failed', 'error');
        } catch (err) { showFlash('Error: ' + err.message, 'error'); }
      });
    });

    // Wire edit save/cancel
    container.querySelectorAll('.tx-edit-save').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.dataset.id;
        const form = document.getElementById('tx-edit-' + id);
        const date = form.querySelector('.tx-edit-date').value;
        const amount = parseFloat(form.querySelector('.tx-edit-amount').value);
        const description = form.querySelector('.tx-edit-description').value;
        if (!amount || isNaN(amount)) { showFlash('Amount required', 'error'); return; }
        try {
          const res = await api('/api/transactions/' + id, {
            method: 'PATCH',
            body: JSON.stringify({ date, amount, description })
          });
          if (res.ok) { showFlash('Updated'); loadTransactionList(); }
          else showFlash('Update failed', 'error');
        } catch (err) { showFlash('Error: ' + err.message, 'error'); }
      });
    });

    container.querySelectorAll('.tx-edit-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.dataset.id;
        const form = document.getElementById('tx-edit-' + id);
        if (form) form.style.display = 'none';
      });
    });

  } catch (e) {
    container.innerHTML = '<div style="color:#ef4444;padding:1rem">Error: ' + e.message + '</div>';
  }
}

async function initTransactions() {
  // Load categories
  txCategories = await loadCategories('Expense');
  populateCategorySelect(txCategories, 'Expense');

  // Set today
  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.value = todayIso();

  // Type toggle (EARN/EXPENSE)
  const typeEarn = document.getElementById('tx-type-earn');
  const typeExpense = document.getElementById('tx-type-expense');

  function setTxType(type) {
    txType = type;
    if (typeEarn) typeEarn.classList.toggle('active', type === 'Income');
    if (typeExpense) typeExpense.classList.toggle('active', type === 'Expense');
    populateCategorySelect(txCategories, type);
  }

  if (typeEarn) typeEarn.addEventListener('click', function () { setTxType('Income'); });
  if (typeExpense) typeExpense.addEventListener('click', function () { setTxType('Expense'); });

  // Save button
  const saveBtn = document.getElementById('tx-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      const date = document.getElementById('tx-date')?.value;
      const amount = parseFloat(document.getElementById('tx-amount')?.value);
      const categoryName = document.getElementById('tx-category')?.value;
      const entity = document.getElementById('tx-entity')?.value || '';
      const description = document.getElementById('tx-description')?.value || '';
      const note = document.getElementById('tx-note')?.value || '';

      if (!amount || isNaN(amount)) { showFlash('Amount is required', 'error'); return; }
      if (!date) { showFlash('Date is required', 'error'); return; }

      saveBtn.disabled = true;
      try {
        const res = await api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            date,
            type: txType,
            amount,
            category_name: categoryName || undefined,
            entity: entity || undefined,
            description: description || undefined,
            note: note || undefined,
            source: 'Manual'
          })
        });
        if (res.ok) {
          showFlash('Saved!');
          // Clear form but keep type and date
          if (document.getElementById('tx-amount')) document.getElementById('tx-amount').value = '';
          if (document.getElementById('tx-category')) document.getElementById('tx-category').value = '';
          if (document.getElementById('tx-entity')) document.getElementById('tx-entity').value = '';
          if (document.getElementById('tx-description')) document.getElementById('tx-description').value = '';
          if (document.getElementById('tx-note')) document.getElementById('tx-note').value = '';
          loadTransactionList();
        } else {
          const d = await res.json().catch(function () { return {}; });
          showFlash(d.error || 'Save failed', 'error');
        }
      } catch (err) {
        showFlash('Error: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  // Period tabs for list
  const periodTabs = document.querySelectorAll('[data-tx-period]');
  periodTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      periodTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      txListPeriod = tab.dataset.txPeriod;
      loadTransactionList();
    });
  });

  loadTransactionList();
}

/* ════════════════════════════════════════
   UTILITIES TAB
════════════════════════════════════════ */
let utilitiesHistory = [];

async function loadUtilitiesForMonth(month) {
  // month = YYYY-MM
  try {
    const year = month.split('-')[0];
    const res = await api('/api/utilities?year=' + year);
    if (!res.ok) return null;
    const data = await res.json();
    const records = data.records || [];
    // Find record matching the month
    const monthDate = month + '-01';
    return records.find(function (r) { return (r.fields.month || '').startsWith(month); }) || null;
  } catch (e) { return null; }
}

async function loadUtilitiesHistory() {
  const container = document.getElementById('util-history-table');
  if (!container) return;

  try {
    const year = new Date().getFullYear();
    const prevYear = year - 1;
    const [res1, res2] = await Promise.all([
      api('/api/utilities?year=' + year),
      api('/api/utilities?year=' + prevYear)
    ]);
    const [data1, data2] = await Promise.all([
      res1.json().catch(function () { return {}; }),
      res2.json().catch(function () { return {}; })
    ]);
    utilitiesHistory = [...(data2.records || []), ...(data1.records || [])];
    utilitiesHistory.sort(function (a, b) {
      return (b.fields.month || '') > (a.fields.month || '') ? 1 : -1;
    });

    if (utilitiesHistory.length === 0) {
      container.innerHTML = '<p style="opacity:0.5;text-align:center;padding:1rem">No utility records yet</p>';
      return;
    }

    const rows = utilitiesHistory.slice(0, 12).map(function (r) {
      const f = r.fields;
      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">' +
        '<td style="padding:0.45rem">' + (f.month || '').substring(0, 7) + '</td>' +
        '<td style="text-align:right;padding:0.45rem">' + (f.electricity_units || '—') + '</td>' +
        '<td style="text-align:right;padding:0.45rem">' + (f.electricity_charge ? formatThb(f.electricity_charge) : '—') + '</td>' +
        '<td style="text-align:right;padding:0.45rem">' + (f.water_units || '—') + '</td>' +
        '<td style="text-align:right;padding:0.45rem">' + (f.water_charge ? formatThb(f.water_charge) : '—') + '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem">' +
      '<thead><tr style="font-size:0.72rem;color:rgba(255,255,255,0.4);border-bottom:1px solid rgba(255,255,255,0.1)">' +
      '<th style="text-align:left;padding:0.35rem">Month</th>' +
      '<th style="text-align:right;padding:0.35rem">Elec Units</th>' +
      '<th style="text-align:right;padding:0.35rem">Elec Charge</th>' +
      '<th style="text-align:right;padding:0.35rem">Water Units</th>' +
      '<th style="text-align:right;padding:0.35rem">Water Charge</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  } catch (e) {
    container.innerHTML = '<p style="color:#ef4444;padding:1rem">Failed to load history</p>';
  }
}

function updateUtilityRateDisplay(unitsId, chargeId, rateId, vsId) {
  const units = parseFloat(document.getElementById(unitsId)?.value) || 0;
  const charge = parseFloat(document.getElementById(chargeId)?.value) || 0;
  const rateEl = document.getElementById(rateId);
  if (rateEl) {
    if (units > 0 && charge > 0) {
      const rate = charge / units;
      rateEl.textContent = 'Rate: ' + formatThb(rate) + ' / unit';
    } else {
      rateEl.textContent = '';
    }
  }
}

async function initUtilities() {
  const monthInput = document.getElementById('util-month');
  if (monthInput) {
    monthInput.value = currentMonthIso();
    monthInput.addEventListener('change', async function () {
      const record = await loadUtilitiesForMonth(monthInput.value);
      if (record) {
        const f = record.fields;
        if (document.getElementById('util-elec-units')) document.getElementById('util-elec-units').value = f.electricity_units || '';
        if (document.getElementById('util-elec-charge')) document.getElementById('util-elec-charge').value = f.electricity_charge || '';
        if (document.getElementById('util-water-units')) document.getElementById('util-water-units').value = f.water_units || '';
        if (document.getElementById('util-water-charge')) document.getElementById('util-water-charge').value = f.water_charge || '';
        if (document.getElementById('util-notes')) document.getElementById('util-notes').value = f.notes || '';
      } else {
        ['util-elec-units', 'util-elec-charge', 'util-water-units', 'util-water-charge', 'util-notes'].forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      }
      updateUtilityRateDisplay('util-elec-units', 'util-elec-charge', 'util-elec-rate', 'util-elec-vs');
      updateUtilityRateDisplay('util-water-units', 'util-water-charge', 'util-water-rate', 'util-water-vs');
    });
  }

  // Auto-calc rates on input
  ['util-elec-units', 'util-elec-charge'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function () {
      updateUtilityRateDisplay('util-elec-units', 'util-elec-charge', 'util-elec-rate', 'util-elec-vs');
    });
  });
  ['util-water-units', 'util-water-charge'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function () {
      updateUtilityRateDisplay('util-water-units', 'util-water-charge', 'util-water-rate', 'util-water-vs');
    });
  });

  // Save button
  const saveBtn = document.getElementById('util-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      const month = document.getElementById('util-month')?.value;
      if (!month) { showFlash('Select a month', 'error'); return; }
      const elecUnits = parseFloat(document.getElementById('util-elec-units')?.value) || null;
      const elecCharge = parseFloat(document.getElementById('util-elec-charge')?.value) || null;
      const waterUnits = parseFloat(document.getElementById('util-water-units')?.value) || null;
      const waterCharge = parseFloat(document.getElementById('util-water-charge')?.value) || null;
      const notes = document.getElementById('util-notes')?.value || '';

      saveBtn.disabled = true;
      try {
        const res = await api('/api/utilities', {
          method: 'POST',
          body: JSON.stringify({
            month: month + '-01',
            electricity_units: elecUnits,
            electricity_charge: elecCharge,
            water_units: waterUnits,
            water_charge: waterCharge,
            notes: notes || undefined
          })
        });
        if (res.ok) {
          showFlash('Utilities saved!');
          loadUtilitiesHistory();
        } else {
          const d = await res.json().catch(function () { return {}; });
          showFlash(d.error || 'Save failed', 'error');
        }
      } catch (err) {
        showFlash('Error: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  loadUtilitiesHistory();
}

/* ════════════════════════════════════════
   DEBTS TAB
════════════════════════════════════════ */
let activeDebts = [];

async function loadDebts() {
  const tableContainer = document.getElementById('debts-table');
  const paySelect = document.getElementById('payment-debt-select');

  try {
    const res = await api('/api/debts');
    if (!res.ok) throw new Error('Failed to load debts');
    const data = await res.json();
    activeDebts = (data.records || []).filter(function (d) {
      const status = (d.fields.status || '').toLowerCase();
      return status !== 'paid' && status !== 'closed';
    });

    // Populate payment select
    if (paySelect) {
      paySelect.innerHTML = '<option value="">— Select debt —</option>';
      activeDebts.forEach(function (d) {
        const f = d.fields;
        const opt = document.createElement('option');
        opt.value = d.id;
        const balance = f.current_balance || f.original_amount || 0;
        opt.textContent = (f.creditor_name || 'Unknown') + ' (balance: ' + formatThb(balance) + ')';
        paySelect.appendChild(opt);
      });
    }

    // Render debts table
    if (tableContainer) {
      if (activeDebts.length === 0) {
        tableContainer.innerHTML = '<p style="opacity:0.5;text-align:center;padding:1rem">No active debts</p>';
        return;
      }
      const typeColors = { 'Bank': '#3b82f6', 'Family': '#f59e0b', 'Other': '#94a3b8' };
      const rows = activeDebts.map(function (d) {
        const f = d.fields;
        const color = typeColors[f.creditor_type] || '#94a3b8';
        const balance = f.current_balance || f.original_amount || 0;
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">' +
          '<td style="padding:0.5rem">' + escHtml(f.creditor_name || '') + '</td>' +
          '<td style="padding:0.5rem"><span style="background:' + color + '22;color:' + color + ';padding:0.15rem 0.4rem;border-radius:4px;font-size:0.72rem;font-weight:600">' + escHtml(f.creditor_type || 'Other') + '</span></td>' +
          '<td style="text-align:right;padding:0.5rem;font-weight:600" class="amount-negative">' + formatThb(balance) + '</td>' +
          '<td style="text-align:right;padding:0.5rem">' + (f.interest_rate ? f.interest_rate + '%' : '—') + '</td>' +
          '<td style="text-align:right;padding:0.5rem">' + formatThb(f.monthly_payment) + '</td>' +
          '<td style="text-align:right;padding:0.5rem;opacity:0.6">' + (f.due_date || '—') + '</td>' +
          '</tr>';
      }).join('');

      const totalBalance = activeDebts.reduce(function (s, d) {
        return s + (d.fields.current_balance || d.fields.original_amount || 0);
      }, 0);

      tableContainer.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem">' +
        '<thead><tr style="font-size:0.72rem;color:rgba(255,255,255,0.4);border-bottom:1px solid rgba(255,255,255,0.1)">' +
        '<th style="text-align:left;padding:0.35rem">Creditor</th><th style="padding:0.35rem">Type</th>' +
        '<th style="text-align:right;padding:0.35rem">Balance</th><th style="text-align:right;padding:0.35rem">Rate</th>' +
        '<th style="text-align:right;padding:0.35rem">Monthly</th><th style="text-align:right;padding:0.35rem">Due</th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
        '<tfoot><tr style="border-top:1px solid rgba(255,255,255,0.1);font-weight:600">' +
        '<td colspan="2" style="padding:0.4rem">Total</td>' +
        '<td class="amount-negative" style="text-align:right;padding:0.4rem">' + formatThb(totalBalance) + '</td>' +
        '<td colspan="3"></td>' +
        '</tr></tfoot></table>';
    }
  } catch (e) {
    if (tableContainer) tableContainer.innerHTML = '<p style="color:#ef4444;padding:1rem">Error: ' + e.message + '</p>';
  }
}

async function initDebts() {
  const payDateInput = document.getElementById('payment-date');
  if (payDateInput) payDateInput.value = todayIso();

  await loadDebts();

  // Save payment
  const payBtn = document.getElementById('save-payment-btn');
  if (payBtn) {
    payBtn.addEventListener('click', async function () {
      const debtId = document.getElementById('payment-debt-select')?.value;
      const amount = parseFloat(document.getElementById('payment-amount')?.value);
      const date = document.getElementById('payment-date')?.value;
      const note = document.getElementById('payment-note')?.value || '';

      if (!debtId) { showFlash('Select a debt', 'error'); return; }
      if (!amount || isNaN(amount)) { showFlash('Enter payment amount', 'error'); return; }
      if (!date) { showFlash('Select payment date', 'error'); return; }

      payBtn.disabled = true;
      try {
        const res = await api('/api/debts/' + debtId, {
          method: 'PATCH',
          body: JSON.stringify({ payment_amount: amount, payment_date: date, note: note || undefined })
        });
        if (res.ok) {
          showFlash('Payment logged!');
          if (document.getElementById('payment-amount')) document.getElementById('payment-amount').value = '';
          if (document.getElementById('payment-note')) document.getElementById('payment-note').value = '';
          await loadDebts();
        } else {
          const d = await res.json().catch(function () { return {}; });
          showFlash(d.error || 'Save failed', 'error');
        }
      } catch (err) {
        showFlash('Error: ' + err.message, 'error');
      } finally {
        payBtn.disabled = false;
      }
    });
  }

  // Add new debt
  const addDebtBtn = document.getElementById('add-debt-btn');
  if (addDebtBtn) {
    addDebtBtn.addEventListener('click', async function () {
      const creditorName = document.getElementById('new-creditor-name')?.value;
      const creditorType = document.getElementById('new-creditor-type')?.value || 'Other';
      const originalAmount = parseFloat(document.getElementById('new-original-amount')?.value);
      const interestRate = parseFloat(document.getElementById('new-interest-rate')?.value) || null;
      const monthlyPayment = parseFloat(document.getElementById('new-monthly-payment')?.value) || null;
      const dueDate = document.getElementById('new-due-date')?.value || null;
      const notes = document.getElementById('new-debt-notes')?.value || null;

      if (!creditorName) { showFlash('Creditor name required', 'error'); return; }
      if (!originalAmount || isNaN(originalAmount)) { showFlash('Amount required', 'error'); return; }

      addDebtBtn.disabled = true;
      try {
        const res = await api('/api/debts', {
          method: 'POST',
          body: JSON.stringify({
            creditor_name: creditorName,
            creditor_type: creditorType,
            original_amount: originalAmount,
            current_balance: originalAmount,
            interest_rate: interestRate,
            monthly_payment: monthlyPayment,
            due_date: dueDate,
            notes: notes
          })
        });
        if (res.ok) {
          showFlash('Debt added!');
          // Clear new debt form
          ['new-creditor-name', 'new-original-amount', 'new-interest-rate', 'new-monthly-payment', 'new-due-date', 'new-debt-notes'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
          });
          await loadDebts();
        } else {
          const d = await res.json().catch(function () { return {}; });
          showFlash(d.error || 'Failed to add debt', 'error');
        }
      } catch (err) {
        showFlash('Error: ' + err.message, 'error');
      } finally {
        addDebtBtn.disabled = false;
      }
    });
  }
}

/* ════════════════════════════════════════
   BUDGETS TAB
════════════════════════════════════════ */
let allBudgets = [];

async function loadBudgets() {
  const container = document.getElementById('budgets-list');
  if (!container) return;

  try {
    const [budgetRes, txRes] = await Promise.all([
      api('/api/budgets'),
      api('/api/transactions?limit=500')
    ]);
    const [budgetData, txData] = await Promise.all([
      budgetRes.json().catch(function () { return {}; }),
      txRes.json().catch(function () { return {}; })
    ]);

    allBudgets = budgetData.records || [];
    const transactions = txData.records || [];

    // Build expense totals by category
    const expByCategory = {};
    transactions.filter(function (t) { return t.fields.type === 'Expense'; }).forEach(function (t) {
      const cat = t.fields.category_name || 'Uncategorized';
      expByCategory[cat] = (expByCategory[cat] || 0) + (t.fields.amount || 0);
    });

    const active = allBudgets.filter(function (b) {
      return b.fields.active !== false;
    });

    if (active.length === 0) {
      container.innerHTML = '<p style="opacity:0.5;text-align:center;padding:1rem">No active budgets. Create one below.</p>';
      return;
    }

    const items = active.map(function (b) {
      const f = b.fields;
      const spent = expByCategory[f.label] || 0;
      const budgetAmt = f.amount || 0;
      const pct = budgetAmt > 0 ? Math.round((spent / budgetAmt) * 100) : 0;

      let barColor = '#22c55e';
      let bgColor = 'rgba(34,197,94,0.08)';
      if (pct > 100) { barColor = '#ef4444'; bgColor = 'rgba(239,68,68,0.08)'; }
      else if (pct > 80) { barColor = '#f59e0b'; bgColor = 'rgba(245,158,11,0.08)'; }

      return `<div style="background:var(--bg-surface,#252d3d);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:10px;padding:0.85rem;margin-bottom:0.6rem;background:${bgColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
          <div>
            <span style="font-weight:600;font-size:0.88rem">${escHtml(f.label || 'Budget')}</span>
            <span style="font-size:0.72rem;opacity:0.55;margin-left:0.4rem">${f.period || 'Monthly'}</span>
          </div>
          <div style="display:flex;gap:0.35rem">
            <button class="budget-delete-btn" data-id="${b.id}" style="background:none;border:none;color:#ef444488;cursor:pointer;font-size:0.8rem;padding:0.2rem 0.4rem" title="Delete">✕</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.5rem">
          <span class="amount-negative">${formatThb(spent)} spent</span>
          <span style="opacity:0.6">/ ${formatThb(budgetAmt)} budget</span>
          <span style="color:${barColor};font-weight:600">${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:6px;overflow:hidden">
          <div style="background:${barColor};width:${Math.min(pct, 100)}%;height:100%;border-radius:4px;transition:width 0.3s"></div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = items;

    // Wire delete buttons
    container.querySelectorAll('.budget-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.dataset.id;
        if (!confirm('Delete this budget?')) return;
        try {
          const res = await api('/api/budgets/' + id, { method: 'DELETE' });
          if (res.ok) { showFlash('Budget deleted'); loadBudgets(); }
          else showFlash('Delete failed', 'error');
        } catch (err) { showFlash('Error: ' + err.message, 'error'); }
      });
    });

  } catch (e) {
    container.innerHTML = '<p style="color:#ef4444;padding:1rem">Error: ' + e.message + '</p>';
  }
}

async function initBudgets() {
  const startInput = document.getElementById('budget-start');
  if (startInput) startInput.value = todayIso();

  // Populate categories for budget label suggestions
  try {
    const cats = await loadCategories('Expense');
    const catSelect = document.getElementById('budget-category-select');
    if (catSelect) {
      catSelect.innerHTML = '<option value="">— Or pick a category —</option>';
      cats.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.fields.name || '';
        opt.textContent = c.fields.name || '';
        catSelect.appendChild(opt);
      });
      catSelect.addEventListener('change', function () {
        if (catSelect.value) {
          const labelInput = document.getElementById('budget-label');
          if (labelInput && !labelInput.value) labelInput.value = catSelect.value;
        }
      });
    }
  } catch (e) { /* non-critical */ }

  await loadBudgets();

  // Create budget
  const createBtn = document.getElementById('create-budget-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async function () {
      const label = document.getElementById('budget-label')?.value;
      const amount = parseFloat(document.getElementById('budget-amount')?.value);
      const period = document.getElementById('budget-period')?.value || 'Monthly';
      const startDate = document.getElementById('budget-start')?.value || todayIso();
      const endDate = document.getElementById('budget-end')?.value || null;

      if (!label) { showFlash('Budget label required', 'error'); return; }
      if (!amount || isNaN(amount)) { showFlash('Budget amount required', 'error'); return; }

      createBtn.disabled = true;
      try {
        const res = await api('/api/budgets', {
          method: 'POST',
          body: JSON.stringify({
            label,
            amount,
            period,
            start_date: startDate,
            end_date: endDate || undefined,
            active: true
          })
        });
        if (res.ok) {
          showFlash('Budget created!');
          if (document.getElementById('budget-label')) document.getElementById('budget-label').value = '';
          if (document.getElementById('budget-amount')) document.getElementById('budget-amount').value = '';
          await loadBudgets();
        } else {
          const d = await res.json().catch(function () { return {}; });
          showFlash(d.error || 'Failed to create budget', 'error');
        }
      } catch (err) {
        showFlash('Error: ' + err.message, 'error');
      } finally {
        createBtn.disabled = false;
      }
    });
  }
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  initTabs();

  // Auto-activate first tab
  const firstTab = document.querySelector('.tab-btn');
  if (firstTab) {
    firstTab.click();
  } else {
    // If no tab system, just init transactions directly
    initTransactions();
  }
});
