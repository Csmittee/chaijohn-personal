/* dashboard.injector.js — Chaijohn Dashboard */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  let activeRange = '1m';
  let txData = [];
  let budgets = [];
  let liabilities = [];
  let categories = [];
  let t1Chart, t2Chart, t3Chart, playroomChart;
  let t2DrillGroup = null;
  let playroomBudgetId = null;

  /* ── Date helpers ── */
  function rangeStart(range) {
    const now = new Date();
    if (range === '1m') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    if (range === '3m') return new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
    if (range === '6m') return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    return new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
  }
  function monthLabel(ym) {
    return new Date(ym + '-02').toLocaleDateString('en', { month: 'short', year: '2-digit' });
  }
  function toYM(dateStr) { return dateStr ? dateStr.slice(0, 7) : ''; }
  function currentYM() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthsBetween(startYM, endYM) {
    const months = [];
    let [sy, sm] = startYM.split('-').map(Number);
    const [ey, em] = endYM.split('-').map(Number);
    while (sy < ey || (sy === ey && sm <= em)) {
      months.push(`${sy}-${String(sm).padStart(2, '0')}`);
      sm++; if (sm > 12) { sm = 1; sy++; }
    }
    return months;
  }
  function daysInMonth() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const days = [];
    for (let d = 1; d <= now.getDate(); d++) {
      days.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }
  function daysLeftInMonth() {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return last - now.getDate();
  }

  /* ── API ── */
  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  }

  /* ── Load all data ── */
  async function loadAll() {
    const start = rangeStart(activeRange);
    const nowYM = currentYM();
    const [txRes, budgetRes, liabRes, catRes] = await Promise.all([
      api(`/api/transactions?start=${start}&limit=500`),
      api('/api/budgets'),
      api('/api/liabilities'),
      api('/api/categories?active=false')
    ]);
    txData      = (txRes.records     || []).map(r => ({ _id: r.id, ...r.fields }));
    budgets     = (budgetRes.records  || []).map(r => ({ id: r.id, ...r.fields }));
    liabilities = (liabRes.records    || []).map(r => ({ id: r.id, ...r.fields }));
    categories  = (catRes.records     || []).map(r => ({ id: r.id, ...r.fields }));

    renderAlerts(nowYM);
    renderT1(start);
    renderT2();
    renderT3();
    renderMeters(nowYM);
    buildPlayroomCategoryOptions();
  }

  /* ── Helpers ── */
  function linkedId(field) {
    if (!field) return null;
    return Array.isArray(field) ? (field[0] || null) : field;
  }
  function groupSum(arr, keyFn) {
    const map = {};
    arr.forEach(item => {
      const k = keyFn(item);
      if (k) map[k] = (map[k] || 0) + Number(item.amount || 0);
    });
    return map;
  }

  /* ── Fix 1: Alert chips ── */
  function renderAlerts(nowYM) {
    const strip = document.getElementById('alert-strip');
    if (!strip) return;
    const chips = [];

    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat  = groupSum(nowExpenses, t => linkedId(t.category_id));

    budgets.forEach(b => {
      if (!b.active) return;
      const catId = linkedId(b.category_id);
      const spent = spendByCat[catId] || 0;
      const p = pct(spent, b.amount);
      const label = b.label || 'Budget';
      if (p >= 100) chips.push({ cls: 'danger', text: `⚠ ${label} over budget (${p}%)` });
      else if (p >= 85) chips.push({ cls: 'warn',  text: `⚠ ${label} at ${p}%` });
    });

    liabilities.forEach(l => {
      if (!l.active) return;
      const bal = Number(l.current_balance || 0);
      if (bal > 0) chips.push({ cls: 'info', text: `💳 ${l.name}: ${fmt(bal)} balance` });
    });

    const nowAll = txData.filter(t => toYM(t.date) === nowYM);
    const mIncome  = nowAll.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const mExpense = nowAll.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    if (mExpense > mIncome && mIncome > 0)
      chips.push({ cls: 'danger', text: `↓ Negative cash flow (${fmt(mIncome - mExpense)})` });

    strip.innerHTML = chips.map(c => `<span class="alert-chip ${c.cls}">${c.text}</span>`).join('');
  }

  /* ── Fix 2: T1 Cash Flow — daily + balance line ── */
  function renderT1(startDate) {
    const canvas = document.getElementById('t1-chart');
    if (!canvas) return;
    if (t1Chart) t1Chart.destroy();

    if (activeRange === '1m') {
      renderT1Daily(canvas);
    } else {
      renderT1Monthly(canvas, startDate);
    }
  }

  function renderT1Daily(canvas) {
    const subtitle = document.getElementById('t1-subtitle');
    if (subtitle) subtitle.textContent = 'Daily income / expense + running balance';

    const days = daysInMonth();
    const incByDay = {}, expByDay = {};
    txData.forEach(t => {
      if (!days.includes(t.date)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income')  incByDay[t.date]  = (incByDay[t.date]  || 0) + amt;
      else if (t.type === 'Expense') expByDay[t.date] = (expByDay[t.date] || 0) + amt;
    });

    let running = 0;
    const balData = days.map(d => {
      running += (incByDay[d] || 0) - (expByDay[d] || 0);
      return running;
    });

    t1Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: days.map(d => d.slice(8)),
        datasets: [
          { label: 'Income',  data: days.map(d => incByDay[d] || 0),
            backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 2 },
          { label: 'Expense', data: days.map(d => expByDay[d] || 0),
            backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 2 },
          { label: 'Balance', data: balData, type: 'line',
            borderColor: '#3b82f6', borderWidth: 2, pointRadius: 1,
            tension: 0.3, yAxisID: 'y2',
            fill: { target: { value: 0 }, above: 'rgba(59,130,246,0.08)', below: 'rgba(239,68,68,0.18)' } }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
        scales: {
          x:  { ticks: { font: { size: 9 } } },
          y:  { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
          y2: { position: 'right', grid: { drawOnChartArea: false },
                ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      }
    });
  }

  function renderT1Monthly(canvas, startDate) {
    const subtitle = document.getElementById('t1-subtitle');
    if (subtitle) subtitle.textContent = 'Monthly income / expense + cumulative balance';

    const nowYM  = currentYM();
    const startYM = startDate.slice(0, 7);
    const months = monthsBetween(startYM, nowYM);

    const incByM = {}, expByM = {};
    txData.forEach(t => {
      const ym = toYM(t.date);
      if (!months.includes(ym)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income')  incByM[ym] = (incByM[ym] || 0) + amt;
      else if (t.type === 'Expense') expByM[ym] = (expByM[ym] || 0) + amt;
    });

    let running = 0;
    const balData = months.map(m => {
      running += (incByM[m] || 0) - (expByM[m] || 0);
      return running;
    });

    t1Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Income',  data: months.map(m => incByM[m] || 0),
            backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3 },
          { label: 'Expense', data: months.map(m => expByM[m] || 0),
            backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 },
          { label: 'Balance', data: balData, type: 'line',
            borderColor: '#3b82f6', borderWidth: 2, pointRadius: 3,
            tension: 0.3, yAxisID: 'y2',
            fill: { target: { value: 0 }, above: 'rgba(59,130,246,0.08)', below: 'rgba(239,68,68,0.18)' } }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
        scales: {
          x:  { ticks: { font: { size: 9 } } },
          y:  { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
          y2: { position: 'right', grid: { drawOnChartArea: false },
                ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      }
    });
  }

  /* ── Fix 3: T2 Group-level Pareto with drill-down ── */
  function renderT2() {
    const canvas = document.getElementById('t2-chart');
    if (!canvas) return;
    if (t2Chart) t2Chart.destroy();

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const expenses = txData.filter(t => t.type === 'Expense');

    const backBtn  = document.getElementById('t2-back-btn');
    const subtitle = document.getElementById('t2-subtitle');

    if (t2DrillGroup) {
      // Drill: categories within a group
      if (backBtn)  { backBtn.classList.remove('hidden'); }
      if (subtitle) subtitle.textContent = t2DrillGroup;

      const sumByCat = {};
      expenses.forEach(t => {
        const catId = linkedId(t.category_id);
        const cat   = catMap[catId];
        if (!cat || cat.group !== t2DrillGroup) return;
        sumByCat[catId] = (sumByCat[catId] || 0) + Number(t.amount || 0);
      });
      const sorted = Object.entries(sumByCat).sort((a, b) => b[1] - a[1]);

      t2Chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: sorted.map(([id]) => catMap[id]?.name || id),
          datasets: [{ data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map((_, i) => `hsl(${200 + i * 25},60%,55%)`),
            borderRadius: 3 }]
        },
        options: t2ChartOptions()
      });
    } else {
      // Group-level
      if (backBtn)  { backBtn.classList.add('hidden'); }
      if (subtitle) subtitle.textContent = 'By group — click to drill in';

      const sumByGroup = {};
      expenses.forEach(t => {
        const catId = linkedId(t.category_id);
        const grp   = catMap[catId]?.group || 'Other';
        sumByGroup[grp] = (sumByGroup[grp] || 0) + Number(t.amount || 0);
      });
      const sorted = Object.entries(sumByGroup).sort((a, b) => b[1] - a[1]);

      t2Chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: sorted.map(([g]) => g),
          datasets: [{ data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map((_, i) => `hsl(${i * 30},65%,55%)`),
            borderRadius: 3 }]
        },
        options: {
          ...t2ChartOptions(),
          onClick: (evt, elements) => {
            if (elements.length > 0) {
              t2DrillGroup = sorted[elements[0].index][0];
              renderT2();
            }
          }
        }
      });
    }
  }

  function t2ChartOptions() {
    return {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
        y: { ticks: { font: { size: 9 } } }
      }
    };
  }

  /* ── Fix 4: T3 Liabilities sorted by balance ── */
  function renderT3() {
    const canvas = document.getElementById('t3-chart');
    if (!canvas) return;
    if (t3Chart) t3Chart.destroy();

    const active = liabilities
      .filter(l => l.active && Number(l.current_balance || 0) > 0)
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0));

    const total = active.reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const el = document.getElementById('t3-total');
    if (el) el.textContent = `Total: ${fmt(total)}`;

    if (active.length === 0) {
      const parent = canvas.parentElement;
      if (parent) parent.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:2rem;font-size:0.85rem">No active liabilities</div>';
      return;
    }

    t3Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: active.map(l => l.name || l.id),
        datasets: [{ data: active.map(l => Number(l.current_balance || 0)),
          backgroundColor: active.map((_, i) => `hsl(${10 + i * 40},70%,55%)`),
          borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      }
    });
  }

  /* ── Budget meters (unchanged logic) ── */
  function renderMeters(nowYM) {
    const grid = document.getElementById('meters-grid');
    if (!grid) return;

    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat  = groupSum(nowExpenses, t => linkedId(t.category_id));
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const active = budgets.filter(b => b.active !== false);
    if (active.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No active budgets.</div>';
      return;
    }

    const withPct = active.map(b => {
      const catId = linkedId(b.category_id);
      const spent  = spendByCat[catId] || 0;
      const limit  = Number(b.amount || 0);
      return { b, catId, spent, limit, p: pct(spent, limit) };
    }).sort((a, b) => b.p - a.p);

    grid.innerHTML = withPct.map(({ b, catId, spent, limit, p }) => {
      const cat     = catMap[catId] || {};
      const cls     = p >= 100 ? 'over' : p >= 85 ? 'warn' : 'ok';
      const display = Math.min(p, 100);
      const label   = b.label || cat.name || 'Budget';
      return `
        <div class="meter-card">
          <div class="meter-label">${cat.group || ''}</div>
          <div class="meter-name">${label}</div>
          <div class="meter-bar-bg"><div class="meter-bar-fill ${cls}" style="width:${display}%"></div></div>
          <div class="meter-nums"><span>${fmt(spent)}</span><span>${p}% / ${fmt(limit)}</span></div>
        </div>`;
    }).join('');
  }

  /* ── Fix 5: Solution Playroom — user-controlled ── */
  function buildPlayroomCategoryOptions() {
    const sel = document.getElementById('playroom-cat-select');
    if (!sel) return;
    const grouped = {};
    categories.filter(c => c.type === 'Expense' || c.type === 'Earn').forEach(c => {
      const g = c.group || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(c);
    });
    sel.innerHTML = '<option value="">— Select a category —</option>' +
      Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([grp, items]) =>
        `<optgroup label="${grp}">` +
        items.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
        '</optgroup>'
      ).join('');
  }

  function initPlayroom() {
    const sel    = document.getElementById('playroom-cat-select');
    const budIn  = document.getElementById('playroom-budget');
    const projIn = document.getElementById('playroom-projected');
    const impact = document.getElementById('playroom-impact');
    const saveBtn = document.getElementById('playroom-save');
    const msgEl  = document.getElementById('playroom-msg');

    sel?.addEventListener('change', async () => {
      const catId = sel.value;
      if (!catId) {
        document.getElementById('playroom-content').style.display = 'none';
        return;
      }
      await renderPlayroomChart(catId);
    });

    function updateImpact() {
      if (!impact) return;
      const budget   = Number(budIn?.value || 0);
      const projected = Number(projIn?.value || 0);
      if (!budget && !projected) { impact.style.display = 'none'; return; }
      const diff = projected - budget;
      const perYear = Math.abs(diff) * 12;
      impact.style.display = 'block';
      if (diff < 0) {
        impact.className = 'playroom-impact saving';
        impact.textContent = `Saving ${fmt(Math.abs(diff))}/month vs budget = ${fmt(perYear)}/year`;
      } else if (diff > 0) {
        impact.className = 'playroom-impact over';
        impact.textContent = `Over budget by ${fmt(diff)}/month = ${fmt(perYear)}/year extra`;
      } else {
        impact.className = 'playroom-impact neutral';
        impact.textContent = 'On budget exactly.';
      }
    }

    budIn?.addEventListener('input',  updateImpact);
    projIn?.addEventListener('input', updateImpact);

    saveBtn?.addEventListener('click', async () => {
      if (!playroomBudgetId) return;
      const newAmt = Number(budIn?.value || 0);
      if (!newAmt) return;
      if (msgEl) { msgEl.style.display = 'none'; }
      try {
        await fetch(`/api/budgets/${playroomBudgetId}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: newAmt })
        });
        if (msgEl) { msgEl.textContent = 'Budget saved!'; msgEl.style.color = '#22c55e'; msgEl.style.display = 'block'; }
        // Refresh dashboard data
        await loadAll();
      } catch (e) {
        if (msgEl) { msgEl.textContent = 'Save failed'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
      }
    });
  }

  async function renderPlayroomChart(catId) {
    const content = document.getElementById('playroom-content');
    const canvas  = document.getElementById('playroom-chart');
    const budIn   = document.getElementById('playroom-budget');
    const projIn  = document.getElementById('playroom-projected');
    const impact  = document.getElementById('playroom-impact');
    if (!content || !canvas) return;
    content.style.display = 'none';

    // 6-month range
    const now = new Date();
    const start6m = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    const months  = monthsBetween(start6m.slice(0, 7), currentYM());

    let txRes;
    try {
      txRes = await fetch(`/api/transactions?start=${start6m}&limit=500`, { credentials: 'same-origin' });
      txRes = await txRes.json();
    } catch { return; }

    const tx6m = (txRes.records || []).map(r => r.fields)
      .filter(t => linkedId(t.category_id) === catId);

    const spendByM = {};
    tx6m.forEach(t => {
      const ym = toYM(t.date);
      spendByM[ym] = (spendByM[ym] || 0) + Number(t.amount || 0);
    });

    // Find budget for this category
    const budget = budgets.find(b => linkedId(b.category_id) === catId);
    playroomBudgetId = budget?.id || null;
    const budAmt = Number(budget?.amount || 0);
    if (budIn) budIn.value = budAmt || '';
    if (projIn) projIn.value = '';
    if (impact) impact.style.display = 'none';

    if (playroomChart) playroomChart.destroy();
    playroomChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Actual', data: months.map(m => spendByM[m] || 0),
            backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 3 },
          ...(budAmt ? [{
            label: 'Budget', data: months.map(() => budAmt),
            type: 'line', borderColor: '#f59e0b', borderWidth: 2,
            borderDash: [4, 3], pointRadius: 0, fill: false
          }] : [])
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      }
    });

    content.style.display = 'block';
  }

  /* ── Part 3: Risk Simulator — cash position ── */
  function runCashSim() {
    const bank   = Number(document.getElementById('sim-bank')?.value  || 0);
    const cash   = Number(document.getElementById('sim-cash')?.value  || 0);
    const result = document.getElementById('sim-result');
    if (!result) return;

    const nowYM = currentYM();
    const totalLiquid = bank + cash;

    const nowTx = txData.filter(t => toYM(t.date) === nowYM);
    const alreadySpent = nowTx.filter(t => t.type === 'Expense')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    // Categories paid this month (have a transaction)
    const catsPaidThisMonth = new Set();
    nowTx.filter(t => t.type === 'Expense').forEach(t => {
      const cid = linkedId(t.category_id);
      if (cid) catsPaidThisMonth.add(cid);
    });

    // FP-FV and FP-VV budgets = fixed commitments
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const fixedBudgets = budgets.filter(b => {
      const catId = linkedId(b.category_id);
      const cat   = catMap[catId];
      return cat && (cat.expense_type === 'FP-FV' || cat.expense_type === 'FP-VV') && b.active;
    });

    let fixedPaid = 0, fixedDue = 0;
    const fixedRows = fixedBudgets.map(b => {
      const catId = linkedId(b.category_id);
      const paid  = catsPaidThisMonth.has(catId);
      const amt   = Number(b.amount || 0);
      if (paid) fixedPaid += amt; else fixedDue += amt;
      return { label: b.label || catMap[catId]?.name || '?', amt, paid };
    }).sort((a, b) => (a.paid ? 1 : -1) - (b.paid ? 1 : -1));

    // Variable estimate: avg daily spend × days left
    const daysLeft = daysLeftInMonth();
    const daysGone = new Date().getDate();
    const avgDaily = daysGone > 0 ? alreadySpent / daysGone : 0;
    const varEstimate = Math.round(avgDaily * daysLeft);

    const projectedBalance = totalLiquid - fixedDue - varEstimate;
    const isShortfall = projectedBalance < 0;
    const daysUntilZero = avgDaily > 0 ? Math.floor(totalLiquid / avgDaily) : 999;

    const rowsHtml = fixedRows.map(r => `
      <div class="commit-row ${r.paid ? 'paid' : 'due'}">
        <span>${r.paid ? '✓' : '⏳'} ${r.label}</span>
        <span>${fmt(r.amt)}</span>
      </div>`).join('');

    result.style.display = 'block';
    result.innerHTML = `
      <div style="font-size:1rem;font-weight:700;margin-bottom:0.5rem">
        Total liquid: <span class="big">${fmt(totalLiquid)}</span>
      </div>
      <div style="margin-bottom:0.25rem">Already spent this month: <strong>${fmt(alreadySpent)}</strong></div>
      <div style="margin-top:0.75rem;margin-bottom:0.25rem;font-weight:600;font-size:0.85rem">
        Fixed commitments this month:
      </div>
      ${rowsHtml || '<div style="font-size:0.82rem;color:var(--text-secondary)">No FP budgets found</div>'}
      <div style="margin-top:0.5rem;display:flex;justify-content:space-between;font-size:0.85rem">
        <span>Still due: <strong style="color:#ef4444">${fmt(fixedDue)}</strong></span>
        <span>Already paid: ${fmt(fixedPaid)}</span>
      </div>
      <div style="margin-top:0.5rem;font-size:0.85rem">
        Variable estimate (${daysLeft}d left × ${fmt(avgDaily)}/day avg): <strong>${fmt(varEstimate)}</strong>
      </div>
      <div style="margin-top:0.75rem;padding:0.6rem;border-radius:6px;background:${isShortfall ? '#fee2e2' : '#dcfce7'};color:${isShortfall ? '#991b1b' : '#166534'}">
        <strong>Projected month-end balance: ${fmt(projectedBalance)}</strong>
        ${isShortfall ? ' — SHORTFALL' : ' — Surplus'}
      </div>
      <div style="margin-top:0.4rem;font-size:0.82rem;color:var(--text-secondary)">
        At current burn rate: cash lasts <strong>${daysUntilZero}</strong> more days
      </div>`;
  }

  function runExtraSim() {
    const extra  = Number(document.getElementById('sim-extra')?.value  || 0);
    const months = Number(document.getElementById('sim-months')?.value || 3);
    const result = document.getElementById('sim-extra-result');
    if (!result) return;

    const nowYM = currentYM();
    const [y, m] = nowYM.split('-').map(Number);
    const lookbackStart = `${m - 2 <= 0 ? y - 1 : y}-${String(m - 2 <= 0 ? m + 10 : m - 2).padStart(2, '0')}`;
    const recentTx  = txData.filter(t => toYM(t.date) >= lookbackStart);
    const monthSet  = new Set(recentTx.map(t => toYM(t.date)));
    const mc        = Math.max(1, monthSet.size);

    const avgIncome  = recentTx.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0) / mc;
    const avgExpense = recentTx.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0) / mc;
    const currentNet = avgIncome - avgExpense;
    const newNet     = currentNet - extra;

    result.style.display = 'block';
    result.innerHTML = `
      <div>Avg monthly net (last ${mc} months): <strong>${fmt(currentNet)}</strong></div>
      <div style="margin-top:0.3rem">With extra ${fmt(extra)}/month:
        <strong style="color:${newNet < 0 ? '#ef4444' : '#22c55e'}">${fmt(newNet)}</strong></div>
      <div style="margin-top:0.3rem">Total extra over ${months} month${months > 1 ? 's' : ''}:
        <strong>${fmt(extra * months)}</strong></div>
      ${newNet < 0 ? '<div style="color:#ef4444;margin-top:0.5rem;font-weight:600">Cash flow turns negative.</div>'
                   : '<div style="color:#22c55e;margin-top:0.5rem">Cash flow stays positive.</div>'}`;
  }

  /* ── Period buttons ── */
  function initPeriodButtons() {
    document.querySelectorAll('.period-btn[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRange    = btn.dataset.range;
        t2DrillGroup   = null;
        loadAll().catch(console.error);
      });
    });
  }

  /* ── Modal / Panel ── */
  function initModals() {
    const simBackdrop = document.getElementById('sim-backdrop');
    document.getElementById('open-simulator')?.addEventListener('click', () => simBackdrop?.classList.add('open'));
    document.getElementById('sim-close')?.addEventListener('click', () => simBackdrop?.classList.remove('open'));
    simBackdrop?.addEventListener('click', e => { if (e.target === simBackdrop) simBackdrop.classList.remove('open'); });

    document.getElementById('run-sim')?.addEventListener('click', runCashSim);
    document.getElementById('run-extra-sim')?.addEventListener('click', runExtraSim);

    const pBackdrop = document.getElementById('playroom-backdrop');
    const pPanel    = document.getElementById('playroom-panel');
    const closePlay = () => { pBackdrop?.classList.remove('open'); pPanel?.classList.remove('open'); };
    document.getElementById('open-playroom')?.addEventListener('click', () => {
      pBackdrop?.classList.add('open'); pPanel?.classList.add('open');
    });
    document.getElementById('playroom-close')?.addEventListener('click', closePlay);
    pBackdrop?.addEventListener('click', closePlay);

    document.getElementById('t2-back-btn')?.addEventListener('click', () => {
      t2DrillGroup = null;
      renderT2();
    });
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', () => {
    initPeriodButtons();
    initModals();
    initPlayroom();
    loadAll().catch(err => console.error('Dashboard load failed:', err));
  });
})();
