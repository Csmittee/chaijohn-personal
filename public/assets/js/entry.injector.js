/* entry.injector.js — Chaijohn Entry Page */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });

  let categories         = [];
  let allBudgets         = [];   // expense budgets with category enrichment
  let budgetsData        = [];   // loaded budgets for inline edit
  let activeBudgetEditId = null;
  let activeLiabDetailId = null;
  let budgetView         = 'row';
  let budgetGroup        = 'all';
  let budgetGroupState   = {};
  let lastSpendByBudget  = {};   // keyed by budget.id
  let lastSpendByCat     = {};   // keyed by category ID (legacy fallback)
  let txType      = 'Expense';
  let txPeriod    = 'daily';
  let txMap       = {};
  let elecChart, waterChart, activeUtilChart = 'electricity', lastUtilRecords = [];
  let budgetActiveFilter = 'active';

  function periodShort(p) {
    if (p === 'Monthly')  return 'mo';
    if (p === 'Annual')   return 'yr';
    if (p === 'One-time') return 'once';
    if (p === '3x-year')  return '3x/yr';
    return p || '';
  }

  /* ── API helpers ── */
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `API error ${r.status}`);
    }
    return r.json();
  }

  function showMsg(elId, text, ok = true) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? 'var(--success, #22c55e)' : '#ef4444';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  /* ── Tab switching ── */
  function initTabs() {
    document.querySelectorAll('#entry-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#entry-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.dataset.tab + '-tab');
        if (panel) panel.classList.add('active');
        if (btn.dataset.tab === 'liabilities') loadLiabilityTab();
        if (btn.dataset.tab === 'budgets')     loadBudgetTab();
        if (btn.dataset.tab === 'utilities')   loadUtilityHistory();
      });
    });

    document.querySelectorAll('#tx-period-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#tx-period-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        txPeriod = btn.dataset.txperiod;
        loadTransactions();
      });
    });
  }

  /* ── Categories (for earn dropdown + budget category form) ── */
  async function loadCategories() {
    const res = await api('/api/categories?active=false');
    categories = (res.records || []).map(r => ({ id: r.id, ...r.fields }));
    populateCategoryDropdowns();
  }

  /* ── Budgets — G3: fetch expense budgets with category enrichment ── */
  async function loadBudgets() {
    try {
      const res = await api('/api/budgets?expense_only=true&active_only=true');
      allBudgets = (res.records || []).map(r => ({ id: r.id, ...r.fields }));
    } catch { allBudgets = []; }
  }

  /* ── G6: populate dropdowns correctly ── */
  function populateCategoryDropdowns() {
    const earns    = categories.filter(c => c.type === 'Earn');
    const expenses = categories.filter(c => c.type === 'Expense');

    // G3: expense tx uses budget list; earn tx uses earn categories
    if (txType === 'Expense') {
      renderBudgetSelect('tx-category', allBudgets);
    } else {
      renderCatSelect('tx-category', earns);
    }

    // G6: budget-category only shows Expense categories
    renderCatSelect('budget-category', expenses);

    // Populate group datalist for New Category form from loaded categories
    const groupList = document.getElementById('cat-group-list');
    if (groupList) {
      const groups = [...new Set(categories.map(c => c.group).filter(Boolean))].sort();
      groupList.innerHTML = groups.map(g => `<option value="${g}">`).join('');
    }
  }

  /* ── G3: render budget options grouped by category_group ── */
  function renderBudgetSelect(selId, buds) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const grouped = {};
    buds.forEach(b => {
      const g = b.category_group || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(b);
    });
    sel.innerHTML = '<option value="">— Select Budget —</option>' +
      Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([grp, items]) =>
        `<optgroup label="${grp}">` +
        items.map(b => `<option value="${b.id}">${b.label} — ${fmt(b.amount)}/${periodShort(b.period)}</option>`).join('') +
        '</optgroup>'
      ).join('');
  }

  function renderCatSelect(selId, cats) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const grouped = {};
    cats.forEach(c => {
      const g = c.group || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(c);
    });
    sel.innerHTML = '<option value="">— Select —</option>' +
      Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([grp, items]) =>
        `<optgroup label="${grp}">` +
        items.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
        '</optgroup>'
      ).join('');
  }

  /* ── G3: Budget bar — now keyed by budget ID ── */
  async function updateBudgetBar(selectedId) {
    const bar = document.getElementById('tx-budget-bar');
    if (!bar) return;
    if (!selectedId || txType !== 'Expense') { bar.style.display = 'none'; return; }

    const budget = allBudgets.find(b => b.id === selectedId);
    if (!budget) { bar.style.display = 'none'; return; }

    const limit = Number(budget.amount || 0);
    const now   = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    let spent = 0;
    try {
      const res = await api(`/api/transactions?start=${startOfMonth}&limit=500`);
      spent = (res.records || []).map(r => r.fields)
        .filter(t => {
          if (t.type !== 'Expense') return false;
          const bid = Array.isArray(t.budget_id) ? t.budget_id[0] : t.budget_id;
          return bid === selectedId;
        })
        .reduce((s, t) => s + Number(t.amount || 0), 0);
    } catch { /* show with 0 spent */ }

    const p   = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const clr = p >= 100 ? '#ef4444' : p >= 85 ? '#f59e0b' : '#22c55e';
    bar.style.display = 'block';
    bar.innerHTML = `
      <span>${budget.label} — ${fmt(spent)} spent / ${fmt(limit)} budget (${p}%)</span>
      <div style="height:5px;background:var(--border,#e2e8f0);border-radius:3px;overflow:hidden;margin-top:0.2rem">
        <div style="height:100%;width:${Math.min(p, 100)}%;background:${clr};border-radius:3px;transition:width 0.4s"></div>
      </div>`;
  }

  /* ── Transactions ── */
  function initTransactionForm() {
    const today  = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('tx-date');
    if (dateEl) dateEl.value = today;

    const btnIncome  = document.getElementById('type-income');
    const btnExpense = document.getElementById('type-expense');

    function setType(type) {
      txType = type;
      if (btnIncome)  btnIncome.className  = 'btn btn-lg ' + (type === 'Income'  ? 'btn-success' : 'btn-outline');
      if (btnExpense) btnExpense.className = 'btn btn-lg ' + (type === 'Expense' ? 'btn-danger'  : 'btn-outline');

      // G3/G6: update label and dropdown based on type
      const catLabel = document.querySelector('label[for="tx-category"]');
      if (catLabel) catLabel.textContent = type === 'Expense' ? 'Budget' : 'Income Source';

      if (type === 'Expense') {
        renderBudgetSelect('tx-category', allBudgets);
      } else {
        renderCatSelect('tx-category', categories.filter(c => c.type === 'Earn'));
      }

      const bar = document.getElementById('tx-budget-bar');
      if (bar) bar.style.display = 'none';
    }

    btnIncome?.addEventListener('click',  () => setType('Income'));
    btnExpense?.addEventListener('click', () => setType('Expense'));
    setType('Expense');

    // G3: budget bar on selection change
    document.getElementById('tx-category')?.addEventListener('change', () => {
      const selectedId = document.getElementById('tx-category')?.value;
      updateBudgetBar(selectedId || '');
    });

    ensureMsgEl('tx-msg', 'save-tx');

    document.getElementById('save-tx')?.addEventListener('click', async () => {
      const amount      = document.getElementById('tx-amount')?.value;
      const selectedId  = document.getElementById('tx-category')?.value;
      const description = document.getElementById('tx-description')?.value || '';
      const entity      = document.getElementById('tx-entity')?.value || '';
      const date        = document.getElementById('tx-date')?.value || today;
      const note        = document.getElementById('tx-note')?.value || '';

      if (!amount || Number(amount) <= 0) return alert('Amount is required');

      // G3: require budget for expense
      if (txType === 'Expense' && !selectedId) return alert('Please select a budget for this expense');

      const body = { date, amount: Number(amount), type: txType, description, entity, note, source: 'Manual' };

      // G3: send budget_id for expense, category_id for earn
      if (txType === 'Expense') {
        if (selectedId) body.budget_id = [selectedId];
      } else {
        if (selectedId) body.category_id = [selectedId];
      }

      try {
        await api('/api/transactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('tx-msg', 'Saved!');
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-description').value = '';
        document.getElementById('tx-note').value = '';
        loadTransactions();
        loadEntitySuggestions();
        if (txType === 'Expense' && selectedId) updateBudgetBar(selectedId);
      } catch (err) {
        showMsg('tx-msg', err.message, false);
      }
    });
  }

  /* ── G4: Transaction list with budget-aware display ── */
  async function loadTransactions() {
    const list = document.getElementById('tx-list');
    if (!list) return;

    const now = new Date();
    let start;
    if (txPeriod === 'daily') {
      start = now.toISOString().split('T')[0];
    } else if (txPeriod === 'weekly') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      start = d.toISOString().split('T')[0];
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }

    const catMap    = {};
    const budgetMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    allBudgets.forEach(b => { budgetMap[b.id] = b; });
    txMap = {};

    try {
      const res = await api(`/api/transactions?start=${start}&limit=200`);
      const records = (res.records || []).map(r => ({ _id: r.id, ...r.fields }));
      records.forEach(r => { txMap[r._id] = r; });

      if (records.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:1.5rem">No transactions yet</div>';
        return;
      }

      const byDate = {};
      records.forEach(r => {
        const d = r.date || 'Unknown';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(r);
      });

      list.innerHTML = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, txs]) => {
        const dayTotal = txs.reduce((s, t) => s + (t.type === 'Income' ? 1 : -1) * Number(t.amount || 0), 0);
        return `
          <div style="margin-bottom:1rem">
            <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);
              display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border)">
              <span>${date}</span>
              <span style="color:${dayTotal >= 0 ? '#22c55e' : '#ef4444'}">${fmt(dayTotal)}</span>
            </div>
            ${txs.map(t => {
              const isIncome  = t.type === 'Income';
              const isLiab    = t.source === 'LiabilityPayment' || t.source === 'LiabilityCreation';

              // G4: resolve display label via budget_id first
              let subLabel = '';
              if (isLiab) {
                subLabel = 'Loan — ' + (t.entity || '');
              } else if (t.budget_label) {
                subLabel = (t.category_group ? t.category_group + ' — ' : '') + t.budget_label;
              } else if (t.category_name) {
                subLabel = (t.category_group ? t.category_group + ' — ' : '') + t.category_name;
                if (t.legacy) subLabel += ' <span style="font-size:0.7rem;color:#94a3b8">(legacy)</span>';
              } else {
                // Local fallback
                const bid    = Array.isArray(t.budget_id) ? t.budget_id[0] : t.budget_id;
                const budget = budgetMap[bid];
                const catId  = Array.isArray(t.category_id) ? t.category_id[0] : t.category_id;
                const cat    = catMap[catId];
                if (budget) {
                  subLabel = (budget.category_group ? budget.category_group + ' — ' : '') + (budget.label || '');
                } else if (cat) {
                  subLabel = (cat.group ? cat.group + ' — ' : '') + cat.name;
                }
              }

              return `
                <div class="tx-row" data-tx-id="${t._id}"
                  style="display:flex;justify-content:space-between;align-items:center;
                  padding:0.5rem 0;border-bottom:1px solid var(--border)">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${t.description || t.entity || 'Transaction'}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-secondary)">
                      ${subLabel}${t.note ? ' · ' + t.note : ''}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;margin-left:0.5rem">
                    <span style="font-weight:700;color:${isIncome ? '#22c55e' : '#ef4444'}">
                      ${isIncome ? '+' : '-'}${fmt(t.amount)}
                    </span>
                    <button class="tx-edit-btn" data-id="${t._id}"
                      style="background:none;border:1px solid var(--border);border-radius:4px;
                      cursor:pointer;color:var(--text-secondary);font-size:0.78rem;padding:0.1rem 0.35rem;
                      line-height:1">✎</button>
                  </div>
                </div>`;
            }).join('')}
          </div>`;
      }).join('');

      list.querySelectorAll('.tx-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => showEditForm(btn.dataset.id));
      });
    } catch (err) {
      list.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
  }

  /* ── G3+G4: Edit form — budget select for expense, earn cat for income ── */
  function showEditForm(txId) {
    const tx  = txMap[txId];
    const row = document.querySelector(`.tx-row[data-tx-id="${txId}"]`);
    if (!tx || !row) return;

    const currentType = tx.type || 'Expense';
    const budgetId    = Array.isArray(tx.budget_id) ? tx.budget_id[0] : tx.budget_id;
    const catId       = Array.isArray(tx.category_id) ? tx.category_id[0] : tx.category_id;

    let dropdownHtml = '';
    if (currentType === 'Expense') {
      const opts = allBudgets.map(b =>
        `<option value="${b.id}" ${b.id === budgetId ? 'selected' : ''}>${b.category_group ? b.category_group + ' — ' : ''}${b.label} (${fmt(b.amount)}/${periodShort(b.period)})</option>`
      ).join('');
      dropdownHtml = `
        <select class="ef-budget-cat" style="width:100%;font-size:0.82rem;padding:0.25rem;margin-bottom:0.4rem">
          <option value="">— No budget —</option>${opts}
        </select>`;
    } else {
      const earns = categories.filter(c => c.type === 'Earn');
      const opts  = earns.map(c =>
        `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.group ? c.group + ' — ' : ''}${c.name}</option>`
      ).join('');
      dropdownHtml = `
        <select class="ef-budget-cat" style="width:100%;font-size:0.82rem;padding:0.25rem;margin-bottom:0.4rem">
          <option value="">— No category —</option>${opts}
        </select>`;
    }

    row.innerHTML = `
      <div style="width:100%;padding:0.5rem 0">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.4rem;margin-bottom:0.4rem">
          <input type="date"   class="ef-date"   value="${tx.date || ''}" style="font-size:0.82rem;padding:0.25rem">
          <select class="ef-type" style="font-size:0.82rem;padding:0.25rem">
            <option value="Income"  ${currentType==='Income'  ? 'selected':''}>Income</option>
            <option value="Expense" ${currentType==='Expense' ? 'selected':''}>Expense</option>
          </select>
          <input type="number" class="ef-amount" value="${tx.amount || ''}" style="font-size:0.82rem;padding:0.25rem">
        </div>
        ${dropdownHtml}
        <input type="text" class="ef-desc" value="${(tx.description || '').replace(/"/g,'&quot;')}" placeholder="Description"
          style="width:100%;font-size:0.82rem;padding:0.25rem;margin-bottom:0.4rem">
        <input type="text" class="ef-note" value="${(tx.note || '').replace(/"/g,'&quot;')}" placeholder="Note"
          style="width:100%;font-size:0.82rem;padding:0.25rem;margin-bottom:0.4rem">
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-primary ef-save" data-id="${txId}" style="flex:1;font-size:0.82rem;padding:0.3rem">Save</button>
          <button class="btn btn-outline ef-cancel" style="flex:1;font-size:0.82rem;padding:0.3rem">Cancel</button>
          <button class="btn ef-delete" data-id="${txId}"
            style="flex:1;font-size:0.82rem;padding:0.3rem;
            background:#ef4444;color:white;border:none;border-radius:var(--radius);
            cursor:pointer">🗑 Delete</button>
        </div>
        <div class="ef-msg" style="display:none;font-size:0.78rem;margin-top:0.25rem"></div>
      </div>`;

    row.querySelector('.ef-save').addEventListener('click', () => saveEditTx(txId, row));
    row.querySelector('.ef-cancel').addEventListener('click', () => loadTransactions());
    row.querySelector('.ef-delete').addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      try {
        await api(`/api/transactions/${txId}`, { method: 'DELETE' });
        loadTransactions();
      } catch (err) {
        const msgEl = row.querySelector('.ef-msg');
        if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
      }
    });
  }

  async function saveEditTx(txId, row) {
    const msgEl    = row.querySelector('.ef-msg');
    const editType = row.querySelector('.ef-type')?.value;
    const bcVal    = row.querySelector('.ef-budget-cat')?.value;

    const fields = {
      date:        row.querySelector('.ef-date')?.value,
      type:        editType,
      amount:      Number(row.querySelector('.ef-amount')?.value || 0),
      description: row.querySelector('.ef-desc')?.value,
      note:        row.querySelector('.ef-note')?.value
    };

    // G3: send budget_id for expense, category_id for earn
    if (bcVal) {
      if (editType === 'Expense') fields.budget_id   = [bcVal];
      else                        fields.category_id = [bcVal];
    }

    try {
      await api(`/api/transactions/${txId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      loadTransactions();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
    }
  }

  /* ── Utilities ── */
  function initUtilityForm() {
    const monthEl = document.getElementById('util-month');
    if (monthEl) {
      const now = new Date();
      monthEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const elecUnits  = document.getElementById('util-elec-units');
    const elecCharge = document.getElementById('util-elec-charge');
    const waterUnits  = document.getElementById('util-water-units');
    const waterCharge = document.getElementById('util-water-charge');

    function updateRateDisplay(units, charge, displayId) {
      const u = Number(units?.value || 0), c = Number(charge?.value || 0);
      const el = document.getElementById(displayId);
      if (el) el.textContent = u > 0 && c > 0 ? `Rate: ${fmt(c / u)}/unit` : '';
    }
    elecUnits?.addEventListener('input',  () => updateRateDisplay(elecUnits,  elecCharge, 'elec-rate-display'));
    elecCharge?.addEventListener('input', () => updateRateDisplay(elecUnits,  elecCharge, 'elec-rate-display'));
    waterUnits?.addEventListener('input',  () => updateRateDisplay(waterUnits, waterCharge, 'water-rate-display'));
    waterCharge?.addEventListener('input', () => updateRateDisplay(waterUnits, waterCharge, 'water-rate-display'));

    ensureMsgEl('util-msg', 'save-util');

    document.getElementById('save-util')?.addEventListener('click', async () => {
      const monthVal = document.getElementById('util-month')?.value;
      if (!monthVal) return alert('Month is required');
      const body = {
        month: monthVal + '-01',
        electricity_units:  Number(elecUnits?.value  || 0) || undefined,
        electricity_charge: Number(elecCharge?.value || 0) || undefined,
        water_units:  Number(waterUnits?.value  || 0) || undefined,
        water_charge: Number(waterCharge?.value || 0) || undefined,
        notes:   document.getElementById('util-notes')?.value || '',
        ft_note: document.getElementById('util-ft-note')?.value || ''
      };
      Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
      try {
        await api('/api/utilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showMsg('util-msg', 'Saved!');
        loadUtilityHistory();
      } catch (err) {
        showMsg('util-msg', err.message, false);
      }
    });
  }

  let yoyCharts = {};
  let yoyAllRecords = [];

  function renderUtilChart(records) {
    const reversed = [...records].reverse();
    const labels   = reversed.map(r => (r.month || '').slice(0, 7));
    if (activeUtilChart === 'water') {
      if (elecChart) { elecChart.destroy(); elecChart = null; }
      renderMiniChart('elec-chart', labels, reversed.map(r => r.water_charge || 0), 'Water ฿', '#3b82f6');
    } else {
      if (elecChart) { elecChart.destroy(); elecChart = null; }
      renderMiniChart('elec-chart', labels, reversed.map(r => r.electricity_charge || 0), 'Electricity ฿', '#f59e0b');
    }
  }

  async function loadUtilityHistory() {
    const tableEl = document.getElementById('util-history-table');
    if (!tableEl) return;

    // F4b — collapse toggle
    const toggleBtn  = document.getElementById('util-history-toggle');
    const chevronEl  = document.getElementById('util-history-chevron');
    const summaryEl  = document.getElementById('util-history-summary');
    const bodyEl     = document.getElementById('util-history-body');
    if (toggleBtn && !toggleBtn._utilToggleInit) {
      toggleBtn._utilToggleInit = true;
      toggleBtn.addEventListener('click', () => {
        const open = bodyEl.style.display !== 'none';
        bodyEl.style.display = open ? 'none' : 'block';
        if (chevronEl) chevronEl.textContent = open ? '▶ Show history' : '▲ Hide history';
      });
    }

    // F4a — chart toggle
    const chartToggle = document.getElementById('util-chart-toggle-bar');
    if (chartToggle && !chartToggle._utilChartInit) {
      chartToggle._utilChartInit = true;
      chartToggle.addEventListener('click', e => {
        const btn = e.target.closest('[data-util-chart]');
        if (!btn || btn.classList.contains('active')) return;
        chartToggle.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeUtilChart = btn.dataset.utilChart;
        if (lastUtilRecords.length) renderUtilChart(lastUtilRecords);
        applyYoYFilter();
      });
    }

    try {
      const now = new Date();
      const [yearRes, allRes] = await Promise.all([
        api(`/api/utilities?year=${now.getFullYear()}`),
        api('/api/utilities')
      ]);
      const records = (yearRes.records || []).map(r => r.fields).slice(0, 12);
      yoyAllRecords = (allRes.records || []).map(r => ({ id: r.id, ...r.fields }));
      lastUtilRecords = records;

      // F4b — summary line (always visible)
      if (summaryEl && records.length > 0) {
        const latest = records[0];
        const mo = (latest.month || '').slice(0, 7);
        summaryEl.textContent = mo
          + ' · Elec ' + (latest.electricity_charge ? fmt(latest.electricity_charge) : '—')
          + ' · Water ' + (latest.water_charge ? fmt(latest.water_charge) : '—');
      }

      if (records.length === 0) {
        tableEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No utility records yet.</div>';
      } else {
        tableEl.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:0.25rem">Month</th>
              <th style="text-align:right">Elec Units</th>
              <th style="text-align:right">Elec ฿</th>
              <th style="text-align:right">Water Units</th>
              <th style="text-align:right">Water ฿</th>
              <th style="text-align:center">FT</th>
            </tr></thead>
            <tbody>${records.map(r => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:0.25rem">${(r.month || '').slice(0, 7)}</td>
                <td style="text-align:right">${r.electricity_units || '—'}</td>
                <td style="text-align:right">${r.electricity_charge ? fmt(r.electricity_charge) : '—'}</td>
                <td style="text-align:right">${r.water_units || '—'}</td>
                <td style="text-align:right">${r.water_charge ? fmt(r.water_charge) : '—'}</td>
                <td style="text-align:center">
                  ${r.ft_note ? `<span title="${r.ft_note.replace(/"/g,'&quot;')}"
                    style="cursor:help">📝</span>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>`;
        renderUtilChart(records);
      }

      renderYoYCharts(yoyAllRecords);
    } catch (err) {
      tableEl.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
  }

  const YOY_COLORS = { 2023:'#6366f1', 2024:'#22c55e', 2025:'#f59e0b', 2026:'#3b82f6' };
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function renderYoYCharts(records) {
    if (!records || records.length === 0) return;
    const byYear = {};
    records.forEach(r => {
      const d = r.month || '';
      if (!d) return;
      const year  = parseInt(d.slice(0, 4));
      const month = parseInt(d.slice(5, 7));
      if (!byYear[year]) byYear[year] = {};
      byYear[year][month] = r;
    });

    const years = Object.keys(byYear).map(Number).sort();
    if (years.length === 0) return;

    const fromSel = document.getElementById('yoy-from-year');
    const toSel   = document.getElementById('yoy-to-year');
    if (fromSel && fromSel.options.length === 0) {
      years.forEach(y => {
        fromSel.appendChild(new Option(y, y));
        toSel.appendChild(new Option(y, y));
      });
      fromSel.value = years[0];
      toSel.value   = years[years.length - 1];

      const onRangeChange = () => {
        const from = parseInt(fromSel.value);
        const to   = parseInt(toSel.value);
        if (from > to) return;
        drawYoYCharts(byYear, years.filter(y => y >= from && y <= to));
        renderYoYLegend(years.filter(y => y >= from && y <= to));
      };
      fromSel.addEventListener('change', onRangeChange);
      toSel.addEventListener('change', onRangeChange);
    }

    const from = parseInt(fromSel?.value || years[0]);
    const to   = parseInt(toSel?.value   || years[years.length - 1]);
    const activeYears = years.filter(y => y >= from && y <= to);
    drawYoYCharts(byYear, activeYears);
    renderYoYLegend(activeYears);
    applyYoYFilter();
  }

  function drawYoYCharts(byYear, activeYears) {
    const charts = [
      { id: 'yoy-elec-units',  field: 'electricity_units',  label: 'Units' },
      { id: 'yoy-elec-charge', field: 'electricity_charge', label: '฿' },
      { id: 'yoy-water-units', field: 'water_units',        label: 'Units' },
      { id: 'yoy-water-charge',field: 'water_charge',       label: '฿' }
    ];
    charts.forEach(cfg => {
      const canvas = document.getElementById(cfg.id);
      if (!canvas) return;
      if (yoyCharts[cfg.id]) yoyCharts[cfg.id].destroy();

      const datasets = activeYears.map(year => {
        const color = YOY_COLORS[year] || `hsl(${(year % 10) * 36},65%,55%)`;
        const data  = MONTHS_SHORT.map((_, mi) => {
          const rec = byYear[year]?.[mi + 1];
          return rec && rec[cfg.field] !== undefined ? Number(rec[cfg.field]) : null;
        });
        return {
          label: String(year), data, borderColor: color, backgroundColor: color + '22',
          borderWidth: 2, pointRadius: 3, tension: 0.3, spanGaps: false
        };
      });

      yoyCharts[cfg.id] = new Chart(canvas, {
        type: 'line',
        data: { labels: MONTHS_SHORT, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: activeYears.length > 1, position: 'bottom',
              labels: { boxWidth: 10, font: { size: 8 } } }
          },
          scales: {
            x: { ticks: { font: { size: 8 } } },
            y: { ticks: { font: { size: 8 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
          }
        }
      });
    });
  }

  function renderYoYLegend(activeYears) {
    const legendEl = document.getElementById('yoy-legend');
    if (!legendEl) return;
    legendEl.innerHTML = activeYears.map(y => {
      const color = YOY_COLORS[y] || `hsl(${(y % 10) * 36},65%,55%)`;
      return `<span style="display:flex;align-items:center;gap:0.3rem">
        <span style="width:14px;height:3px;background:${color};display:inline-block;border-radius:2px"></span>
        <span>${y}</span>
      </span>`;
    }).join('');
  }

  function applyYoYFilter() {
    const elecIds  = ['yoy-wrap-elec-units', 'yoy-wrap-elec-charge'];
    const waterIds = ['yoy-wrap-water-units', 'yoy-wrap-water-charge'];
    const showElec = activeUtilChart === 'electricity';
    elecIds.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = showElec ? '' : 'none'; });
    waterIds.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = showElec ? 'none' : ''; });
  }

  function renderMiniChart(canvasId, labels, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: color + 'bb', borderRadius: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { font: { size: 8 } } }, y: { ticks: { font: { size: 8 } } } }
      }
    });
  }

  /* ── Liabilities ── */
  let liabilities = [];

  async function loadLiabilityTab() {
    const res = await api('/api/liabilities?all=true').catch(() => ({ records: [] }));
    liabilities = (res.records || []).map(r => ({ id: r.id, ...r.fields }));
    renderLiabilitySelect();
    renderLiabilitiesList();
  }

  function renderLiabilitySelect() {
    const sel = document.getElementById('payment-liability-select');
    if (!sel) return;
    const active = liabilities.filter(l => l.active !== false && Number(l.current_balance || 0) > 0);
    sel.innerHTML = '<option value="">— Select liability —</option>' +
      active.map(l => `<option value="${l.id}">${l.name} (${fmt(l.current_balance)} @ ${l.interest_rate || 0}%)</option>`).join('');
    sel.addEventListener('change', () => updateInterestPreview(sel.value));
    updateInterestPreview(sel.value);
  }

  function updateInterestPreview(liabId) {
    const preview = document.getElementById('payment-interest-preview');
    if (!preview) return;
    const liab = liabilities.find(l => l.id === liabId);
    if (!liab || !liab.current_balance) { preview.style.display = 'none'; return; }
    const balance   = Number(liab.current_balance || 0);
    const rate      = Number(liab.interest_rate || 0);
    const interest  = Math.round(balance * (rate / 100 / 12) * 100) / 100;
    const suggested = Number(liab.monthly_payment || 0);
    const principal = Math.max(0, suggested - interest);
    preview.style.display = 'block';
    preview.innerHTML = `Balance: ${fmt(balance)} · Est. interest: ${fmt(interest)} · Principal: ${fmt(principal)}`;
    const amtEl = document.getElementById('payment-amount');
    if (amtEl && !amtEl.value && suggested > 0) amtEl.value = suggested;
  }

  function initLiabilityForm() {
    const today = new Date().toISOString().split('T')[0];
    const pdateEl = document.getElementById('payment-date');
    if (pdateEl) pdateEl.value = today;

    const liabToggle  = document.getElementById('liab-form-toggle');
    const liabBody    = document.getElementById('liab-form-body');
    const liabChevron = document.getElementById('liab-form-chevron');
    if (liabToggle && liabBody) {
      liabToggle.addEventListener('click', () => {
        const isOpen = liabBody.style.maxHeight && liabBody.style.maxHeight !== '0px' && liabBody.style.maxHeight !== '0';
        liabBody.style.maxHeight = isOpen ? '0' : '700px';
        if (liabChevron) liabChevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    }

    ensureMsgEl('payment-msg', 'save-payment');
    ensureMsgEl('liab-msg', 'save-liability');

    document.getElementById('save-payment')?.addEventListener('click', async () => {
      const liabId = document.getElementById('payment-liability-select')?.value;
      const amount = document.getElementById('payment-amount')?.value;
      const date   = document.getElementById('payment-date')?.value || today;
      const note   = document.getElementById('payment-note')?.value || '';
      if (!liabId) return alert('Select a liability');
      if (!amount || Number(amount) <= 0) return alert('Enter payment amount');
      try {
        const res = await api(`/api/liabilities/${liabId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_amount: Number(amount), date, note })
        });
        showMsg('payment-msg', `Logged. Interest: ${fmt(res.interest)}, Principal: ${fmt(res.principal)}, New balance: ${fmt(res.new_balance)}`);
        document.getElementById('payment-amount').value = '';
        document.getElementById('payment-note').value   = '';
        loadLiabilityTab();
      } catch (err) {
        showMsg('payment-msg', err.message, false);
      }
    });

    document.getElementById('save-liability')?.addEventListener('click', async () => {
      const name = document.getElementById('liab-name')?.value?.trim();
      if (!name) return alert('Name is required');
      const body = {
        name,
        creditor_type:   document.getElementById('liab-creditor-type')?.value || 'Other',
        loan_size:       Number(document.getElementById('liab-loan-size')?.value  || 0) || undefined,
        current_balance: Number(document.getElementById('liab-balance')?.value    || 0) || undefined,
        interest_rate:   Number(document.getElementById('liab-rate')?.value       || 0) || undefined,
        monthly_payment:  Number(document.getElementById('liab-monthly')?.value    || 0) || undefined,
        payment_due_day:  Number(document.getElementById('liab-due-day')?.value    || 0) || undefined,
        start_date:       document.getElementById('liab-start')?.value || undefined,
        notes:            document.getElementById('liab-notes')?.value || ''
      };
      Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
      try {
        await api('/api/liabilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showMsg('liab-msg', 'Liability added!');
        ['liab-name','liab-loan-size','liab-balance','liab-rate','liab-monthly','liab-due-day','liab-start','liab-notes']
          .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        loadLiabilityTab();
      } catch (err) {
        showMsg('liab-msg', err.message, false);
      }
    });
  }

  function renderLiabilitiesList() {
    const table = document.getElementById('active-liabilities-table');
    if (!table) return;
    const active = liabilities.filter(l => l.active !== false);
    if (active.length === 0) {
      table.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No liabilities found.</div>';
      return;
    }
    table.innerHTML = active.map(l => {
      const bal  = Number(l.current_balance || 0);
      const loan = Number(l.loan_size || bal);
      const paidPct = loan > 0 ? Math.round((1 - bal / loan) * 100) : 0;
      return `
        <div class="liab-row-wrap">
          <div class="liab-row" data-liab-id="${l.id}"
            style="border-bottom:1px solid var(--border);padding:0.75rem 0;cursor:pointer;
            user-select:none;transition:background 0.15s"
            onmouseover="this.style.background='rgba(59,130,246,0.04)'"
            onmouseout="this.style.background=''">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <strong style="font-size:0.95rem">${l.name}</strong>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <span style="font-size:0.85rem;color:#ef4444">${fmt(bal)}</span>
                <span class="liab-chevron" data-liab-chevron="${l.id}"
                  style="font-size:0.75rem;color:var(--text-secondary);transition:transform 0.3s;
                  display:inline-block">▼</span>
              </div>
            </div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.1rem">
              ${l.creditor_type || ''} · ${l.interest_rate || 0}% p.a. · Monthly: ${fmt(l.monthly_payment)}${l.payment_due_day ? ` · Due ${l.payment_due_day}th` : ''}
            </div>
            <div style="height:4px;background:var(--border);border-radius:2px;margin-top:0.4rem;overflow:hidden">
              <div style="height:100%;width:${paidPct}%;background:#22c55e;border-radius:2px"></div>
            </div>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem">${paidPct}% paid off</div>
          </div>
          <div class="liab-detail-panel" data-liab-panel="${l.id}" style="display:none"></div>
        </div>`;
    }).join('');

    table.querySelectorAll('.liab-row').forEach(row => {
      row.addEventListener('click', () => openLiabDetailPanel(row.dataset.liabId));
    });
  }

  async function openLiabDetailPanel(liabId) {
    if (activeLiabDetailId === liabId) {
      const panel = document.querySelector(`.liab-detail-panel[data-liab-panel="${liabId}"]`);
      if (panel) panel.style.display = 'none';
      const chev = document.querySelector(`[data-liab-chevron="${liabId}"]`);
      if (chev) chev.style.transform = '';
      activeLiabDetailId = null;
      return;
    }
    if (activeLiabDetailId) {
      const prev = document.querySelector(`.liab-detail-panel[data-liab-panel="${activeLiabDetailId}"]`);
      if (prev) prev.style.display = 'none';
      const prevChev = document.querySelector(`[data-liab-chevron="${activeLiabDetailId}"]`);
      if (prevChev) prevChev.style.transform = '';
    }
    activeLiabDetailId = liabId;
    const chev = document.querySelector(`[data-liab-chevron="${liabId}"]`);
    if (chev) chev.style.transform = 'rotate(180deg)';

    const l     = liabilities.find(x => x.id === liabId);
    const panel = document.querySelector(`.liab-detail-panel[data-liab-panel="${liabId}"]`);
    if (!l || !panel) return;

    const bal  = Number(l.current_balance || 0);
    const loan = Number(l.loan_size || bal);
    const paid = Math.max(0, loan - bal);
    const paidPct = loan > 0 ? Math.round((paid / loan) * 100) : 0;
    const balWidth = loan > 0 ? Math.min(100, Math.round((bal / loan) * 100)) : 100;

    panel.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;
        margin-bottom:0.5rem;background:rgba(59,130,246,0.02)">
        <div style="margin-bottom:1.25rem">
          <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);
            margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.04em">Edit</div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Creditor Name</label>
              <input type="text" class="le-name" value="${(l.name || '').replace(/"/g,'&quot;')}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Creditor Type</label>
              <select class="le-type" style="font-size:0.85rem;padding:0.3rem 0.5rem">
                <option value="Bank"   ${l.creditor_type==='Bank'   ?'selected':''}>Bank</option>
                <option value="Family" ${l.creditor_type==='Family' ?'selected':''}>Family</option>
                <option value="Friend" ${l.creditor_type==='Friend' ?'selected':''}>Friend</option>
                <option value="Other"  ${l.creditor_type==='Other'  ?'selected':''}>Other</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Original Amount ฿</label>
              <input type="number" class="le-loan" value="${l.loan_size || ''}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Current Balance ฿</label>
              <input type="number" class="le-balance" value="${bal || ''}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Interest Rate %</label>
              <input type="number" class="le-rate" step="0.01" value="${l.interest_rate || ''}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Monthly Payment ฿</label>
              <input type="number" class="le-monthly" value="${l.monthly_payment || ''}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Payment Due Day (1–31)</label>
              <input type="number" class="le-due-day" min="1" max="31" value="${l.payment_due_day || ''}"
                placeholder="e.g. 5" style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
            <div class="form-group">
              <label style="font-size:0.78rem;color:var(--text-secondary)">Notes</label>
              <input type="text" class="le-notes" value="${(l.notes || '').replace(/"/g,'&quot;')}"
                style="font-size:0.85rem;padding:0.3rem 0.5rem">
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.25rem">
            <button class="btn btn-primary le-save" style="flex:1;font-size:0.85rem;padding:0.35rem 1rem">Save Changes</button>
            <button class="btn btn-danger le-delete" style="font-size:0.85rem;padding:0.35rem 0.75rem">Delete</button>
          </div>
          <div class="le-msg" style="display:none;font-size:0.82rem;margin-top:0.4rem"></div>
        </div>

        <div style="margin-bottom:1.25rem">
          <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);
            margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.04em">Balance</div>
          ${bal === 0 ? `
            <div style="font-size:0.9rem;color:#22c55e;font-weight:600">✅ Fully paid</div>
          ` : `
            <div style="margin-bottom:0.4rem">
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;
                color:var(--text-secondary);margin-bottom:0.25rem">
                <span>Original loan</span><span>${fmt(loan)}</span>
              </div>
              <div style="height:10px;background:#64748b;border-radius:5px;overflow:hidden">
                <div style="height:100%;width:100%;background:#64748b;border-radius:5px"></div>
              </div>
            </div>
            <div style="margin-bottom:0.4rem">
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;
                color:var(--text-secondary);margin-bottom:0.25rem">
                <span>Current balance</span><span>${fmt(bal)}</span>
              </div>
              <div style="height:10px;background:var(--border);border-radius:5px;
                overflow:hidden;border:1px dashed var(--border)">
                <div style="height:100%;width:${balWidth}%;background:var(--color-primary);
                  border-radius:5px;transition:width 0.4s"></div>
              </div>
            </div>
            <div style="font-size:0.82rem;color:#22c55e;font-weight:500">
              ${fmt(paid)} paid back (${paidPct}%)
            </div>
          `}
        </div>

        <div>
          <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);
            margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.04em">Payment History</div>
          <div class="liab-history-list" data-liab-history="${liabId}">
            <div style="color:var(--text-secondary);font-size:0.85rem">Loading…</div>
          </div>
        </div>
      </div>`;

    panel.style.display = 'block';
    panel.querySelector('.le-save').addEventListener('click', () => saveLiabEdit(liabId, panel));
    panel.querySelector('.le-delete').addEventListener('click', () => deleteLiability(liabId, panel));
    loadLiabHistory(liabId, panel);
  }

  async function deleteLiability(liabId, panel) {
    if (!confirm('Delete this liability? This cannot be undone.')) return;
    const msgEl = panel.querySelector('.le-msg');
    try {
      await api(`/api/liabilities/${liabId}`, { method: 'DELETE' });
      activeLiabDetailId = null;
      loadLiabilityTab();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
    }
  }

  async function saveLiabEdit(liabId, panel) {
    const msgEl = panel.querySelector('.le-msg');
    const body = {
      name:            panel.querySelector('.le-name')?.value?.trim(),
      creditor_type:   panel.querySelector('.le-type')?.value,
      loan_size:       Number(panel.querySelector('.le-loan')?.value    || 0) || undefined,
      current_balance: Number(panel.querySelector('.le-balance')?.value || 0),
      interest_rate:   Number(panel.querySelector('.le-rate')?.value    || 0) || undefined,
      monthly_payment:  Number(panel.querySelector('.le-monthly')?.value  || 0) || undefined,
      payment_due_day:  Number(panel.querySelector('.le-due-day')?.value  || 0) || undefined,
      notes:            panel.querySelector('.le-notes')?.value || ''
    };
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
    try {
      await api(`/api/liabilities/${liabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      activeLiabDetailId = null;
      loadLiabilityTab();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
    }
  }

  async function loadLiabHistory(liabId, panel) {
    const histEl = panel.querySelector(`.liab-history-list[data-liab-history="${liabId}"]`);
    if (!histEl) return;
    try {
      const res = await api(`/api/liabilities/${liabId}/history`);
      const payments = res.payments || [];
      if (payments.length === 0) {
        histEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No payments recorded yet.</div>';
        return;
      }
      const visible  = payments.slice(0, 10);
      const overflow = payments.slice(10);
      histEl.innerHTML = `
        <div>${visible.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.82rem">
            <span style="color:var(--text-secondary)">${p.date}</span>
            <span style="font-weight:600;color:#22c55e">${fmt(p.amount)}</span>
            <span style="color:var(--text-secondary);font-size:0.75rem;flex:1;
              text-align:right;padding-left:0.5rem">${p.note || ''}</span>
          </div>`).join('')}</div>
        ${overflow.length > 0 ? `
          <div id="liab-hist-more-${liabId}" style="display:none">${overflow.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;
              padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.82rem">
              <span style="color:var(--text-secondary)">${p.date}</span>
              <span style="font-weight:600;color:#22c55e">${fmt(p.amount)}</span>
              <span style="color:var(--text-secondary);font-size:0.75rem;flex:1;
                text-align:right;padding-left:0.5rem">${p.note || ''}</span>
            </div>`).join('')}</div>
          <button onclick="
            document.getElementById('liab-hist-more-${liabId}').style.display='block';
            this.style.display='none'
          " style="background:none;border:none;cursor:pointer;color:var(--color-primary);
            font-size:0.82rem;padding:0.4rem 0;font-family:inherit">
            Show all ${payments.length} payments
          </button>` : ''}`;
    } catch (err) {
      histEl.innerHTML = `<div style="color:#ef4444;font-size:0.82rem">${err.message}</div>`;
    }
  }

  /* ── Budgets ── */
  async function loadBudgetTab() {
    const budgetList = document.getElementById('budgets-list');
    if (!budgetList) return;
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    try {
      const budgetUrl = budgetActiveFilter === 'all' ? '/api/budgets?all=true' : '/api/budgets?active_only=true';
      const [budgetRes, txRes] = await Promise.all([
        api(budgetUrl),
        api(`/api/transactions?start=${startOfMonth}&limit=500`)
      ]);
      const buds = (budgetRes.records || []).map(r => ({ id: r.id, ...r.fields }));
      const txs  = (txRes.records || []).map(r => r.fields).filter(t => t.type === 'Expense');

      // G3: track spend by budget_id (new) AND by category_id (legacy fallback)
      const spendByBudget = {};
      const spendByCat    = {};
      txs.forEach(t => {
        const bid   = Array.isArray(t.budget_id)   ? t.budget_id[0]   : t.budget_id;
        const catId = Array.isArray(t.category_id) ? t.category_id[0] : t.category_id;
        if (bid)   spendByBudget[bid]   = (spendByBudget[bid]   || 0) + Number(t.amount || 0);
        else if (catId) spendByCat[catId] = (spendByCat[catId] || 0) + Number(t.amount || 0);
      });

      if (buds.length === 0) {
        budgetList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No budgets yet.</div>';
        return;
      }

      budgetsData       = buds;
      lastSpendByBudget = spendByBudget;
      lastSpendByCat    = spendByCat;

      renderBudgetListWithSpend(budgetList, spendByBudget, spendByCat);
    } catch (err) {
      budgetList.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
  }

  /* ── Budget inline edit ── */
  function openBudgetEditPanel(budgetId) {
    if (activeBudgetEditId === budgetId) {
      const panel = document.querySelector(`.budget-edit-panel[data-budget-panel="${budgetId}"]`);
      if (panel) panel.style.display = 'none';
      activeBudgetEditId = null;
      return;
    }
    if (activeBudgetEditId) {
      const prev = document.querySelector(`.budget-edit-panel[data-budget-panel="${activeBudgetEditId}"]`);
      if (prev) prev.style.display = 'none';
    }
    activeBudgetEditId = budgetId;

    const b = budgetsData.find(bud => bud.id === budgetId);
    const panel = document.querySelector(`.budget-edit-panel[data-budget-panel="${budgetId}"]`);
    if (!b || !panel) return;

    const catId = Array.isArray(b.category_id) ? b.category_id[0] : b.category_id;
    // G6: budget edit category dropdown — expense only
    const expenseCats = categories.filter(c => c.type === 'Expense');
    const catOptions  = expenseCats.map(c =>
      `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.group ? c.group + ' — ' : ''}${c.name}</option>`
    ).join('');

    panel.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;
        margin-bottom:1rem;background:rgba(59,130,246,0.03)">
        <div class="form-row">
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">Label</label>
            <input type="text" class="be-label" value="${(b.label || '').replace(/"/g, '&quot;')}"
              style="font-size:0.85rem;padding:0.35rem 0.5rem">
          </div>
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">Category (Expense)</label>
            <select class="be-category" style="font-size:0.85rem;padding:0.35rem 0.5rem">
              <option value="">— None —</option>${catOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">Amount ฿</label>
            <input type="number" class="be-amount" value="${b.amount || ''}"
              style="font-size:0.85rem;padding:0.35rem 0.5rem">
          </div>
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">Period</label>
            <select class="be-period" style="font-size:0.85rem;padding:0.35rem 0.5rem">
              <option value="Monthly"  ${b.period === 'Monthly'  ? 'selected' : ''}>Monthly</option>
              <option value="Annual"   ${b.period === 'Annual'   ? 'selected' : ''}>Annual</option>
              <option value="One-time" ${b.period === 'One-time' ? 'selected' : ''}>One-time</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">Start Date</label>
            <input type="date" class="be-start" value="${b.start_date || ''}"
              style="font-size:0.85rem;padding:0.35rem 0.5rem">
          </div>
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-secondary)">End Date</label>
            <input type="date" class="be-end" value="${b.end_date || ''}"
              style="font-size:0.85rem;padding:0.35rem 0.5rem">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
          <input type="checkbox" class="be-active" style="width:auto;margin:0"
            ${b.active !== false ? 'checked' : ''}>
          <label style="font-size:0.85rem;color:var(--text-secondary);margin:0">Active</label>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-primary be-save" style="flex:1;font-size:0.85rem;padding:0.4rem">Save</button>
          <button class="btn btn-outline be-cancel" style="flex:1;font-size:0.85rem;padding:0.4rem">Cancel</button>
          <button class="btn btn-danger be-delete" style="font-size:0.85rem;padding:0.4rem 0.75rem">Delete</button>
        </div>
        <div class="be-msg" style="display:none;font-size:0.82rem;margin-top:0.5rem"></div>
      </div>`;

    panel.style.display = 'block';
    panel.querySelector('.be-save').addEventListener('click', () => saveBudgetEdit(budgetId, panel));
    panel.querySelector('.be-cancel').addEventListener('click', () => {
      panel.style.display = 'none';
      activeBudgetEditId = null;
    });
    panel.querySelector('.be-delete').addEventListener('click', () => deleteBudget(budgetId, panel));
  }

  async function saveBudgetEdit(budgetId, panel) {
    const msgEl  = panel.querySelector('.be-msg');
    const catVal = panel.querySelector('.be-category')?.value;
    const body   = {
      label:  panel.querySelector('.be-label')?.value?.trim(),
      amount: Number(panel.querySelector('.be-amount')?.value || 0),
      period: panel.querySelector('.be-period')?.value,
      active: panel.querySelector('.be-active')?.checked
    };
    const startVal = panel.querySelector('.be-start')?.value;
    const endVal   = panel.querySelector('.be-end')?.value;
    if (startVal) body.start_date = startVal;
    if (endVal)   body.end_date   = endVal;
    if (catVal)   body.category_id = [catVal];

    try {
      await api(`/api/budgets/${budgetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      activeBudgetEditId = null;
      await loadBudgets();
      loadBudgetTab();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
    }
  }

  async function deleteBudget(budgetId, panel) {
    const label = panel.querySelector('.be-label')?.value?.trim() || 'this budget';
    const typed = window.prompt(`Type the budget name to confirm deletion:\n"${label}"`);
    if (typed === null) return;
    if (typed.trim() !== label.trim()) { alert('Name did not match — deletion cancelled.'); return; }
    const msgEl = panel.querySelector('.be-msg');
    try {
      await api(`/api/budgets/${budgetId}`, { method: 'DELETE' });
      activeBudgetEditId = null;
      await loadBudgets();
      loadBudgetTab();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
    }
  }

  /* ── Budget view/group controls ── */
  function initBudgetControls() {
    document.querySelectorAll('[data-budget-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        budgetView = btn.dataset.budgetView;
        document.querySelectorAll('[data-budget-view]').forEach(b =>
          b.classList.toggle('active', b.dataset.budgetView === budgetView));
        renderBudgetList();
      });
    });

    document.querySelectorAll('[data-budget-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        budgetGroup = btn.dataset.budgetGroup;
        document.querySelectorAll('[data-budget-group]').forEach(b =>
          b.classList.toggle('active', b.dataset.budgetGroup === budgetGroup));
        const actionsEl = document.getElementById('budget-group-actions');
        if (actionsEl) actionsEl.style.display = budgetGroup === 'byCategory' ? 'flex' : 'none';
        renderBudgetList();
      });
    });

    document.getElementById('budget-expand-all')?.addEventListener('click', () => {
      budgetGroupState = {};
      renderBudgetList();
    });
    document.getElementById('budget-collapse-all')?.addEventListener('click', () => {
      Object.keys(getBudgetGroups()).forEach(g => { budgetGroupState[g] = true; });
      renderBudgetList();
    });

    document.querySelectorAll('[data-budget-active]').forEach(btn => {
      btn.addEventListener('click', () => {
        budgetActiveFilter = btn.dataset.budgetActive;
        document.querySelectorAll('[data-budget-active]').forEach(b =>
          b.classList.toggle('active', b.dataset.budgetActive === budgetActiveFilter));
        loadBudgetTab();
      });
    });
  }

  function getBudgetGroupName(b) {
    const grp = b.category_group || '';
    if (grp) return grp;
    // Legacy fallback using category name heuristics
    const catId = Array.isArray(b.category_id) ? b.category_id[0] : b.category_id;
    const cat   = categories.find(c => c.id === catId);
    if (!cat) return 'Other';
    const n = (cat.name || '').toLowerCase();
    const g = (cat.group || '').toLowerCase();
    if (n.includes('car') || g.includes('car')) return 'Car';
    if (n.includes('family') || g.includes('family')) return 'Family';
    if (g.includes('basic it') || g.includes('basic_it')) return 'Basic IT';
    if (g.includes('bus it') || g.includes('bus_it')) return 'Bus IT';
    if (n.includes('investment') || g.includes('investment')) return 'Investment';
    if (n.includes('business') || g.includes('business')) return 'Business';
    if (g.includes('personal')) return 'Personal';
    return 'Other';
  }

  function getBudgetGroups() {
    const groups = {};
    budgetsData.forEach(b => {
      const grp = getBudgetGroupName(b);
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(b);
    });
    return groups;
  }

  function renderBudgetList() {
    const budgetList = document.getElementById('budgets-list');
    if (!budgetList || budgetsData.length === 0) return;
    renderBudgetListWithSpend(budgetList, lastSpendByBudget, lastSpendByCat);
  }

  function renderBudgetListWithSpend(budgetList, spendByBudget, spendByCat) {
    if (budgetGroup === 'byCategory') {
      renderBudgetGrouped(budgetList, spendByBudget, spendByCat);
    } else if (budgetView === 'card') {
      renderBudgetCards(budgetList, budgetsData, spendByBudget, spendByCat);
    } else {
      renderBudgetRows(budgetList, budgetsData, spendByBudget, spendByCat);
    }
  }

  function getBudgetSpent(b, spendByBudget, spendByCat) {
    const catId = Array.isArray(b.category_id) ? b.category_id[0] : b.category_id;
    return spendByBudget[b.id] || spendByCat[catId] || 0;
  }

  function budgetRowHTML(b, spent, limit, p, clr) {
    const label = b.label || b.category_name || 'Budget';
    const sub   = b.category_group ? b.category_group + ' — ' + (b.category_name || '') : (b.category_name || '');
    return `
      <div class="budget-row-wrap">
        <div style="margin-bottom:0.5rem">
          <div style="display:flex;justify-content:space-between;font-size:0.88rem;
            font-weight:600;align-items:center">
            <span>${label}</span>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <span>${fmt(spent)} / ${fmt(limit)}</span>
              <button class="budget-edit-btn" data-id="${b.id}"
                style="background:none;border:1px solid var(--border);border-radius:4px;
                cursor:pointer;color:var(--text-secondary);font-size:0.78rem;
                padding:0.1rem 0.4rem;line-height:1.6">✏️</button>
            </div>
          </div>
          <div style="font-size:0.73rem;color:var(--text-secondary);margin-bottom:0.3rem">
            ${sub} · ${b.period || 'Monthly'}
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${p}%;background:${clr};border-radius:4px;
              transition:width 0.4s"></div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem">${p}% used</div>
        </div>
        <div class="budget-edit-panel" data-budget-panel="${b.id}" style="display:none"></div>
      </div>`;
  }

  function budgetCardHTML(b, spent, limit, p, clr) {
    const label = b.label || b.category_name || 'Budget';
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);
        padding:0.9rem;background:var(--bg-card);position:relative">
        <button class="budget-edit-btn" data-id="${b.id}"
          style="position:absolute;top:0.6rem;right:0.6rem;background:none;
          border:1px solid var(--border);border-radius:4px;cursor:pointer;
          color:var(--text-secondary);font-size:0.75rem;padding:0.1rem 0.35rem;
          line-height:1.6">✏️</button>
        <div style="font-weight:700;font-size:0.9rem;padding-right:2rem;margin-bottom:0.4rem">
          ${label}
        </div>
        <div style="display:flex;gap:0.4rem;margin-bottom:0.6rem;flex-wrap:wrap">
          ${b.category_name ? `<span class="badge badge-primary" style="font-size:0.7rem">${b.category_name}</span>` : ''}
          <span class="badge badge-gray" style="font-size:0.7rem">${b.period || 'Monthly'}</span>
        </div>
        <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;margin-bottom:0.4rem">
          <div style="height:100%;width:${p}%;background:${clr};border-radius:5px;transition:width 0.4s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:0.78rem;color:var(--text-secondary)">${fmt(spent)} / ${fmt(limit)}</span>
          <span style="font-size:1.1rem;font-weight:700;color:${clr}">${p}%</span>
        </div>
        <div class="budget-edit-panel" data-budget-panel="${b.id}" style="display:none;
          margin-top:0.5rem"></div>
      </div>`;
  }

  function renderBudgetRows(container, buds, spendByBudget, spendByCat) {
    container.innerHTML = buds.map(b => {
      const spent = getBudgetSpent(b, spendByBudget, spendByCat);
      const limit = Number(b.amount || 0);
      const p     = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const clr   = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
      return budgetRowHTML(b, spent, limit, p, clr);
    }).join('');
    wireBudgetEditBtns(container);
  }

  function renderBudgetCards(container, buds, spendByBudget, spendByCat) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem">
        ${buds.map(b => {
          const spent = getBudgetSpent(b, spendByBudget, spendByCat);
          const limit = Number(b.amount || 0);
          const p     = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const clr   = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
          return budgetCardHTML(b, spent, limit, p, clr);
        }).join('')}
      </div>`;
    wireBudgetEditBtns(container);
  }

  function renderBudgetGrouped(container, spendByBudget, spendByCat) {
    const groupOrder = ['Car','Family','Basic IT','Bus IT','Personal','Business','Investment','Other'];
    const groups = getBudgetGroups();

    let html = '';
    groupOrder.forEach(grpName => {
      const grpBuds = groups[grpName];
      if (!grpBuds || grpBuds.length === 0) return;

      const totalBudget = grpBuds.reduce((s, b) => s + Number(b.amount || 0), 0);
      const totalSpent  = grpBuds.reduce((s, b) => s + getBudgetSpent(b, spendByBudget, spendByCat), 0);
      const grpPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
      const grpClr = grpPct >= 100 ? '#ef4444' : grpPct >= 80 ? '#f59e0b' : '#22c55e';
      const collapsed = !!budgetGroupState[grpName];

      html += `
        <div style="margin-bottom:0.75rem">
          <div class="budget-group-header" data-grp="${grpName}"
            style="display:flex;align-items:center;justify-content:space-between;
            padding:0.6rem 0.75rem;background:rgba(59,130,246,0.06);border-radius:var(--radius);
            cursor:pointer;user-select:none;border:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0">
              <strong style="font-size:0.88rem">${grpName}</strong>
              <span class="badge badge-gray" style="font-size:0.72rem">${grpBuds.length}</span>
              <span style="font-size:0.78rem;color:var(--text-secondary)">
                ${fmt(totalSpent)} / ${fmt(totalBudget)}
              </span>
              <div style="flex:1;max-width:80px;height:6px;background:var(--border);
                border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${grpPct}%;background:${grpClr};border-radius:3px"></div>
              </div>
              <span style="font-size:0.78rem;color:${grpClr};font-weight:600">${grpPct}%</span>
            </div>
            <span data-grp-chevron="${grpName}"
              style="transition:transform 0.3s;display:inline-block;color:var(--text-secondary);
              font-size:0.75rem;margin-left:0.5rem;
              transform:${collapsed ? 'rotate(-90deg)' : ''}">▼</span>
          </div>
          <div data-grp-body="${grpName}"
            style="overflow:hidden;${collapsed ? 'display:none' : ''}">
            <div style="padding-top:0.5rem">
              ${budgetView === 'card'
                ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem">
                    ${grpBuds.map(b => {
                      const spent = getBudgetSpent(b, spendByBudget, spendByCat);
                      const limit = Number(b.amount || 0);
                      const p     = limit > 0 ? Math.min(100, Math.round((spent/limit)*100)) : 0;
                      const clr   = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
                      return budgetCardHTML(b, spent, limit, p, clr);
                    }).join('')}
                  </div>`
                : grpBuds.map(b => {
                    const spent = getBudgetSpent(b, spendByBudget, spendByCat);
                    const limit = Number(b.amount || 0);
                    const p     = limit > 0 ? Math.min(100, Math.round((spent/limit)*100)) : 0;
                    const clr   = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
                    return budgetRowHTML(b, spent, limit, p, clr);
                  }).join('')}
            </div>
          </div>
        </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.budget-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const grp  = header.dataset.grp;
        const body = container.querySelector(`[data-grp-body="${grp}"]`);
        const chev = container.querySelector(`[data-grp-chevron="${grp}"]`);
        const wasCollapsed = !!budgetGroupState[grp];
        budgetGroupState[grp] = !wasCollapsed;
        if (body) body.style.display = wasCollapsed ? '' : 'none';
        if (chev) chev.style.transform = wasCollapsed ? '' : 'rotate(-90deg)';
      });
    });

    wireBudgetEditBtns(container);
  }

  function wireBudgetEditBtns(container) {
    container.querySelectorAll('.budget-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openBudgetEditPanel(btn.dataset.id);
      });
    });
  }

  /* ── Category create form ── */
  function initCategoryForm() {
    const toggle  = document.getElementById('cat-form-toggle');
    const body    = document.getElementById('cat-form-body');
    const chevron = document.getElementById('cat-form-chevron');
    if (toggle && body) {
      toggle.addEventListener('click', () => {
        const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px' && body.style.maxHeight !== '0';
        body.style.maxHeight = isOpen ? '0' : '600px';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    }

    document.getElementById('cat-type')?.addEventListener('change', function () {
      const etGroup = document.getElementById('cat-expense-type-group');
      if (etGroup) etGroup.style.display = this.value === 'Expense' ? 'block' : 'none';
    });

    ensureMsgEl('cat-msg', 'save-category');

    document.getElementById('save-category')?.addEventListener('click', async () => {
      const name        = document.getElementById('cat-name')?.value?.trim();
      const type        = document.getElementById('cat-type')?.value || 'Expense';
      const group       = document.getElementById('cat-group')?.value?.trim() || '';
      const expenseType = document.getElementById('cat-expense-type')?.value || '';
      if (!name) return alert('Item name is required');
      if (!group) return alert('Category group is required');
      const payload = { name, type, group, active: true };
      if (expenseType) payload.expense_type = expenseType;
      try {
        await api('/api/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showMsg('cat-msg', 'Category added!');
        document.getElementById('cat-name').value  = '';
        document.getElementById('cat-group').value = '';
        const etSel = document.getElementById('cat-expense-type');
        if (etSel) etSel.value = '';
        await loadCategories();
      } catch (err) {
        showMsg('cat-msg', err.message, false);
      }
    });
  }

  /* ── Entity autocomplete ── */
  async function loadEntitySuggestions() {
    try {
      const res = await api('/api/transactions?limit=500');
      const records = (res.records || []).map(r => r.fields || r);
      const freq = {};
      records.forEach(r => {
        const e = (r.entity || '').trim();
        if (e) freq[e] = (freq[e] || 0) + 1;
      });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([e]) => e);
      const dl = document.getElementById('entity-suggestions');
      if (dl) {
        dl.innerHTML = sorted.map(e => `<option value="${e.replace(/"/g, '&quot;')}">`).join('');
      }
    } catch { /* non-fatal */ }
  }

  /* ── G5+G6: Budget create form ── */
  function initBudgetForm() {
    ensureMsgEl('budget-msg', 'save-budget');

    document.getElementById('budget-period')?.addEventListener('change', function () {
      const note = document.getElementById('budget-onetime-note');
      if (note) note.style.display = this.value === 'One-time' ? 'block' : 'none';
    });

    document.getElementById('save-budget')?.addEventListener('click', async () => {
      const label      = document.getElementById('budget-label')?.value?.trim();
      const categoryId = document.getElementById('budget-category')?.value;
      const amount     = document.getElementById('budget-amount')?.value;
      const period     = document.getElementById('budget-period')?.value || 'Monthly';
      const startDate  = document.getElementById('budget-start')?.value;
      const endDate    = document.getElementById('budget-end')?.value;
      if (!label || !amount) return alert('Label and amount are required');
      const body = { label, amount: Number(amount), period, active: true };
      if (categoryId) body.category_id = [categoryId];
      if (startDate)  body.start_date  = startDate;
      if (endDate)    body.end_date    = endDate;
      try {
        await api('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showMsg('budget-msg', 'Budget item added!');
        // G5: only clear on success
        ['budget-label','budget-amount','budget-start','budget-end'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        await loadBudgets();
        loadBudgetTab();
      } catch (err) {
        // G5: show error, do NOT clear form — let user correct
        showMsg('budget-msg', err.message, false);
      }
    });
  }

  /* ── Helpers ── */
  function ensureMsgEl(msgId, anchorId) {
    if (document.getElementById(msgId)) return;
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const el = document.createElement('div');
    el.id = msgId;
    el.style.cssText = 'font-size:0.82rem;margin-top:0.5rem;display:none';
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    try {
      await Promise.all([loadCategories(), loadBudgets()]);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
    initTransactionForm();
    initUtilityForm();
    initLiabilityForm();
    initBudgetControls();
    initCategoryForm();
    initBudgetForm();
    loadTransactions().catch(console.error);
    loadEntitySuggestions().catch(console.error);
  });
})();
