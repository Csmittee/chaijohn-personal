/* entry.injector.js — Chaijohn Entry Page */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });

  let categories = [];
  let liabilities = [];
  let txPeriod = 'daily';
  let txType = 'Expense';
  let elecChart, waterChart;

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

  function addMsg(el, text, ok = true) {
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
        if (btn.dataset.tab === 'budgets') loadBudgetTab();
        if (btn.dataset.tab === 'utilities') loadUtilityHistory();
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

  /* ── Categories ── */
  async function loadCategories() {
    const res = await api('/api/categories?active=false');
    categories = (res.records || []).map(r => ({ id: r.id, ...r.fields }));
    populateCategoryDropdowns();
  }

  function populateCategoryDropdowns() {
    const earns = categories.filter(c => c.type === 'Earn');
    const expenses = categories.filter(c => c.type === 'Expense');
    const loans = categories.filter(c => c.type === 'Loan' || c.type === 'Investment');

    // Transaction category dropdown — filtered by current type
    renderCatSelect('tx-category', txType === 'Income' ? earns : expenses);
    // Budget category dropdown
    renderCatSelect('budget-category', [...earns, ...expenses, ...loans]);
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

  /* ── Transactions ── */
  function initTransactionForm() {
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('tx-date');
    if (dateEl) dateEl.value = today;

    const btnIncome = document.getElementById('type-income');
    const btnExpense = document.getElementById('type-expense');

    function setType(type) {
      txType = type;
      if (btnIncome) btnIncome.className = 'btn btn-lg ' + (type === 'Income' ? 'btn-success' : 'btn-outline');
      if (btnExpense) btnExpense.className = 'btn btn-lg ' + (type === 'Expense' ? 'btn-danger' : 'btn-outline');
      renderCatSelect('tx-category', type === 'Income'
        ? categories.filter(c => c.type === 'Earn')
        : categories.filter(c => c.type === 'Expense'));
    }

    btnIncome?.addEventListener('click', () => setType('Income'));
    btnExpense?.addEventListener('click', () => setType('Expense'));
    setType('Expense');

    // Ensure msg element exists
    ensureMsgEl('tx-msg', 'save-tx');

    document.getElementById('save-tx')?.addEventListener('click', async () => {
      const amount = document.getElementById('tx-amount')?.value;
      const categoryId = document.getElementById('tx-category')?.value;
      const description = document.getElementById('tx-description')?.value || '';
      const entity = document.getElementById('tx-entity')?.value || '';
      const date = document.getElementById('tx-date')?.value || today;
      const note = document.getElementById('tx-note')?.value || '';

      if (!amount || Number(amount) <= 0) return alert('Amount is required');

      const body = {
        date, amount: Number(amount), type: txType,
        description, entity, note, source: 'Manual'
      };
      if (categoryId) body.category_id = [categoryId];

      try {
        await api('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('tx-msg', 'Saved!');
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-description').value = '';
        document.getElementById('tx-note').value = '';
        loadTransactions();
      } catch (err) {
        showMsg('tx-msg', err.message, false);
      }
    });
  }

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

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    try {
      const res = await api(`/api/transactions?start=${start}&limit=200`);
      const records = (res.records || []).map(r => r.fields);
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
              const catId = Array.isArray(t.category_id) ? t.category_id[0] : t.category_id;
              const cat = catMap[catId];
              const isIncome = t.type === 'Income';
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:0.5rem 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-size:0.88rem">${t.description || t.entity || 'Transaction'}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary)">
                      ${cat ? (cat.group ? cat.group + ' — ' : '') + cat.name : ''}
                      ${t.note ? ' · ' + t.note : ''}
                    </div>
                  </div>
                  <div style="font-weight:700;color:${isIncome ? '#22c55e' : '#ef4444'}">
                    ${isIncome ? '+' : '-'}${fmt(t.amount)}
                  </div>
                </div>`;
            }).join('')}
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
  }

  /* ── Utilities ── */
  function initUtilityForm() {
    const monthEl = document.getElementById('util-month');
    if (monthEl) {
      const now = new Date();
      monthEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const elecUnits = document.getElementById('util-elec-units');
    const elecCharge = document.getElementById('util-elec-charge');
    const waterUnits = document.getElementById('util-water-units');
    const waterCharge = document.getElementById('util-water-charge');

    function updateRateDisplay(units, charge, displayId) {
      const u = Number(units?.value || 0);
      const c = Number(charge?.value || 0);
      const el = document.getElementById(displayId);
      if (el) el.textContent = u > 0 && c > 0 ? `Rate: ${fmt(c / u)}/unit` : '';
    }

    elecUnits?.addEventListener('input', () => updateRateDisplay(elecUnits, elecCharge, 'elec-rate-display'));
    elecCharge?.addEventListener('input', () => updateRateDisplay(elecUnits, elecCharge, 'elec-rate-display'));
    waterUnits?.addEventListener('input', () => updateRateDisplay(waterUnits, waterCharge, 'water-rate-display'));
    waterCharge?.addEventListener('input', () => updateRateDisplay(waterUnits, waterCharge, 'water-rate-display'));

    ensureMsgEl('util-msg', 'save-util');

    document.getElementById('save-util')?.addEventListener('click', async () => {
      const monthVal = document.getElementById('util-month')?.value;
      if (!monthVal) return alert('Month is required');
      const month = monthVal + '-01';
      const body = {
        month,
        electricity_units: Number(elecUnits?.value || 0) || undefined,
        electricity_charge: Number(elecCharge?.value || 0) || undefined,
        water_units: Number(waterUnits?.value || 0) || undefined,
        water_charge: Number(waterCharge?.value || 0) || undefined,
        notes: document.getElementById('util-notes')?.value || ''
      };
      Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

      try {
        await api('/api/utilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('util-msg', 'Saved!');
        loadUtilityHistory();
      } catch (err) {
        showMsg('util-msg', err.message, false);
      }
    });
  }

  async function loadUtilityHistory() {
    const tableEl = document.getElementById('util-history-table');
    if (!tableEl) return;

    try {
      const now = new Date();
      const res = await api(`/api/utilities?year=${now.getFullYear()}`);
      const records = (res.records || []).map(r => r.fields).slice(0, 12);

      if (records.length === 0) {
        tableEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No utility records yet.</div>';
        return;
      }

      tableEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:0.25rem">Month</th>
            <th style="text-align:right">Elec Units</th>
            <th style="text-align:right">Elec ฿</th>
            <th style="text-align:right">Water Units</th>
            <th style="text-align:right">Water ฿</th>
          </tr></thead>
          <tbody>${records.map(r => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:0.25rem">${(r.month || '').slice(0, 7)}</td>
              <td style="text-align:right">${r.electricity_units || '—'}</td>
              <td style="text-align:right">${r.electricity_charge ? fmt(r.electricity_charge) : '—'}</td>
              <td style="text-align:right">${r.water_units || '—'}</td>
              <td style="text-align:right">${r.water_charge ? fmt(r.water_charge) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;

      // Render mini charts
      const reversed = [...records].reverse();
      const labels = reversed.map(r => (r.month || '').slice(0, 7));
      renderMiniChart('elec-chart', labels, reversed.map(r => r.electricity_charge || 0), 'Electricity ฿', '#f59e0b');
      renderMiniChart('water-chart', labels, reversed.map(r => r.water_charge || 0), 'Water ฿', '#3b82f6');
    } catch (err) {
      tableEl.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
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

    const balance = Number(liab.current_balance || 0);
    const rate = Number(liab.interest_rate || 0);
    const monthlyRate = rate / 100 / 12;
    const interest = Math.round(balance * monthlyRate * 100) / 100;
    const suggested = Number(liab.monthly_payment || 0);
    const principal = Math.max(0, suggested - interest);

    preview.style.display = 'block';
    preview.innerHTML = `Balance: ${fmt(balance)} · Est. interest this month: ${fmt(interest)} · Principal: ${fmt(principal)}`;

    const amtEl = document.getElementById('payment-amount');
    if (amtEl && !amtEl.value && suggested > 0) amtEl.value = suggested;
  }

  function initLiabilityForm() {
    const today = new Date().toISOString().split('T')[0];
    const pdateEl = document.getElementById('payment-date');
    if (pdateEl) pdateEl.value = today;

    ensureMsgEl('payment-msg', 'save-payment');
    ensureMsgEl('liab-msg', 'save-liability');

    document.getElementById('save-payment')?.addEventListener('click', async () => {
      const liabId = document.getElementById('payment-liability-select')?.value;
      const amount = document.getElementById('payment-amount')?.value;
      const date = document.getElementById('payment-date')?.value || today;
      const note = document.getElementById('payment-note')?.value || '';

      if (!liabId) return alert('Select a liability');
      if (!amount || Number(amount) <= 0) return alert('Enter payment amount');

      try {
        const res = await api(`/api/liabilities/${liabId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_amount: Number(amount), date, note })
        });
        const msg = `Payment logged. Interest: ${fmt(res.interest)}, Principal: ${fmt(res.principal)}, New balance: ${fmt(res.new_balance)}`;
        showMsg('payment-msg', msg);
        document.getElementById('payment-amount').value = '';
        document.getElementById('payment-note').value = '';
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
        creditor_type: document.getElementById('liab-creditor-type')?.value || 'Other',
        loan_size: Number(document.getElementById('liab-loan-size')?.value || 0) || undefined,
        current_balance: Number(document.getElementById('liab-balance')?.value || 0) || undefined,
        interest_rate: Number(document.getElementById('liab-rate')?.value || 0) || undefined,
        monthly_payment: Number(document.getElementById('liab-monthly')?.value || 0) || undefined,
        start_date: document.getElementById('liab-start')?.value || undefined,
        notes: document.getElementById('liab-notes')?.value || ''
      };
      Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

      try {
        await api('/api/liabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('liab-msg', 'Liability added!');
        ['liab-name', 'liab-loan-size', 'liab-balance', 'liab-rate', 'liab-monthly', 'liab-start', 'liab-notes']
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
      const bal = Number(l.current_balance || 0);
      const loan = Number(l.loan_size || bal);
      const paidPct = loan > 0 ? Math.round((1 - bal / loan) * 100) : 0;
      return `
        <div style="border-bottom:1px solid var(--border);padding:0.75rem 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <strong style="font-size:0.95rem">${l.name}</strong>
            <span style="font-size:0.85rem;color:#ef4444">${fmt(bal)}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.1rem">
            ${l.creditor_type || ''} · ${l.interest_rate || 0}% p.a. · Monthly: ${fmt(l.monthly_payment)}
          </div>
          <div style="height:4px;background:var(--border);border-radius:2px;margin-top:0.4rem;overflow:hidden">
            <div style="height:100%;width:${paidPct}%;background:#22c55e;border-radius:2px"></div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem">${paidPct}% paid off</div>
        </div>`;
    }).join('');
  }

  /* ── Budgets ── */
  async function loadBudgetTab() {
    const budgetList = document.getElementById('budgets-list');
    if (!budgetList) return;

    const now = new Date();
    const nowYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = nowYM + '-01';

    try {
      const [budgetRes, txRes] = await Promise.all([
        api('/api/budgets'),
        api(`/api/transactions?start=${startOfMonth}&limit=500`)
      ]);

      const budgets = (budgetRes.records || []).map(r => ({ id: r.id, ...r.fields }));
      const txs = (txRes.records || []).map(r => r.fields).filter(t => t.type === 'Expense');

      const spendByCat = {};
      txs.forEach(t => {
        const catId = Array.isArray(t.category_id) ? t.category_id[0] : t.category_id;
        if (catId) spendByCat[catId] = (spendByCat[catId] || 0) + Number(t.amount || 0);
      });

      const catMap = {};
      categories.forEach(c => { catMap[c.id] = c; });

      if (budgets.length === 0) {
        budgetList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No budgets yet.</div>';
        return;
      }

      budgetList.innerHTML = budgets.map(b => {
        const catId = Array.isArray(b.category_id) ? b.category_id[0] : b.category_id;
        const cat = catMap[catId];
        const spent = spendByCat[catId] || 0;
        const limit = Number(b.amount || 0);
        const p = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
        const cls = p >= 100 ? '#ef4444' : p >= 85 ? '#f59e0b' : '#22c55e';
        return `
          <div style="margin-bottom:1rem">
            <div style="display:flex;justify-content:space-between;font-size:0.88rem;font-weight:600">
              <span>${b.label || (cat ? cat.name : 'Budget')}</span>
              <span>${fmt(spent)} / ${fmt(limit)}</span>
            </div>
            <div style="font-size:0.73rem;color:var(--text-secondary);margin-bottom:0.3rem">
              ${cat ? (cat.group ? cat.group + ' — ' : '') + cat.name : ''} · ${b.period || 'Monthly'}
            </div>
            <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${p}%;background:${cls};border-radius:4px;transition:width 0.4s"></div>
            </div>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem">${p}% used</div>
          </div>`;
      }).join('');
    } catch (err) {
      budgetList.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
    }
  }

  function initBudgetForm() {
    ensureMsgEl('budget-msg', 'save-budget');
    document.getElementById('save-budget')?.addEventListener('click', async () => {
      const label = document.getElementById('budget-label')?.value?.trim();
      const categoryId = document.getElementById('budget-category')?.value;
      const amount = document.getElementById('budget-amount')?.value;
      const period = document.getElementById('budget-period')?.value || 'Monthly';
      const startDate = document.getElementById('budget-start')?.value;
      const endDate = document.getElementById('budget-end')?.value;

      if (!label || !amount) return alert('Label and amount are required');

      const body = { label, amount: Number(amount), period, active: true };
      if (categoryId) body.category_id = [categoryId];
      if (startDate) body.start_date = startDate;
      if (endDate) body.end_date = endDate;

      try {
        await api('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('budget-msg', 'Budget created!');
        ['budget-label', 'budget-amount', 'budget-start', 'budget-end'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        loadBudgetTab();
      } catch (err) {
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
      await loadCategories();
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
    initTransactionForm();
    initUtilityForm();
    initLiabilityForm();
    initBudgetForm();
    loadTransactions().catch(console.error);
  });
})();
