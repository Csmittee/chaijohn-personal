/* cashflow.injector.js — Cash Flow panel (M2.1)
 * 9B3: card view → Cash In / Cash Out section bands, proportional sizing like expenses
 */
(function () {
  'use strict';

  const fmt  = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let cfChart = null, txData = [], liabilities = [], syncPoint = null;
  let activeRange = '1m', cfView = 'list', initialized = false;
  function el(id) { return document.getElementById(id); }

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  function rangeWindow(range) {
    const n = new Date();
    let start, end;
    if (range === '1m') {
      start = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split('T')[0];
      end   = new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (range === '3m') {
      start = new Date(n.getFullYear(), n.getMonth() - 1, n.getDate()).toISOString().split('T')[0];
      end   = new Date(n.getFullYear(), n.getMonth() + 2, n.getDate()).toISOString().split('T')[0];
    } else {
      start = new Date(n.getFullYear(), n.getMonth() - 2, n.getDate()).toISOString().split('T')[0];
      end   = new Date(n.getFullYear(), n.getMonth() + 4, n.getDate()).toISOString().split('T')[0];
    }
    return { start, end };
  }

  function computeStats() {
    const totalIn  = txData.filter(t => t.type === 'Income' ).reduce((s,t) => s + Number(t.amount||0), 0);
    const totalOut = txData.filter(t => t.type === 'Expense').reduce((s,t) => s + Number(t.amount||0), 0);

    const syncBal  = syncPoint ? Number(syncPoint.balance || 0) : null;
    const syncDate = syncPoint ? (syncPoint.date || null) : null;

    let currentCash = totalIn - totalOut;
    if (syncBal !== null && syncDate) {
      const delta = txData.filter(t => t.date > syncDate);
      const dIn  = delta.filter(t => t.type==='Income' ).reduce((s,t) => s+Number(t.amount||0),0);
      const dOut = delta.filter(t => t.type==='Expense').reduce((s,t) => s+Number(t.amount||0),0);
      currentCash = syncBal + dIn - dOut;
    }

    const fcLoan = liabilities
      .filter(l => l.active !== false && Number(l.current_balance||0) > 0)
      .reduce((s,l) => s + Number(l.monthly_payment||0), 0);

    const daysPassed = new Date().getDate();
    const avgDailyOut = daysPassed > 0 ? totalOut / daysPassed : 0;
    const dailyNet = -avgDailyOut - fcLoan / 30;

    let daysToZeroStr = '—';
    if (currentCash <= 0) {
      daysToZeroStr = '⚠ Now';
    } else if (dailyNet < 0) {
      const d = Math.floor(currentCash / -dailyNet);
      const zd = new Date(); zd.setDate(zd.getDate() + d);
      daysToZeroStr = d + 'd (' + zd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')';
    }

    const today = new Date().toISOString().split('T')[0];
    const futureEarns = txData.filter(t => t.type === 'Income' && t.date > today)
      .sort((a,b) => a.date.localeCompare(b.date));
    const incomingDue = futureEarns.length
      ? futureEarns[0].date.slice(5) + ' ' + fmt(futureEarns[0].amount) : '—';

    const set = (id,v) => { const e = el(id); if (e) e.textContent = v; };
    set('cf-days-zero',    daysToZeroStr);
    set('cf-total-in',     fmt(totalIn));
    set('cf-total-out',    fmt(totalOut));
    set('cf-balance',      fmt(currentCash));
    set('cf-incoming-due', incomingDue);

    const balEl = el('cf-balance');
    if (balEl) balEl.style.color = currentCash >= 0 ? 'var(--green)' : 'var(--red)';

    const syncEl = el('cf-sync-info');
    if (syncEl) syncEl.textContent = syncPoint ? '⚡ sync: ' + fmt(syncBal) + ' · ' + syncDate : '';

    return { currentCash, dailyNet };
  }

  function renderChart(currentCash, dailyNet, endDateStr) {
    const canvas = el('cf-chart');
    if (!canvas) return;
    if (cfChart) { cfChart.destroy(); cfChart = null; }

    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const rStart   = rangeWindow(activeRange).start;
    const endDate  = new Date(endDateStr + 'T00:00:00');

    const dailyDelta = {};
    txData.forEach(t => {
      dailyDelta[t.date] = (dailyDelta[t.date] || 0) + (t.type === 'Income' ? 1 : -1) * Number(t.amount||0);
    });

    const loanByDay = {};
    let loanSpread  = 0;
    liabilities.filter(l => l.active !== false && Number(l.monthly_payment||0) > 0).forEach(l => {
      const dd = Number(l.payment_due_day || 0);
      if (dd) loanByDay[dd] = (loanByDay[dd] || 0) + Number(l.monthly_payment);
      else    loanSpread += Number(l.monthly_payment) / 30;
    });

    let bal = currentCash;
    for (let d = new Date(today); d >= new Date(rStart + 'T00:00:00'); d.setDate(d.getDate() - 1)) {
      const ds = d.toISOString().split('T')[0];
      if (ds === todayStr) continue;
      bal -= (dailyDelta[ds] || 0);
    }

    const labels = [], hist = [], fcast = [];
    let fcastStartIdx = 0;

    for (let d = new Date(rStart); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      labels.push(ds.slice(5));
      if (ds <= todayStr) {
        bal += (dailyDelta[ds] || 0);
        hist.push(bal);
        fcast.push(null);
        if (ds === todayStr) fcastStartIdx = hist.length - 1;
      } else {
        const dom = d.getDate();
        bal += dailyNet - (loanByDay[dom] || 0) - loanSpread;
        hist.push(null);
        fcast.push(bal);
      }
    }
    if (fcastStartIdx > 0) fcast[fcastStartIdx] = hist[fcastStartIdx];

    const zeroCross = makeZeroCross(fcast.map((v,i) => v === null ? hist[i] : v), fcastStartIdx);
    cfChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Balance',  data: hist,  borderColor: '#3b82f6', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.3 },
        { label: 'Forecast', data: fcast, borderColor: '#f5c518', borderWidth: 1.5, borderDash: [5,3], fill: false, pointRadius: 0, tension: 0.3 }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 9 } } },
          y: { ticks: { font: { size: 9 }, callback: v => '฿' + (v/1000).toFixed(0) + 'k' } }
        }
      },
      plugins: zeroCross ? [zeroCross] : []
    });
  }

  function makeZeroCross(arr, startIdx) {
    let ci = null;
    for (let i = startIdx + 1; i < arr.length; i++) {
      const p = arr[i-1], c = arr[i];
      if (p != null && c != null && p >= 0 && c < 0) { ci = (i-1) + p/(p-c); break; }
    }
    if (ci === null) return null;
    return { id:'cfZero', afterDraw(chart) {
      const { ctx, scales:{x}, chartArea:{top,bottom} } = chart;
      if (!x) return;
      const xPos = x.getPixelForValue(Math.floor(ci)) + (x.getPixelForValue(Math.ceil(ci)) - x.getPixelForValue(Math.floor(ci))) * (ci - Math.floor(ci));
      ctx.save(); ctx.strokeStyle='#ef4444'; ctx.setLineDash([4,2]); ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(xPos,top); ctx.lineTo(xPos,bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle='#ef4444'; ctx.font='bold 9px system-ui';
      ctx.fillText('⚠ ฿0', xPos+3, top+16); ctx.restore();
    }};
  }

  /* ── Cards — list: compact rows; card: Cash In / Cash Out section bands ── */
  function renderCards() {
    const zone = el('cf-cards');
    if (!zone) return;
    const rows = [...txData].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 60);
    if (!rows.length) {
      zone.style.cssText = '';
      zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem 0">No transactions</p>';
      return;
    }

    if (cfView === 'card') {
      const incomes  = rows.filter(t => t.type === 'Income').sort((a,b)  => Number(b.amount||0) - Number(a.amount||0));
      const expenses = rows.filter(t => t.type === 'Expense').sort((a,b) => Number(b.amount||0) - Number(a.amount||0));
      const maxAmt   = Math.max(...rows.map(t => Number(t.amount||0)), 1);

      const renderSection = (items, sectionLabel, color) => {
        if (!items.length) return '';
        return `<div class="section-band" style="color:${color}">${sectionLabel}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.75rem;margin-bottom:1rem">
${items.map(t => {
  const lbl = t.budget_label || t.category_name || t.entity || t.description || '—';
  const h   = Math.max(72, Math.sqrt(Number(t.amount||0) / maxAmt) * 160);
  return `<div class="liab-content-card" style="min-height:${h}px;display:flex;flex-direction:column;justify-content:space-between;background:var(--bg-card,var(--bg-raised))">
  <div style="padding:0.7rem 0.85rem">
    <div style="font-size:0.68rem;color:var(--text-dim)">${t.date.slice(5)}</div>
    <div style="font-size:0.82rem;font-weight:600;color:var(--text,var(--text-primary));margin-top:0.1rem">${esc(lbl)}</div>
    ${t.entity ? `<div style="font-size:0.68rem;color:var(--text-secondary,var(--text-dim))">${esc(t.entity)}</div>` : ''}
  </div>
  <div style="padding:0 0.85rem 0.7rem;text-align:right">
    <div style="font-size:0.85rem;font-weight:700;color:${color}">${t.type==='Income'?'+':'-'}${fmt(t.amount)}</div>
  </div>
</div>`;
}).join('')}
</div>`;
      };

      zone.style.cssText = 'padding:0.25rem 0.5rem';
      zone.innerHTML = renderSection(incomes, 'CASH IN', 'var(--green)') + renderSection(expenses, 'CASH OUT', 'var(--red)');
    } else {
      zone.style.cssText = '';
      zone.innerHTML = rows.map(t => {
        const isIn  = t.type === 'Income';
        const label = t.budget_label || t.category_name || t.entity || t.description || '—';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.35rem 0.75rem;border-bottom:1px solid var(--border)">
          <div style="min-width:0;flex:1;margin-right:0.5rem">
            <span style="font-size:0.75rem;font-weight:600;color:var(--text-primary,var(--text));margin-right:0.4rem">${esc(label)}</span>
            <span style="font-size:0.66rem;color:var(--text-secondary,var(--text-dim))">${t.date.slice(5)}${t.entity ? ' · '+esc(t.entity) : ''}</span>
          </div>
          <div style="font-size:0.78rem;font-weight:700;white-space:nowrap;color:${isIn?'var(--color-income,var(--green))':'var(--color-expense,var(--red))'}">${isIn?'+':'-'}${fmt(t.amount)}</div>
        </div>`;
      }).join('');
    }
  }

  function initRangeToggle() {
    const tog = el('cf-range-toggle');
    if (!tog) return;
    tog.addEventListener('click', e => {
      const btn = e.target.closest('[data-range]');
      if (!btn || btn.classList.contains('active')) return;
      tog.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      loadAndRender().catch(console.error);
    });
  }

  function initViewToggle() {
    const tog = el('cf-view-toggle');
    if (!tog) return;
    tog.addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (!btn || btn.classList.contains('active')) return;
      tog.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cfView = btn.dataset.view;
      renderCards();
    });
  }

  async function loadAndRender() {
    const { start, end } = rangeWindow(activeRange);
    const [txR, liR, syR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/liabilities'),
      api('/api/cashflow-sync')
    ]);
    txData      = txR.status==='fulfilled' ? (txR.value.records||[]).map(r=>({id:r.id,...r.fields})) : [];
    liabilities = liR.status==='fulfilled' ? (liR.value.records||[]).map(r=>({id:r.id,...r.fields})) : [];
    syncPoint   = syR.status==='fulfilled' ? (syR.value.syncPoint||null) : null;

    const { currentCash, dailyNet } = computeStats();
    renderChart(currentCash, dailyNet, end);
    renderCards();
  }

  function init() {
    if (initialized) return; initialized = true;
    initRangeToggle();
    initViewToggle();
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'cashflow') init(); });
  if (el('panel-cashflow')?.classList.contains('active')) init();
})();
