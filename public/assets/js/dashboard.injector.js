/* dashboard.injector.js — Chaijohn Dashboard */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  let activeRange  = '1m';
  let activePanel  = 't1';
  let contentYear  = new Date().getFullYear();
  let t2ContentFilter = 'group'; // F6 T2 content filter
  let txData       = [];
  let budgets      = [];
  let budgetMap    = {};
  let liabilities  = [];
  let categories   = [];
  let t1Chart, t2Chart, t3Chart, t4Chart, playroomChart;
  let t2DrillGroup = null;
  let playroomBudgetId = null;
  let t4Range      = '1m';
  let dismissedAlerts = new Set();
  let syncPoint    = null;
  let t1ViewMode   = 'netflow';

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
  function dateOffset(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
  function daysLeftInMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  }

  /* ── API ── */
  async function api(path, opts) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  }

  /* ── E4: Sync point ── */
  async function loadSyncPoint() {
    try {
      const res = await api('/api/cashflow-sync');
      syncPoint = res.syncPoint || null;
      updateSyncInfo();
    } catch { syncPoint = null; }
  }

  function updateSyncInfo() {
    const el = document.getElementById('sync-info');
    if (!el) return;
    if (syncPoint) {
      const d = new Date(syncPoint.date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
      el.textContent = `📍 ${fmt(syncPoint.amount)} on ${d}`;
    } else {
      el.textContent = '';
    }
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
    budgetMap   = {};
    budgets.forEach(b => { budgetMap[b.id] = b; });
    liabilities = (liabRes.records    || []).map(r => ({ id: r.id, ...r.fields }));
    categories  = (catRes.records     || []).map(r => ({ id: r.id, ...r.fields }));

    renderAlerts(nowYM);
    renderT1(start);
    renderT2();
    renderT3();
    renderBudgetPanel(t4Range);
    buildPlayroomCategoryOptions();
    loadContentZone(activePanel);
  }

  /* ── Helpers ── */
  function linkedId(field) {
    if (!field) return null;
    return Array.isArray(field) ? (field[0] || null) : field;
  }
  function resolveCatId(t) {
    const bid = linkedId(t.budget_id);
    const budget = bid ? budgetMap[bid] : null;
    return budget ? linkedId(budget.category_id) : linkedId(t.category_id);
  }
  function groupSum(arr, keyFn) {
    const map = {};
    arr.forEach(item => {
      const k = keyFn(item);
      if (k) map[k] = (map[k] || 0) + Number(item.amount || 0);
    });
    return map;
  }

  /* ── F5-F6: Graph panel clicks ── */
  function initGraphPanels() {
    document.querySelectorAll('.graph-panel').forEach(panel => {
      panel.addEventListener('click', e => {
        // Don't trigger panel switch when clicking buttons inside the panel
        if (e.target.closest('button') || e.target.closest('input')) return;
        const panelId = panel.dataset.panel;
        activatePanel(panelId);
      });
    });

    // T4 range buttons (inside T4 graph panel)
    document.querySelectorAll('[data-t4-range]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        t4Range = btn.dataset.t4Range;
        document.querySelectorAll('[data-t4-range]').forEach(b =>
          b.classList.toggle('active', b.dataset.t4Range === t4Range));
        renderBudgetPanel(t4Range);
      });
    });
  }

  function activatePanel(panelId) {
    activePanel = panelId;
    document.querySelectorAll('.graph-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.panel === panelId));
    loadContentZone(panelId);
  }

  /* ── F6: Content zone ── */
  function loadContentZone(panelId) {
    renderContentControls(panelId);
    const body = document.getElementById('content-body');
    if (!body) return;
    if (panelId === 't1') renderT1Content(body);
    else if (panelId === 't2') renderT2Content(body);
    else if (panelId === 't3') renderT3Content(body);
    else if (panelId === 't4') renderT4Content(body);
  }

  function renderContentControls(panelId) {
    const ctrl = document.getElementById('content-controls');
    if (!ctrl) return;

    const isYearPanel = panelId === 't3' || panelId === 't4';

    let html = '';

    if (isYearPanel) {
      // Year selector for T3/T4
      const years = [];
      for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 3; y--) years.push(y);
      html += `<div style="display:flex;align-items:center;gap:0.35rem">
        <span style="font-size:0.78rem;color:var(--text-secondary)">Year:</span>
        <select id="content-year-sel"
          style="font-size:0.82rem;padding:0.25rem 0.5rem;border:1px solid var(--border);
          border-radius:4px;background:var(--bg-card);color:var(--text-primary);font-family:inherit">
          ${years.map(y => `<option value="${y}" ${y === contentYear ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>`;
    } else {
      // Period toggle for T1/T2
      html += `<div class="period-toggle">
        <button class="period-btn${activeRange === '1m' ? ' active' : ''}" data-content-range="1m">1M</button>
        <button class="period-btn${activeRange === '3m' ? ' active' : ''}" data-content-range="3m">3M</button>
        <button class="period-btn${activeRange === '6m' ? ' active' : ''}" data-content-range="6m">6M</button>
        <button class="period-btn${activeRange === '12m' ? ' active' : ''}" data-content-range="12m">12M</button>
      </div>`;
    }

    if (panelId === 't2') {
      html += `<div class="period-toggle">
        <button class="period-btn${t2ContentFilter === 'group'   ? ' active' : ''}" data-t2-filter="group">By Group</button>
        <button class="period-btn${t2ContentFilter === 'all'     ? ' active' : ''}" data-t2-filter="all">All</button>
        <button class="period-btn${t2ContentFilter === 'expense' ? ' active' : ''}" data-t2-filter="expense">Expense</button>
        <button class="period-btn${t2ContentFilter === 'loan'    ? ' active' : ''}" data-t2-filter="loan">Loan Payback</button>
        <button class="period-btn${t2ContentFilter === 'project' ? ' active' : ''}" data-t2-filter="project">Project</button>
      </div>`;
    }

    // Action buttons
    html += `<div style="margin-left:auto;display:flex;gap:0.4rem">
      <button class="btn btn-sm" id="open-simulator"
        style="background:#7c3aed;color:#fff;font-size:0.78rem;padding:0.3rem 0.65rem">🔬 Simulator</button>
      <button class="btn btn-sm" id="open-playroom"
        style="background:#0891b2;color:#fff;font-size:0.78rem;padding:0.3rem 0.65rem">🎮 Playroom</button>
    </div>`;

    ctrl.innerHTML = html;

    // Wire content range buttons
    ctrl.querySelectorAll('[data-content-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeRange = btn.dataset.contentRange;
        t2DrillGroup = null;
        loadAll().catch(console.error);
      });
    });

    // Wire T2 filter buttons
    ctrl.querySelectorAll('[data-t2-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        t2ContentFilter = btn.dataset.t2Filter;
        renderContentControls('t2');
        const body = document.getElementById('content-body');
        if (body) renderT2Content(body);
      });
    });

    // Wire year selector
    const yearSel = ctrl.querySelector('#content-year-sel');
    yearSel?.addEventListener('change', () => {
      contentYear = parseInt(yearSel.value);
      const body = document.getElementById('content-body');
      if (body) {
        if (activePanel === 't3') renderT3Content(body);
        if (activePanel === 't4') renderT4Content(body);
      }
    });

    // Re-wire modal buttons (they get re-rendered each time)
    ctrl.querySelector('#open-simulator')?.addEventListener('click', () =>
      document.getElementById('sim-backdrop')?.classList.add('open'));
    ctrl.querySelector('#open-playroom')?.addEventListener('click', () => {
      document.getElementById('playroom-backdrop')?.classList.add('open');
      document.getElementById('playroom-panel')?.classList.add('open');
    });
  }

  /* ── F6: T1 Content — Cashflow Breakdown ── */
  function renderT1Content(body) {
    const start = rangeStart(activeRange);
    const end   = new Date().toISOString().split('T')[0];

    const periodTx = txData.filter(t => t.date >= start && t.date <= end);

    const cashIn  = periodTx.filter(t => t.type === 'Income' && t.source !== 'LiabilityCreation');
    const loanIn  = periodTx.filter(t => t.source === 'LiabilityCreation');
    const trueExp = periodTx.filter(t => t.type === 'Expense' && t.source !== 'LiabilityPayment');
    const loanPay = periodTx.filter(t => t.source === 'LiabilityPayment');

    const totalIn  = [...cashIn, ...loanIn].reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalOut = [...trueExp, ...loanPay].reduce((s, t) => s + Number(t.amount || 0), 0);
    const netFlow  = totalIn - totalOut;

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    function miniCards(list, isIncome) {
      if (list.length === 0) return `<div style="grid-column:1/-1;color:var(--text-secondary);font-size:0.78rem">None</div>`;
      return list.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(t => {
        const cat   = catMap[resolveCatId(t)];
        const label = t.description || t.entity || '—';
        const sub   = t.date + (cat ? ' · ' + cat.name : '') + (t.entity && !t.description ? '' : t.entity ? ' · ' + t.entity : '');
        const clr   = isIncome ? '#22c55e' : '#ef4444';
        return `<div class="tx-mini-card">
          <div style="min-width:0;flex:1">
            <div style="font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>
            <div style="font-size:0.64rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</div>
          </div>
          <span style="font-weight:700;color:${clr};font-size:0.8rem;white-space:nowrap;flex-shrink:0">
            ${isIncome ? '+' : '-'}${fmt(t.amount)}
          </span>
        </div>`;
      }).join('');
    }

    function sectionLabel(text) {
      return `<div style="grid-column:1/-1;font-size:0.7rem;font-weight:700;color:var(--text-secondary);
        text-transform:uppercase;letter-spacing:0.05em;padding:0.3rem 0 0.1rem">${text}</div>`;
    }

    body.innerHTML = `
      <div class="cashflow-total" style="margin-bottom:0.5rem">
        <span style="color:#22c55e">In: ${fmt(totalIn)}</span>
        <span style="color:${netFlow >= 0 ? '#22c55e' : '#ef4444'};font-weight:700">Net ${fmt(netFlow)}</span>
        <span style="color:#ef4444">Out: ${fmt(totalOut)}</span>
      </div>

      <div class="tx-mini-grid">
        ${sectionLabel('💚 Cash In')}
        ${miniCards(cashIn, true)}
        ${loanIn.length > 0 ? sectionLabel('Loans Received') + miniCards(loanIn, true) : ''}
        ${sectionLabel('🔴 Cash Out')}
        ${miniCards(trueExp, false)}
        ${loanPay.length > 0 ? sectionLabel('Loan Repayments') + miniCards(loanPay, false) : ''}
      </div>`;
  }

  /* ── F6: T2 Content — Expense Intelligence ── */
  function renderT2Content(body) {
    const nowYM = currentYM();
    const start = rangeStart(activeRange);

    const periodExp = txData.filter(t =>
      t.type === 'Expense' && t.date >= start && t.date <= new Date().toISOString().split('T')[0]
    );

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const spendByCat = groupSum(periodExp, t => resolveCatId(t));

    // Filter budgets based on t2ContentFilter
    let visibleBudgets = budgets.filter(b => b.active !== false && b.active !== 0);
    if (t2ContentFilter === 'expense') {
      visibleBudgets = visibleBudgets.filter(b => {
        const cat = catMap[linkedId(b.category_id)];
        return cat?.type === 'Expense';
      });
    } else if (t2ContentFilter === 'loan') {
      visibleBudgets = visibleBudgets.filter(b => {
        const cat = catMap[linkedId(b.category_id)];
        return cat?.type === 'Loan';
      });
    }

    const withData = visibleBudgets.map(b => {
      const catId  = linkedId(b.category_id);
      const cat    = catMap[catId] || {};
      const spent  = spendByCat[catId] || 0;
      const period = b.period || 'Monthly';
      const limit  = period === 'Annual' ? Number(b.amount || 0) / 12 : Number(b.amount || 0);
      const label  = b.label || cat.name || 'Budget';
      const p      = pct(spent, limit);
      return { b, catId, cat, spent, limit, p, label, period };
    }).sort((a, b) => b.p - a.p);

    // Find unbudgeted expenses
    const budgetedCatIds = new Set(visibleBudgets.map(b => linkedId(b.category_id)).filter(Boolean));
    const unbudgeted = periodExp.filter(t => {
      if (linkedId(t.budget_id)) return false;
      const cid = resolveCatId(t);
      return !cid || !budgetedCatIds.has(cid);
    });
    const unbudgetedTotal = unbudgeted.reduce((s, t) => s + Number(t.amount || 0), 0);

    const overCount    = withData.filter(x => x.p >= 100).length;
    const totalSpent   = withData.reduce((s, x) => s + x.spent, 0);

    function periodBadge(period) {
      if (!period || period === 'Monthly') return '';
      if (period === 'Annual') return `<span class="period-badge period-badge-annual">Annual÷12</span>`;
      if (period === 'One-time') return `<span class="period-badge period-badge-onetime">One-time</span>`;
      return `<span class="period-badge period-badge-annual">${period}</span>`;
    }

    // ── Group view (default) ──────────────────────────────────────────
    if (t2ContentFilter === 'group') {
      const grpMap = {};
      withData.forEach(({ cat, spent, limit, p }) => {
        const g = cat.group || 'Other';
        if (!grpMap[g]) grpMap[g] = { name: g, spent: 0, totalLimit: 0, count: 0, worst: 0 };
        grpMap[g].spent      += spent;
        grpMap[g].totalLimit += limit;
        grpMap[g].count++;
        grpMap[g].worst = Math.max(grpMap[g].worst, p);
      });
      const grps = Object.values(grpMap).sort((a, b) => b.totalLimit - a.totalLimit);

      body.innerHTML = `
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem">
          ${overCount > 0 ? `<span style="color:#ef4444;font-weight:700">${overCount} over</span> · ` : ''}
          ${grps.length} groups · Total spent ${fmt(totalSpent)}
        </div>
        <div style="display:flex;gap:0.4rem;height:150px;align-items:stretch">
          ${grps.map(g => {
            const gp  = pct(g.spent, g.totalLimit);
            const clr = g.worst >= 100 ? '#ef4444' : g.worst >= 80 ? '#f59e0b' : '#22c55e';
            return `<div style="flex:${Math.max(g.totalLimit,1)};border:1px solid var(--border);border-radius:var(--radius);
              padding:0.5rem 0.55rem;background:var(--bg-card);border-top:3px solid ${clr};
              display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;min-width:0">
              <div>
                <div style="font-weight:700;font-size:0.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</div>
                <div style="font-size:0.62rem;color:var(--text-secondary)">${g.count} budget${g.count > 1 ? 's' : ''}</div>
              </div>
              <div>
                <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:0.22rem">
                  <div style="height:100%;width:${Math.min(gp,100)}%;background:${clr};border-radius:2px"></div>
                </div>
                <div style="font-size:0.62rem;display:flex;justify-content:space-between;gap:0.2rem">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmt(g.spent)}</span>
                  <span style="color:${clr};font-weight:700;flex-shrink:0">${gp}%</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right">${fmt(g.totalLimit)}</span>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      return;
    }

    // Sort by budget amount desc for mosaic visual hierarchy
    const mosaicData = [...withData].sort((a, b) => b.limit - a.limit);
    const maxLimit   = mosaicData.length > 0 ? mosaicData[0].limit : 1;
    // sqrt scaling: large budgets are taller, small ones still readable, min 78px
    const cardH = (limit) => Math.max(78, Math.round(Math.sqrt(limit / maxLimit) * 200));

    body.innerHTML = `
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.6rem">
        ${overCount > 0 ? `<span style="color:#ef4444;font-weight:700">${overCount} over</span> · ` : ''}
        ${unbudgeted.length > 0 ? `${unbudgeted.length} unbudgeted · ` : ''}
        Total spent ${fmt(totalSpent)}
      </div>

      ${mosaicData.length === 0 ? '<div class="content-card" style="color:var(--text-secondary)">No budgets match filter.</div>' : ''}

      <div class="budget-mosaic">
        ${mosaicData.map(({ cat, spent, limit, p, label, period }) => {
          const cls = p >= 100 ? 'over' : p >= 80 ? 'warn' : 'ok';
          const clr = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#22c55e';
          const h   = cardH(limit);
          return `<div class="budget-mosaic-card" style="border-left:3px solid ${clr};min-height:${h}px">
            <div>
              <div style="font-size:0.78rem;font-weight:700;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${label}${periodBadge(period)}
              </div>
              ${cat.group ? `<div style="font-size:0.62rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat.group}</div>` : ''}
            </div>
            <div>
              <div class="meter-bar-bg" style="height:5px;margin-bottom:0.2rem">
                <div class="meter-bar-fill ${cls}" style="width:${Math.min(p, 100)}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.64rem;color:var(--text-secondary)">
                <span>${fmt(spent)}</span>
                <span style="color:${clr};font-weight:700">${p}%</span>
                <span>${fmt(limit)}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      ${unbudgeted.length > 0 ? `
        <div style="font-size:0.8rem;font-weight:700;color:#f59e0b;margin:0.75rem 0 0.35rem">
          ⚡ Unbudgeted — ${fmt(unbudgetedTotal)}
        </div>
        <div class="budget-mosaic">
          ${unbudgeted.slice(0, 10).map(t => {
            const cat = catMap[resolveCatId(t)];
            return `<div class="budget-mosaic-card" style="border-left:3px solid #f59e0b;min-height:62px">
              <div style="font-size:0.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.description || t.entity || '—'}</div>
              <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary)">
                <span>${t.date}${cat ? ' · ' + cat.name : ''}</span>
                <span style="color:#ef4444;font-weight:700">-${fmt(t.amount)}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : ''}`;
  }

  /* ── F6: T3 Content — Debt Overview ── */
  function renderT3Content(body) {
    const active = liabilities
      .filter(l => l.active !== false)
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0));

    const totalDebt    = active.reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const monthlyObl   = active.reduce((s, l) => s + Number(l.monthly_payment || 0), 0);

    if (active.length === 0) {
      body.innerHTML = '<div class="content-card" style="color:var(--text-secondary)">No active liabilities.</div>';
      return;
    }

    body.innerHTML = `
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.6rem">
        Total debt: ${fmt(totalDebt)} · Monthly: ${fmt(monthlyObl)}
      </div>
      <div class="liab-content-grid">
      ${active.map(l => {
        const bal    = Number(l.current_balance || 0);
        const loan   = Number(l.loan_size || bal);
        const paidPct = loan > 0 ? Math.round((1 - bal / loan) * 100) : 0;
        return `
          <div class="liab-content-card">
            <div class="liab-content-header" data-liab-toggle="${l.id}">
              <div>
                <div style="font-size:0.9rem;font-weight:700">${l.name}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">
                  ${l.creditor_type || ''} · ${l.interest_rate || 0}% p.a.
                </div>
                <div style="height:5px;background:var(--border);border-radius:3px;
                  margin-top:0.4rem;overflow:hidden;width:100%">
                  <div style="height:100%;width:${paidPct}%;background:#22c55e;border-radius:3px"></div>
                </div>
                <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.1rem">${paidPct}% paid off</div>
              </div>
              <div style="text-align:right">
                <div style="color:#ef4444;font-weight:700;font-size:1rem">${fmt(bal)}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary)">of ${fmt(loan)}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.2rem">
                  Monthly: ${fmt(l.monthly_payment)}
                </div>
                <span style="font-size:0.7rem;color:var(--color-primary)">▼ history</span>
              </div>
            </div>
            <div class="liab-content-body" id="liab-hist-${l.id}">
              <div style="color:var(--text-secondary);font-size:0.82rem">Click to load history…</div>
            </div>
          </div>`;
      }).join('')}
      </div>`;

    // Wire toggles
    body.querySelectorAll('[data-liab-toggle]').forEach(header => {
      let loaded = false;
      header.addEventListener('click', async () => {
        const liabId  = header.dataset.liabToggle;
        const details = document.getElementById('liab-hist-' + liabId);
        if (!details) return;
        const isOpen = details.style.display === 'block';
        details.style.display = isOpen ? 'none' : 'block';
        if (!isOpen && !loaded) {
          loaded = true;
          try {
            const res = await api(`/api/liabilities/${liabId}/history`);
            const payments = (res.payments || []).slice(0, 6);
            if (payments.length === 0) {
              details.innerHTML = '<div style="color:var(--text-secondary)">No payments recorded.</div>';
            } else {
              details.innerHTML = payments.map(p => `
                <div style="display:flex;justify-content:space-between;padding:0.25rem 0;
                  border-bottom:1px solid var(--border);font-size:0.82rem">
                  <span style="color:var(--text-secondary)">${p.date}</span>
                  <span style="font-weight:600;color:#22c55e">${fmt(p.amount)}</span>
                  <span style="color:var(--text-secondary);font-size:0.75rem">${p.note || ''}</span>
                </div>`).join('');
            }
          } catch (err) {
            details.innerHTML = `<div style="color:#ef4444">${err.message}</div>`;
          }
        }
      });
    });
  }

  /* ── F6: T4 Content — Annual Financial Plan ── */
  function renderT4Content(body) {
    const yearStart = `${contentYear}-01-01`;
    const yearEnd   = `${contentYear}-12-31`;
    const today     = new Date().toISOString().split('T')[0];
    const cutoff    = today < yearEnd ? today : yearEnd;
    const nowYM     = currentYM();

    const yearTx = txData.filter(t => t.date >= yearStart && t.date <= cutoff);
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    // Months elapsed in selected year (up to today for current year, all 12 for past years)
    const isCurrentYear = contentYear === new Date().getFullYear();
    const monthsElapsed = isCurrentYear ? new Date().getMonth() + 1 : 12;

    // INCOME PLAN
    const earnCats = categories.filter(c => c.type === 'Earn');
    const earnBudgets = budgets.filter(b => {
      const cat = catMap[linkedId(b.category_id)];
      return cat?.type === 'Earn';
    });
    const incActualByCat = groupSum(
      yearTx.filter(t => t.type === 'Income'),
      t => linkedId(t.category_id)
    );
    const incActualTotal = Object.values(incActualByCat).reduce((s, v) => s + v, 0);

    function planRow(label, budgetMonth, monthsEl, actual, bgStyle) {
      const expected = budgetMonth * monthsEl;
      const variance = actual - expected;
      const varClr   = variance >= 0 ? '#22c55e' : '#ef4444';
      return `<div class="plan-row" style="grid-template-columns:2fr 1fr 1fr 1fr;${bgStyle || ''}">
        <span>${label}</span>
        <span style="text-align:right">${fmt(budgetMonth)}/mo</span>
        <span style="text-align:right">${fmt(actual)}</span>
        <span style="text-align:right;color:${varClr}">${variance >= 0 ? '+' : ''}${fmt(variance)}</span>
      </div>`;
    }

    const incomeRows = earnBudgets.map(b => {
      const catId     = linkedId(b.category_id);
      const cat       = catMap[catId] || {};
      const label     = b.label || cat.name || '?';
      const budgetMo  = Number(b.amount || 0);
      const actual    = incActualByCat[catId] || 0;
      return planRow(label, budgetMo, monthsElapsed, actual);
    });

    // EXPENSE PLAN
    const expBudgets = budgets.filter(b => {
      const cat = catMap[linkedId(b.category_id)];
      return cat?.type === 'Expense' && b.active !== false && b.active !== 0;
    });
    const expActualByCat = groupSum(
      yearTx.filter(t => t.type === 'Expense' && t.source !== 'LiabilityPayment'),
      t => resolveCatId(t)
    );
    const expActualTotal = Object.values(expActualByCat).reduce((s, v) => s + v, 0);

    const expenseRows = expBudgets.map(b => {
      const catId    = linkedId(b.category_id);
      const cat      = catMap[catId] || {};
      const label    = b.label || cat.name || '?';
      const period   = b.period || 'Monthly';
      const budgetMo = period === 'Annual' ? Number(b.amount || 0) / 12 : Number(b.amount || 0);
      const actual   = expActualByCat[catId] || 0;
      return planRow(label, budgetMo, monthsElapsed, actual);
    });

    // LOAN OBLIGATIONS
    const activeLiabs = liabilities.filter(l => l.active !== false && Number(l.current_balance || 0) > 0);
    const loanPayments = yearTx.filter(t => t.source === 'LiabilityPayment');
    const paidByLiab = {};
    // We can't easily match loan payments to specific liabilities without more data
    const totalLoanPaid = loanPayments.reduce((s, t) => s + Number(t.amount || 0), 0);
    const annualObligation = activeLiabs.reduce((s, l) => s + Number(l.monthly_payment || 0), 0) * 12;

    const loanRows = activeLiabs.map(l => {
      const annObl = Number(l.monthly_payment || 0) * 12;
      return `<div class="plan-row" style="grid-template-columns:2fr 1fr 1fr">
        <span>${l.name} (${l.interest_rate || 0}%)</span>
        <span style="text-align:right">${fmt(annObl)}/yr</span>
        <span style="text-align:right;color:var(--text-secondary)">${fmt(l.current_balance)} remaining</span>
      </div>`;
    });

    // Grand summary
    const totalIncExpected = earnBudgets.reduce((s, b) => s + Number(b.amount || 0), 0) * monthsElapsed;
    const totalExpExpected = expBudgets.reduce((s, b) => {
      const period = b.period || 'Monthly';
      const mo = period === 'Annual' ? Number(b.amount || 0) / 12 : Number(b.amount || 0);
      return s + mo;
    }, 0) * monthsElapsed;
    const planNet    = totalIncExpected - totalExpExpected;
    const actualNet  = incActualTotal - expActualTotal;

    body.innerHTML = `
      <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.75rem">
        ${contentYear} · ${monthsElapsed} month${monthsElapsed !== 1 ? 's' : ''} elapsed
      </div>

      <!-- Grand summary -->
      <div class="content-card" style="background:rgba(59,130,246,0.04);margin-bottom:0.75rem">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.5rem;font-size:0.82rem">
          <div>
            <div style="color:var(--text-secondary);font-size:0.72rem">Expected In</div>
            <div style="font-weight:700;color:#22c55e">${fmt(totalIncExpected)}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:0.72rem">Expected Out</div>
            <div style="font-weight:700;color:#ef4444">${fmt(totalExpExpected)}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:0.72rem">Plan Net</div>
            <div style="font-weight:700;color:${planNet >= 0 ? '#22c55e' : '#ef4444'}">${fmt(planNet)}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:0.72rem">Actual Net YTD</div>
            <div style="font-weight:700;color:${actualNet >= 0 ? '#22c55e' : '#ef4444'}">${fmt(actualNet)}</div>
          </div>
        </div>
      </div>

      <!-- Income Plan -->
      <div class="plan-section" id="plan-income">
        <div class="plan-section-header" data-plan-toggle="income">
          <span>💚 Income Plan</span>
          <span style="font-size:0.8rem;color:var(--text-secondary)">
            Actual ${fmt(incActualTotal)} / Expected ${fmt(totalIncExpected)} ▼
          </span>
        </div>
        <div class="plan-section-body" id="plan-body-income">
          <div class="plan-row" style="grid-template-columns:2fr 1fr 1fr 1fr;font-weight:600;font-size:0.78rem;color:var(--text-secondary)">
            <span>Category</span><span style="text-align:right">Budget/mo</span>
            <span style="text-align:right">Actual YTD</span><span style="text-align:right">Variance</span>
          </div>
          ${incomeRows.length > 0 ? incomeRows.join('') : '<div class="plan-row" style="color:var(--text-secondary)">No income budgets defined</div>'}
        </div>
      </div>

      <!-- Expense Plan -->
      <div class="plan-section" id="plan-expense">
        <div class="plan-section-header" data-plan-toggle="expense">
          <span>🔴 Expense Plan</span>
          <span style="font-size:0.8rem;color:var(--text-secondary)">
            Actual ${fmt(expActualTotal)} / Expected ${fmt(totalExpExpected)} ▼
          </span>
        </div>
        <div class="plan-section-body" id="plan-body-expense">
          <div class="plan-row" style="grid-template-columns:2fr 1fr 1fr 1fr;font-weight:600;font-size:0.78rem;color:var(--text-secondary)">
            <span>Budget</span><span style="text-align:right">Budget/mo</span>
            <span style="text-align:right">Actual YTD</span><span style="text-align:right">Variance</span>
          </div>
          ${expenseRows.length > 0 ? expenseRows.join('') : '<div class="plan-row" style="color:var(--text-secondary)">No expense budgets defined</div>'}
        </div>
      </div>

      <!-- Loan Obligations -->
      <div class="plan-section" id="plan-loans">
        <div class="plan-section-header" data-plan-toggle="loans">
          <span>💳 Loan Obligations</span>
          <span style="font-size:0.8rem;color:var(--text-secondary)">
            ${fmt(totalLoanPaid)} paid YTD / ${fmt(annualObligation)} annual ▼
          </span>
        </div>
        <div class="plan-section-body" id="plan-body-loans">
          <div class="plan-row" style="grid-template-columns:2fr 1fr 1fr;font-weight:600;font-size:0.78rem;color:var(--text-secondary)">
            <span>Loan</span><span style="text-align:right">Annual Obligation</span>
            <span style="text-align:right">Balance</span>
          </div>
          ${loanRows.length > 0 ? loanRows.join('') : '<div class="plan-row" style="color:var(--text-secondary)">No active loans</div>'}
        </div>
      </div>

      <!-- Project Funding -->
      <div class="plan-section">
        <div class="plan-section-header" data-plan-toggle="projects">
          <span>🚀 Project Funding</span>
          <span style="font-size:0.8rem;color:var(--text-secondary)">Coming soon ▼</span>
        </div>
        <div class="plan-section-body" id="plan-body-projects" style="display:none">
          <div style="color:var(--text-secondary);font-size:0.85rem">No projects defined yet — coming soon</div>
        </div>
      </div>`;

    // Wire plan section toggles
    body.querySelectorAll('[data-plan-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const key    = header.dataset.planToggle;
        const bodyEl = document.getElementById('plan-body-' + key);
        if (bodyEl) bodyEl.style.display = bodyEl.style.display === 'none' ? '' : 'none';
      });
    });
  }

  /* ── D4: Smart Alert chips ── */
  function renderAlerts(nowYM, showAll) {
    const strip = document.getElementById('alert-strip');
    if (!strip) return;

    const redChips = [], amberChips = [], blueChips = [];
    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat  = groupSum(nowExpenses, t => resolveCatId(t));

    budgets.forEach(b => {
      if (!b.active) return;
      const catId = linkedId(b.category_id);
      const spent = spendByCat[catId] || 0;
      const p = pct(spent, b.amount);
      const label = b.label || 'Budget';
      if (p >= 100) {
        const id = `budget-over-${b.id}`;
        if (!dismissedAlerts.has(id)) redChips.push({ id, text: `⚠ ${label} over budget (${p}%)` });
      }
    });

    liabilities.forEach(l => {
      if (!l.active) return;
      const bal = Number(l.current_balance || 0);
      const pmt = Number(l.monthly_payment || 0);
      if (bal > 0 && pmt > 0) {
        const id = `liab-due-${l.id}`;
        if (!dismissedAlerts.has(id))
          redChips.push({ id, text: `💳 ${l.name} payment due ${fmt(pmt)}` });
      }
    });

    budgets.forEach(b => {
      if (!b.active) return;
      const catId = linkedId(b.category_id);
      const spent = spendByCat[catId] || 0;
      const p = pct(spent, b.amount);
      const label = b.label || 'Budget';
      if (p >= 80 && p < 100) {
        const id = `budget-warn-${b.id}`;
        if (!dismissedAlerts.has(id)) amberChips.push({ id, text: `〜 ${label} at ${p}% of budget` });
      }
    });

    const activeLiabs = liabilities.filter(l => l.active && Number(l.current_balance || 0) > 0);
    if (activeLiabs.length > 0) {
      const totalDebt = activeLiabs.reduce((s, l) => s + Number(l.current_balance || 0), 0);
      const id = `total-debt-${nowYM}`;
      if (!dismissedAlerts.has(id))
        blueChips.push({ id, text: `🏦 Total debt ${fmt(totalDebt)} across ${activeLiabs.length} loan${activeLiabs.length > 1 ? 's' : ''}` });
    }

    const allChips = [...redChips, ...amberChips, ...blueChips];
    const visible  = showAll ? allChips : allChips.slice(0, 6);
    const overflow = showAll ? 0 : allChips.length - 6;

    function chipHtml(c, cls) {
      return `<span class="alert-chip ${cls}">
        ${c.text}
        <button class="alert-dismiss" data-alert-id="${c.id}"
          style="background:none;border:none;cursor:pointer;color:inherit;font-size:0.8rem;
          padding:0 0 0 0.15rem;line-height:1;opacity:0.65;font-family:inherit">×</button>
      </span>`;
    }

    let html = visible.map(c => {
      const cls = redChips.some(r => r.id === c.id) ? 'danger'
        : amberChips.some(a => a.id === c.id) ? 'warn' : 'info';
      return chipHtml(c, cls);
    }).join('');

    if (overflow > 0) {
      html += `<button id="alert-show-more" class="alert-chip"
        style="background:rgba(100,116,139,0.15);color:var(--text-secondary);
        border:none;cursor:pointer;font-size:0.78rem;font-weight:600;
        padding:0.35rem 0.85rem;border-radius:999px;font-family:inherit">+${overflow} more</button>`;
    }

    strip.innerHTML = html;

    strip.querySelectorAll('.alert-dismiss').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        dismissedAlerts.add(btn.dataset.alertId);
        renderAlerts(nowYM, showAll);
      });
    });
    document.getElementById('alert-show-more')?.addEventListener('click', () => renderAlerts(nowYM, true));
  }

  /* ── T1 Cash Flow chart ── */
  function renderT1(startDate) {
    const canvas = document.getElementById('t1-chart');
    if (!canvas) return;
    if (t1Chart) t1Chart.destroy();
    if (activeRange === '1m') renderT1DailyForecast(canvas);
    else renderT1MonthlyForecast(canvas, startDate);
  }

  function getSyncStartingBalance(fromDate) {
    if (!syncPoint) return 0;
    const syncDate = syncPoint.date;
    let bal = syncPoint.amount;
    txData.forEach(t => {
      if (!t.date) return;
      if (t.date > syncDate && t.date <= fromDate) {
        const amt = Number(t.amount || 0);
        if (t.type === 'Income')       bal += amt;
        else if (t.type === 'Expense') bal -= amt;
      }
    });
    return bal;
  }

  function renderT1DailyForecast(canvas) {
    const subtitle = document.getElementById('t1-subtitle');
    if (subtitle) subtitle.textContent = t1ViewMode === 'invsout'
      ? 'Daily — Income vs Expense (15 days)'
      : 'Daily cash flow + 15-day forecast';

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const pastDays = [], futureDays = [];
    for (let i = 14; i >= 0; i--) pastDays.push(dateOffset(todayStr, -i));
    for (let i = 1; i <= 15; i++) futureDays.push(dateOffset(todayStr, i));
    const allDays = [...pastDays, ...futureDays];

    const incByDay = {}, expByDay = {};
    txData.forEach(t => {
      if (!pastDays.includes(t.date)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income')       incByDay[t.date]  = (incByDay[t.date]  || 0) + amt;
      else if (t.type === 'Expense') expByDay[t.date]  = (expByDay[t.date]  || 0) + amt;
    });

    const totalInc   = pastDays.reduce((s, d) => s + (incByDay[d] || 0), 0);
    const totalExp   = pastDays.reduce((s, d) => s + (expByDay[d] || 0), 0);
    const avgDailyInc = totalInc / Math.max(1, pastDays.length);
    const avgDailyExp = totalExp / Math.max(1, pastDays.length);
    const labels     = allDays.map(d => d.slice(5));
    const todayIdx   = 14;

    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
        if (!x) return;
        const xPos = (x.getPixelForValue(todayIdx) + x.getPixelForValue(todayIdx + 1)) / 2;
        ctx.save();
        ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
        ctx.fillStyle = '#f59e0b'; ctx.font = '9px system-ui';
        ctx.fillText('Today', xPos + 3, top + 10);
        ctx.restore();
      }
    };

    if (t1ViewMode === 'invsout') {
      t1Chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: pastDays.map(d => d.slice(5)),
          datasets: [
            { label: 'Income',  data: pastDays.map(d => incByDay[d] || 0),
              backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 2 },
            { label: 'Expense', data: pastDays.map(d => expByDay[d] || 0),
              backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
          scales: { x: { ticks: { font: { size: 9 } } },
            y: { min: 0, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } } }
        }
      });
      return;
    }

    let runBal = syncPoint ? getSyncStartingBalance(pastDays[0]) : 0;
    const balPast = pastDays.map(d => {
      runBal += (incByDay[d] || 0) - (expByDay[d] || 0);
      return runBal;
    });
    const balForecast = [balPast[balPast.length - 1]];
    futureDays.forEach(() => {
      balForecast.push(balForecast[balForecast.length - 1] + avgDailyInc - avgDailyExp);
    });

    let syncLinePlugin = null;
    if (syncPoint && pastDays.includes(syncPoint.date)) {
      const spIdx = pastDays.indexOf(syncPoint.date);
      syncLinePlugin = {
        id: 'syncLine',
        afterDraw(chart) {
          const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
          if (!x) return;
          const xPos = x.getPixelForValue(spIdx);
          ctx.save();
          ctx.strokeStyle = '#6366f1'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
          ctx.fillStyle = '#6366f1'; ctx.font = '8px system-ui';
          ctx.fillText('📍sync', xPos + 2, top + 10);
          ctx.restore();
        }
      };
    }

    const plugins = [todayLinePlugin];
    if (syncLinePlugin) plugins.push(syncLinePlugin);

    t1Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Income',  data: [...pastDays.map(d => incByDay[d] || 0), ...new Array(15).fill(null)],
            backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 2 },
          { label: 'Expense', data: [...pastDays.map(d => expByDay[d] || 0), ...new Array(15).fill(null)],
            backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 2 },
          { label: '~ Inc Forecast', data: [...new Array(15).fill(null), ...futureDays.map(() => avgDailyInc)],
            backgroundColor: 'rgba(34,197,94,0.25)', borderRadius: 2 },
          { label: '~ Exp Forecast', data: [...new Array(15).fill(null), ...futureDays.map(() => avgDailyExp)],
            backgroundColor: 'rgba(239,68,68,0.25)', borderRadius: 2 },
          { label: 'Balance', data: [...balPast, ...new Array(15).fill(null)], type: 'line',
            borderColor: '#3b82f6', borderWidth: 2, pointRadius: 1, tension: 0.3, yAxisID: 'y2',
            fill: { target: { value: 0 }, above: 'rgba(59,130,246,0.08)', below: 'rgba(239,68,68,0.18)' } },
          { label: '~ Bal Forecast', data: [...new Array(14).fill(null), ...balForecast],
            type: 'line', borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0,
            borderDash: [4, 3], tension: 0.3, yAxisID: 'y2', fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 },
            filter: item => !item.text.startsWith('~ ') || item.text === '~ Bal Forecast' } },
          tooltip: { callbacks: {
            label: ctx => {
              const isForecast = ctx.dataset.label.startsWith('~ ');
              const v = Math.round(ctx.raw || 0);
              return `${isForecast ? '~ Est: ' : ''}${ctx.dataset.label.replace('~ ', '')}: ฿${v.toLocaleString()}`;
            },
            afterBody: ctx => ctx[0]?.dataset.label.startsWith('~ ')
              ? ['Estimated — based on 15-day average'] : []
          }}
        },
        scales: {
          x:  { ticks: { font: { size: 9 } } },
          y:  { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
          y2: { position: 'right', grid: { drawOnChartArea: false },
                ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      },
      plugins
    });
  }

  function renderT1MonthlyForecast(canvas, startDate) {
    const subtitle   = document.getElementById('t1-subtitle');
    const nowYM      = currentYM();
    const startYM    = startDate.slice(0, 7);
    const forecastMonths = activeRange === '3m' ? 1 : activeRange === '6m' ? 3 : 6;

    const pastMonths   = monthsBetween(startYM, nowYM);
    const futureMonths = [];
    let [fy, fm] = nowYM.split('-').map(Number);
    for (let i = 0; i < forecastMonths; i++) {
      fm++; if (fm > 12) { fm = 1; fy++; }
      futureMonths.push(`${fy}-${String(fm).padStart(2, '0')}`);
    }
    const allMonths = [...pastMonths, ...futureMonths];

    const incByM = {}, expByM = {};
    txData.forEach(t => {
      const ym = toYM(t.date);
      if (!pastMonths.includes(ym)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income')       incByM[ym] = (incByM[ym] || 0) + amt;
      else if (t.type === 'Expense') expByM[ym] = (expByM[ym] || 0) + amt;
    });

    if (t1ViewMode === 'invsout') {
      if (subtitle) subtitle.textContent = 'Monthly — Income vs Expense';
      t1Chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: pastMonths.map(monthLabel),
          datasets: [
            { label: 'Income',  data: pastMonths.map(m => incByM[m] || 0),
              backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3 },
            { label: 'Expense', data: pastMonths.map(m => expByM[m] || 0),
              backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } },
          scales: { x: { ticks: { font: { size: 9 } } },
            y: { min: 0, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } } }
        }
      });
      return;
    }

    if (subtitle) subtitle.textContent = `Monthly cash flow + ${forecastMonths}-month forecast`;

    const recentM = pastMonths.slice(-3);
    const avgInc  = recentM.reduce((s, m) => s + (incByM[m] || 0), 0) / Math.max(1, recentM.length);
    const avgExp  = recentM.reduce((s, m) => s + (expByM[m] || 0), 0) / Math.max(1, recentM.length);

    let running = 0;
    if (syncPoint) {
      const syncYM = syncPoint.date.slice(0, 7);
      if (syncYM <= pastMonths[0]) running = getSyncStartingBalance(pastMonths[0] + '-01');
    }
    const balPast = pastMonths.map(m => {
      running += (incByM[m] || 0) - (expByM[m] || 0);
      return running;
    });
    const balForecast = [balPast[balPast.length - 1]];
    futureMonths.forEach(() => balForecast.push(balForecast[balForecast.length - 1] + avgInc - avgExp));

    const todayIdx = pastMonths.length - 1;
    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
        if (!x) return;
        const xPos = (x.getPixelForValue(todayIdx) + x.getPixelForValue(todayIdx + 1)) / 2;
        ctx.save();
        ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
        ctx.fillStyle = '#f59e0b'; ctx.font = '9px system-ui';
        ctx.fillText('Now', xPos + 3, top + 10);
        ctx.restore();
      }
    };

    const nPast = pastMonths.length;
    t1Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: allMonths.map(monthLabel),
        datasets: [
          { label: 'Income',  data: [...pastMonths.map(m => incByM[m] || 0), ...new Array(forecastMonths).fill(null)],
            backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3 },
          { label: 'Expense', data: [...pastMonths.map(m => expByM[m] || 0), ...new Array(forecastMonths).fill(null)],
            backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 },
          { label: '~ Inc Forecast', data: [...new Array(nPast).fill(null), ...futureMonths.map(() => avgInc)],
            backgroundColor: 'rgba(34,197,94,0.28)', borderRadius: 3 },
          { label: '~ Exp Forecast', data: [...new Array(nPast).fill(null), ...futureMonths.map(() => avgExp)],
            backgroundColor: 'rgba(239,68,68,0.28)', borderRadius: 3 },
          { label: 'Balance', data: [...balPast, ...new Array(forecastMonths).fill(null)], type: 'line',
            borderColor: '#3b82f6', borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: 'y2',
            fill: { target: { value: 0 }, above: 'rgba(59,130,246,0.08)', below: 'rgba(239,68,68,0.18)' } },
          { label: '~ Bal Forecast', data: [...new Array(nPast - 1).fill(null), ...balForecast],
            type: 'line', borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 1,
            borderDash: [4, 3], tension: 0.3, yAxisID: 'y2', fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 },
            filter: item => !item.text.startsWith('~ ') || item.text === '~ Bal Forecast' } },
          tooltip: { callbacks: {
            afterBody: ctx => ctx[0]?.dataset.label.startsWith('~ ')
              ? ['Estimated — based on 3-month average'] : []
          }}
        },
        scales: {
          x:  { ticks: { font: { size: 9 } } },
          y:  { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
          y2: { position: 'right', grid: { drawOnChartArea: false },
                ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
        }
      },
      plugins: [todayLinePlugin]
    });
  }

  /* ── T2 Expense Pareto chart ── */
  function renderT2() {
    const canvas = document.getElementById('t2-chart');
    if (!canvas) return;
    if (t2Chart) t2Chart.destroy();

    const catMap  = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const expenses = txData.filter(t => t.type === 'Expense');
    const backBtn  = document.getElementById('t2-back-btn');
    const subtitle = document.getElementById('t2-subtitle');

    if (t2DrillGroup) {
      if (backBtn) backBtn.classList.remove('hidden');
      if (subtitle) subtitle.textContent = t2DrillGroup;
      const sumByCat = {};
      expenses.forEach(t => {
        const catId = resolveCatId(t);
        const cat   = catMap[catId];
        if (!cat || cat.group !== t2DrillGroup) return;
        sumByCat[catId] = (sumByCat[catId] || 0) + Number(t.amount || 0);
      });
      const sorted = Object.entries(sumByCat).sort((a, b) => b[1] - a[1]);
      t2Chart = new Chart(canvas, {
        type: 'bar',
        data: { labels: sorted.map(([id]) => catMap[id]?.name || id),
          datasets: [{ data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map((_, i) => `hsl(${200 + i * 25},60%,55%)`), borderRadius: 3 }] },
        options: t2ChartOptions()
      });
    } else {
      if (backBtn) backBtn.classList.add('hidden');
      if (subtitle) subtitle.textContent = 'By group — click to drill in';
      const sumByGroup = {};
      expenses.forEach(t => {
        const catId = resolveCatId(t);
        const grp   = catMap[catId]?.group || 'Other';
        sumByGroup[grp] = (sumByGroup[grp] || 0) + Number(t.amount || 0);
      });
      const sorted = Object.entries(sumByGroup).sort((a, b) => b[1] - a[1]);
      t2Chart = new Chart(canvas, {
        type: 'bar',
        data: { labels: sorted.map(([g]) => g),
          datasets: [{ data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map((_, i) => `hsl(${i * 30},65%,55%)`), borderRadius: 3 }] },
        options: {
          ...t2ChartOptions(),
          onClick: (evt, elements) => {
            if (elements.length > 0) { t2DrillGroup = sorted[elements[0].index][0]; renderT2(); }
          }
        }
      });
    }
  }

  function t2ChartOptions() {
    return {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
        y: { ticks: { font: { size: 9 } } }
      }
    };
  }

  /* ── T3 Liabilities chart ── */
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
      if (parent) parent.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:1rem;font-size:0.82rem">No active liabilities</div>';
      return;
    }

    t3Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: active.map(l => l.name || l.id),
        datasets: [{ data: active.map(l => Number(l.current_balance || 0)),
          backgroundColor: active.map((_, i) => `hsl(${10 + i * 40},70%,55%)`), borderRadius: 4 }]
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

  /* ── T4 Budget vs Actual chart ── */
  function renderBudgetPanel(range) {
    const canvas = document.getElementById('t4-chart');
    if (!canvas) return;
    if (t4Chart) t4Chart.destroy();

    const nowYM = currentYM();
    let months;
    if (range === '1m')  months = [nowYM];
    else if (range === '3m')  months = monthsBetween(rangeStart('3m').slice(0, 7), nowYM);
    else if (range === '6m')  months = monthsBetween(rangeStart('6m').slice(0, 7), nowYM);
    else months = monthsBetween(rangeStart('12m').slice(0, 7), nowYM);

    const budgetByMonth = {};
    months.forEach(ym => { budgetByMonth[ym] = 0; });
    budgets.forEach(b => {
      if (!b.active) return;
      const limit = Number(b.amount || 0);
      if (b.period === 'One-time') {
        months.forEach(ym => {
          const [y, m] = ym.split('-').map(Number);
          const ymStart = ym + '-01';
          const ymEnd   = new Date(y, m, 0).toISOString().split('T')[0];
          const start   = b.start_date || '1900-01-01';
          const end     = b.end_date   || '9999-12-31';
          if (start <= ymEnd && end >= ymStart) budgetByMonth[ym] += limit;
        });
      } else if (b.period === 'Annual') {
        months.forEach(ym => { budgetByMonth[ym] += limit / 12; });
      } else {
        months.forEach(ym => { budgetByMonth[ym] += limit; });
      }
    });

    const actualByMonth = {};
    months.forEach(ym => { actualByMonth[ym] = 0; });
    txData.forEach(t => {
      if (t.type !== 'Expense') return;
      const ym = toYM(t.date);
      if (months.includes(ym)) actualByMonth[ym] += Number(t.amount || 0);
    });

    let cumBudget = 0, cumActual = 0;
    const runBudget = months.map(ym => { cumBudget += budgetByMonth[ym]; return Math.round(cumBudget); });
    const runActual = months.map(ym => { cumActual += actualByMonth[ym]; return Math.round(cumActual); });

    const budgetAmts = months.map(ym => Math.round(budgetByMonth[ym]));
    const actualAmts = months.map(ym => Math.round(actualByMonth[ym]));
    const barColors  = actualAmts.map((a, i) => a > budgetAmts[i] ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.7)');

    t4Chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Budget', data: budgetAmts, backgroundColor: 'rgba(59,130,246,0.5)', borderRadius: 3, order: 2 },
          { label: 'Actual', data: actualAmts, backgroundColor: barColors, borderRadius: 3, order: 3 },
          { label: 'Run Budget', data: runBudget, type: 'line',
            borderColor: '#f59e0b', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false, order: 1, yAxisID: 'y2' },
          { label: 'Run Actual', data: runActual, type: 'line',
            borderColor: '#8b5cf6', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false, order: 0, yAxisID: 'y2' }
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

    const totalBudgeted = budgetAmts.reduce((s, v) => s + v, 0);
    const totalActual   = actualAmts.reduce((s, v) => s + v, 0);
    const variance      = totalBudgeted - totalActual;
    const pctVar        = totalBudgeted > 0 ? Math.round(Math.abs(variance) / totalBudgeted * 100) : 0;
    const summaryEl     = document.getElementById('t4-summary');
    if (summaryEl) {
      summaryEl.textContent = `Budgeted: ${fmt(totalBudgeted)} | Spent: ${fmt(totalActual)} | ${variance >= 0 ? 'Under' : 'Over'} ${pctVar}%`;
    }
  }

  /* ── E4: Sync panel ── */
  function initSyncPanel() {
    const toggleBtn = document.getElementById('sync-toggle-btn');
    const panel     = document.getElementById('sync-panel');
    const saveBtn   = document.getElementById('sync-save-btn');
    const msgEl     = document.getElementById('sync-msg');
    const dateEl    = document.getElementById('sync-date');

    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    toggleBtn?.addEventListener('click', e => {
      e.stopPropagation();
      if (!panel) return;
      panel.style.display = panel.style.display !== 'none' ? 'none' : 'block';
    });

    saveBtn?.addEventListener('click', async () => {
      const amount = document.getElementById('sync-amount')?.value;
      const date   = document.getElementById('sync-date')?.value;
      const note   = document.getElementById('sync-note')?.value || '';
      if (!amount || !date) {
        if (msgEl) { msgEl.textContent = 'Amount and date required'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
        return;
      }
      try {
        const res = await api('/api/cashflow-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Number(amount), date, note })
        });
        syncPoint = res.syncPoint;
        updateSyncInfo();
        if (panel) panel.style.display = 'none';
        renderT1(rangeStart(activeRange));
      } catch (err) {
        if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
      }
    });
  }

  /* ── E5: T1 view mode toggle ── */
  function initT1ViewMode() {
    document.querySelectorAll('[data-t1-mode]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        t1ViewMode = btn.dataset.t1Mode;
        document.querySelectorAll('[data-t1-mode]').forEach(b =>
          b.classList.toggle('active', b.dataset.t1Mode === t1ViewMode));
        renderT1(rangeStart(activeRange));
      });
    });
  }

  /* ── T2 back button ── */
  function initT2Back() {
    document.getElementById('t2-back-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      t2DrillGroup = null;
      renderT2();
    });
  }

  /* ── Solution Playroom ── */
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
      if (!catId) { document.getElementById('playroom-content').style.display = 'none'; return; }
      await renderPlayroomChart(catId);
    });

    function updateImpact() {
      if (!impact) return;
      const budget    = Number(budIn?.value || 0);
      const projected = Number(projIn?.value || 0);
      if (!budget && !projected) { impact.style.display = 'none'; return; }
      const diff = projected - budget;
      const perYear = Math.abs(diff) * 12;
      impact.style.display = 'block';
      if (diff < 0) {
        impact.className = 'playroom-impact saving';
        impact.textContent = `Saving ${fmt(Math.abs(diff))}/month = ${fmt(perYear)}/year`;
      } else if (diff > 0) {
        impact.className = 'playroom-impact over';
        impact.textContent = `Over budget by ${fmt(diff)}/month = ${fmt(perYear)}/year extra`;
      } else {
        impact.className = 'playroom-impact neutral';
        impact.textContent = 'On budget exactly.';
      }
    }

    budIn?.addEventListener('input', updateImpact);
    projIn?.addEventListener('input', updateImpact);

    saveBtn?.addEventListener('click', async () => {
      if (!playroomBudgetId) return;
      const newAmt = Number(budIn?.value || 0);
      if (!newAmt) return;
      if (msgEl) msgEl.style.display = 'none';
      try {
        await fetch(`/api/budgets/${playroomBudgetId}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: newAmt })
        });
        if (msgEl) { msgEl.textContent = 'Budget saved!'; msgEl.style.color = '#22c55e'; msgEl.style.display = 'block'; }
        await loadAll();
      } catch {
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

    const now = new Date();
    const start6m  = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    const months   = monthsBetween(start6m.slice(0, 7), currentYM());

    let txRes;
    try {
      const r = await fetch(`/api/transactions?start=${start6m}&limit=500`, { credentials: 'same-origin' });
      txRes = await r.json();
    } catch { return; }

    const tx6m = (txRes.records || []).map(r => r.fields).filter(t => resolveCatId(t) === catId);
    const spendByM = {};
    tx6m.forEach(t => {
      const ym = toYM(t.date);
      spendByM[ym] = (spendByM[ym] || 0) + Number(t.amount || 0);
    });

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
          ...(budAmt ? [{ label: 'Budget', data: months.map(() => budAmt), type: 'line',
            borderColor: '#f59e0b', borderWidth: 2, borderDash: [4, 3], pointRadius: 0, fill: false }] : [])
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

  /* ── Risk Simulator ── */
  function runCashSim() {
    const bank   = Number(document.getElementById('sim-bank')?.value  || 0);
    const cash   = Number(document.getElementById('sim-cash')?.value  || 0);
    const result = document.getElementById('sim-result');
    if (!result) return;

    const nowYM = currentYM();
    const totalLiquid = bank + cash;
    const nowTx = txData.filter(t => toYM(t.date) === nowYM);
    const alreadySpent = nowTx.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);

    const catsPaidThisMonth = new Set();
    nowTx.filter(t => t.type === 'Expense').forEach(t => {
      const cid = resolveCatId(t);
      if (cid) catsPaidThisMonth.add(cid);
    });

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

    const daysLeft   = daysLeftInMonth();
    const daysGone   = new Date().getDate();
    const avgDaily   = daysGone > 0 ? alreadySpent / daysGone : 0;
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
      <div>Already spent this month: <strong>${fmt(alreadySpent)}</strong></div>
      <div style="margin-top:0.75rem;margin-bottom:0.25rem;font-weight:600;font-size:0.85rem">Fixed commitments:</div>
      ${rowsHtml || '<div style="font-size:0.82rem;color:var(--text-secondary)">No FP budgets found</div>'}
      <div style="margin-top:0.5rem;display:flex;justify-content:space-between;font-size:0.85rem">
        <span>Still due: <strong style="color:#ef4444">${fmt(fixedDue)}</strong></span>
        <span>Already paid: ${fmt(fixedPaid)}</span>
      </div>
      <div style="margin-top:0.5rem;font-size:0.85rem">
        Variable estimate (${daysLeft}d × ${fmt(avgDaily)}/day avg): <strong>${fmt(varEstimate)}</strong>
      </div>
      <div style="margin-top:0.75rem;padding:0.6rem;border-radius:6px;
        background:${isShortfall ? '#fee2e2' : '#dcfce7'};color:${isShortfall ? '#991b1b' : '#166534'}">
        <strong>Projected month-end: ${fmt(projectedBalance)}</strong>
        ${isShortfall ? ' — SHORTFALL' : ' — Surplus'}
      </div>
      <div style="margin-top:0.4rem;font-size:0.82rem;color:var(--text-secondary)">
        At current burn: cash lasts <strong>${daysUntilZero}</strong> more days
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
      ${newNet < 0
        ? '<div style="color:#ef4444;margin-top:0.5rem;font-weight:600">Cash flow turns negative.</div>'
        : '<div style="color:#22c55e;margin-top:0.5rem">Cash flow stays positive.</div>'}`;
  }

  /* ── Modals ── */
  function initModals() {
    const simBackdrop = document.getElementById('sim-backdrop');
    document.getElementById('sim-close')?.addEventListener('click', () => simBackdrop?.classList.remove('open'));
    simBackdrop?.addEventListener('click', e => { if (e.target === simBackdrop) simBackdrop.classList.remove('open'); });
    document.getElementById('run-sim')?.addEventListener('click', runCashSim);
    document.getElementById('run-extra-sim')?.addEventListener('click', runExtraSim);

    const pBackdrop = document.getElementById('playroom-backdrop');
    const pPanel    = document.getElementById('playroom-panel');
    const closePlay = () => { pBackdrop?.classList.remove('open'); pPanel?.classList.remove('open'); };
    document.getElementById('playroom-close')?.addEventListener('click', closePlay);
    pBackdrop?.addEventListener('click', closePlay);
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', async () => {
    initGraphPanels();
    initT1ViewMode();
    initT2Back();
    initSyncPanel();
    initModals();
    initPlayroom();
    await loadSyncPoint();
    loadAll().catch(err => console.error('Dashboard load failed:', err));
  });
})();
