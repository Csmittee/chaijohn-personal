/* cashflow.injector.js — Cash Flow panel (M2.1)
 * 9B5: complete forecast engine, DEF CON 5 firewall, simulation mode, full card types
 */
(function () {
  'use strict';

  /* ── Constants ───────────────────────────────────────────────────────────── */
  const FLOOR = 20000; // ฿20k safety floor

  /* ── Utilities ───────────────────────────────────────────────────────────── */
  const fmt  = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const el   = id => document.getElementById(id);

  function toDateStr(d) {
    return d.toISOString().split('T')[0];
  }
  function todayStr() { return toDateStr(new Date()); }
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `API ${r.status}`); }
    return r.json();
  }

  /* ── Module state ────────────────────────────────────────────────────────── */
  const CF = {
    transactions:   [],
    budgets:        [],
    liabilities:    [],
    forecast:       [],
    currentBalance: 0,
    syncDate:       null,
    simulation: {
      active:  false,
      onHold:  {},         // { budgetId: true }
      intents: {},         // { budgetId: amount }
      actions: [{ what: '', amount: '', byDate: '' }, { what: '', amount: '', byDate: '' }, { what: '', amount: '', byDate: '' }],
      note:    ''
    },
    defcon:     null,      // null | { active, status, ticket }
    view:       'list',    // 'list' | 'card'
    period:     '1M',      // '1M' | '3M' | '6M'
    viewMonth:  null,      // null = current month, or { year, month } (0-indexed)
    dueInDays:  null
  };

  let cfChart          = null;
  let initialized      = false;
  let _cfListCollapsed = {}; // { income: bool, expense: bool, project_funding: bool }

  /* ── Budget helpers ──────────────────────────────────────────────────────── */

  function getBudgetType(budget) {
    if (budget.start_date && budget.end_date && budget.start_date === budget.end_date) return 'one-day-bound';
    if (budget.period_due_day) return 'force-pay';
    return 'standard';
  }

  function prorateAmount(budget, period) {
    const amt = Number(budget.amount || 0);
    const p   = budget.period || 'Monthly';
    let monthly;
    if (p === 'Annual')  monthly = amt / 12;
    else if (p === '3x-yr' || p === '3x-year') monthly = amt / 4;
    else if (p === '6x-yr' || p === '6x-year') monthly = amt / 2;
    else monthly = amt; // Monthly or One-time
    if (period === '1M') return monthly;
    if (period === '3M') return monthly * 3;
    if (period === '6M') return monthly * 6;
    return monthly;
  }

  function prorateAnnotation(budget) {
    const amt = Number(budget.amount || 0);
    const p   = budget.period || 'Monthly';
    if (p === 'Annual')  return `${fmt(amt)}/yr ÷ 12 = ${fmt(amt/12)}/mo`;
    if (p === '3x-yr' || p === '3x-year') return `${fmt(amt)} · 3x/yr ÷ 4 = ${fmt(amt/4)}/mo`;
    if (p === '6x-yr' || p === '6x-year') return `${fmt(amt)} · 6x/yr ÷ 2 = ${fmt(amt/2)}/mo`;
    return `${fmt(amt)}/mo`;
  }

  function getBudgetSpentThisPeriod(budgetId) {
    const mo = todayStr().slice(0, 7);
    return CF.transactions
      .filter(t => {
        if (t.type !== 'Expense') return false;
        const bid = Array.isArray(t.budget_id) ? t.budget_id[0] : t.budget_id;
        return bid === budgetId && (t.date || '').slice(0, 7) === mo;
      })
      .reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  /* ── Window dates ────────────────────────────────────────────────────────── */

  function getWindowDates() {
    const now    = new Date();
    const yr     = CF.viewMonth ? CF.viewMonth.year  : now.getFullYear();
    const mo     = CF.viewMonth ? CF.viewMonth.month : now.getMonth(); // 0-indexed
    const months = CF.period === '6M' ? 6 : CF.period === '3M' ? 3 : 1;
    const windowStart = new Date(yr, mo, 1);
    const windowEnd   = new Date(yr, mo + months, 0); // last day of last month
    return { windowStart, windowEnd };
  }

  /* ── Forecast engine ─────────────────────────────────────────────────────── */

  function _buildForecastWith(onHoldOverride, intentsOverride) {
    const { windowStart, windowEnd } = getWindowDates();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayS = todayStr();

    // Tx delta map
    const txByDate = {};
    CF.transactions.forEach(t => {
      if (!t.date) return;
      const amt   = Number(t.amount || 0);
      const delta = t.type === 'Income' ? amt : -amt;
      txByDate[t.date] = (txByDate[t.date] || 0) + delta;
    });

    // Compute balance at windowStart by walking backward from currentBalance
    let bal = CF.currentBalance;
    {
      const cur = new Date(today);
      while (toDateStr(cur) > toDateStr(windowStart)) {
        const ds = toDateStr(cur);
        if (ds !== todayS) bal -= (txByDate[ds] || 0);
        cur.setDate(cur.getDate() - 1);
      }
      // also undo windowStart day itself if it's before or on today
      if (toDateStr(windowStart) < todayS) {
        // windowStart's transactions will be re-applied when walking forward
        // balance here = balance at START of windowStart (before that day's tx)
      }
    }

    // Projected outflows maps
    const projByDate     = {}; // date -> delta (negative = outflow)
    const dailyBurnByMo  = {}; // 'YYYY-MM' -> burn per day

    // Debt outflows — booked on payment_due_day each month
    CF.liabilities.filter(l => l.active !== false && Number(l.monthly_payment || 0) > 0).forEach(lib => {
      const dueDay = Number(lib.payment_due_day || 5);
      let cursor   = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
      while (cursor <= windowEnd) {
        const payDate = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);
        const payStr  = toDateStr(payDate);
        if (payDate >= windowStart && payDate <= windowEnd && payStr > todayS) {
          projByDate[payStr] = (projByDate[payStr] || 0) - Number(lib.monthly_payment);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    });

    // Budget outflows — 3 types
    CF.budgets.forEach(budget => {
      if (onHoldOverride[budget.id]) return;
      const intentAmt = intentsOverride[budget.id];
      const type      = getBudgetType(budget);

      if (type === 'one-day-bound') {
        const payStr = budget.start_date;
        if (payStr && payStr > todayS && payStr >= toDateStr(windowStart) && payStr <= toDateStr(windowEnd)) {
          const amt = intentAmt !== undefined ? Number(intentAmt) : Number(budget.amount || 0);
          projByDate[payStr] = (projByDate[payStr] || 0) - amt;
        }
      } else if (type === 'force-pay') {
        const dueDay = Number(budget.period_due_day);
        let cursor   = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
        while (cursor <= windowEnd) {
          const payDate = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);
          const payStr  = toDateStr(payDate);
          if (payDate >= windowStart && payDate <= windowEnd && payStr > todayS) {
            const monthly = prorateAmount(budget, '1M');
            const amt     = intentAmt !== undefined ? Number(intentAmt) : monthly;
            projByDate[payStr] = (projByDate[payStr] || 0) - amt;
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        // Standard — daily burn: fixed rate per calendar month
        let cursor = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
        while (cursor <= windowEnd) {
          const monthStr = toDateStr(cursor).slice(0, 7);
          const monthly  = prorateAmount(budget, '1M');
          const amt      = intentAmt !== undefined ? Number(intentAmt) : monthly;
          const dim      = daysInMonth(cursor.getFullYear(), cursor.getMonth());
          dailyBurnByMo[monthStr] = (dailyBurnByMo[monthStr] || 0) + (amt / dim);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    });

    // Walk forward from windowStart to windowEnd
    const forecast = [];
    let running = bal;

    for (let d = new Date(windowStart); toDateStr(d) <= toDateStr(windowEnd); d.setDate(d.getDate() + 1)) {
      const ds      = toDateStr(d);
      const monthS  = ds.slice(0, 7);

      if (ds <= todayS) {
        running += (txByDate[ds] || 0);
        forecast.push({ date: ds, balance: running, isProjected: false, wouldGoBelow20k: running < FLOOR });
      } else {
        const burn = dailyBurnByMo[monthS] || 0;
        running   -= burn;
        running   += (projByDate[ds] || 0);
        forecast.push({ date: ds, balance: running, isProjected: true, wouldGoBelow20k: running < FLOOR });
      }
    }

    return forecast;
  }

  function buildForecast() {
    return _buildForecastWith(CF.simulation.onHold, CF.simulation.intents);
  }

  function buildForecastOriginal() {
    return _buildForecastWith({}, {});
  }

  /* ── Firewall ────────────────────────────────────────────────────────────── */

  function checkFirewall(forecast) {
    const future90   = forecast.filter(d => d.isProjected).slice(0, 90);
    const minBalance = future90.length ? Math.min(...future90.map(d => d.balance)) : Infinity;
    const negIdx     = future90.findIndex(d => d.balance <= 0);
    const hasNeg90   = negIdx !== -1;
    const below20k   = future90.some(d => d.balance < FLOOR);

    const bannerSlot = document.getElementById('cf-firewall-banner');
    if (!bannerSlot) return;

    if (CF.defcon && (CF.defcon.status === 'active' || CF.defcon.status === 'warning')) {
      renderDefConBanner(bannerSlot, forecast);
    } else if (hasNeg90) {
      const daysToZero = negIdx;
      renderYellowAlert(bannerSlot,
        `⚡ Critical: cashflow goes negative in ${daysToZero}d · balance ${fmt(minBalance)} · run simulation now`,
        '#ef4444');
    } else if (below20k) {
      const firstLow = future90.find(d => d.balance < FLOOR);
      renderYellowAlert(bannerSlot,
        `⚠ Low cashflow — week of ${firstLow ? firstLow.date.slice(5) : '?'} · projected ${fmt(firstLow ? firstLow.balance : 0)} · take action now`,
        '#f59e0b');
    } else {
      bannerSlot.innerHTML = '';
      bannerSlot.style.display = 'none';
    }
  }

  function renderYellowAlert(slot, msg, color) {
    slot.style.display = '';
    slot.innerHTML = `<div style="background:${color}22;border:1px solid ${color}66;border-radius:var(--radius);
      padding:0.45rem 0.85rem;margin-bottom:0.5rem;font-size:0.75rem;color:${color};
      display:flex;align-items:center;gap:0.5rem">
      <span class="blink-slow" style="font-size:0.85rem">●</span>${esc(msg)}</div>`;
  }

  function renderDefConBanner(slot, forecast) {
    const tk = CF.defcon?.ticket;
    if (!tk) return;
    const since      = tk.triggeredAt || '—';
    const daysActive = tk.triggeredAt
      ? Math.ceil((new Date() - new Date(tk.triggeredAt)) / 86400000)
      : '?';
    const onHoldN    = Object.keys(CF.simulation.onHold).length;
    const intentN    = Object.keys(CF.simulation.intents).length;
    const carryTotal = (tk.carryDebt || []).reduce((s, c) => s + (c.total || 0), 0);

    // Allowance calc
    const stratStart = new Date(tk.period?.start || since);
    const stratEnd   = new Date(tk.period?.end   || since);
    const stratDays  = Math.max(1, Math.ceil((stratEnd - stratStart) / 86400000));
    const gapNeeded  = tk.triggerBalance ? Math.max(0, FLOOR * 3 - tk.triggerBalance) : 0;
    const dailyAllow = gapNeeded > 0 ? (gapNeeded / stratDays) : 1500;
    const weekAllow  = dailyAllow * 7;

    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = toDateStr(weekStart);
    const usedThisWeek = CF.transactions
      .filter(t => t.type === 'Expense' && (t.date || '') >= weekStartStr)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const leftThisWeek = weekAllow - usedThisWeek;

    // Bills next 7 days
    const in7 = toDateStr(new Date(now.getTime() + 7 * 86400000));
    const billsNext7 = CF.liabilities
      .filter(l => l.active !== false && l.monthly_payment > 0 && l.payment_due_day)
      .map(l => {
        const dueDay = Number(l.payment_due_day);
        const dueThis = new Date(now.getFullYear(), now.getMonth(), dueDay);
        const dueNext = dueThis >= now ? dueThis : new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
        return { ...l, nextDue: toDateStr(dueNext) };
      })
      .filter(l => l.nextDue > toDateStr(now) && l.nextDue <= in7);

    // Income earned since strategy start
    const earnedSinceStart = CF.transactions
      .filter(t => t.type === 'Income' && (t.date || '') >= (tk.triggeredAt || ''))
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const statusColor = CF.defcon.status === 'warning' ? '#f59e0b' : '#ef4444';

    slot.style.display = '';
    slot.innerHTML = `
      <style>
        .blink-slow  { animation: blink 2s step-start infinite; }
        .blink-med   { animation: blink 1s step-start infinite; }
        .blink-fast  { animation: blink 0.5s step-start infinite; }
        @keyframes blink { 50% { opacity: 0; } }
      </style>
      <div style="border:1px solid ${statusColor}66;border-radius:var(--radius);margin-bottom:0.75rem;overflow:hidden">
        <div style="background:${statusColor}22;padding:0.45rem 0.85rem;font-size:0.75rem;color:${statusColor};
          display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
          <span style="display:flex;align-items:center;gap:0.4rem">
            <span class="${CF.defcon.status==='warning'?'blink-med':'blink-fast'}">⚡</span>
            <strong>DEF CON 5 ${CF.defcon.status==='warning'?'— monitoring exit condition':''}</strong>
            since ${esc(since)} · ${daysActive}d active · exits when 90d above ฿20k for 7 weeks
          </span>
          <button id="cf-dc-view-plan" style="font-size:0.68rem;padding:0.15rem 0.5rem;border:1px solid ${statusColor}55;
            border-radius:3px;background:transparent;color:${statusColor};cursor:pointer">view plan ›</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:0.72rem;border-top:1px solid ${statusColor}33">
          <div style="padding:0.6rem 0.85rem;border-right:1px solid var(--border)">
            <div style="font-weight:700;color:${statusColor};margin-bottom:0.35rem;font-size:0.65rem;letter-spacing:0.05em">PART 1 · STATUS</div>
            <div>Since <strong>${esc(since)}</strong></div>
            <div><strong>${daysActive}</strong> days active</div>
            <div style="margin-top:0.2rem">${onHoldN} on hold · ${intentN} intent</div>
            <div>${(tk.carryDebt||[]).length} committed actions</div>
            ${carryTotal > 0 ? `<div style="color:#f59e0b">Carry owed ${fmt(carryTotal)}</div>` : ''}
          </div>
          <div style="padding:0.6rem 0.85rem;border-right:1px solid var(--border)">
            <div style="font-weight:700;color:${statusColor};margin-bottom:0.35rem;font-size:0.65rem;letter-spacing:0.05em">PART 2 · YOUR ALLOWANCE</div>
            <div>Day limit <strong>${fmt(dailyAllow)}/day</strong></div>
            <div>Week limit <strong>${fmt(weekAllow)}/wk</strong></div>
            <div>Used this week <strong>${fmt(usedThisWeek)}</strong></div>
            <div style="color:${leftThisWeek>=0?'#22c55e':'#ef4444'}">Left this week <strong>${fmt(Math.abs(leftThisWeek))}</strong> ${leftThisWeek>=0?'✓':'⚠ over'}</div>
            ${billsNext7.length > 0 ? `<div style="margin-top:0.2rem;color:var(--text-dim)">Bills next 7d:</div>
            ${billsNext7.map(l=>`<div style="padding-left:0.3rem">${fmt(l.monthly_payment)} ${esc(l.name)} · ${l.nextDue.slice(5)}</div>`).join('')}` : ''}
          </div>
          <div style="padding:0.6rem 0.85rem">
            <div style="font-weight:700;color:${statusColor};margin-bottom:0.35rem;font-size:0.65rem;letter-spacing:0.05em">PART 3 · YOUR COMMITMENTS</div>
            ${(tk.actions||[]).map(a => {
              const daysLeft = a.byDate ? Math.ceil((new Date(a.byDate) - new Date()) / 86400000) : null;
              const blinkCls = daysLeft !== null && daysLeft < 7 ? 'blink-fast' : daysLeft !== null && daysLeft < 14 ? 'blink-med' : 'blink-slow';
              return `<div style="margin-bottom:0.25rem">→ ${esc(a.what)} ${fmt(a.amount)} by ${esc(a.byDate||'—')}<br>
                <span style="color:var(--text-dim)">earned ${fmt(earnedSinceStart)} · ${daysLeft !== null ? daysLeft + 'd left' : ''}</span>
                ${daysLeft !== null && daysLeft < 14 ? `<span class="${blinkCls}"> ⚡</span>` : ''}</div>`;
            }).join('') || '<div style="color:var(--text-dim)">No actions set</div>'}
          </div>
        </div>
      </div>`;

    document.getElementById('cf-dc-view-plan')?.addEventListener('click', showDefConModal);
  }

  /* ── Stat row ────────────────────────────────────────────────────────────── */

  function updateStats(forecast) {
    const todayS = todayStr();
    const future = forecast.filter(d => d.isProjected);

    // Days to ฿0
    const negIdx = future.findIndex(d => d.balance <= 0);
    let daysToZero = '—';
    if (CF.currentBalance <= 0) {
      daysToZero = '⚠ Now';
    } else if (negIdx !== -1) {
      daysToZero = negIdx + 'd';
    } else if (future.length > 0) {
      daysToZero = `>${future.length}d`;
    }

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('cf-days-zero', daysToZero);

    // Balance
    const balEl = el('cf-balance');
    if (balEl) {
      balEl.textContent = fmt(CF.currentBalance);
      balEl.style.color = CF.currentBalance >= 0 ? 'var(--green)' : 'var(--red)';
    }

    // Total out this period
    const { windowStart, windowEnd } = getWindowDates();
    const wsStr = toDateStr(windowStart), weStr = toDateStr(windowEnd);
    const totalOut = CF.transactions
      .filter(t => t.type === 'Expense' && t.date >= wsStr && t.date <= weStr)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    set('cf-total-out', fmt(totalOut));

    // Next income
    const futureEarns = CF.transactions
      .filter(t => t.type === 'Income' && t.date > todayS)
      .sort((a, b) => a.date.localeCompare(b.date));
    set('cf-incoming-due', futureEarns.length
      ? futureEarns[0].date.slice(5) + ' ' + fmt(futureEarns[0].amount) : '—');

    // Total in or carry reserve
    const totalIn = CF.transactions
      .filter(t => t.type === 'Income' && t.date >= wsStr && t.date <= weStr)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    set('cf-total-in', fmt(totalIn));

    // Sync info
    const syncEl = el('cf-sync-info');
    if (syncEl) {
      syncEl.innerHTML = CF.syncDate
        ? `⚡ sync: ${fmt(CF.currentBalance)} · ${CF.syncDate} <span style="font-size:0.6rem;opacity:0.55">[edit]</span>`
        : `<span style="text-decoration:underline dotted">⚡ Set startup cash</span>`;
      if (!syncEl._bound) {
        syncEl._bound = true;
        syncEl.addEventListener('click', () => {
          const f = el('cf-sync-form');
          if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
        });
      }
    }
  }

  /* ── Chart ───────────────────────────────────────────────────────────────── */

  function renderChart(forecast) {
    const canvas = el('cf-chart');
    if (!canvas) return;
    if (cfChart) { cfChart.destroy(); cfChart = null; }

    const simActive  = CF.simulation.active;
    const origFcast  = simActive ? buildForecastOriginal() : null;

    const labels   = [];
    const histData = [], fcastData = [], origData = [];

    function xLabel(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      if (CF.period === '1M') {
        return d.getDate() + ' ' + d.toLocaleDateString('en', { month: 'short' });
      }
      return d.toLocaleDateString('en', { month: 'short', year: CF.period === '6M' ? '2-digit' : undefined });
    }

    // Deduplicate labels for 3M/6M (one per month)
    let lastLabel = '';
    forecast.forEach((pt, i) => {
      const lbl = xLabel(pt.date);
      labels.push(lbl === lastLabel && CF.period !== '1M' ? '' : lbl);
      if (CF.period !== '1M') lastLabel = lbl;

      if (!pt.isProjected) {
        histData.push(pt.balance);
        fcastData.push(null);
        if (origFcast) origData.push(null);
      } else {
        histData.push(null);
        fcastData.push(pt.balance);
        if (origFcast) origData.push(origFcast[i]?.balance ?? null);
      }
    });

    // Connect history and forecast
    const firstFcast = fcastData.findIndex(v => v !== null);
    const lastHist   = histData.reduce((acc, v, i) => v !== null ? i : acc, -1);
    if (lastHist >= 0 && firstFcast >= 0) {
      fcastData[lastHist] = histData[lastHist];
      if (origFcast) origData[lastHist] = histData[lastHist];
    }

    // Today index for annotation
    const todayS     = todayStr();
    const todayIdx   = forecast.findIndex(pt => pt.date === todayS);
    const floor20kPx = FLOOR;

    const datasets = [
      {
        label: 'Balance',
        data: histData,
        borderColor: '#3b82f6',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.3
      }
    ];

    if (simActive && origFcast) {
      datasets.push({
        label: 'Original',
        data: origData,
        borderColor: 'rgba(99,102,241,0.55)',
        borderWidth: 1.5,
        borderDash: [5, 3],
        fill: false,
        pointRadius: 0,
        tension: 0.3
      });
      datasets.push({
        label: 'Simulated',
        data: fcastData,
        borderColor: '#22c55e',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.3
      });
    } else {
      datasets.push({
        label: 'Forecast',
        data: fcastData,
        borderColor: '#f5c518',
        borderWidth: 1.5,
        borderDash: [5, 3],
        fill: false,
        pointRadius: 0,
        tension: 0.3
      });
    }

    // Custom plugins: today line, ฿20k floor line, zero cross
    const plugins = [{
      id: 'cfAnnotations',
      afterDraw(chart) {
        const { ctx, scales: { x, y }, chartArea: { top, bottom } } = chart;
        if (!x || !y) return;
        ctx.save();

        // ฿20k floor line
        const floorY = y.getPixelForValue(floor20kPx);
        if (floorY >= top && floorY <= bottom) {
          ctx.strokeStyle = 'rgba(251,191,36,0.35)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(chart.chartArea.left, floorY);
          ctx.lineTo(chart.chartArea.right, floorY);
          ctx.stroke();
          ctx.fillStyle = 'rgba(251,191,36,0.6)';
          ctx.font = '9px system-ui';
          ctx.fillText('฿20k floor', chart.chartArea.left + 4, floorY - 3);
        }

        // Today marker
        if (todayIdx >= 0) {
          const todayX = x.getPixelForValue(todayIdx);
          ctx.strokeStyle = 'rgba(59,130,246,0.5)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(todayX, top);
          ctx.lineTo(todayX, bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 9px system-ui';
          ctx.fillText('today ◀', todayX + 3, top + 14);
        }

        // Zero crossing
        const allData = fcastData.map((v, i) => v !== null ? v : histData[i]);
        ctx.setLineDash([]);
        for (let i = 1; i < allData.length; i++) {
          const prev = allData[i - 1], curr = allData[i];
          if (prev != null && curr != null && prev >= 0 && curr < 0) {
            const ci   = (i - 1) + prev / (prev - curr);
            const xPos = x.getPixelForValue(Math.floor(ci))
              + (x.getPixelForValue(Math.ceil(ci)) - x.getPixelForValue(Math.floor(ci)))
              * (ci - Math.floor(ci));
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.moveTo(xPos, top);
            ctx.lineTo(xPos, bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 9px system-ui';
            ctx.fillText('⚠ ฿0', xPos + 3, top + 28);
            break;
          }
        }

        ctx.restore();
      }
    }];

    cfChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: simActive, position: 'top', labels: { boxWidth: 10, font: { size: 9 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { ticks: { maxTicksLimit: CF.period === '1M' ? 10 : 6, font: { size: 9 }, maxRotation: 0 } },
          y: { ticks: { font: { size: 9 }, callback: v => '฿' + (v / 1000).toFixed(0) + 'k' } }
        }
      },
      plugins
    });
  }

  /* ── Simulation summary box ──────────────────────────────────────────────── */

  function renderSimBox() {
    const zone = el('cf-cards');
    if (!zone) return;
    let box = document.getElementById('cf-sim-box');

    if (!CF.simulation.active) {
      if (box) box.remove();
      return;
    }

    const onHoldItems = CF.budgets.filter(b => CF.simulation.onHold[b.id]);
    const intentItems = CF.budgets.filter(b => CF.simulation.intents[b.id] !== undefined);
    const saving = onHoldItems.reduce((s, b) => s + prorateAmount(b, '1M'), 0)
      + intentItems.reduce((s, b) => {
        const orig   = prorateAmount(b, '1M');
        const intent = Number(CF.simulation.intents[b.id]);
        return s + (orig - intent);
      }, 0);

    const origFcast = buildForecastOriginal();
    const simFcast  = buildForecast();
    const origDays  = origFcast.filter(d => d.isProjected).findIndex(d => d.balance <= 0);
    const simDays   = simFcast.filter(d => d.isProjected).findIndex(d => d.balance <= 0);
    const origD     = origDays === -1 ? `>${origFcast.filter(d=>d.isProjected).length}d` : origDays + 'd';
    const simD      = simDays  === -1 ? `>${simFcast.filter(d=>d.isProjected).length}d`  : simDays  + 'd';
    const simMinBal = Math.min(...simFcast.filter(d=>d.isProjected).map(d=>d.balance), Infinity);
    const gapNeeded = simMinBal < FLOOR ? FLOOR - simMinBal : 0;

    if (!box) {
      box = document.createElement('div');
      box.id = 'cf-sim-box';
      zone.parentNode.insertBefore(box, zone);
    }

    const actions = CF.simulation.actions;

    box.innerHTML = `
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.4);
        border-radius:var(--radius);padding:0.75rem;margin-bottom:0.75rem;font-size:0.75rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.35rem">
          <span style="color:#f59e0b;font-weight:700;display:flex;align-items:center;gap:0.4rem">
            <span class="blink-med">●</span>
            Simulation · ${onHoldItems.length} on hold · ${intentItems.length} intents · saving ${fmt(saving)}/mo
          </span>
          <button id="cf-sim-reset" style="font-size:0.67rem;padding:0.12rem 0.45rem;border:1px solid var(--border);
            border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">Reset</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem 1rem;margin-bottom:0.6rem">
          ${onHoldItems.map(b=>`<div>On hold — <strong>${esc(b.label)}</strong> · ${fmt(prorateAmount(b,'1M'))} → ฿0</div>`).join('')}
          ${intentItems.map(b=>`<div>Intent — <strong>${esc(b.label)}</strong> · ${fmt(prorateAmount(b,'1M'))} → ${fmt(CF.simulation.intents[b.id])}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.3rem 0.5rem;border-top:1px solid rgba(251,191,36,0.25);
          padding-top:0.4rem;margin-bottom:0.6rem">
          <div>Monthly saving <strong style="color:#22c55e">+${fmt(saving)}</strong></div>
          <div>Days to ฿0 <strong>${origD} → ${simD}</strong></div>
          ${gapNeeded > 0 ? `<div>Gap still needed <strong style="color:#ef4444">${fmt(gapNeeded)}</strong></div>` : '<div></div>'}
        </div>

        <div style="font-size:0.7rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em;margin-bottom:0.35rem">ACTION PLAN</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.72rem">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:0.2rem 0.3rem">What</th>
            <th style="text-align:right;padding:0.2rem 0.3rem">Target ฿</th>
            <th style="text-align:right;padding:0.2rem 0.3rem">By when</th>
          </tr></thead>
          <tbody id="cf-action-rows">
            ${actions.map((a, i) => `<tr>
              <td style="padding:0.2rem 0.3rem"><input class="cf-action-what" data-idx="${i}"
                value="${esc(a.what)}" placeholder="Action…"
                style="width:100%;font-size:0.72rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;padding:0.15rem 0.3rem;color:var(--text)"></td>
              <td style="padding:0.2rem 0.3rem"><input class="cf-action-amt" data-idx="${i}" type="number"
                value="${esc(a.amount)}" placeholder="฿"
                style="width:80px;font-size:0.72rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;padding:0.15rem 0.3rem;color:var(--text);text-align:right"></td>
              <td style="padding:0.2rem 0.3rem"><input class="cf-action-date" data-idx="${i}" type="date"
                value="${esc(a.byDate)}"
                style="font-size:0.72rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;padding:0.15rem 0.3rem;color:var(--text)"></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <textarea id="cf-sim-note" rows="2" placeholder="Notes…"
          style="width:100%;margin-top:0.5rem;font-size:0.72rem;background:var(--bg-page);border:1px solid var(--border);
          border-radius:3px;padding:0.3rem 0.5rem;color:var(--text);resize:vertical;box-sizing:border-box">${esc(CF.simulation.note)}</textarea>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button id="cf-sim-activate" style="flex:1;font-size:0.72rem;padding:0.3rem 0.5rem;
            background:#ef4444;color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700">
            ⚡ Activate DEF CON 5 — enforce restrictions</button>
        </div>
      </div>`;

    // Wire action input listeners
    box.querySelectorAll('.cf-action-what').forEach(inp => {
      inp.addEventListener('change', () => {
        CF.simulation.actions[Number(inp.dataset.idx)].what = inp.value;
      });
    });
    box.querySelectorAll('.cf-action-amt').forEach(inp => {
      inp.addEventListener('change', () => {
        CF.simulation.actions[Number(inp.dataset.idx)].amount = inp.value;
      });
    });
    box.querySelectorAll('.cf-action-date').forEach(inp => {
      inp.addEventListener('change', () => {
        CF.simulation.actions[Number(inp.dataset.idx)].byDate = inp.value;
      });
    });
    document.getElementById('cf-sim-note')?.addEventListener('change', e => {
      CF.simulation.note = e.target.value;
    });
    document.getElementById('cf-sim-reset')?.addEventListener('click', () => {
      CF.simulation.active  = false;
      CF.simulation.onHold  = {};
      CF.simulation.intents = {};
      CF.simulation.actions = [{ what:'', amount:'', byDate:'' }, { what:'', amount:'', byDate:'' }, { what:'', amount:'', byDate:'' }];
      CF.simulation.note    = '';
      renderAll();
    });
    document.getElementById('cf-sim-activate')?.addEventListener('click', showDefConModal);
  }

  /* ── DEF CON execute modal ───────────────────────────────────────────────── */

  function showDefConModal() {
    if (document.getElementById('cf-dc-modal')) return;
    const tk       = CF.defcon?.ticket;
    const onHoldBuds = CF.budgets.filter(b => CF.simulation.onHold[b.id]);
    const intentBuds = CF.budgets.filter(b => CF.simulation.intents[b.id] !== undefined);
    const carryBuds  = onHoldBuds.filter(b => b.backlog_type === 'carry');
    const months     = CF.period === '6M' ? 6 : CF.period === '3M' ? 3 : 1;
    const carryDebt  = carryBuds.map(b => ({
      budgetId:  b.id,
      label:     b.label,
      perMonth:  prorateAmount(b, '1M'),
      months,
      total:     prorateAmount(b, '1M') * months
    }));
    const carryTotal = carryDebt.reduce((s, c) => s + c.total, 0);

    const { windowStart, windowEnd } = getWindowDates();
    const simFcast = buildForecast();
    const minBal   = Math.min(...simFcast.filter(d => d.isProjected).map(d => d.balance));
    const gapToClose = Math.max(0, FLOOR * 3 - minBal);
    const { windowStart: ws } = getWindowDates();
    const stratDays = Math.ceil((windowEnd - windowStart) / 86400000);
    const earnPerDay = stratDays > 0 ? gapToClose / stratDays : 0;

    const modal = document.createElement('div');
    modal.id = 'cf-dc-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border:2px solid #ef4444;border-radius:var(--radius);
        padding:1.25rem;max-width:600px;width:100%;max-height:80vh;overflow-y:auto">
        <div style="font-size:1rem;font-weight:700;color:#ef4444;margin-bottom:1rem">⚡ Activate DEF CON 5</div>

        ${onHoldBuds.length ? `
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-bottom:0.35rem">ON HOLD THIS PERIOD</div>
        ${onHoldBuds.map(b=>`<div style="font-size:0.78rem;padding:0.2rem 0">— ${esc(b.label)} · ${fmt(prorateAmount(b,'1M'))}/mo delayed
          <span style="color:#f59e0b">${b.backlog_type==='carry'?' · carry debt':' · forgive'}</span></div>`).join('')}
        <div style="margin:0.5rem 0;border-top:1px solid var(--border)"></div>` : ''}

        ${intentBuds.length ? `
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-bottom:0.35rem">INTENT COMMITTED</div>
        ${intentBuds.map(b=>`<div style="font-size:0.78rem;padding:0.2rem 0">— ${esc(b.label)} · ${fmt(prorateAmount(b,'1M'))} → ${fmt(CF.simulation.intents[b.id])} committed</div>`).join('')}
        <div style="margin:0.5rem 0;border-top:1px solid var(--border)"></div>` : ''}

        ${carryDebt.length ? `
        <div style="font-size:0.75rem;font-weight:700;color:#f59e0b;margin-bottom:0.35rem">CARRY DEBT ACCUMULATES</div>
        ${carryDebt.map(c=>`<div style="font-size:0.78rem;padding:0.2rem 0">— ${esc(c.label)} · ${fmt(c.perMonth)}/mo × ${c.months}mo = ${fmt(c.total)}</div>`).join('')}
        <div style="font-size:0.82rem;font-weight:700;color:#f59e0b;margin-top:0.2rem">Total family debt: ${fmt(carryTotal)}</div>
        <div style="margin:0.5rem 0;border-top:1px solid var(--border)"></div>` : ''}

        <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-bottom:0.35rem">INCOME TARGET</div>
        <div style="font-size:0.78rem;background:rgba(239,68,68,0.08);border-radius:var(--radius);padding:0.5rem;margin-bottom:0.5rem">
          <div>Safety reserve floor: <strong>฿20,000</strong></div>
          <div>Gap to close: <strong style="color:#ef4444">${fmt(gapToClose)}</strong></div>
          <div>Must earn: <strong>${fmt(earnPerDay)}/day · ${fmt(earnPerDay*7)}/wk · ${fmt(earnPerDay*30)}/mo</strong></div>
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:1rem">
          <button id="cf-dc-cancel" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);
            background:transparent;color:var(--text-dim);cursor:pointer">Cancel</button>
          <button id="cf-dc-confirm" style="flex:2;padding:0.5rem;background:#ef4444;color:#fff;border:none;
            border-radius:var(--radius);cursor:pointer;font-weight:700">Confirm — Activate DEF CON 5 now</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('cf-dc-cancel')?.addEventListener('click', () => modal.remove());
    document.getElementById('cf-dc-confirm')?.addEventListener('click', () => activateDefCon(carryDebt, gapToClose, modal));
  }

  async function activateDefCon(carryDebt, gapToClose, modal) {
    const { windowStart, windowEnd } = getWindowDates();
    const ticket = {
      id:               'DC5-' + Date.now().toString(36).toUpperCase(),
      triggeredAt:      todayStr(),
      triggerBalance:   CF.currentBalance,
      onHold:           Object.keys(CF.simulation.onHold),
      intents:          { ...CF.simulation.intents },
      actions:          CF.simulation.actions.filter(a => a.what),
      note:             CF.simulation.note,
      period:           { start: toDateStr(windowStart), end: toDateStr(windowEnd) },
      carryDebt
    };
    const payload = { active: true, status: 'active', triggeredAt: todayStr(), ticket };
    try {
      await api('/api/active-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      CF.defcon = payload;
      modal.remove();
      renderAll();
    } catch (err) {
      alert('Failed to activate: ' + err.message);
    }
  }

  /* ── Card view ───────────────────────────────────────────────────────────── */

  function propH(amt, maxAmt) {
    return Math.max(80, Math.sqrt(Math.abs(amt) / Math.max(maxAmt, 1)) * 180);
  }

  function makeCard({ key, label, sub, amount, sign, color, border, badges, eligible, holdable, intentable, dueTag, onHold, intentVal, spent, budgetPeriod, backlogType, prorated }) {
    const h       = propH(amount, 100000);
    const isHeld  = onHold;
    const hasIntent = intentVal !== undefined;

    let badgeHtml = '';
    if (dueTag)  badgeHtml += `<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:#ef4444;color:#fff;font-weight:700">${esc(dueTag)}</span> `;
    (badges || []).forEach(b => { badgeHtml += `<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:${b.color};color:#fff;font-weight:600">${esc(b.label)}</span> `; });
    if (backlogType === 'carry') badgeHtml += `<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:#92400e;color:#fef3c7;font-weight:600">carry</span> `;
    else if (backlogType === 'forgive') badgeHtml += `<span style="font-size:0.57rem;padding:0.04rem 0.3rem;border-radius:3px;background:#374151;color:#9ca3af;font-weight:600">forgive</span> `;

    const amtDisplay = hasIntent
      ? `<div style="font-size:0.78rem;text-decoration:line-through;opacity:0.45;color:${color}">${sign}${fmt(amount)}</div>
         <div style="font-size:0.82rem;font-weight:700;color:#f59e0b">intent: ${fmt(intentVal)}</div>`
      : `<div style="font-size:0.85rem;font-weight:700;color:${color};${isHeld?'text-decoration:line-through;opacity:0.45':''}">${sign}${fmt(amount)}</div>
         ${isHeld ? '<div style="font-size:0.72rem;color:var(--text-dim);font-weight:600">on hold this period</div>' : ''}`;

    let progressHtml = '';
    if (spent !== undefined && prorated !== undefined && prorated > 0) {
      const pct = Math.min(100, Math.round(spent / prorated * 100));
      const clr = pct >= 85 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e';
      progressHtml = `
        <div style="font-size:0.67rem;color:var(--text-dim);margin-top:0.15rem">
          spent ${fmt(spent)} · remaining ${fmt(Math.max(0, prorated - spent))}</div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:0.15rem">
          <div style="height:100%;width:${pct}%;background:${clr};border-radius:2px"></div>
        </div>`;
    }

    let btnHtml = '';
    if (holdable) btnHtml += `<button data-cfhold="${esc(key)}" style="font-size:0.6rem;padding:0.1rem 0.35rem;border:1px solid var(--border);border-radius:3px;background:${isHeld?'rgba(239,68,68,0.15)':'transparent'};color:var(--text-dim);cursor:pointer;margin-top:0.25rem">${isHeld?'↩ Release':'≥< On Hold'}</button> `;
    if (intentable) btnHtml += `<input class="cf-intent-input" data-budgetid="${esc(key.replace('budget-',''))}" type="number" placeholder="Intent ฿" value="${intentVal !== undefined ? intentVal : ''}" style="width:72px;font-size:0.6rem;padding:0.1rem 0.3rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">`;

    return `<div data-cfcard="${esc(key)}"
      draggable="${eligible ? 'true' : 'false'}"
      style="position:relative;min-height:${h}px;display:flex;flex-direction:column;justify-content:space-between;
      background:var(--bg-card,var(--bg-raised));border:${border};border-radius:var(--radius);
      opacity:${isHeld?0.5:1};transition:opacity 0.2s;overflow:hidden;cursor:${eligible?'grab':'default'};
      ${dueTag?'border-left:3px solid #ef4444':''}"
    >
      <div style="padding:0.65rem 0.8rem 0.3rem">
        ${badgeHtml ? `<div style="display:flex;flex-wrap:wrap;gap:0.2rem;margin-bottom:0.2rem">${badgeHtml}</div>` : ''}
        <div style="font-size:0.81rem;font-weight:600;color:var(--text);line-height:1.25">${esc(label)}</div>
        ${sub ? `<div style="font-size:0.67rem;color:var(--text-dim);margin-top:0.05rem">${esc(sub)}</div>` : ''}
        ${budgetPeriod ? `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:0.05rem">${esc(budgetPeriod)}</div>` : ''}
        ${progressHtml}
      </div>
      <div style="padding:0.3rem 0.8rem 0.6rem">
        ${amtDisplay}
        ${btnHtml ? `<div style="margin-top:0.25rem;display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center">${btnHtml}</div>` : ''}
      </div>
    </div>`;
  }

  function renderCardView(zone) {
    const todayS = todayStr();

    // ── CASH IN ──────────────────────────────────────────────────────────────
    const actualIncome = CF.transactions
      .filter(t => t.type === 'Income' && t.source !== 'LiabilityPayment')
      .sort((a, b) => Number(b.amount||0) - Number(a.amount||0));
    const borrowIncome = CF.transactions
      .filter(t => t.type === 'Income' && t.source === 'LiabilityPayment')
      .sort((a, b) => Number(b.amount||0) - Number(a.amount||0));

    // ── CASH OUT — DEBT ───────────────────────────────────────────────────────
    const debtCards = CF.liabilities
      .filter(l => l.active !== false && Number(l.monthly_payment||0) > 0 && Number(l.current_balance||0) > 0)
      .sort((a, b) => Number(b.monthly_payment||0) - Number(a.monthly_payment||0));

    // ── CASH OUT — BUDGET (grouped) ──────────────────────────────────────────
    const budgetGroups = {};
    CF.budgets.forEach(b => {
      const g = b.category_group || 'Other';
      if (!budgetGroups[g]) budgetGroups[g] = [];
      budgetGroups[g].push(b);
    });

    // Due window helper
    function debtDueTag(l) {
      if (CF.dueInDays === null || !l.payment_due_day) return null;
      const dueDay   = Number(l.payment_due_day);
      const now      = new Date(); now.setHours(0,0,0,0);
      const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
      const nextDue  = thisMonthDue >= now ? thisMonthDue : new Date(now.getFullYear(), now.getMonth()+1, dueDay);
      const days     = Math.ceil((nextDue - now) / 86400000);
      return days <= CF.dueInDays ? `DUE P1 (${days}d)` : null;
    }

    // Build HTML sections
    const inCards = [
      ...actualIncome.map(t => makeCard({
        key: 'tx-' + t.id,
        label: t.budget_label || t.category_name || t.entity || t.description || '—',
        sub: t.date.slice(5) + (t.entity ? ' · ' + t.entity : ''),
        amount: Number(t.amount||0), sign: '+', color: 'var(--green)',
        border: '1px solid rgba(34,197,94,0.35)', badges: [], eligible: false
      })),
      ...borrowIncome.map(t => makeCard({
        key: 'borrow-' + t.id,
        label: t.entity || t.description || 'Loan received',
        sub: 'Loan received · ' + t.date.slice(5),
        amount: Number(t.amount||0), sign: '+', color: 'var(--green)',
        border: '1px dashed rgba(34,197,94,0.5)', badges: [{ label:'Borrow', color:'#15803d' }], eligible: false
      }))
    ];

    const debtHtml = debtCards.map(l => makeCard({
      key: 'liab-' + l.id,
      label: l.name || '—',
      sub: (l.creditor_type || 'Lender') + (l.payment_due_day ? ` · due ${l.payment_due_day}th` : ' · monthly'),
      amount: Number(l.monthly_payment||0), sign: '-', color: 'var(--red)',
      border: CF.simulation.onHold['liab-' + l.id] ? '1px solid rgba(239,68,68,0.2)' : '1px dashed rgba(239,68,68,0.45)',
      badges: [{ label:'Debt · P1', color:'#b91c1c' }],
      eligible: true, holdable: true,
      onHold: !!CF.simulation.onHold['liab-' + l.id],
      dueTag: debtDueTag(l)
    })).join('');

    // Budget group sections
    let budgetSectionsHtml = '';
    Object.entries(budgetGroups).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([grpName, buds]) => {
      const prorated = buds.reduce((s, b) => s + prorateAmount(b, CF.period), 0);
      const budCards = buds.map(b => {
        const proratedAmt = prorateAmount(b, CF.period);
        const spent       = getBudgetSpentThisPeriod(b.id);
        const intentVal   = CF.simulation.intents[b.id];
        const isHeld      = !!CF.simulation.onHold[b.id];
        return makeCard({
          key: 'budget-' + b.id,
          label: b.label || '—',
          sub: b.category_group || '',
          amount: proratedAmt,
          sign: '-',
          color: 'rgba(239,68,68,0.85)',
          border: isHeld ? '1px solid rgba(100,116,139,0.3)' : '1px solid rgba(239,68,68,0.2)',
          badges: [{ label:'Budget', color:'#9a3412' }],
          eligible: true,
          holdable: true,
          intentable: true,
          onHold: isHeld,
          intentVal,
          spent,
          prorated: proratedAmt,
          budgetPeriod: prorateAnnotation(b),
          backlogType: b.backlog_type || 'forgive'
        });
      }).join('');

      budgetSectionsHtml += `
        <div style="margin-bottom:0.75rem">
          <div class="section-band" style="color:rgba(239,68,68,0.75);display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem">
            <span>${esc(grpName)}</span>
            <span style="font-size:0.67rem;opacity:0.7">${fmt(prorated)} this ${CF.period}</span>
          </div>
          <div data-cfgroup="${esc(grpName)}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.65rem">
            ${budCards}
          </div>
        </div>`;
    });

    zone.style.cssText = 'padding:0.25rem 0.5rem';
    zone.innerHTML = `
      ${inCards.length ? `
        <div class="section-band" style="color:var(--green);margin-bottom:0.35rem">CASH IN</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.65rem;margin-bottom:0.75rem">
          ${inCards.join('')}
        </div>` : ''}
      ${debtCards.length ? `
        <div class="section-band" style="color:var(--red);margin-bottom:0.35rem">CASH OUT — DEBT</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.65rem;margin-bottom:0.75rem">
          ${debtHtml}
        </div>` : ''}
      ${budgetSectionsHtml ? `
        <div class="section-band" style="color:rgba(239,68,68,0.85);margin-bottom:0.35rem">CASH OUT — BUDGET</div>
        ${budgetSectionsHtml}` : ''}`;

    // Wire on-hold toggles (delegated)
    // (handled by zone delegation in init)

    // Wire intent inputs (blur → set intent → rebuild sim)
    zone.querySelectorAll('.cf-intent-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const bid = inp.dataset.budgetid;
        const val = Number(inp.value || 0);
        if (inp.value === '' || isNaN(val)) {
          delete CF.simulation.intents[bid];
        } else {
          CF.simulation.intents[bid] = val;
          CF.simulation.active = true;
        }
        renderAll();
      });
    });

    // Init drag-to-reorder within groups
    zone.querySelectorAll('[data-cfgroup]').forEach(groupEl => {
      initDragDrop(groupEl, groupEl.dataset.cfgroup);
    });

    if (CF.dueInDays !== null) renderDueSummary();
  }

  /* ── Drag-to-reorder ─────────────────────────────────────────────────────── */

  function initDragDrop(groupEl, groupKey) {
    let dragSrc = null;
    const cards = groupEl.querySelectorAll('[data-cfcard]');
    cards.forEach(card => {
      card.addEventListener('dragstart', e => {
        dragSrc = card;
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.5';
      });
      card.addEventListener('dragend', () => {
        dragSrc = null;
        card.style.opacity = '';
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc === card) return;
        // Reorder DOM
        const allCards = [...groupEl.querySelectorAll('[data-cfcard]')];
        const srcIdx   = allCards.indexOf(dragSrc);
        const dstIdx   = allCards.indexOf(card);
        if (srcIdx < dstIdx) groupEl.insertBefore(dragSrc, card.nextSibling);
        else groupEl.insertBefore(dragSrc, card);
        // Save order to localStorage
        const order = [...groupEl.querySelectorAll('[data-cfcard]')].map(c => c.dataset.cfcard);
        try { localStorage.setItem('cf_card_order_' + groupKey, JSON.stringify(order)); } catch {}
      });
    });

    // Apply saved order
    try {
      const saved = JSON.parse(localStorage.getItem('cf_card_order_' + groupKey) || 'null');
      if (saved && saved.length) {
        const map = {};
        groupEl.querySelectorAll('[data-cfcard]').forEach(c => { map[c.dataset.cfcard] = c; });
        saved.forEach(key => { if (map[key]) groupEl.appendChild(map[key]); });
      }
    } catch {}
  }

  /* ── List view ───────────────────────────────────────────────────────────── */

  function renderListView(zone) {
    if (!CF.transactions.length) {
      zone.style.cssText = '';
      zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem 0">No transactions</p>';
      return;
    }
    zone.style.cssText = '';

    const sorted = [...CF.transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80);

    const incomeRows   = sorted.filter(t => t.type === 'Income');
    const fundingRows  = sorted.filter(t => t.type === 'Expense' && t.source === 'project_funding');
    const expenseRows  = sorted.filter(t => t.type === 'Expense' && t.source !== 'project_funding');

    function txRow(t) {
      const isIn  = t.type === 'Income';
      const label = t.budget_label || t.category_name || t.entity || t.description || '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.35rem 0.75rem;border-bottom:1px solid var(--border)">
        <div style="min-width:0;flex:1;margin-right:0.5rem">
          <span style="font-size:0.75rem;font-weight:600;color:var(--text)">${esc(label)}</span>
          <span style="font-size:0.66rem;color:var(--text-dim);margin-left:0.3rem">${(t.date||'').slice(5)}${t.entity ? ' · ' + esc(t.entity) : ''}</span>
        </div>
        <div style="font-size:0.78rem;font-weight:700;white-space:nowrap;color:${isIn?'var(--green)':'var(--red)'}">${isIn?'+':'-'}${fmt(t.amount)}</div>
      </div>`;
    }

    function secHeader(key, label, total, color) {
      const collapsed = !!_cfListCollapsed[key];
      return `<div data-cf-list-sec="${key}" style="display:flex;justify-content:space-between;align-items:center;
        padding:0.3rem 0.75rem;background:var(--bg-card);border-bottom:1px solid var(--border);
        cursor:pointer;user-select:none">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em">
          ${label} <span style="font-size:0.65rem;opacity:0.6">${collapsed ? '▶' : '▼'}</span>
        </span>
        <span style="font-size:0.78rem;font-weight:700;color:${color}">${total}</span>
      </div>`;
    }

    const totalIncome  = incomeRows.reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalExpense = expenseRows.reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalFunding = fundingRows.reduce((s, t) => s + Number(t.amount || 0), 0);

    let html = '';
    html += secHeader('income', 'INCOME', fmt(totalIncome), 'var(--green)');
    if (!_cfListCollapsed.income) html += incomeRows.map(txRow).join('');

    html += secHeader('expense', 'EXPENSES', fmt(totalExpense), 'var(--red)');
    if (!_cfListCollapsed.expense) html += expenseRows.map(txRow).join('');

    if (fundingRows.length) {
      html += secHeader('project_funding', 'PROJECT FUNDING', fmt(totalFunding), 'var(--red)');
      if (!_cfListCollapsed.project_funding) html += fundingRows.map(txRow).join('');
    }

    zone.innerHTML = html;

    if (!zone._listSectionBound) {
      zone._listSectionBound = true;
      zone.addEventListener('click', e => {
        const sec = e.target.closest('[data-cf-list-sec]');
        if (!sec) return;
        const key = sec.dataset.cfListSec;
        _cfListCollapsed[key] = !_cfListCollapsed[key];
        renderListView(zone);
      });
    }
  }

  /* ── X-days due tool ─────────────────────────────────────────────────────── */

  function ensureDueTool() {
    if (document.getElementById('cf-due-tool')) return;
    const viewTog = el('cf-view-toggle');
    if (!viewTog) return;
    const wrap = document.createElement('div');
    wrap.id = 'cf-due-tool';
    wrap.style.cssText = 'display:none;padding:0.35rem 0';
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <span style="font-size:0.72rem;color:var(--text-dim)">Due in:</span>
      <input id="cf-due-days" type="number" min="1" max="90" placeholder="days"
        style="width:64px;font-size:0.78rem;padding:0.2rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
      <button id="cf-due-check" style="font-size:0.72rem;padding:0.2rem 0.6rem;background:var(--accent);color:#000;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">Check</button>
      <button id="cf-due-clear" style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-dim);cursor:pointer;display:none">Clear</button>
    </div>
    <div id="cf-due-summary" style="display:none;margin-top:0.35rem;font-size:0.72rem;color:var(--text-dim);background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:0.35rem 0.6rem;line-height:1.6"></div>`;
    viewTog.after(wrap);

    document.getElementById('cf-due-check')?.addEventListener('click', () => {
      const v = Number(document.getElementById('cf-due-days')?.value || 0);
      if (!v || v < 1) return;
      CF.dueInDays = v;
      document.getElementById('cf-due-clear').style.display = '';
      if (CF.view === 'card') renderCards();
      else renderDueSummary();
    });
    document.getElementById('cf-due-clear')?.addEventListener('click', () => {
      CF.dueInDays = null;
      const dEl = document.getElementById('cf-due-days');
      if (dEl) dEl.value = '';
      document.getElementById('cf-due-clear').style.display = 'none';
      document.getElementById('cf-due-summary').style.display = 'none';
      if (CF.view === 'card') renderCards();
    });
  }

  function renderDueSummary() {
    const summaryEl = document.getElementById('cf-due-summary');
    if (!summaryEl || CF.dueInDays === null) return;
    let p1Total = 0;
    const now = new Date(); now.setHours(0,0,0,0);
    CF.liabilities.filter(l => l.active !== false && l.monthly_payment > 0 && l.payment_due_day).forEach(l => {
      const dueDay   = Number(l.payment_due_day);
      const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
      const nextDue  = thisMonthDue >= now ? thisMonthDue : new Date(now.getFullYear(), now.getMonth()+1, dueDay);
      const days     = Math.ceil((nextDue - now) / 86400000);
      if (days <= CF.dueInDays) p1Total += Number(l.monthly_payment);
    });
    const future90 = CF.forecast.filter(d => d.isProjected).slice(0, 90);
    const daysToEmpty = future90.findIndex(d => d.balance <= 0);
    summaryEl.style.display = '';
    summaryEl.innerHTML = `Due in <strong>${CF.dueInDays}</strong> days:<br>
      P1 Legal: <strong style="color:#ef4444">${fmt(p1Total)}</strong> &nbsp;|&nbsp;
      P2 Projects: <span style="opacity:0.5">n/a</span> &nbsp;|&nbsp;
      Current balance: <strong style="color:var(--green)">${fmt(CF.currentBalance)}</strong>
      → Days to ฿0: <strong>${daysToEmpty === -1 ? `>${future90.length}d` : daysToEmpty + 'd'}</strong>`;
  }

  function showDueTool(visible) {
    const t = document.getElementById('cf-due-tool');
    if (t) t.style.display = visible ? '' : 'none';
    if (!visible) {
      CF.dueInDays = null;
      const s = document.getElementById('cf-due-summary');
      if (s) s.style.display = 'none';
    }
  }

  /* ── Sync form ───────────────────────────────────────────────────────────── */

  function initSyncForm() {
    const saveBtn = el('cf-sync-save');
    if (!saveBtn || saveBtn._bound) return;
    saveBtn._bound = true;
    const today   = todayStr();
    const dateEl  = el('cf-sync-date');
    if (dateEl && !dateEl.value) dateEl.value = today;

    saveBtn.addEventListener('click', async () => {
      const amount = Number(el('cf-sync-balance')?.value || 0);
      const date   = el('cf-sync-date')?.value || today;
      const msgEl  = el('cf-sync-msg');
      if (!amount || !date) {
        if (msgEl) { msgEl.textContent = 'Balance and date required'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
        return;
      }
      try {
        await api('/api/cashflow-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, date })
        });
        const form = el('cf-sync-form');
        if (form) form.style.display = 'none';
        await loadAndRender();
      } catch (err) {
        const msgEl = el('cf-sync-msg');
        if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
      }
    });
  }

  /* ── On-hold / card delegation ───────────────────────────────────────────── */

  function initCardDelegation() {
    const zone = el('cf-cards');
    if (!zone || zone._cardDelegated) return;
    zone._cardDelegated = true;

    zone.addEventListener('click', e => {
      const holdBtn = e.target.closest('[data-cfhold]');
      if (holdBtn) {
        const key = holdBtn.dataset.cfhold;
        if (!key) return;
        if (CF.simulation.onHold[key]) {
          delete CF.simulation.onHold[key];
        } else {
          CF.simulation.onHold[key] = true;
          CF.simulation.active = true;
        }
        renderAll();
      }
    });
  }

  /* ── View month navigation ───────────────────────────────────────────────── */

  function ensureViewMonthNav() {
    if (document.getElementById('cf-view-month-nav')) return;
    const rangeToggle = el('cf-range-toggle');
    if (!rangeToggle) return;

    const wrap = document.createElement('div');
    wrap.id = 'cf-view-month-nav';
    wrap.style.cssText = 'display:flex;align-items:center;gap:0.35rem;margin-bottom:0.35rem;flex-wrap:wrap';

    const thisMonthBtn = document.createElement('button');
    thisMonthBtn.textContent = 'This month';
    thisMonthBtn.id = 'cf-vm-this';
    thisMonthBtn.className = 'range-btn active';
    thisMonthBtn.style.cssText = 'font-size:0.75rem;padding:0.2rem 0.6rem';

    const otherMonthBtn = document.createElement('button');
    otherMonthBtn.textContent = 'Other month ›';
    otherMonthBtn.id = 'cf-vm-other';
    otherMonthBtn.className = 'range-btn';
    otherMonthBtn.style.cssText = 'font-size:0.75rem;padding:0.2rem 0.6rem';

    const otherNav = document.createElement('div');
    otherNav.id = 'cf-vm-other-nav';
    otherNav.style.cssText = 'display:none;align-items:center;gap:0.3rem;font-size:0.78rem';
    otherNav.innerHTML = `<button id="cf-vm-prev" style="padding:0.15rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text);cursor:pointer">‹</button>
      <span id="cf-vm-label" style="min-width:120px;text-align:center;font-size:0.75rem;color:var(--text-dim)"></span>
      <button id="cf-vm-next" style="padding:0.15rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text);cursor:pointer">›</button>`;

    wrap.appendChild(thisMonthBtn);
    wrap.appendChild(otherMonthBtn);
    wrap.appendChild(otherNav);
    rangeToggle.before(wrap);

    function updateOtherLabel() {
      const vm  = CF.viewMonth;
      if (!vm) return;
      const d   = new Date(vm.year, vm.month, 1);
      const lbl = document.getElementById('cf-vm-label');
      if (lbl) lbl.textContent = d.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    }

    thisMonthBtn.addEventListener('click', () => {
      CF.viewMonth = null;
      thisMonthBtn.classList.add('active');
      otherMonthBtn.classList.remove('active');
      otherNav.style.display = 'none';
      renderAll();
    });

    otherMonthBtn.addEventListener('click', () => {
      if (!CF.viewMonth) {
        const n = new Date();
        CF.viewMonth = { year: n.getFullYear(), month: n.getMonth() };
      }
      otherMonthBtn.classList.add('active');
      thisMonthBtn.classList.remove('active');
      otherNav.style.display = 'flex';
      updateOtherLabel();
      renderAll();
    });

    document.getElementById('cf-vm-prev')?.addEventListener('click', () => {
      if (!CF.viewMonth) return;
      CF.viewMonth.month--;
      if (CF.viewMonth.month < 0) { CF.viewMonth.month = 11; CF.viewMonth.year--; }
      updateOtherLabel();
      renderAll();
    });
    document.getElementById('cf-vm-next')?.addEventListener('click', () => {
      if (!CF.viewMonth) return;
      CF.viewMonth.month++;
      if (CF.viewMonth.month > 11) { CF.viewMonth.month = 0; CF.viewMonth.year++; }
      updateOtherLabel();
      renderAll();
    });
  }

  /* ── Firewall banner slot ────────────────────────────────────────────────── */

  function ensureBannerSlot() {
    if (document.getElementById('cf-firewall-banner')) return;
    const panel = document.getElementById('panel-cashflow');
    if (!panel) return;
    const slot = document.createElement('div');
    slot.id = 'cf-firewall-banner';
    slot.style.display = 'none';
    // Insert after the stat chips row (before sync info)
    const syncInfo = el('cf-sync-info');
    if (syncInfo) syncInfo.before(slot);
    else panel.prepend(slot);
  }

  /* ── Toggles ─────────────────────────────────────────────────────────────── */

  function initRangeToggle() {
    const tog = el('cf-range-toggle');
    if (!tog || tog._rangeBound) return;
    tog._rangeBound = true;
    tog.addEventListener('click', e => {
      const btn = e.target.closest('[data-range]');
      if (!btn || btn.classList.contains('active')) return;
      tog.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CF.period = btn.dataset.range.toUpperCase() || '1M';
      // normalize 1m → 1M etc.
      const raw = btn.dataset.range;
      CF.period = raw === '1m' ? '1M' : raw === '3m' ? '3M' : raw === '6m' ? '6M' : raw;
      loadAndRender().catch(console.error);
    });
  }

  function initViewToggle() {
    const tog = el('cf-view-toggle');
    if (!tog || tog._viewBound) return;
    tog._viewBound = true;
    tog.addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (!btn || btn.classList.contains('active')) return;
      tog.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CF.view = btn.dataset.view;
      showDueTool(CF.view === 'card');
      renderCards();
    });
  }

  /* ── Combined render ─────────────────────────────────────────────────────── */

  function renderCards() {
    const zone = el('cf-cards');
    if (!zone) return;
    if (CF.view === 'card') renderCardView(zone);
    else renderListView(zone);
    renderSimBox();
  }

  function renderAll() {
    const forecast  = buildForecast();
    CF.forecast     = forecast;
    checkFirewall(forecast);
    updateStats(forecast);
    renderChart(forecast);
    renderCards();
  }

  /* ── Data load ───────────────────────────────────────────────────────────── */

  async function loadAndRender() {
    const { windowStart, windowEnd } = getWindowDates();
    const wsStr = toDateStr(windowStart);

    const [txR, liR, syR, budR, dcR] = await Promise.allSettled([
      api('/api/transactions?start=' + wsStr),
      api('/api/liabilities'),
      api('/api/cashflow-sync'),
      api('/api/budgets?active_only=true'),
      api('/api/active-strategy')
    ]);

    CF.transactions = txR.status === 'fulfilled'
      ? (txR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    CF.liabilities  = liR.status === 'fulfilled'
      ? (liR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    CF.budgets      = budR.status === 'fulfilled'
      ? (budR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];

    const sync      = syR.status === 'fulfilled' ? (syR.value.syncPoint || null) : null;
    if (sync) {
      CF.currentBalance = Number(sync.amount || 0);
      CF.syncDate       = sync.date || null;
    } else {
      // Fallback: compute from transactions
      CF.currentBalance = CF.transactions.reduce((s, t) => s + (t.type === 'Income' ? 1 : -1) * Number(t.amount || 0), 0);
      CF.syncDate       = null;
    }

    const dc = dcR.status === 'fulfilled' ? dcR.value : null;
    CF.defcon = (dc && dc.active) ? dc : null;

    // Restore simulation from defcon if active and no current simulation
    if (CF.defcon?.ticket && !CF.simulation.active) {
      const tk = CF.defcon.ticket;
      (tk.onHold || []).forEach(id => { CF.simulation.onHold[id] = true; });
      CF.simulation.intents = { ...tk.intents };
      CF.simulation.actions = tk.actions?.length ? [...tk.actions] : CF.simulation.actions;
      CF.simulation.note    = tk.note || '';
      CF.simulation.active  = Object.keys(CF.simulation.onHold).length > 0 || Object.keys(CF.simulation.intents).length > 0;
    }

    renderAll();
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */

  function init() {
    if (!initialized) {
      initialized = true;

      // Inject blink CSS
      if (!document.getElementById('cf-blink-style')) {
        const style = document.createElement('style');
        style.id = 'cf-blink-style';
        style.textContent = `.blink-slow{animation:cf-blink 2s step-start infinite}.blink-med{animation:cf-blink 1s step-start infinite}.blink-fast{animation:cf-blink 0.5s step-start infinite}@keyframes cf-blink{50%{opacity:0}}`;
        document.head.appendChild(style);
      }

      ensureBannerSlot();
      ensureViewMonthNav();
      initRangeToggle();
      initViewToggle();
      initSyncForm();
      initCardDelegation();
      ensureDueTool();
    }
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'cashflow') init(); });
  if (document.getElementById('panel-cashflow')?.classList.contains('active')) init();
})();
