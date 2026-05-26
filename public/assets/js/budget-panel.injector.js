/* budget-panel.injector.js — Budget panel (9E E1)
 * 12-month planning grid redesign
 * Stats: earn/mo, spend/mo, gap/mo, hit/miss
 * Chart: 6-month budget vs actual vertical bar
 * Grid: spreadsheet with EARN / EXPENSES / DEBT PAYBACK / GAP / ANALYSIS sections
 * Filters: view (actual/budget/gap) × period (month/12mo)
 */
(function () {
  'use strict';

  /* ── Helpers ── */
  const fmt  = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc  = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lid  = v => (Array.isArray(v) ? v[0] : v) || null;

  function mbr(b) {
    const a = Number(b.amount || 0), p = b.period || 'Monthly';
    if (p === 'Annual')  return a / 12;
    if (p === '3x-year') return (a * 3) / 12;
    if (p === '6x-year') return (a * 6) / 12;
    return a;
  }

  /* isoMonth(n): ISO date string for the first day of (currentMonth - n months) */
  function isoMonth(n) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString().split('T')[0];
  }

  /* ── Module state ── */
  let budgetChart  = null;
  let txData       = [];
  let budgets      = [];
  let categories   = [];
  let liabilities  = [];
  let initialized  = false;
  let activeView   = 'actual';   // actual | budget | gap
  let activePeriod = 'month';    // month | 12mo

  function el(id) { return document.getElementById(id); }

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  /* ── Thai progressive income tax ── */
  function thaiTax(netTaxable) {
    const brackets = [
      { limit: 150000,   rate: 0.00 },
      { limit: 300000,   rate: 0.05 },
      { limit: 500000,   rate: 0.10 },
      { limit: 750000,   rate: 0.15 },
      { limit: 1000000,  rate: 0.20 },
      { limit: 2000000,  rate: 0.25 },
      { limit: 5000000,  rate: 0.30 },
      { limit: Infinity, rate: 0.35 }
    ];
    let tax = 0, prev = 0, rem = Math.max(0, netTaxable);
    for (const { limit, rate } of brackets) {
      const band = limit - prev;
      const taxable = Math.min(rem, band);
      tax += taxable * rate;
      rem -= taxable;
      prev = limit;
      if (rem <= 0) break;
    }
    return tax;
  }

  /* ── computeMaps() — extract aggregated maps from loaded data ── */
  function computeMaps() {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const now       = new Date();
    const curStart  = isoMonth(0);   // first of current month
    const yr12Start = isoMonth(11);  // first of 11 months back (= 12 months window)

    /* current-month actual spend & earn by budget_id */
    const spendMonth = {};   // expense actual for current month
    const earnMonth  = {};   // income  actual for current month
    txData.filter(t => t.date >= curStart).forEach(t => {
      const bid = lid(t.budget_id);
      if (!bid) return;
      if (t.type === 'Expense') spendMonth[bid] = (spendMonth[bid] || 0) + Number(t.amount || 0);
      if (t.type === 'Income')  earnMonth[bid]  = (earnMonth[bid]  || 0) + Number(t.amount || 0);
    });

    /* 12-month average spend & earn by budget_id (total ÷ 12) */
    const spend12Total = {};
    const earn12Total  = {};
    txData.filter(t => t.date >= yr12Start).forEach(t => {
      const bid = lid(t.budget_id);
      if (!bid) return;
      if (t.type === 'Expense') spend12Total[bid] = (spend12Total[bid] || 0) + Number(t.amount || 0);
      if (t.type === 'Income')  earn12Total[bid]  = (earn12Total[bid]  || 0) + Number(t.amount || 0);
    });
    const spend12Avg = Object.fromEntries(Object.entries(spend12Total).map(([k, v]) => [k, v / 12]));
    const earn12Avg  = Object.fromEntries(Object.entries(earn12Total ).map(([k, v]) => [k, v / 12]));

    /* active liabilities */
    const activeDebt = liabilities.filter(l => l.active !== false && Number(l.current_balance || 0) > 0);
    const debtMonthly = activeDebt.reduce((s, l) => s + Number(l.monthly_payment || 0), 0);

    return { catMap, spendMonth, earnMonth, spend12Avg, earn12Avg, activeDebt, debtMonthly };
  }

  /* ── Stat chips ── */
  function renderStats(maps) {
    const { catMap, spendMonth, earnMonth, spend12Avg, earn12Avg, debtMonthly } = maps;

    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income';
    });
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    });

    const earnBudMo  = incBudgets.reduce((s, b) => s + mbr(b), 0);
    const spendBudMo = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const gapMo      = earnBudMo - spendBudMo - debtMonthly;

    let hitCount = 0, missCount = 0;
    expBudgets.forEach(b => {
      const bAmt  = mbr(b);
      const spent = spendMonth[b.id] || 0;
      if (spent > bAmt) missCount++; else hitCount++;
    });

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('bud-earn-mo',  fmt(earnBudMo));
    set('bud-spend-mo', fmt(spendBudMo));

    const gapEl = el('bud-gap-mo');
    if (gapEl) {
      gapEl.textContent = fmt(gapMo);
      gapEl.style.color = gapMo >= 0 ? 'var(--green)' : 'var(--red)';
    }

    const statusEl = el('bud-status');
    if (statusEl) {
      statusEl.textContent = hitCount + ' hit · ' + missCount + ' miss';
      statusEl.style.color = missCount > 0 ? 'var(--red)' : 'var(--green)';
    }
  }

  /* ── 6-month bar chart ── */
  function renderChart(maps) {
    const canvas = el('bud-bar-chart');
    if (!canvas) return;
    if (budgetChart) { budgetChart.destroy(); budgetChart = null; }

    const { catMap } = maps;
    const now = new Date();

    /* Build 6 monthly labels: current + 5 prior */
    const monthLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(d.toLocaleDateString('en', { month: 'short', year: '2-digit' }));
    }

    /* Monthly keys YYYY-MM for those 6 months */
    const monthKeys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }

    /* Total expense budget per month (all active expense budgets × mbr) */
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    });
    const totalBudgetMo = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const budgetData = monthKeys.map(() => totalBudgetMo);

    /* Actual expense totals per month from txData */
    const actualByMonth = Object.fromEntries(monthKeys.map(k => [k, 0]));
    txData.filter(t => t.type === 'Expense').forEach(t => {
      const ym = (t.date || '').slice(0, 7);
      if (actualByMonth[ym] !== undefined) actualByMonth[ym] += Number(t.amount || 0);
    });
    const actualData = monthKeys.map(k => actualByMonth[k]);

    /* Color actual bars: green if ≤ budget, red if over */
    const actualColors = actualData.map((a, i) =>
      a <= budgetData[i] ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'
    );

    budgetChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Budget',
            data: budgetData,
            backgroundColor: 'rgba(59,130,246,0.2)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Actual',
            data: actualData,
            backgroundColor: actualColors,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { size: 9 }, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 }, callback: v => '฿' + (v / 1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  /* ── Grid renderer ── */
  function renderGrid(maps) {
    const zone = el('bud-grid');
    if (!zone) return;

    const { catMap, spendMonth, earnMonth, spend12Avg, earn12Avg, activeDebt, debtMonthly } = maps;
    const usePeriod12 = activePeriod === '12mo';

    /* Helper: pick actual value depending on period toggle */
    function actualSpend(bid) { return usePeriod12 ? (spend12Avg[bid] || 0) : (spendMonth[bid] || 0); }
    function actualEarn(bid)  { return usePeriod12 ? (earn12Avg[bid]  || 0) : (earnMonth[bid]  || 0); }

    /* Column highlight classes based on view toggle */
    const boldBudget = activeView === 'budget';
    const boldActual = activeView === 'actual';
    const boldGap    = activeView === 'gap';

    const colStyleBudget = boldBudget ? 'font-weight:700;' : '';
    const colStyleActual = boldActual ? 'font-weight:700;' : '';
    const colStyleGap    = boldGap    ? 'font-weight:700;' : '';

    /* Table styles */
    const cellBase = 'font-size:0.78rem;padding:0.28rem 0.5rem;border-bottom:1px solid var(--border);white-space:nowrap;';
    const labelCell = cellBase + 'text-align:left;';
    const numCell   = cellBase + 'text-align:right;';

    function tdLabel(text, extra) {
      return `<td style="${labelCell}${extra || ''}">${esc(text)}</td>`;
    }
    function tdNum(val, extra) {
      return `<td style="${numCell}${extra || ''}">${fmt(val)}</td>`;
    }
    function tdDash(extra) {
      return `<td style="${numCell}color:var(--text-dim);${extra || ''}">—</td>`;
    }

    /* Variance styling */
    function varCell(budAmt, actAmt) {
      const v = budAmt - actAmt;
      const color = v >= 0 ? 'var(--green)' : 'var(--red)';
      const sign  = v >= 0 ? '+' : '';
      return `<td style="${numCell}${colStyleGap}color:${boldGap ? color : 'inherit'};">${boldGap ? `<span style="color:${color}">${sign}${fmt(v)}</span>` : (sign + fmt(v))}</td>`;
    }

    /* Section header row */
    function sectionRow(label) {
      return `<tr>
        <td colspan="5" style="${labelCell}background:var(--bg-raised);font-family:var(--font-mono,monospace);font-size:0.68rem;font-weight:600;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;padding:0.5rem;">${esc(label)}</td>
      </tr>`;
    }

    /* Column header */
    const thead = `<thead>
      <tr>
        <th style="${labelCell}font-size:0.72rem;color:var(--text-dim);font-weight:500;min-width:160px;">Item</th>
        <th style="${numCell}${colStyleBudget}font-size:0.72rem;color:var(--text-dim);font-weight:${boldBudget ? 700 : 500};">Budget/mo</th>
        <th style="${numCell}${colStyleActual}font-size:0.72rem;color:var(--text-dim);font-weight:${boldActual ? 700 : 500};">Actual</th>
        <th style="${numCell}${colStyleGap}font-size:0.72rem;color:var(--text-dim);font-weight:${boldGap ? 700 : 500};">Var</th>
        <th style="${numCell}font-size:0.72rem;color:var(--text-dim);font-weight:500;">Status</th>
      </tr>
    </thead>`;

    /* Dot status emoji */
    function statusDot(bAmt, actAmt) {
      if (bAmt <= 0) return '—';
      const ratio = actAmt / bAmt;
      if (ratio > 1)    return '🔴';
      if (ratio >= 0.8) return '🟡';
      return '🟢';
    }

    /* ── EARN section ── */
    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income';
    });

    let totalEarnBud = 0, totalEarnAct = 0;
    const earnRows = incBudgets.map(b => {
      const bAmt  = mbr(b);
      const aAmt  = actualEarn(b.id);
      totalEarnBud += bAmt;
      totalEarnAct += aAmt;
      return `<tr>
        ${tdLabel(b.label || '—')}
        ${tdNum(bAmt, colStyleBudget)}
        ${tdNum(aAmt, colStyleActual)}
        ${varCell(bAmt, aAmt)}
        <td style="${numCell}">${statusDot(bAmt, aAmt)}</td>
      </tr>`;
    }).join('');

    /* ── EXPENSES section ── */
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    });

    /* Group by category group name */
    const expGroups = {};
    expBudgets.forEach(b => {
      const cat = catMap[lid(b.category_id)];
      const grp = cat?.group || cat?.name || 'Other';
      if (!expGroups[grp]) expGroups[grp] = [];
      expGroups[grp].push(b);
    });

    let totalSpendBud = 0, totalSpendAct = 0;
    const expRows = Object.entries(expGroups).map(([grpName, items]) => {
      const subHeader = `<tr>
        <td colspan="5" style="${labelCell}font-size:0.72rem;color:var(--text-dim);padding-left:0.75rem;">↳ ${esc(grpName.toUpperCase())}</td>
      </tr>`;
      const rows = items.map(b => {
        const bAmt = mbr(b);
        const aAmt = actualSpend(b.id);
        totalSpendBud += bAmt;
        totalSpendAct += aAmt;
        return `<tr>
          <td style="${labelCell}padding-left:1.25rem;">${esc(b.label || '—')}</td>
          ${tdNum(bAmt, colStyleBudget)}
          ${tdNum(aAmt, colStyleActual)}
          ${varCell(bAmt, aAmt)}
          <td style="${numCell}">${statusDot(bAmt, aAmt)}</td>
        </tr>`;
      }).join('');
      return subHeader + rows;
    }).join('');

    /* ── DEBT PAYBACK section ── */
    const debtRows = activeDebt.map(l => {
      const mp = Number(l.monthly_payment || 0);
      return `<tr>
        ${tdLabel(l.name || '—')}
        ${tdNum(mp, colStyleBudget)}
        ${tdDash(colStyleActual)}
        ${tdDash(colStyleGap)}
        <td style="${numCell}">—</td>
      </tr>`;
    }).join('');

    /* ── GAP row ── */
    const gapBud = totalEarnBud - totalSpendBud - debtMonthly;
    const gapAct = totalEarnAct - totalSpendAct;
    const gapColor = gapBud >= 0 ? 'var(--green)' : 'var(--red)';
    const gapActColor = gapAct >= 0 ? 'var(--green)' : 'var(--red)';

    const gapRow = `<tr>
      ${tdLabel('Gap (earn − spend − debt)', 'font-weight:600;')}
      <td style="${numCell}${colStyleBudget}font-weight:600;color:${gapColor};">${fmt(gapBud)}</td>
      <td style="${numCell}${colStyleActual}font-weight:600;color:${gapActColor};">${fmt(gapAct)}</td>
      ${tdDash(colStyleGap)}
      <td style="${numCell}">—</td>
    </tr>`;

    /* ── ANALYSIS — Thai Tax ── */
    const annualEarn    = totalEarnBud * 12;
    const empDed        = Math.min(annualEarn * 0.5, 100000);
    const personalAllow = 60000;
    const netTaxable    = Math.max(0, annualEarn - empDed - personalAllow);
    const taxYr         = thaiTax(netTaxable);
    const taxMo         = taxYr / 12;
    const afterTaxGap   = gapBud - taxMo;
    const afterTaxColor = afterTaxGap >= 0 ? 'var(--green)' : 'var(--red)';

    function analysisRow(label, val, extra) {
      return `<tr>
        ${tdLabel(label, 'padding-left:1.25rem;color:var(--text-dim);')}
        <td colspan="3" style="${numCell}${extra || ''}">${fmt(val)}</td>
        <td style="${numCell}">—</td>
      </tr>`;
    }

    const analysisRows = [
      analysisRow('Annual earn (plan × 12)',   annualEarn),
      analysisRow('Employment deduction',      -empDed,        'color:var(--text-dim);'),
      analysisRow('Personal allowance',        -personalAllow, 'color:var(--text-dim);'),
      analysisRow('Net taxable',               netTaxable),
      analysisRow('Est. tax / yr',             taxYr,          'color:var(--red);'),
      analysisRow('Est. tax / mo',             taxMo,          'color:var(--red);'),
      `<tr>
        <td style="${labelCell}padding-left:1.25rem;font-weight:600;">After-tax gap / mo</td>
        <td colspan="3" style="${numCell}font-weight:700;color:${afterTaxColor};">${fmt(afterTaxGap)}</td>
        <td style="${numCell}">—</td>
      </tr>`
    ].join('');

    /* ── Assemble table ── */
    zone.innerHTML = `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          ${thead}
          <tbody>
            ${sectionRow('EARN')}
            ${earnRows || '<tr><td colspan="5" style="' + labelCell + 'color:var(--text-dim);">No income budgets</td></tr>'}
            ${sectionRow('EXPENSES')}
            ${expRows  || '<tr><td colspan="5" style="' + labelCell + 'color:var(--text-dim);">No expense budgets</td></tr>'}
            ${sectionRow('DEBT PAYBACK')}
            ${debtRows || '<tr><td colspan="5" style="' + labelCell + 'color:var(--text-dim);">No active liabilities</td></tr>'}
            ${sectionRow('GAP')}
            ${gapRow}
            ${sectionRow('ANALYSIS (Thai Tax)')}
            ${analysisRows}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Period label ── */
  function updatePeriodLabel() {
    const labelEl = el('bud-period-label');
    if (!labelEl) return;
    if (activePeriod === '12mo') {
      labelEl.textContent = 'avg last 12 months';
    } else {
      const now = new Date();
      labelEl.textContent = now.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    }
  }

  /* ── Filter toggles ── */
  function initFilters() {
    /* View toggle */
    const viewZone = el('bud-view-toggle');
    if (viewZone) {
      viewZone.querySelectorAll('[data-budview]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeView = btn.dataset.budview;
          viewZone.querySelectorAll('[data-budview]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const maps = computeMaps();
          renderGrid(maps);
        });
      });
      /* Set initial active state */
      const initView = viewZone.querySelector('[data-budview="' + activeView + '"]');
      if (initView) initView.classList.add('active');
    }

    /* Period toggle */
    const periodZone = el('bud-period-toggle');
    if (periodZone) {
      periodZone.querySelectorAll('[data-budperiod]').forEach(btn => {
        btn.addEventListener('click', () => {
          activePeriod = btn.dataset.budperiod;
          periodZone.querySelectorAll('[data-budperiod]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          updatePeriodLabel();
          const maps = computeMaps();
          renderGrid(maps);
        });
      });
      /* Set initial active state */
      const initPeriod = periodZone.querySelector('[data-budperiod="' + activePeriod + '"]');
      if (initPeriod) initPeriod.classList.add('active');
    }
  }

  /* ── Load and render ── */
  async function loadAndRender() {
    /* Fetch 12 months of transactions + budgets + categories + liabilities */
    const start = isoMonth(11);
    const [txR, bR, cR, lR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/budgets'),
      api('/api/categories'),
      api('/api/liabilities?all=true')
    ]);

    txData      = txR.status === 'fulfilled' ? (txR.value.records      || []).map(r => ({ id: r.id, ...r.fields })) : [];
    budgets     = bR.status  === 'fulfilled' ? (bR.value.records       || []).map(r => ({ id: r.id, ...r.fields })) : [];
    categories  = cR.status  === 'fulfilled' ? (cR.value.records       || []).map(r => ({ id: r.id, ...r.fields })) : [];
    liabilities = lR.status  === 'fulfilled' ? (lR.value.records       || []).map(r => ({ id: r.id, ...r.fields })) : [];

    const maps = computeMaps();
    updatePeriodLabel();
    renderStats(maps);
    renderChart(maps);
    renderGrid(maps);
  }

  /* ── Init ── */
  function init() {
    if (initialized) return;
    initialized = true;
    initFilters();
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'budget') init(); });
  if (el('panel-budget')?.classList.contains('active')) init();
})();
