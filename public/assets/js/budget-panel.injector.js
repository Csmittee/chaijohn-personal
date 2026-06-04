/* budget-panel.injector.js — Budget panel (9E redesign)
 * 12-month planning matrix with collapsible analysis, graph filters, data filters,
 * edit mode with batch save, spreadsheet + card views.
 */
(function () {
  'use strict';

  /* ── Helpers ── */
  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lid = v => (Array.isArray(v) ? v[0] : v) || null;

  function mbr(b) {
    const a = Number(b.amount || 0), p = b.period || 'Monthly';
    if (p === 'Annual')  return a / 12;
    if (p === '3x-year') return (a * 3) / 12;
    if (p === '6x-year') return (a * 6) / 12;
    return a;
  }

  /* isoMonth(n): ISO date string for first day of (currentMonth - n months) */
  function isoMonth(n) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString().split('T')[0];
  }

  /* Thai progressive income tax */
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
      const band    = limit - prev;
      const taxable = Math.min(rem, band);
      tax += taxable * rate;
      rem -= taxable;
      prev = limit;
      if (rem <= 0) break;
    }
    return tax;
  }

  /* isOverrideRecord: single-month override has start_date and end_date in same YYYY-MM */
  function isOverrideRecord(b) {
    return !!(b.start_date && b.end_date &&
      b.start_date.slice(0, 7) === b.end_date.slice(0, 7));
  }

  /* getBudgetAmountForMonth: find the most specific (shortest range) budget record
   * covering ym for the given base budget's label+category_id. */
  function getBudgetAmountForMonth(baseId, ym) {
    const base = budgets.find(b => b.id === baseId);
    if (!base) return 0;

    const ymStart = ym + '-01';
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const ymEnd = ym + '-' + String(lastDay).padStart(2, '0');

    /* Siblings: same label + category_id, active */
    const baseLabel = base.label;
    const baseCatId = lid(base.category_id);
    const siblings = budgets.filter(b =>
      b.active !== false &&
      b.label === baseLabel &&
      lid(b.category_id) === baseCatId
    );

    /* Candidates that cover this month */
    const candidates = siblings.filter(b => {
      if (!b.start_date || !b.end_date) return true;
      return b.start_date <= ymEnd && b.end_date >= ymStart;
    });

    if (!candidates.length) return mbr(base);

    /* Sort by range length ascending (most specific first) */
    candidates.sort((a, b) => {
      const ra = (a.start_date && a.end_date)
        ? new Date(a.end_date) - new Date(a.start_date)
        : Infinity;
      const rb = (b.start_date && b.end_date)
        ? new Date(b.end_date) - new Date(b.start_date)
        : Infinity;
      return ra - rb;
    });

    return mbr(candidates[0]);
  }

  /* ── Module state ── */
  let txData      = [];
  let budgets     = [];
  let categories  = [];
  let liabilities = [];
  let initialized = false;
  let budgetChart = null;

  /* Graph filter state — default FY so Jan is always visible (L153) */
  let graphView   = 'mobymo';  // 'mobymo' | 'accum'
  let graphPeriod = 'fy';      // 'fy' | 'rolling'
  let graphData   = 'bgact';   // 'bgact' | 'gap'

  /* Data filter state */
  let dispView    = 'sps';     // 'sps' | 'card'
  let dataType    = 'bgact';   // 'bgact' | 'data' | 'bg'
  let editMode    = false;

  /* Pending changes: key → { kind, id, monthKey, newVal, label, oldVal, dataType } */
  let pendingChanges = {};

  /* Custom period start (YYYY-MM) */
  let customStart = null;

  function el(id) { return document.getElementById(id); }

  function showFlash(msg, type) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.65rem 1.1rem;border-radius:8px;' +
      'background:' + (type === 'error' ? '#ef4444' : '#22c55e') + ';color:#fff;font-weight:500;z-index:9999;' +
      'font-size:0.85rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s';
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; }, 2600);
    setTimeout(() => { if (d.parentNode) d.remove(); }, 3000);
  }

  async function apiFetch(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('API ' + r.status + ' ' + path);
    return r.json();
  }

  /* ── computeMaps() ── */
  function computeMaps() {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const now = new Date();
    const year = now.getFullYear();

    /* FY month keys: Jan–Dec of current year (L153) */
    const fyMonthKeys = [];
    for (let m = 1; m <= 12; m++) {
      fyMonthKeys.push(year + '-' + String(m).padStart(2, '0'));
    }

    /* Rolling month keys: current month back 11 months */
    const rollingMonthKeys = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      rollingMonthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }

    let monthKeys;
    if (graphPeriod === 'fy') {
      monthKeys = fyMonthKeys;
    } else if (graphPeriod === 'custom' && customStart) {
      const [cy, cm] = customStart.split('-').map(Number);
      const customMonthKeys = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(cy, cm - 1 + i, 1);
        customMonthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      }
      monthKeys = customMonthKeys;
    } else {
      monthKeys = rollingMonthKeys;
    }

    /* Short labels like "Jan '25" */
    const monthLabels = monthKeys.map(k => {
      const [y, m] = k.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('en', { month: 'short' }) + " '" + String(y).slice(2);
    });

    /* spendByBudgetMonth: { budget_id: { YYYY-MM: amount } }
     * L151: dedup — keep only the MOST RECENT transaction per budget_id+month.
     * Latest = highest date string; on tie, last in array wins. */
    const spendLatest = {};
    const earnByBudgetMonth = {};

    txData.forEach(t => {
      const bid = lid(t.budget_id);
      if (!bid) return;
      const ym  = (t.date || '').slice(0, 7);
      if (!monthKeys.includes(ym)) return;
      const amt = Number(t.amount || 0);

      if (t.type === 'Expense') {
        if (!spendLatest[bid]) spendLatest[bid] = {};
        const existing = spendLatest[bid][ym];
        /* Replace if newer date or same date (last record in array wins) */
        if (!existing || t.date >= existing.date) {
          spendLatest[bid][ym] = t;
        }
      } else if (t.type === 'Income') {
        if (!earnByBudgetMonth[bid]) earnByBudgetMonth[bid] = {};
        earnByBudgetMonth[bid][ym] = (earnByBudgetMonth[bid][ym] || 0) + amt;
      }
    });

    /* Convert spendLatest to amounts */
    const spendByBudgetMonth = {};
    Object.entries(spendLatest).forEach(([bid, byYm]) => {
      spendByBudgetMonth[bid] = {};
      Object.entries(byYm).forEach(([ym, tx]) => {
        spendByBudgetMonth[bid][ym] = Number(tx.amount || 0);
      });
    });

    /* Active liabilities with balance > 0 */
    const activeDebt  = liabilities.filter(l => l.active !== false && Number(l.current_balance || 0) > 0);
    const debtMonthly = activeDebt.reduce((s, l) => s + Number(l.monthly_payment || 0), 0);

    return { catMap, spendByBudgetMonth, earnByBudgetMonth, monthKeys, monthLabels, activeDebt, debtMonthly };
  }

  /* ── renderStats() ── */
  function renderStats(maps) {
    const { catMap, spendByBudgetMonth, earnByBudgetMonth, monthKeys, debtMonthly } = maps;

    /* Exclude override records from stats — base records represent the budgeted plan */
    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income' && !isOverrideRecord(b);
    });
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense' && !isOverrideRecord(b);
    });

    const earnBudMo  = incBudgets.reduce((s, b) => s + mbr(b), 0);
    const spendBudMo = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const gapMo      = earnBudMo - spendBudMo - debtMonthly;

    /* Hit/miss based on current month */
    const curMo = monthKeys[monthKeys.length - 1];
    let hitCount = 0, missCount = 0;
    expBudgets.forEach(b => {
      const bAmt  = mbr(b);
      const spent = (spendByBudgetMonth[b.id] || {})[curMo] || 0;
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

  /* ── renderAnalysis() ── */
  function renderAnalysis(maps) {
    const { catMap, debtMonthly } = maps;

    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income' && !isOverrideRecord(b);
    });
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense' && !isOverrideRecord(b);
    });

    const earnBudMo  = incBudgets.reduce((s, b) => s + mbr(b), 0);
    const spendBudMo = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const gapMo      = earnBudMo - spendBudMo - debtMonthly;

    const annualEarn    = earnBudMo * 12;
    const empDed        = Math.min(annualEarn * 0.5, 100000);
    const personalAllow = 60000;
    const netTaxable    = Math.max(0, annualEarn - empDed - personalAllow);
    const taxYr         = thaiTax(netTaxable);
    const taxMo         = taxYr / 12;
    const afterTaxGap   = gapMo - taxMo;

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('bud-analysis-annual',     fmt(annualEarn));
    set('bud-analysis-emp-ded',    fmt(empDed));
    set('bud-analysis-personal',   fmt(personalAllow));
    set('bud-analysis-taxable',    fmt(netTaxable));
    set('bud-analysis-tax-yr',     fmt(taxYr));
    set('bud-analysis-tax-mo',     fmt(taxMo));

    const afterEl = el('bud-analysis-after-tax');
    if (afterEl) {
      afterEl.textContent = fmt(afterTaxGap);
      afterEl.style.color = afterTaxGap >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  /* ── renderChart() ── */
  function renderChart(maps) {
    const canvas = el('bud-bar-chart');
    if (!canvas) return;
    if (budgetChart) { budgetChart.destroy(); budgetChart = null; }

    const { catMap, spendByBudgetMonth, earnByBudgetMonth, monthKeys, monthLabels } = maps;

    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense' && !isOverrideRecord(b);
    });

    /* Per-month totals */
    const budgetPerMonth = monthKeys.map(() => expBudgets.reduce((s, b) => s + mbr(b), 0));
    const actualPerMonth = monthKeys.map(ym => {
      return expBudgets.reduce((s, b) => {
        return s + ((spendByBudgetMonth[b.id] || {})[ym] || 0);
      }, 0);
    });

    /* Accumulate if graphView === 'accum' */
    function accumulate(arr) {
      let running = 0;
      return arr.map(v => { running += v; return running; });
    }

    const budData = graphView === 'accum' ? accumulate(budgetPerMonth) : budgetPerMonth;
    const actData = graphView === 'accum' ? accumulate(actualPerMonth) : actualPerMonth;

    /* Chart title */
    const titleEl = el('bud-chart-title');
    if (titleEl) {
      if (graphPeriod === 'fy') {
        titleEl.textContent = 'FY ' + new Date().getFullYear();
      } else if (graphPeriod === 'custom' && customStart) {
        titleEl.textContent = 'Custom from ' + customStart;
      } else {
        titleEl.textContent = 'Rolling 12mo';
      }
    }

    let datasets;

    if (graphData === 'gap') {
      /* Gap = budget - actual per month */
      const gapData   = budData.map((b, i) => b - actData[i]);
      const gapColors = gapData.map(g => g >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');
      datasets = [{
        label: 'Gap (Budget − Actual)',
        data: gapData,
        backgroundColor: gapColors,
        borderRadius: 4
      }];
    } else {
      /* bgact: budget + actual side by side */
      const actualColors = actData.map((a, i) =>
        a <= budData[i] ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'
      );
      datasets = [
        {
          label: 'Budget',
          data: budData,
          backgroundColor: 'rgba(59,130,246,0.18)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Actual',
          data: actData,
          backgroundColor: actualColors,
          borderRadius: 4
        }
      ];
    }

    budgetChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: monthLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { size: 9 }, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: {
            ticks: {
              font: { size: 9 },
              callback: v => '฿' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
            }
          }
        }
      }
    });
  }

  /* ── updatePendingBar() ── */
  function updatePendingBar() {
    const count = Object.keys(pendingChanges).length;
    const bar   = el('bud-pending-bar');
    const countEl = el('bud-pending-count');
    if (bar)     bar.style.display     = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent   = count + ' change' + (count === 1 ? '' : 's');
  }

  /* ── renderGrid() — spreadsheet mode ── */
  function renderGridSps(maps) {
    const { catMap, spendByBudgetMonth, earnByBudgetMonth, monthKeys, monthLabels, activeDebt, debtMonthly } = maps;

    const cellBase  = 'font-size:0.62rem;padding:0.18rem 0.3rem;border-bottom:1px solid var(--border);white-space:nowrap;';
    const labelCell = cellBase + 'text-align:left;';
    const numCell   = cellBase + 'text-align:right;';
    const thBase    = 'font-size:0.57rem;padding:0.22rem 0.3rem;font-weight:500;color:var(--text-dim);text-align:right;white-space:nowrap;border-bottom:2px solid var(--border);';

    /* Build column headers */
    const shortMoLabels = monthKeys.map(k => {
      const [y, m] = k.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en', { month: 'short' });
    });

    const theadCols = shortMoLabels.map(lbl => `<th style="${thBase}">${esc(lbl)}</th>`).join('');
    const thead = `<thead><tr>
      <th style="${thBase}text-align:left;min-width:128px;">Item</th>
      <th style="${thBase}">Budget/mo</th>
      ${theadCols}
      <th style="${thBase}">Total</th>
    </tr></thead>`;

    function sectionRow(label, colspan) {
      return `<tr><td colspan="${colspan}" style="${labelCell}background:var(--bg-raised);font-family:var(--font-mono,monospace);font-size:0.54rem;font-weight:600;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;padding:0.36rem 0.4rem;">${esc(label)}</td></tr>`;
    }

    function subheaderRow(label, colspan) {
      return `<tr><td colspan="${colspan}" style="${labelCell}font-size:0.57rem;color:var(--text-dim);padding-left:0.6rem;background:var(--bg-surface,var(--bg-raised));">&#8627; ${esc(label.toUpperCase())}</td></tr>`;
    }

    const totalCols = 2 + monthKeys.length + 1; // Item + Budget/mo + months + Total

    /* Earn: base records only (L152 — earn rows are always read-only) */
    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income' && !isOverrideRecord(b);
    });
    /* Expense: base records only — overrides used for per-month amounts (L149, L150) */
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense' && !isOverrideRecord(b);
    });

    /* ── EARN rows — always read-only (L152) ── */
    let totalEarnBud = 0;
    const earnRowsHtml = incBudgets.map(b => {
      const bAmt = mbr(b);
      totalEarnBud += bAmt;
      const byMonth = earnByBudgetMonth[b.id] || {};
      let rowTotal = 0;

      /* Budget/mo cell — always read-only for earn (L152) */
      const budCell = `<td style="${numCell}color:var(--text-dim);">${fmt(bAmt)}</td>`;

      /* Month cells — always read-only for earn (L152) */
      const monthCells = monthKeys.map(ym => {
        const actual = byMonth[ym] || 0;
        rowTotal += actual;

        if (dataType === 'bgact') {
          const v = actual - bAmt;
          const vc = v >= 0 ? 'color:var(--green);' : 'color:var(--red);';
          const vs = v >= 0 ? '+' : '';
          return `<td style="${numCell}${vc}">${vs}${fmt(Math.abs(v))}</td>`;
        }
        if (dataType === 'bg') {
          return `<td style="${numCell}color:var(--text-dim);">${fmt(bAmt)}</td>`;
        }
        /* data: show actual — read-only for earn */
        const color = actual > bAmt ? 'color:var(--green);' : '';
        return `<td style="${numCell}${color}">${fmt(actual)}</td>`;
      }).join('');

      return `<tr>
        <td style="${labelCell}padding-left:0.8rem;">${esc(b.label || '—')}</td>
        ${budCell}
        ${monthCells}
        <td style="${numCell}font-weight:600;">${fmt(rowTotal)}</td>
      </tr>`;
    }).join('');

    /* ── EXPENSE rows grouped ── */
    const expGroups = {};
    expBudgets.forEach(b => {
      const cat = catMap[lid(b.category_id)];
      const grp = cat?.group || cat?.name || 'Other';
      if (!expGroups[grp]) expGroups[grp] = [];
      expGroups[grp].push(b);
    });

    let totalSpendBud = 0;
    const expRowsHtml = Object.entries(expGroups).map(([grpName, items]) => {
      const sub = subheaderRow(grpName, totalCols);
      const rows = items.map(b => {
        const bAmt = mbr(b);
        totalSpendBud += bAmt;
        const byMonth = spendByBudgetMonth[b.id] || {};
        let rowTotal = 0;

        /* Budget/mo cell: editable only for budget kind (base record PATCH) */
        let budCell;
        if (editMode && dataType !== 'bgact') {
          budCell = `<td style="${numCell}"><input type="text" inputmode="numeric" pattern="[0-9.]*" class="bud-cell-input"
            style="width:78px;text-align:right;font-size:0.62rem;"
            data-id="${esc(b.id)}" data-field="budget"
            value="${bAmt.toFixed(0)}"></td>`;
        } else {
          budCell = `<td style="${numCell}">${fmt(bAmt)}</td>`;
        }

        const monthCells = monthKeys.map(ym => {
          const actual = byMonth[ym] || 0;
          rowTotal += actual;

          if (dataType === 'bgact') {
            /* Variance: actual − budget, read-only */
            const v = actual - bAmt;
            const vc = v <= 0 ? 'color:var(--green);' : 'color:var(--red);';
            const vs = v >= 0 ? '+' : '';
            return `<td style="${numCell}${vc}">${vs}${fmt(Math.abs(v))}</td>`;
          }
          if (dataType === 'bg') {
            /* Per-month budget amount — uses most specific record (L149) */
            const moAmt = getBudgetAmountForMonth(b.id, ym);
            if (editMode) {
              /* data-cell-type="budget" → saveBatchChanges POSTs new override record (L150) */
              return `<td style="${numCell}"><input type="text" inputmode="numeric" pattern="[0-9.]*" class="bud-cell-input"
                style="width:72px;text-align:right;font-size:0.62rem;"
                data-id="${esc(b.id)}" data-month="${esc(ym)}" data-cell-type="budget"
                value="${moAmt.toFixed(0)}"></td>`;
            }
            return `<td style="${numCell}">${fmt(moAmt)}</td>`;
          }
          /* data: actual, editable — data-cell-type="actual" → PATCH if exists (L151) */
          if (editMode) {
            return `<td style="${numCell}"><input type="text" inputmode="numeric" pattern="[0-9.]*" class="bud-cell-input"
              style="width:72px;text-align:right;font-size:0.62rem;"
              data-id="${esc(b.id)}" data-month="${esc(ym)}" data-cell-type="actual" data-dtype="Expense"
              value="${actual.toFixed(0)}"></td>`;
          }
          const over = actual > bAmt;
          return `<td style="${numCell}${over ? 'color:var(--red);' : ''}">${fmt(actual)}</td>`;
        }).join('');

        return `<tr>
          <td style="${labelCell}padding-left:1.2rem;">${esc(b.label || '—')}</td>
          ${budCell}
          ${monthCells}
          <td style="${numCell}font-weight:600;">${fmt(rowTotal)}</td>
        </tr>`;
      }).join('');

      return sub + rows;
    }).join('');

    /* ── DEBT PAYBACK rows — monthly_payment in each month, stops at payoff ── */
    const nowYM = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    const debtRowsHtml = activeDebt.map(l => {
      const mp      = Number(l.monthly_payment || 0);
      const balance = Number(l.current_balance || 0);
      let remaining = balance;

      const monthCells = monthKeys.map(ym => {
        if (mp === 0) return `<td style="${numCell}color:var(--text-dim);">—</td>`;
        if (ym < nowYM) {
          return `<td style="${numCell}color:var(--text-dim);">${fmt(mp)}</td>`;
        }
        if (remaining <= 0) return `<td style="${numCell}color:var(--text-dim);font-size:0.56rem;">✓</td>`;
        const pay = Math.min(mp, remaining);
        remaining -= pay;
        return `<td style="${numCell}">${fmt(pay)}</td>`;
      }).join('');

      return `<tr>
        <td style="${labelCell}padding-left:0.8rem;">${esc(l.name || '—')}</td>
        <td style="${numCell}">${fmt(mp)}</td>
        ${monthCells}
        <td style="${numCell}color:var(--text-dim);font-size:0.58rem;">${fmt(balance)}</td>
      </tr>`;
    }).join('');

    /* ── GAP rows ── */
    const gapBud = totalEarnBud - totalSpendBud - debtMonthly;
    const gapBudColor = gapBud >= 0 ? 'var(--green)' : 'var(--red)';
    const gapBudMonthCells = monthKeys.map(() =>
      `<td style="${numCell}color:${gapBudColor};font-weight:600;">${fmt(gapBud)}</td>`
    ).join('');

    let totalActGap = 0;
    let cumActGap = 0;
    const gapActMonthCells = [], gapCumMonthCells = [];
    monthKeys.forEach(ym => {
      const earnAct  = incBudgets.reduce((s, b) => s + ((earnByBudgetMonth[b.id]  || {})[ym] || 0), 0);
      const spendAct = expBudgets.reduce((s, b) => s + ((spendByBudgetMonth[b.id] || {})[ym] || 0), 0);
      const hasData  = earnAct > 0 || spendAct > 0;
      if (!hasData) {
        gapActMonthCells.push(`<td style="${numCell}color:var(--text-dim);">—</td>`);
        gapCumMonthCells.push(`<td style="${numCell}color:var(--text-dim);">—</td>`);
        return;
      }
      const gapAct = earnAct - spendAct;
      totalActGap += gapAct;
      cumActGap   += gapAct;
      const gc  = gapAct  >= 0 ? 'var(--green)' : 'var(--red)';
      const gcc = cumActGap >= 0 ? 'var(--green)' : 'var(--red)';
      gapActMonthCells.push(`<td style="${numCell}color:${gc};font-weight:600;">${fmt(gapAct)}</td>`);
      gapCumMonthCells.push(`<td style="${numCell}color:${gcc};font-size:0.58rem;">${fmt(cumActGap)}</td>`);
    });

    const gapRow = `
      <tr>
        <td style="${labelCell}padding-left:0.6rem;font-size:0.58rem;color:var(--text-dim);">Budget Plan</td>
        <td style="${numCell}font-weight:700;color:${gapBudColor};">${fmt(gapBud)}</td>
        ${gapBudMonthCells}
        <td style="${numCell}font-weight:700;color:${gapBudColor};">${fmt(gapBud * 12)}</td>
      </tr>
      <tr>
        <td style="${labelCell}padding-left:0.6rem;font-size:0.58rem;color:var(--text-dim);">Actual</td>
        <td style="${numCell}color:var(--text-dim);">—</td>
        ${gapActMonthCells.join('')}
        <td style="${numCell}font-weight:700;color:${totalActGap >= 0 ? 'var(--green)' : 'var(--red)'};">${fmt(totalActGap)}</td>
      </tr>
      <tr>
        <td style="${labelCell}padding-left:0.6rem;font-size:0.58rem;color:var(--text-dim);font-style:italic;">Cumulative</td>
        <td style="${numCell}color:var(--text-dim);">—</td>
        ${gapCumMonthCells.join('')}
        <td style="${numCell}color:var(--text-dim);">—</td>
      </tr>`;

    /* ── Assemble ── */
    const noInc  = `<tr><td colspan="${totalCols}" style="${labelCell}color:var(--text-dim);">No income budgets</td></tr>`;
    const noExp  = `<tr><td colspan="${totalCols}" style="${labelCell}color:var(--text-dim);">No expense budgets</td></tr>`;
    const noDebt = `<tr><td colspan="${totalCols}" style="${labelCell}color:var(--text-dim);">No active liabilities</td></tr>`;

    return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
      <table style="width:100%;border-collapse:collapse;font-size:0.62rem;">
        ${thead}
        <tbody>
          ${sectionRow('EARN', totalCols)}
          ${earnRowsHtml || noInc}
          ${sectionRow('EXPENSES', totalCols)}
          ${expRowsHtml || noExp}
          ${sectionRow('DEBT PAYBACK', totalCols)}
          ${debtRowsHtml || noDebt}
          ${sectionRow('GAP', totalCols)}
          ${gapRow}
        </tbody>
      </table>
    </div>`;
  }

  /* ── renderGrid() — card mode ── */
  function renderGridCard(maps) {
    const { catMap, spendByBudgetMonth, monthKeys } = maps;

    const curMo = monthKeys[monthKeys.length - 1];

    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense' && !isOverrideRecord(b);
    });

    if (!expBudgets.length) {
      return '<p style="color:var(--text-dim);padding:1rem;">No expense budgets</p>';
    }

    const cards = expBudgets.map(b => {
      const bAmt   = mbr(b);
      const actual = (spendByBudgetMonth[b.id] || {})[curMo] || 0;
      const varAmt = bAmt - actual;
      const ratio  = bAmt > 0 ? Math.min(actual / bAmt, 1) : 0;
      const over   = actual > bAmt;
      const barColor = over ? 'var(--red)' : ratio >= 0.8 ? 'var(--yellow,#f59e0b)' : 'var(--green)';
      const dot    = over ? '🔴' : ratio >= 0.8 ? '🟡' : '🟢';

      return `<div style="background:var(--bg-raised);border-radius:8px;padding:0.75rem 1rem;display:flex;flex-direction:column;gap:0.35rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.82rem;font-weight:600;">${esc(b.label || '—')}</span>
          <span style="font-size:1rem;">${dot}</span>
        </div>
        <div style="font-size:0.72rem;color:var(--text-dim);">Budget/mo: ${fmt(bAmt)}</div>
        <div style="font-size:0.72rem;">This month: <span style="color:${over ? 'var(--red)' : 'inherit'};font-weight:600;">${fmt(actual)}</span></div>
        <div style="font-size:0.72rem;color:${varAmt >= 0 ? 'var(--green)' : 'var(--red)'};">Variance: ${varAmt >= 0 ? '+' : ''}${fmt(varAmt)}</div>
        <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;">
          <div style="background:${barColor};height:100%;width:${(ratio * 100).toFixed(1)}%;transition:width 0.3s;"></div>
        </div>
      </div>`;
    }).join('');

    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;padding:0.25rem 0;">${cards}</div>`;
  }

  /* ── renderGrid() dispatcher ── */
  function renderGrid(maps) {
    const zone = el('bud-grid');
    if (!zone) return;

    if (dispView === 'card') {
      zone.innerHTML = renderGridCard(maps);
    } else {
      zone.innerHTML = renderGridSps(maps);
    }

    /* Wire up edit mode input listeners after DOM update */
    if (editMode && dispView === 'sps') {
      zone.querySelectorAll('.bud-cell-input').forEach(input => {
        input.addEventListener('change', () => {
          const id       = input.dataset.id;
          const field    = input.dataset.field;
          const monthKey = input.dataset.month;
          const cellType = input.dataset.cellType; // 'budget' | 'actual'
          const dtype    = input.dataset.dtype;
          const rawVal   = input.value.replace(/[^0-9.]/g, '');
          const newVal   = rawVal === '' ? 0 : Number(rawVal);

          const bud   = budgets.find(b => b.id === id);
          const label = bud ? (bud.label || id) : id;

          if (field === 'budget') {
            /* Budget/mo column — PATCH base record */
            const oldVal = bud ? mbr(bud) : 0;
            pendingChanges['budget:' + id] = { kind: 'budget', id, newVal, label, oldVal };

          } else if (cellType === 'budget' && monthKey) {
            /* Per-month budget cell — POST new override record (L150) */
            pendingChanges['budget-month:' + id + ':' + monthKey] = {
              kind: 'budget-month', id, monthKey, newVal, label
            };

          } else if (cellType === 'actual' && monthKey && dtype) {
            /* Actual transaction cell — PATCH if exists, else POST (L151) */
            const maps2  = computeMaps();
            const byMo   = dtype === 'Income'
              ? (maps2.earnByBudgetMonth[id]  || {})
              : (maps2.spendByBudgetMonth[id] || {});
            const oldVal = byMo[monthKey] || 0;
            /* Skip if value unchanged or zero (API rejects amount=0 on POST) */
            if (newVal === oldVal || (newVal === 0 && !oldVal)) {
              delete pendingChanges['actual:' + id + ':' + monthKey];
            } else {
              pendingChanges['actual:' + id + ':' + monthKey] = {
                kind: 'actual', id, monthKey, newVal, label, oldVal, dataType: dtype
              };
            }
          }

          updatePendingBar();
        });
      });
    }
  }

  /* ── saveBatchChanges() ── */
  async function saveBatchChanges() {
    const entries = Object.values(pendingChanges);
    if (!entries.length) return;

    const requests = entries.map(async e => {
      if (e.kind === 'budget') {
        /* PATCH base budget record (Budget/mo column only) */
        const bud    = budgets.find(b => b.id === e.id);
        const period = bud ? (bud.period || 'Monthly') : 'Monthly';
        let saveAmount = Math.round(e.newVal);
        if (period === 'Annual')      saveAmount = Math.round(e.newVal * 12);
        else if (period === '3x-year') saveAmount = Math.round((e.newVal * 12) / 3);
        else if (period === '6x-year') saveAmount = Math.round((e.newVal * 12) / 6);

        const r = await fetch('/api/budgets/' + e.id, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: saveAmount })
        });
        if (!r.ok) throw new Error('Budget PATCH failed: ' + r.status + ' for ' + e.label);

      } else if (e.kind === 'budget-month') {
        /* PATCH existing override if found, else POST new (L150) */
        const bud = budgets.find(b => b.id === e.id);
        const existingOverride = budgets.find(b =>
          isOverrideRecord(b) &&
          b.label === bud?.label &&
          lid(b.category_id) === lid(bud?.category_id) &&
          b.start_date?.slice(0, 7) === e.monthKey
        );
        const [y, m] = e.monthKey.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        let r;
        if (existingOverride) {
          r = await fetch('/api/budgets/' + existingOverride.id, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: Math.round(e.newVal) })
          });
        } else {
          r = await fetch('/api/budgets', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label:       bud?.label,
              category_id: lid(bud?.category_id),
              amount:      Math.round(e.newVal),
              period:      'Monthly',
              start_date:  e.monthKey + '-01',
              end_date:    e.monthKey + '-' + String(lastDay).padStart(2, '0'),
              active:      true
            })
          });
        }
        if (!r.ok) throw new Error('Budget override save failed: ' + r.status + ' for ' + e.label);

      } else {
        /* Actual transaction — PATCH if existing tx found, else POST (L151) */
        const existingTx = txData.find(t =>
          lid(t.budget_id) === e.id &&
          (t.date || '').slice(0, 7) === e.monthKey
        );

        if (existingTx) {
          if (e.newVal === 0) return; /* zero clears handled by not saving */
          const r = await fetch('/api/transactions/' + existingTx.id, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: e.newVal })
          });
          if (!r.ok) throw new Error('Transaction PATCH failed: ' + r.status + ' for ' + e.label);
        } else {
          if (!e.newVal) return; /* skip zero/falsy — API rejects amount=0 */
          const r = await fetch('/api/transactions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              budget_id:   e.id,
              amount:      e.newVal,
              date:        e.monthKey + '-01',
              type:        e.dataType,
              description: 'mass update by owner',
              source:      'Manual'
            })
          });
          if (!r.ok) throw new Error('Transaction POST failed: ' + r.status + ' for ' + e.label);
        }
      }
    });

    try {
      const results = await Promise.allSettled(requests);
      const failed  = results.filter(r => r.status === 'rejected');
      if (failed.length === 0) {
        showFlash('Saved ' + entries.length + ' change' + (entries.length === 1 ? '' : 's') + ' ✓');
      } else {
        showFlash(failed.length + ' save(s) failed — check console', 'error');
        failed.forEach(r => console.error(r.reason));
      }
    } catch (err) {
      showFlash('Save error: ' + err.message, 'error');
      console.error('Save error:', err);
    }

    pendingChanges = {};
    updatePendingBar();
    await loadAndRender();
  }

  /* ── discardChanges() ── */
  function discardChanges() {
    pendingChanges = {};
    updatePendingBar();
    const maps = computeMaps();
    renderGrid(maps);
  }

  /* ── toggleEditMode() ── */
  function toggleEditMode() {
    /* bgact is read-only variance view — auto-switch to 'data' when enabling edit */
    if (!editMode && dataType === 'bgact') {
      dataType = 'data';
      const dtZone = el('bud-datatype-toggle');
      if (dtZone) {
        dtZone.querySelectorAll('[data-dtype]').forEach(b => b.classList.remove('active'));
        const dataBtn = dtZone.querySelector('[data-dtype="data"]');
        if (dataBtn) dataBtn.classList.add('active');
      }
    }
    editMode = !editMode;
    const btn = el('bud-edit-btn');
    if (btn) btn.textContent = 'Edit Mode: ' + (editMode ? 'ON' : 'OFF');
    if (!editMode) {
      pendingChanges = {};
      updatePendingBar();
    }
    const maps = computeMaps();
    renderGrid(maps);
  }

  /* ── initFilters() ── */
  function initFilters() {
    function wireGroup(containerId, dataAttr, getCurrentState, setState, onChanged) {
      const zone = el(containerId);
      if (!zone) return;
      zone.querySelectorAll('[data-' + dataAttr + ']').forEach(btn => {
        btn.addEventListener('click', () => {
          setState(btn.dataset[dataAttr]);
          zone.querySelectorAll('[data-' + dataAttr + ']').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onChanged();
        });
      });
      const initBtn = zone.querySelector('[data-' + dataAttr + '="' + getCurrentState() + '"]');
      if (initBtn) initBtn.classList.add('active');
    }

    wireGroup('bud-graphview-toggle', 'gview',
      () => graphView,
      v => { graphView = v; },
      () => { const m = computeMaps(); renderChart(m); }
    );

    wireGroup('bud-graphperiod-toggle', 'gperiod',
      () => graphPeriod,
      v => { graphPeriod = v; },
      () => {
        const customInput = el('bud-custom-start');
        if (customInput) customInput.style.display = graphPeriod === 'custom' ? '' : 'none';
        if (graphPeriod === 'custom') {
          loadAndRender().catch(console.error);
        } else {
          const m = computeMaps(); renderChart(m); renderGrid(m); renderStats(m);
        }
      }
    );

    const customInput = el('bud-custom-start');
    if (customInput) {
      customInput.style.display = 'none';
      customInput.addEventListener('change', () => {
        customStart = customInput.value || null;
        if (graphPeriod === 'custom') loadAndRender().catch(console.error);
      });
    }

    wireGroup('bud-graphdata-toggle', 'gdata',
      () => graphData,
      v => { graphData = v; },
      () => { const m = computeMaps(); renderChart(m); }
    );

    wireGroup('bud-dispview-toggle', 'dview',
      () => dispView,
      v => { dispView = v; },
      () => { const m = computeMaps(); renderGrid(m); }
    );

    wireGroup('bud-datatype-toggle', 'dtype',
      () => dataType,
      v => { dataType = v; },
      () => { const m = computeMaps(); renderGrid(m); }
    );

    const editBtn = el('bud-edit-btn');
    if (editBtn) editBtn.addEventListener('click', toggleEditMode);

    const saveBtn    = el('bud-save-changes-btn');
    const discardBtn = el('bud-discard-btn');
    if (saveBtn)    saveBtn.addEventListener('click', () => saveBatchChanges().catch(console.error));
    if (discardBtn) discardBtn.addEventListener('click', discardChanges);

    const analysisTog  = el('bud-analysis-toggle');
    const analysisBody = el('bud-analysis-body');
    if (analysisTog && analysisBody) {
      analysisTog.style.cursor = 'pointer';
      analysisTog.addEventListener('click', () => {
        const isHidden = analysisBody.style.display === 'none' || analysisBody.hidden;
        if (isHidden) {
          analysisBody.style.display = '';
          analysisBody.hidden = false;
        } else {
          analysisBody.style.display = 'none';
        }
      });
    }

    const bar = el('bud-pending-bar');
    if (bar) bar.style.display = 'none';
  }

  /* ── loadAndRender() ── */
  async function loadAndRender() {
    /* FY: always fetch from Jan 1 of current year to ensure Jan is included (L153) */
    let start;
    if (graphPeriod === 'fy') {
      start = new Date().getFullYear() + '-01-01';
    } else if (graphPeriod === 'custom' && customStart) {
      start = customStart + '-01';
    } else {
      start = isoMonth(11);
    }

    const [txR, bR, cR, lR] = await Promise.allSettled([
      apiFetch('/api/transactions?start=' + start + '&limit=500'),
      apiFetch('/api/budgets?all=true'),
      apiFetch('/api/categories'),
      apiFetch('/api/liabilities?all=true')
    ]);

    txData      = txR.status === 'fulfilled' ? (txR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    budgets     = bR.status  === 'fulfilled' ? (bR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];
    categories  = cR.status  === 'fulfilled' ? (cR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];
    liabilities = lR.status  === 'fulfilled' ? (lR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];

    const maps = computeMaps();
    renderStats(maps);
    renderAnalysis(maps);
    renderChart(maps);
    renderGrid(maps);
  }

  /* ── init() ── */
  function init() {
    if (initialized) return;
    initialized = true;
    initFilters();
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'budget') init(); });
  if (el('panel-budget')?.classList.contains('active')) init();
})();
