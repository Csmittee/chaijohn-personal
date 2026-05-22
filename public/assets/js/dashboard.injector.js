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
  let t1Chart, t2Chart, t3Chart;

  /* ── Date helpers ── */
  function rangeStart(range) {
    const now = new Date();
    if (range === '1m') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    if (range === '3m') return new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
    if (range === '6m') return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    return new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
  }
  function monthLabel(ym) {
    const d = new Date(ym + '-02');
    return d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
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
      sm++;
      if (sm > 12) { sm = 1; sy++; }
    }
    return months;
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

    txData = (txRes.records || []).map(r => r.fields);
    budgets = (budgetRes.records || []).map(r => ({ id: r.id, ...r.fields }));
    liabilities = (liabRes.records || []).map(r => ({ id: r.id, ...r.fields }));
    categories = (catRes.records || []).map(r => ({ id: r.id, ...r.fields }));

    renderAlerts(nowYM);
    renderT1(start);
    renderT2();
    renderT3();
    renderMeters(nowYM);
    buildSimCategoryOptions();
    buildPlayroomScenarios(nowYM);
  }

  /* ── Alert strip ── */
  function renderAlerts(nowYM) {
    const strip = document.getElementById('alert-strip');
    if (!strip) return;
    const chips = [];

    const nowMonthExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat = groupSum(nowMonthExpenses, t => linkedId(t.category_id));

    budgets.forEach(b => {
      if (!b.active) return;
      const catId = linkedId(b.category_id);
      const spent = spendByCat[catId] || 0;
      const p = pct(spent, b.amount);
      if (p >= 100) chips.push({ type: 'danger', text: `${b.label || 'Budget'} OVER (${p}%)` });
      else if (p >= 85) chips.push({ type: 'warn', text: `${b.label || 'Budget'} at ${p}%` });
    });

    liabilities.forEach(l => {
      if (!l.active) return;
      const bal = Number(l.current_balance || 0);
      if (bal > 0) chips.push({ type: 'info', text: `${l.name}: ${fmt(bal)} balance` });
    });

    const nowMonthAll = txData.filter(t => toYM(t.date) === nowYM);
    const mIncome = nowMonthAll.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const mExpense = nowMonthAll.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    if (mExpense > mIncome && mIncome > 0) {
      chips.push({ type: 'danger', text: `Negative cash flow this month (${fmt(mIncome - mExpense)})` });
    }

    strip.innerHTML = chips.map(c => `<span class="alert-chip ${c.type}">${c.text}</span>`).join('');
  }

  /* ── T1: Income vs Expense trend ── */
  function renderT1(startDate) {
    const canvas = document.getElementById('t1-chart');
    if (!canvas) return;
    if (t1Chart) t1Chart.destroy();

    const nowYM = currentYM();
    const startYM = startDate.slice(0, 7);
    const months = monthsBetween(startYM, nowYM);

    const incomeByM = {}, expByM = {};
    txData.forEach(t => {
      const ym = toYM(t.date);
      if (!months.includes(ym)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income') incomeByM[ym] = (incomeByM[ym] || 0) + amt;
      else if (t.type === 'Expense') expByM[ym] = (expByM[ym] || 0) + amt;
    });

    t1Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Income', data: months.map(m => incomeByM[m] || 0),
            backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3 },
          { label: 'Expense', data: months.map(m => expByM[m] || 0),
            backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      }
    });
  }

  /* ── T2: Expense pareto ── */
  function renderT2() {
    const canvas = document.getElementById('t2-chart');
    if (!canvas) return;
    if (t2Chart) t2Chart.destroy();

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name || c.id; });

    const expenses = txData.filter(t => t.type === 'Expense');
    const sumByCat = {};
    expenses.forEach(t => {
      const catId = linkedId(t.category_id) || 'uncategorised';
      sumByCat[catId] = (sumByCat[catId] || 0) + Number(t.amount || 0);
    });

    const sorted = Object.entries(sumByCat).sort((a, b) => b[1] - a[1]).slice(0, 10);

    t2Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map(([id]) => catMap[id] || id),
        datasets: [{
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => `hsl(${i * 25},65%,55%)`),
          borderRadius: 3
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
          y: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  /* ── T3: Liability balances ── */
  function renderT3() {
    const canvas = document.getElementById('t3-chart');
    if (!canvas) return;
    if (t3Chart) t3Chart.destroy();

    const active = liabilities.filter(l => l.active && Number(l.current_balance || 0) > 0);
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
        datasets: [{
          data: active.map(l => Number(l.current_balance || 0)),
          backgroundColor: active.map((_, i) => `hsl(${10 + i * 40},70%,55%)`),
          borderRadius: 4
        }]
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

  /* ── Budget meters ── */
  function renderMeters(nowYM) {
    const grid = document.getElementById('meters-grid');
    if (!grid) return;

    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat = groupSum(nowExpenses, t => linkedId(t.category_id));

    const active = budgets.filter(b => b.active !== false);
    if (active.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No active budgets. Add some in Entry.</div>';
      return;
    }

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const withPct = active.map(b => {
      const catId = linkedId(b.category_id);
      const spent = spendByCat[catId] || 0;
      const limit = Number(b.amount || 0);
      const p = pct(spent, limit);
      return { b, catId, spent, limit, p };
    }).sort((a, b) => b.p - a.p);

    grid.innerHTML = withPct.map(({ b, catId, spent, limit, p }) => {
      const cat = catMap[catId] || {};
      const cls = p >= 100 ? 'over' : p >= 85 ? 'warn' : 'ok';
      const display = Math.min(p, 100);
      const label = b.label || cat.name || 'Budget';
      const group = cat.group || '';
      return `
        <div class="meter-card">
          <div class="meter-label">${group}</div>
          <div class="meter-name">${label}</div>
          <div class="meter-bar-bg">
            <div class="meter-bar-fill ${cls}" style="width:${display}%"></div>
          </div>
          <div class="meter-nums">
            <span>${fmt(spent)}</span>
            <span>${p}% / ${fmt(limit)}</span>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Risk Simulator ── */
  function buildSimCategoryOptions() {
    const sel = document.getElementById('sim-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">— All expenses —</option>' +
      categories
        .filter(c => c.type === 'Expense')
        .map(c => `<option value="${c.id}">${c.group ? c.group + ' — ' : ''}${c.name}</option>`)
        .join('');
  }

  function runSimulator() {
    const extra = Number(document.getElementById('sim-extra').value || 0);
    const months = Number(document.getElementById('sim-months').value || 3);
    const result = document.getElementById('sim-result');
    if (!result) return;

    const nowYM = currentYM();
    const [y, m] = nowYM.split('-').map(Number);
    // Look at last 3 months for avg
    const lookbackStart = `${m - 2 <= 0 ? y - 1 : y}-${String(m - 2 <= 0 ? m + 10 : m - 2).padStart(2, '0')}`;
    const recentTx = txData.filter(t => toYM(t.date) >= lookbackStart);
    const monthSet = new Set(recentTx.map(t => toYM(t.date)));
    const mc = Math.max(1, monthSet.size);

    const avgIncome = recentTx.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0) / mc;
    const avgExpense = recentTx.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0) / mc;

    const currentNet = avgIncome - avgExpense;
    const newNet = currentNet - extra;
    const totalImpact = extra * months;

    let html = `
      <div>Avg monthly net (last ${mc} months): <strong>${fmt(currentNet)}</strong></div>
      <div style="margin-top:0.3rem">With extra ${fmt(extra)}/month: <strong style="color:${newNet < 0 ? '#ef4444' : '#22c55e'}">${fmt(newNet)}</strong></div>
      <div style="margin-top:0.3rem">Total extra over ${months} month${months > 1 ? 's' : ''}: <strong>${fmt(totalImpact)}</strong></div>`;

    if (newNet < 0) {
      html += `<div style="color:#ef4444;margin-top:0.6rem;font-weight:600">
        Cash flow turns negative — you'll need savings or new income.</div>`;
    } else {
      html += `<div style="color:#22c55e;margin-top:0.6rem">Cash flow stays positive.</div>`;
    }

    result.style.display = 'block';
    result.innerHTML = html;
  }

  /* ── Solution Playroom ── */
  function buildPlayroomScenarios(nowYM) {
    const container = document.getElementById('playroom-scenarios');
    if (!container) return;

    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat = groupSum(nowExpenses, t => linkedId(t.category_id));
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const topCats = Object.entries(spendByCat).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const scenarios = [];
    topCats.forEach(([catId, spent]) => {
      const cat = catMap[catId];
      if (!cat) return;
      const saving30 = Math.round(spent * 0.3);
      scenarios.push({
        title: `Cut "${cat.name}" by 30%`,
        desc: `Currently ${fmt(spent)} this month on ${cat.name}.`,
        impact: `Save ${fmt(saving30)}/month = ${fmt(saving30 * 12)}/year`
      });
    });

    const highLiab = liabilities.filter(l => l.active && Number(l.current_balance || 0) > 0)
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0))[0];
    if (highLiab) {
      const mp = Number(highLiab.monthly_payment || 0);
      const rate = Number(highLiab.interest_rate || 0) / 100 / 12;
      const bal = Number(highLiab.current_balance || 0);
      const extra = Math.round(mp * 0.5);
      let impactText = `Add ${fmt(extra)}/month extra to ${highLiab.name}.`;
      if (rate > 0 && bal > 0) {
        const interestSaved = Math.round(extra / (bal * rate) * bal * rate * 3);
        impactText += ` Saves ~${fmt(interestSaved)} in interest over 3 months.`;
      }
      scenarios.push({ title: `Pay ${highLiab.name} extra 50%`, desc: `Balance: ${fmt(bal)}`, impact: impactText });
    }

    if (scenarios.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">Log some transactions this month to see scenarios.</div>';
      return;
    }

    container.innerHTML = scenarios.map((s, i) => `
      <div class="scenario-card" data-idx="${i}">
        <h4>${s.title}</h4>
        <p>${s.desc}</p>
        <div class="scenario-result" id="sr-${i}">${s.impact}</div>
      </div>`).join('');

    container.querySelectorAll('.scenario-card').forEach(card => {
      card.addEventListener('click', () => {
        const res = document.getElementById(`sr-${card.dataset.idx}`);
        if (res) res.style.display = res.style.display === 'none' ? 'block' : 'none';
      });
    });
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

  /* ── Period buttons ── */
  function initPeriodButtons() {
    document.querySelectorAll('.period-btn[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRange = btn.dataset.range;
        loadAll().catch(console.error);
      });
    });
  }

  /* ── Modal / Panel ── */
  function initModals() {
    const simBackdrop = document.getElementById('sim-backdrop');
    document.getElementById('open-simulator')?.addEventListener('click', () => simBackdrop.classList.add('open'));
    document.getElementById('sim-close')?.addEventListener('click', () => simBackdrop.classList.remove('open'));
    simBackdrop?.addEventListener('click', e => { if (e.target === simBackdrop) simBackdrop.classList.remove('open'); });
    document.getElementById('run-sim')?.addEventListener('click', runSimulator);

    const pBackdrop = document.getElementById('playroom-backdrop');
    const pPanel = document.getElementById('playroom-panel');
    const closePlay = () => { pBackdrop.classList.remove('open'); pPanel.classList.remove('open'); };
    document.getElementById('open-playroom')?.addEventListener('click', () => {
      pBackdrop.classList.add('open'); pPanel.classList.add('open');
    });
    document.getElementById('playroom-close')?.addEventListener('click', closePlay);
    pBackdrop?.addEventListener('click', closePlay);
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', () => {
    initPeriodButtons();
    initModals();
    loadAll().catch(err => console.error('Dashboard load failed:', err));
  });
})();
