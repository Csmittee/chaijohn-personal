/* cashflow.injector.js — Cash Flow panel (M2.1)
 * 9B4: restore all card types (budget/debt/borrow), X-days due window, cut cost simulation
 */
(function () {
  'use strict';

  const fmt  = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let cfChart = null, txData = [], liabilities = [], syncPoint = null, budgets = [];
  let activeRange = '1m', cfView = 'list', initialized = false;
  let cutItems = new Set();   // 'liab-{id}' | 'budget-{id}'
  let dueWindowDays = null;
  let lastStats = { currentCash: 0, dailyNet: 0 };
  let lastEnd = '';

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

    const syncAmt  = syncPoint ? Number(syncPoint.amount || 0) : null;
    const syncDate = syncPoint ? (syncPoint.date || null) : null;

    let currentCash = totalIn - totalOut;
    if (syncAmt !== null && syncDate) {
      const delta = txData.filter(t => t.date > syncDate);
      const dIn  = delta.filter(t => t.type==='Income' ).reduce((s,t) => s+Number(t.amount||0),0);
      const dOut = delta.filter(t => t.type==='Expense').reduce((s,t) => s+Number(t.amount||0),0);
      currentCash = syncAmt + dIn - dOut;
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
    if (syncEl) {
      syncEl.innerHTML = syncPoint
        ? `⚡ sync: ${fmt(syncAmt)} · ${syncDate} <span style="font-size:0.6rem;opacity:0.55">[edit]</span>`
        : `<span style="text-decoration:underline dotted">⚡ Set startup cash</span>`;
      if (!syncEl._cfSyncBound) {
        syncEl._cfSyncBound = true;
        syncEl.addEventListener('click', () => {
          const form = el('cf-sync-form');
          if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
        });
      }
    }

    return { currentCash, dailyNet, avgDailyOut };
  }

  /* ── Simulation helpers ─────────────────────────────────────────────────── */

  function simSavingsPerDay() {
    let s = 0;
    liabilities.forEach(l => { if (cutItems.has('liab-' + l.id)) s += Number(l.monthly_payment||0) / 30; });
    budgets.forEach(b => { if (cutItems.has('budget-' + b.id)) s += Number(b.amount||0) / 30; });
    return s;
  }

  function simSavingsPerMonth() {
    let s = 0;
    liabilities.forEach(l => { if (cutItems.has('liab-' + l.id)) s += Number(l.monthly_payment||0); });
    budgets.forEach(b => { if (cutItems.has('budget-' + b.id)) s += Number(b.amount||0); });
    return s;
  }

  /* ── Chart ──────────────────────────────────────────────────────────────── */

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

    const simActive = cutItems.size > 0;
    const savingsPerDay = simSavingsPerDay();
    const labels = [], hist = [], fcast = [], simFcast = [];
    let fcastStartIdx = 0;
    let simAccum = 0;

    for (let d = new Date(rStart); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      labels.push(ds.slice(5));
      if (ds <= todayStr) {
        bal += (dailyDelta[ds] || 0);
        hist.push(bal);
        fcast.push(null);
        simFcast.push(null);
        if (ds === todayStr) fcastStartIdx = hist.length - 1;
      } else {
        const dom = d.getDate();
        bal += dailyNet - (loanByDay[dom] || 0) - loanSpread;
        hist.push(null);
        fcast.push(bal);
        simAccum += savingsPerDay;
        simFcast.push(bal + simAccum);
      }
    }
    if (fcastStartIdx > 0) {
      fcast[fcastStartIdx] = hist[fcastStartIdx];
      simFcast[fcastStartIdx] = hist[fcastStartIdx];
    }

    const zeroCross = makeZeroCross(fcast.map((v,i) => v === null ? hist[i] : v), fcastStartIdx);

    const datasets = [
      { label: 'Balance', data: hist, borderColor: '#3b82f6', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.3 }
    ];
    if (simActive) {
      datasets.push({ label: 'Original', data: fcast, borderColor: '#f5c518', borderWidth: 1, borderDash: [5,3], fill: false, pointRadius: 0, tension: 0.3 });
      datasets.push({ label: 'Simulated', data: simFcast, borderColor: '#22c55e', borderWidth: 2, fill: false, pointRadius: 0, tension: 0.3 });
    } else {
      datasets.push({ label: 'Forecast', data: fcast, borderColor: '#f5c518', borderWidth: 1.5, borderDash: [5,3], fill: false, pointRadius: 0, tension: 0.3 });
    }

    cfChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
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

  /* ── Due window helpers ─────────────────────────────────────────────────── */

  function nextDueDate(dueDay) {
    const today = new Date(); today.setHours(0,0,0,0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay);
    return thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
  }

  function daysUntilDate(d) {
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.ceil((d - today) / 86400000);
  }

  /* ── Budget helpers ─────────────────────────────────────────────────────── */

  function budgetPeriodFilter(budget) {
    const today = new Date();
    const period = budget.period || 'Monthly';
    if (period === 'Annual') {
      const yr = today.getFullYear().toString();
      return t => (t.date||'').startsWith(yr);
    }
    if (period === 'One-time') {
      const s = budget.start_date || '1970-01-01';
      const e = budget.end_date   || '2099-12-31';
      return t => (t.date||'') >= s && (t.date||'') <= e;
    }
    const mo = today.toISOString().slice(0, 7);
    return t => (t.date||'').slice(0, 7) === mo;
  }

  function calcBudgetRemaining(budget) {
    const filter = budgetPeriodFilter(budget);
    const spent = txData
      .filter(t => {
        if (t.type !== 'Expense') return false;
        const bid = Array.isArray(t.budget_id) ? t.budget_id[0] : t.budget_id;
        return bid === budget.id && filter(t);
      })
      .reduce((s,t) => s + Number(t.amount||0), 0);
    return Number(budget.amount || 0) - spent;
  }

  /* ── Simulation banner ──────────────────────────────────────────────────── */

  function renderSimBanner() {
    const zone = el('cf-cards');
    if (!zone) return;
    let banner = document.getElementById('cf-sim-banner');

    if (cutItems.size === 0) {
      if (banner) banner.remove();
      return;
    }

    const saving = simSavingsPerMonth();
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cf-sim-banner';
      zone.parentNode.insertBefore(banner, zone);
    }
    banner.style.cssText = 'background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.4);border-radius:var(--radius);padding:0.4rem 0.75rem;margin-bottom:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
    banner.innerHTML = `<span style="font-size:0.72rem;color:var(--text-dim)">⚠ Simulation active — <strong style="color:var(--text)">${cutItems.size}</strong> item${cutItems.size===1?'':'s'} cut · Saving <strong style="color:#22c55e">${fmt(saving)}/mo</strong></span>
      <button id="cf-sim-reset" style="font-size:0.68rem;padding:0.15rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-dim);cursor:pointer">Reset all</button>`;
    document.getElementById('cf-sim-reset')?.addEventListener('click', () => {
      cutItems.clear();
      renderAll();
    });
  }

  /* ── Due window toolbar ─────────────────────────────────────────────────── */

  function ensureDueTool() {
    if (document.getElementById('cf-due-tool')) return;
    const viewTog = el('cf-view-toggle');
    if (!viewTog) return;
    const wrap = document.createElement('div');
    wrap.id = 'cf-due-tool';
    wrap.style.cssText = 'display:none;padding:0.35rem 0;';
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <span style="font-size:0.72rem;color:var(--text-dim)">Due in:</span>
      <input id="cf-due-days" type="number" min="1" max="90" placeholder="days" style="width:64px;font-size:0.78rem;padding:0.2rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
      <button id="cf-due-check" style="font-size:0.72rem;padding:0.2rem 0.6rem;background:var(--accent);color:#000;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">Check</button>
      <button id="cf-due-clear" style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-dim);cursor:pointer;display:none">Clear</button>
    </div>
    <div id="cf-due-summary" style="display:none;margin-top:0.35rem;font-size:0.72rem;color:var(--text-dim);background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:0.35rem 0.6rem;line-height:1.6"></div>`;
    viewTog.after(wrap);

    document.getElementById('cf-due-check')?.addEventListener('click', () => {
      const v = Number(document.getElementById('cf-due-days')?.value || 0);
      if (!v || v < 1) return;
      dueWindowDays = v;
      document.getElementById('cf-due-clear').style.display = '';
      renderCards();
    });
    document.getElementById('cf-due-clear')?.addEventListener('click', () => {
      dueWindowDays = null;
      document.getElementById('cf-due-days').value = '';
      document.getElementById('cf-due-clear').style.display = 'none';
      document.getElementById('cf-due-summary').style.display = 'none';
      renderCards();
    });
  }

  function showDueTool(visible) {
    const t = document.getElementById('cf-due-tool');
    if (t) t.style.display = visible ? '' : 'none';
    if (!visible) {
      dueWindowDays = null;
      const s = document.getElementById('cf-due-summary');
      if (s) s.style.display = 'none';
    }
  }

  function renderDueSummary() {
    const summaryEl = document.getElementById('cf-due-summary');
    if (!summaryEl || dueWindowDays === null) return;

    let p1Total = 0;
    liabilities
      .filter(l => l.active !== false && Number(l.monthly_payment||0) > 0)
      .forEach(l => {
        const dd = Number(l.payment_due_day||0);
        if (!dd) return;
        const nd = nextDueDate(dd);
        if (daysUntilDate(nd) <= dueWindowDays) p1Total += Number(l.monthly_payment||0);
      });

    const currentCash = lastStats.currentCash;
    const totalOut30 = txData.filter(t => t.type==='Expense').reduce((s,t)=>s+Number(t.amount||0),0);
    const daysPassed = Math.max(1, new Date().getDate());
    const dailyBurn = (totalOut30 / daysPassed) + (liabilities.reduce((s,l)=>s+Number(l.monthly_payment||0),0)/30);
    const daysToEmpty = dailyBurn > 0 ? Math.floor(currentCash / dailyBurn) : 99999;

    summaryEl.style.display = '';
    summaryEl.innerHTML = `Due in <strong>${dueWindowDays}</strong> days:<br>
      P1 Legal: <strong style="color:#ef4444">${fmt(p1Total)}</strong> &nbsp;|&nbsp;
      P2 Projects: <span style="opacity:0.5">n/a (9C)</span> &nbsp;|&nbsp;
      Total committed: <strong>${fmt(p1Total)}</strong><br>
      Current balance: <strong style="color:var(--green)">${fmt(currentCash)}</strong>
      → Days until empty: <strong>${daysToEmpty > 999 ? '—' : daysToEmpty + 'd'}</strong> (at current burn)`;
  }

  /* ── Card view renderer ─────────────────────────────────────────────────── */

  function renderCards() {
    const zone = el('cf-cards');
    if (!zone) return;

    if (cfView === 'card') {
      renderCardView(zone);
    } else {
      renderListView(zone);
    }
    renderSimBanner();
  }

  function renderListView(zone) {
    const rows = [...txData].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 60);
    if (!rows.length) {
      zone.style.cssText = '';
      zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem 0">No transactions</p>';
      return;
    }
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

  function renderCardView(zone) {
    // ── collect card data ──────────────────────────────────────────────────
    const actualIncome = txData
      .filter(t => t.type === 'Income' && t.source !== 'LiabilityPayment')
      .sort((a,b) => Number(b.amount||0) - Number(a.amount||0));

    const borrowIncome = txData
      .filter(t => t.type === 'Income' && t.source === 'LiabilityPayment')
      .sort((a,b) => Number(b.amount||0) - Number(a.amount||0));

    const debtCards = liabilities
      .filter(l => l.active !== false && Number(l.monthly_payment||0) > 0 && Number(l.current_balance||0) > 0)
      .sort((a,b) => Number(b.monthly_payment||0) - Number(a.monthly_payment||0));

    const budgetCards = budgets
      .map(b => ({ ...b, _remaining: calcBudgetRemaining(b) }))
      .filter(b => b._remaining > 0)
      .sort((a,b) => b._remaining - a._remaining);

    const unbudgeted = txData
      .filter(t => {
        if (t.type !== 'Expense') return false;
        const bid = Array.isArray(t.budget_id) ? t.budget_id[0] : t.budget_id;
        return !bid;
      })
      .sort((a,b) => Number(b.amount||0) - Number(a.amount||0));

    const allAmounts = [
      ...actualIncome.map(t => Number(t.amount||0)),
      ...borrowIncome.map(t => Number(t.amount||0)),
      ...debtCards.map(l => Number(l.monthly_payment||0)),
      ...budgetCards.map(b => b._remaining),
      ...unbudgeted.map(t => Number(t.amount||0))
    ];
    const maxAmt = Math.max(...allAmounts, 1);

    function propH(amt) { return Math.max(72, Math.sqrt(Math.abs(amt) / maxAmt) * 160); }

    function makeCard({ key, label, sub, amount, sign, color, border, badge, badgeColor, eligible, dueTag }) {
      const isCut = eligible && cutItems.has(key);
      const h = propH(amount);
      const tags = [];
      if (dueTag) tags.push(`<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:#ef4444;color:#fff;font-weight:700">${esc(dueTag)}</span>`);
      if (badge)  tags.push(`<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:${badgeColor||'#4b5563'};color:#fff;font-weight:600;letter-spacing:0.03em">${esc(badge)}</span>`);
      const cutBtnHtml = eligible
        ? `<button data-cfcut="${esc(key)}" style="font-size:0.6rem;padding:0.1rem 0.35rem;border:1px solid var(--border);border-radius:3px;background:${isCut?'rgba(239,68,68,0.15)':'transparent'};color:var(--text-dim);cursor:pointer;margin-top:0.25rem">${isCut ? '↩ Restore' : '✂ Cut'}</button>`
        : '';
      return `<div style="position:relative;min-height:${h}px;display:flex;flex-direction:column;justify-content:space-between;background:var(--bg-card,var(--bg-raised));border:${border};border-radius:var(--radius);opacity:${isCut?0.45:1};transition:opacity 0.2s;overflow:hidden">
  <div style="padding:0.65rem 0.8rem 0.3rem">
    ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:0.2rem;margin-bottom:0.2rem">${tags.join('')}</div>` : ''}
    <div style="font-size:0.81rem;font-weight:600;color:var(--text,var(--text-primary));line-height:1.25">${esc(label)}</div>
    ${sub ? `<div style="font-size:0.67rem;color:var(--text-dim);margin-top:0.05rem">${esc(sub)}</div>` : ''}
  </div>
  <div style="padding:0.3rem 0.8rem 0.6rem;display:flex;flex-direction:column;align-items:flex-end">
    <div style="font-size:0.85rem;font-weight:700;color:${color};${isCut?'text-decoration:line-through;opacity:0.5':''}">${sign}${fmt(Math.abs(amount))}</div>
    ${isCut ? '<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim)">฿0</div>' : ''}
    ${cutBtnHtml}
  </div>
</div>`;
    }

    function section(title, color, cards) {
      if (!cards.length) return '';
      return `<div class="section-band" style="color:${color};margin-top:0.5rem">${esc(title)}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">
${cards.join('')}
</div>`;
    }

    // ── due window tagging ─────────────────────────────────────────────────
    function debtDueTag(l) {
      if (dueWindowDays === null) return null;
      const dd = Number(l.payment_due_day||0);
      if (!dd) return null;
      const d = daysUntilDate(nextDueDate(dd));
      return d <= dueWindowDays ? `DUE P1 (${d}d)` : null;
    }

    // ── build card html ────────────────────────────────────────────────────
    const inCards = [
      ...actualIncome.map(t => makeCard({
        key: 'tx-' + t.id,
        label: t.budget_label || t.category_name || t.entity || t.description || '—',
        sub: t.date.slice(5) + (t.entity ? ' · ' + t.entity : ''),
        amount: Number(t.amount||0), sign: '+', color: 'var(--green)',
        border: '1px solid rgba(34,197,94,0.35)', badge: null, eligible: false
      })),
      ...borrowIncome.map(t => makeCard({
        key: 'borrow-' + t.id,
        label: t.entity || t.description || 'Loan received',
        sub: 'New loan received · ' + t.date.slice(5),
        amount: Number(t.amount||0), sign: '+', color: 'var(--green)',
        border: '1px dashed rgba(34,197,94,0.5)', badge: 'Borrow', badgeColor: '#15803d', eligible: false
      }))
    ];

    const outCards = [
      ...debtCards.map(l => makeCard({
        key: 'liab-' + l.id,
        label: l.name || '—',
        sub: (l.creditor_type || 'Lender') + ' · ' + (l.payment_due_day ? `Due ${l.payment_due_day}th` : 'Monthly'),
        amount: Number(l.monthly_payment||0), sign: '-', color: 'var(--red)',
        border: '1px dashed rgba(239,68,68,0.45)', badge: 'Debt', badgeColor: '#b91c1c',
        eligible: true, dueTag: debtDueTag(l)
      })),
      ...budgetCards.map(b => makeCard({
        key: 'budget-' + b.id,
        label: b.label || '—',
        sub: b.category_group || b.category_name || b.period || '',
        amount: b._remaining, sign: '-', color: 'rgba(239,68,68,0.85)',
        border: '1px solid rgba(239,68,68,0.2)', badge: 'Budget', badgeColor: '#9a3412',
        eligible: true, dueTag: dueWindowDays !== null ? 'Review' : null
      })),
      ...unbudgeted.map(t => makeCard({
        key: 'tx-' + t.id,
        label: t.category_name || t.entity || t.description || '—',
        sub: t.date.slice(5) + (t.entity ? ' · ' + t.entity : ''),
        amount: Number(t.amount||0), sign: '-', color: 'var(--red)',
        border: '1px solid rgba(239,68,68,0.35)', badge: null, eligible: false
      }))
    ];

    zone.style.cssText = 'padding:0.25rem 0.5rem';
    zone.innerHTML = section('CASH IN', 'var(--green)', inCards) + section('CASH OUT', 'var(--red)', outCards);

    if (dueWindowDays !== null) renderDueSummary();
  }

  /* ── Combined re-render (for simulation toggle) ─────────────────────────── */

  function renderAll() {
    renderChart(lastStats.currentCash, lastStats.dailyNet, lastEnd);
    renderCards();
  }

  /* ── Toggle init ────────────────────────────────────────────────────────── */

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
      showDueTool(cfView === 'card');
      renderCards();
    });
  }

  /* ── Load & render ──────────────────────────────────────────────────────── */

  async function loadAndRender() {
    const { start, end } = rangeWindow(activeRange);
    lastEnd = end;
    cutItems.clear();

    const [txR, liR, syR, budR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/liabilities'),
      api('/api/cashflow-sync'),
      api('/api/budgets?active_only=true')
    ]);

    txData      = txR.status==='fulfilled'  ? (txR.value.records||[]).map(r=>({id:r.id,...r.fields}))  : [];
    liabilities = liR.status==='fulfilled'  ? (liR.value.records||[]).map(r=>({id:r.id,...r.fields}))  : [];
    syncPoint   = syR.status==='fulfilled'  ? (syR.value.syncPoint||null)                                : null;
    budgets     = budR.status==='fulfilled' ? (budR.value.records||[]).map(r=>({id:r.id,...r.fields})) : [];

    const stats = computeStats();
    lastStats = stats;
    renderChart(stats.currentCash, stats.dailyNet, end);
    renderCards();
  }

  function initSyncForm() {
    const saveBtn = el('cf-sync-save');
    if (!saveBtn) return;
    const today = new Date().toISOString().split('T')[0];
    const dateEl = el('cf-sync-date');
    if (dateEl && !dateEl.value) dateEl.value = today;
    saveBtn.addEventListener('click', async () => {
      const amount  = Number(el('cf-sync-balance')?.value || 0);
      const date    = el('cf-sync-date')?.value || today;
      const msgEl   = el('cf-sync-msg');
      if (!amount || !date) {
        if (msgEl) { msgEl.textContent = 'Balance and date required'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
        return;
      }
      try {
        const r = await fetch('/api/cashflow-sync', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, date })
        });
        if (!r.ok) throw new Error('API ' + r.status);
        const form = el('cf-sync-form');
        if (form) form.style.display = 'none';
        loadAndRender().catch(console.error);
      } catch (err) {
        const msgEl = el('cf-sync-msg');
        if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
      }
    });
  }

  function initCutDelegation() {
    const zone = el('cf-cards');
    if (!zone) return;
    zone.addEventListener('click', e => {
      const btn = e.target.closest('[data-cfcut]');
      if (!btn) return;
      const key = btn.dataset.cfcut;
      if (!key) return;
      if (cutItems.has(key)) cutItems.delete(key); else cutItems.add(key);
      renderAll();
    });
  }

  function init() {
    if (initialized) return; initialized = true;
    initRangeToggle();
    initViewToggle();
    initSyncForm();
    initCutDelegation();
    ensureDueTool();
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'cashflow') init(); });
  if (el('panel-cashflow')?.classList.contains('active')) init();
})();
