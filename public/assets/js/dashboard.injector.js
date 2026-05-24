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
  let t1Chart, t2Chart, t3Chart, t4Chart, playroomChart;
  let t2DrillGroup = null;
  let playroomBudgetId = null;
  let meterView = 'all';
  let meterGroupState = {};
  let meterPeriodFilter = 'all';  // E6
  let t4Range = '1m';
  let dismissedAlerts = new Set();
  let syncPoint = null;            // E4: { amount, date, note }
  let t1ViewMode = 'netflow';      // E5: 'netflow' | 'invsout'
  let panelCollapsed = {};         // E7: panel id → bool

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
  function dateOffset(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  /* ── API ── */
  async function api(path, opts) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  }

  /* ── E4: Load sync point ── */
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
    liabilities = (liabRes.records    || []).map(r => ({ id: r.id, ...r.fields }));
    categories  = (catRes.records     || []).map(r => ({ id: r.id, ...r.fields }));

    renderAlerts(nowYM);
    renderT1(start);
    renderT2();
    renderT3();
    renderBudgetPanel(t4Range);
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

  /* ── D4: Smart Alert chips ── */
  function renderAlerts(nowYM, showAll) {
    const strip = document.getElementById('alert-strip');
    if (!strip) return;

    const redChips = [], amberChips = [], blueChips = [];
    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat  = groupSum(nowExpenses, t => linkedId(t.category_id));

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
        if (!dismissedAlerts.has(id)) {
          redChips.push({ id, text: `💳 ${l.name} payment due ${fmt(pmt)}` });
        }
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
      if (!dismissedAlerts.has(id)) {
        blueChips.push({ id, text: `🏦 Total debt ${fmt(totalDebt)} across ${activeLiabs.length} loan${activeLiabs.length > 1 ? 's' : ''}` });
      }
    }

    const allChips = [...redChips, ...amberChips, ...blueChips];
    const visible  = showAll ? allChips : allChips.slice(0, 6);
    const overflow = showAll ? 0 : allChips.length - 6;

    function chipHtml(c, cls) {
      return `<span class="alert-chip ${cls}" style="display:inline-flex;align-items:center;gap:0.25rem">
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

    document.getElementById('alert-show-more')?.addEventListener('click', () => {
      renderAlerts(nowYM, true);
    });
  }

  /* ── D3: T1 Cash Flow ── */
  function renderT1(startDate) {
    const canvas = document.getElementById('t1-chart');
    if (!canvas) return;
    if (t1Chart) t1Chart.destroy();
    if (activeRange === '1m') {
      renderT1DailyForecast(canvas);
    } else {
      renderT1MonthlyForecast(canvas, startDate);
    }
  }

  /* ── E4+E5: compute starting balance from syncPoint ── */
  function getSyncStartingBalance(fromDate) {
    if (!syncPoint) return 0;
    // Sum transactions from syncPoint.date to fromDate
    const syncDate = syncPoint.date;
    let bal = syncPoint.amount;
    txData.forEach(t => {
      if (!t.date) return;
      if (t.date > syncDate && t.date <= fromDate) {
        const amt = Number(t.amount || 0);
        if (t.type === 'Income') bal += amt;
        else if (t.type === 'Expense') bal -= amt;
      } else if (t.date <= syncDate) {
        // Already accounted for in the sync point
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

    const pastDays = [];
    for (let i = 14; i >= 0; i--) pastDays.push(dateOffset(todayStr, -i));
    const futureDays = [];
    for (let i = 1; i <= 15; i++) futureDays.push(dateOffset(todayStr, i));
    const allDays = [...pastDays, ...futureDays];

    const incByDay = {}, expByDay = {};
    txData.forEach(t => {
      if (!pastDays.includes(t.date)) return;
      const amt = Number(t.amount || 0);
      if (t.type === 'Income')  incByDay[t.date]  = (incByDay[t.date]  || 0) + amt;
      else if (t.type === 'Expense') expByDay[t.date] = (expByDay[t.date] || 0) + amt;
    });

    const totalInc = pastDays.reduce((s, d) => s + (incByDay[d] || 0), 0);
    const totalExp = pastDays.reduce((s, d) => s + (expByDay[d] || 0), 0);
    const avgDailyInc = totalInc / Math.max(1, pastDays.length);
    const avgDailyExp = totalExp / Math.max(1, pastDays.length);

    const labels = allDays.map(d => d.slice(5));
    const todayIdx = 14;

    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
        if (!x) return;
        const xLeft  = x.getPixelForValue(todayIdx);
        const xRight = x.getPixelForValue(todayIdx + 1);
        const xPos   = (xLeft + xRight) / 2;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([5, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xPos, top);
        ctx.lineTo(xPos, bottom);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px system-ui';
        ctx.fillText('Today', xPos + 3, top + 10);
        ctx.restore();
      }
    };

    if (t1ViewMode === 'invsout') {
      // E5: In vs Out — side-by-side positive bars, no balance line
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
          scales: {
            x:  { ticks: { font: { size: 9 } } },
            y:  { min: 0, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
          }
        }
      });
      return;
    }

    // Net Flow mode (default)
    let runBal = syncPoint ? getSyncStartingBalance(pastDays[0]) : 0;
    const balPast = pastDays.map(d => {
      runBal += (incByDay[d] || 0) - (expByDay[d] || 0);
      return runBal;
    });
    const balForecast = [balPast[balPast.length - 1]];
    futureDays.forEach(() => {
      balForecast.push(balForecast[balForecast.length - 1] + avgDailyInc - avgDailyExp);
    });

    // syncPoint annotation
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
          ctx.strokeStyle = '#6366f1';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xPos, top);
          ctx.lineTo(xPos, bottom);
          ctx.stroke();
          ctx.fillStyle = '#6366f1';
          ctx.font = '8px system-ui';
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
          { label: '~ Bal Forecast',
            data: [...new Array(14).fill(null), ...balForecast],
            type: 'line', borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0,
            borderDash: [4, 3], tension: 0.3, yAxisID: 'y2', fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 9 },
              filter: item => !item.text.startsWith('~ ') || item.text === '~ Bal Forecast' }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const isForecast = ctx.dataset.label.startsWith('~ ');
                const prefix = isForecast ? '~ Est: ' : '';
                const v = Math.round(ctx.raw || 0);
                return `${prefix}${ctx.dataset.label.replace('~ ', '')}: ฿${v.toLocaleString()}`;
              },
              afterBody: ctx => {
                const isForecast = ctx[0] && ctx[0].dataset.label.startsWith('~ ');
                return isForecast ? ['Estimated — based on 15-day average'] : [];
              }
            }
          }
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
    const subtitle = document.getElementById('t1-subtitle');
    const nowYM   = currentYM();
    const startYM = startDate.slice(0, 7);

    let forecastMonths;
    if (activeRange === '3m')  forecastMonths = 1;
    else if (activeRange === '6m')  forecastMonths = 3;
    else forecastMonths = 6;

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
      if (t.type === 'Income')  incByM[ym] = (incByM[ym] || 0) + amt;
      else if (t.type === 'Expense') expByM[ym] = (expByM[ym] || 0) + amt;
    });

    if (t1ViewMode === 'invsout') {
      if (subtitle) subtitle.textContent = `Monthly — Income vs Expense`;
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
          scales: {
            x:  { ticks: { font: { size: 9 } } },
            y:  { min: 0, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
          }
        }
      });
      return;
    }

    if (subtitle) subtitle.textContent = `Monthly cash flow + ${forecastMonths}-month forecast`;

    const recentMonths = pastMonths.slice(-3);
    const avgInc = recentMonths.reduce((s, m) => s + (incByM[m] || 0), 0) / Math.max(1, recentMonths.length);
    const avgExp = recentMonths.reduce((s, m) => s + (expByM[m] || 0), 0) / Math.max(1, recentMonths.length);

    // Starting balance from syncPoint if available
    let running = 0;
    if (syncPoint) {
      const syncYM = syncPoint.date.slice(0, 7);
      if (syncYM <= pastMonths[0]) {
        running = getSyncStartingBalance(pastMonths[0] + '-01');
      }
    }
    const balPast = pastMonths.map(m => {
      running += (incByM[m] || 0) - (expByM[m] || 0);
      return running;
    });
    const balForecast = [balPast[balPast.length - 1]];
    futureMonths.forEach(() => {
      balForecast.push(balForecast[balForecast.length - 1] + avgInc - avgExp);
    });

    const todayIdx = pastMonths.length - 1;
    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
        if (!x) return;
        const xLeft  = x.getPixelForValue(todayIdx);
        const xRight = x.getPixelForValue(todayIdx + 1);
        const xPos   = (xLeft + xRight) / 2;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([5, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xPos, top);
        ctx.lineTo(xPos, bottom);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px system-ui';
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
          { label: '~ Bal Forecast',
            data: [...new Array(nPast - 1).fill(null), ...balForecast],
            type: 'line', borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 1,
            borderDash: [4, 3], tension: 0.3, yAxisID: 'y2', fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 9 },
              filter: item => !item.text.startsWith('~ ') || item.text === '~ Bal Forecast' }
          },
          tooltip: {
            callbacks: {
              afterBody: ctx => {
                const isForecast = ctx[0] && ctx[0].dataset.label.startsWith('~ ');
                return isForecast ? ['Estimated — based on 3-month average'] : [];
              }
            }
          }
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

  /* ── Fix 3: T2 Group-level Pareto with drill-down ── */
  function renderT2() {
    const canvas = document.getElementById('t2-chart');
    if (!canvas) return;
    if (t2Chart) t2Chart.destroy();

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const expenses  = txData.filter(t => t.type === 'Expense');
    const backBtn   = document.getElementById('t2-back-btn');
    const subtitle  = document.getElementById('t2-subtitle');

    if (t2DrillGroup) {
      if (backBtn) backBtn.classList.remove('hidden');
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
            backgroundColor: sorted.map((_, i) => `hsl(${200 + i * 25},60%,55%)`), borderRadius: 3 }]
        },
        options: t2ChartOptions()
      });
    } else {
      if (backBtn) backBtn.classList.add('hidden');
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
            backgroundColor: sorted.map((_, i) => `hsl(${i * 30},65%,55%)`), borderRadius: 3 }]
        },
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

  /* ── D6B: Budget vs Actual panel (T4) ── */
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
            borderColor: '#f59e0b', borderWidth: 2, pointRadius: 2, tension: 0.3,
            fill: false, order: 1, yAxisID: 'y2' },
          { label: 'Run Actual', data: runActual, type: 'line',
            borderColor: '#8b5cf6', borderWidth: 2, pointRadius: 2, tension: 0.3,
            fill: false, order: 0, yAxisID: 'y2' }
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

  /* ── E7: Panel collapse controls ── */
  function initPanelCollapses() {
    document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
      const panelId = btn.dataset.panel;
      const bodyEl  = document.getElementById(panelId + '-body');
      if (!bodyEl) return;

      // Set initial max-height
      bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';

      btn.addEventListener('click', () => {
        const isCollapsed = panelCollapsed[panelId];
        panelCollapsed[panelId] = !isCollapsed;
        if (!isCollapsed) {
          bodyEl.style.maxHeight = '0';
          btn.classList.add('collapsed');
        } else {
          bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
          btn.classList.remove('collapsed');
          // Expand might need more height after chart renders
          setTimeout(() => { bodyEl.style.maxHeight = bodyEl.scrollHeight + 400 + 'px'; }, 50);
        }
      });
    });

    // T4 range buttons
    document.querySelectorAll('[data-t4-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        t4Range = btn.dataset.t4Range;
        document.querySelectorAll('[data-t4-range]').forEach(b =>
          b.classList.toggle('active', b.dataset.t4Range === t4Range));
        renderBudgetPanel(t4Range);
        // Re-expand body after chart draws
        const t4Body = document.getElementById('t4-body');
        if (t4Body && !panelCollapsed['t4']) {
          setTimeout(() => { t4Body.style.maxHeight = t4Body.scrollHeight + 400 + 'px'; }, 100);
        }
      });
    });
  }

  /* ── E6: Budget meters period-aware ── */
  function normalizeBudgetAmount(b) {
    const period = b.period || 'Monthly';
    const amount = Number(b.amount || 0);
    if (period === 'Annual') return amount / 12;
    return amount;
  }

  function periodBadgeHtml(period) {
    if (!period || period === 'Monthly') return '';
    if (period === 'Annual') return `<span class="period-badge period-badge-annual">Annual</span>`;
    if (period === 'One-time') return `<span class="period-badge period-badge-onetime">One-time</span>`;
    return `<span class="period-badge period-badge-annual">${period}</span>`;
  }

  function budgetMatchesPeriodFilter(b) {
    const period = b.period || 'Monthly';
    if (meterPeriodFilter === 'all') return true;
    if (meterPeriodFilter === 'monthly') return period === 'Monthly';
    if (meterPeriodFilter === 'annual') return period === 'Annual' || period === '3x-year';
    if (meterPeriodFilter === 'onetime') return period === 'One-time';
    return true;
  }

  /* ── Fix 14: Budget meters ── */
  function renderMeters(nowYM) {
    const grid = document.getElementById('meters-grid');
    if (!grid) return;

    const nowExpenses = txData.filter(t => toYM(t.date) === nowYM && t.type === 'Expense');
    const spendByCat  = groupSum(nowExpenses, t => linkedId(t.category_id));
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const active = budgets.filter(b => b.active !== false && budgetMatchesPeriodFilter(b));
    if (active.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">No budgets for selected filter.</div>';
      return;
    }

    const withData = active.map(b => {
      const catId      = linkedId(b.category_id);
      const cat        = catMap[catId] || {};
      const spent      = spendByCat[catId] || 0;
      const limit      = normalizeBudgetAmount(b);   // E6: normalized
      const label      = b.label || cat.name || 'Budget';
      const period     = b.period || 'Monthly';
      return { b, catId, cat, spent, limit, p: pct(spent, limit), label, period };
    });

    if (meterView === 'group') {
      renderMeterGroupView(grid, withData);
    } else {
      renderMeterAllView(grid, withData);
    }
  }

  function renderMeterAllView(grid, withData) {
    grid.style.cssText = 'margin-bottom:1rem';
    const maxAmount = Math.max(...withData.map(x => x.limit), 1);
    const sorted    = [...withData].sort((a, b) => b.limit - a.limit);

    grid.innerHTML = sorted.map(({ cat, spent, limit, p, label, period }) => {
      const containerPct = Math.max(5, Math.round((limit / maxAmount) * 100));
      const fillPct      = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const cls          = p >= 100 ? 'over' : p >= 85 ? 'warn' : 'ok';
      return `
        <div style="margin-bottom:0.65rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.15rem">
            <span style="font-size:0.82rem;font-weight:600">${label}${periodBadgeHtml(period)}${cat.group
              ? ` <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:400">— ${cat.group}</span>`
              : ''}</span>
            <span style="font-size:0.73rem;color:var(--text-secondary)">${fmt(spent)} / ${fmt(limit)} · ${p}%</span>
          </div>
          <div style="width:${containerPct}%;min-width:8%">
            <div class="meter-bar-bg" style="height:10px">
              <div class="meter-bar-fill ${cls}" style="width:${fillPct}%"></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderMeterGroupView(grid, withData) {
    grid.style.cssText = 'margin-bottom:1rem';
    const maxAmount = Math.max(...withData.map(x => x.limit), 1);

    const groups = {};
    withData.forEach(item => {
      const grp = item.cat.group || 'Other';
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(item);
    });

    const sortedGroups = Object.entries(groups)
      .map(([name, items]) => ({
        name, items,
        totalBudget: items.reduce((s, x) => s + x.limit, 0),
        totalSpent:  items.reduce((s, x) => s + x.spent, 0)
      }))
      .sort((a, b) => b.totalBudget - a.totalBudget);

    let html = '';
    sortedGroups.forEach(({ name, items, totalBudget, totalSpent }) => {
      const grpPct       = pct(totalSpent, totalBudget);
      const grpCls       = grpPct >= 100 ? 'over' : grpPct >= 85 ? 'warn' : 'ok';
      const containerPct = Math.max(5, Math.round((totalBudget / maxAmount) * 100));
      const fillPct      = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
      const expanded     = meterGroupState[name] !== false;

      const innerHtml = items.sort((a, b) => b.limit - a.limit).map(item => {
        const itemCPct = Math.max(5, Math.round((item.limit / maxAmount) * 100));
        const itemFPct = item.limit > 0 ? Math.min(100, Math.round((item.spent / item.limit) * 100)) : 0;
        const itemCls  = item.p >= 100 ? 'over' : item.p >= 85 ? 'warn' : 'ok';
        return `
          <div style="margin-bottom:0.5rem;padding-left:0.75rem">
            <div style="display:flex;justify-content:space-between;margin-bottom:0.15rem">
              <span style="font-size:0.78rem">${item.label}${periodBadgeHtml(item.period)}</span>
              <span style="font-size:0.7rem;color:var(--text-secondary)">
                ${fmt(item.spent)} / ${fmt(item.limit)} · ${item.p}%
              </span>
            </div>
            <div style="width:${itemCPct}%;min-width:8%">
              <div class="meter-bar-bg" style="height:8px">
                <div class="meter-bar-fill ${itemCls}" style="width:${itemFPct}%"></div>
              </div>
            </div>
          </div>`;
      }).join('');

      html += `
        <div style="margin-bottom:0.75rem;border:1px solid var(--border);border-radius:var(--radius)">
          <div class="meter-group-header" data-grp="${name}"
            style="display:flex;align-items:center;padding:0.6rem 0.75rem;cursor:pointer;
            user-select:none;background:rgba(59,130,246,0.05);
            border-radius:${expanded ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)'}">
            <span style="font-size:0.85rem;font-weight:700;flex:0 0 auto;min-width:90px">${name}</span>
            <div style="flex:1;margin:0 0.75rem">
              <div style="width:${containerPct}%;min-width:30px">
                <div class="meter-bar-bg" style="height:8px">
                  <div class="meter-bar-fill ${grpCls}" style="width:${fillPct}%"></div>
                </div>
              </div>
            </div>
            <span style="font-size:0.75rem;color:var(--text-secondary);flex:0 0 auto;white-space:nowrap">
              ${fmt(totalSpent)} / ${fmt(totalBudget)} · ${grpPct}%
            </span>
            <span data-grp-chev="${name}"
              style="margin-left:0.5rem;font-size:0.7rem;color:var(--text-secondary);
              transition:transform 0.3s;display:inline-block;
              ${expanded ? '' : 'transform:rotate(-90deg)'}">▼</span>
          </div>
          <div data-grp-body="${name}" style="padding-top:0.5rem;padding-bottom:0.5rem;
            ${expanded ? '' : 'display:none'}">
            ${innerHtml}
          </div>
        </div>`;
    });

    grid.innerHTML = html;

    grid.querySelectorAll('.meter-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const grp       = header.dataset.grp;
        const wasExpanded = meterGroupState[grp] !== false;
        meterGroupState[grp] = !wasExpanded;
        const body = grid.querySelector(`[data-grp-body="${grp}"]`);
        const chev = grid.querySelector(`[data-grp-chev="${grp}"]`);
        if (body) body.style.display = wasExpanded ? 'none' : '';
        if (chev) chev.style.transform = wasExpanded ? 'rotate(-90deg)' : '';
        header.style.borderRadius = wasExpanded
          ? 'var(--radius)' : 'var(--radius) var(--radius) 0 0';
      });
    });
  }

  function initMeterToggle() {
    document.querySelectorAll('[data-meter-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        meterView = btn.dataset.meterView;
        document.querySelectorAll('[data-meter-view]').forEach(b =>
          b.classList.toggle('active', b.dataset.meterView === meterView));
        renderMeters(currentYM());
      });
    });

    // E6: period filter
    document.querySelectorAll('[data-meter-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        meterPeriodFilter = btn.dataset.meterPeriod;
        document.querySelectorAll('[data-meter-period]').forEach(b =>
          b.classList.toggle('active', b.dataset.meterPeriod === meterPeriodFilter));
        renderMeters(currentYM());
      });
    });
  }

  /* ── E4: Sync panel init ── */
  function initSyncPanel() {
    const toggleBtn = document.getElementById('sync-toggle-btn');
    const panel     = document.getElementById('sync-panel');
    const saveBtn   = document.getElementById('sync-save-btn');
    const msgEl     = document.getElementById('sync-msg');
    const dateEl    = document.getElementById('sync-date');

    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    toggleBtn?.addEventListener('click', () => {
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
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
      btn.addEventListener('click', () => {
        t1ViewMode = btn.dataset.t1Mode;
        document.querySelectorAll('[data-t1-mode]').forEach(b =>
          b.classList.toggle('active', b.dataset.t1Mode === t1ViewMode));
        renderT1(rangeStart(activeRange));
      });
    });
  }

  /* ── Fix 5: Solution Playroom ── */
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
      if (msgEl) msgEl.style.display = 'none';
      try {
        await fetch(`/api/budgets/${playroomBudgetId}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: newAmt })
        });
        if (msgEl) { msgEl.textContent = 'Budget saved!'; msgEl.style.color = '#22c55e'; msgEl.style.display = 'block'; }
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

    const now = new Date();
    const start6m = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    const months  = monthsBetween(start6m.slice(0, 7), currentYM());

    let txRes;
    try {
      txRes = await fetch(`/api/transactions?start=${start6m}&limit=500`, { credentials: 'same-origin' });
      txRes = await txRes.json();
    } catch { return; }

    const tx6m = (txRes.records || []).map(r => r.fields).filter(t => linkedId(t.category_id) === catId);
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
          ...(budAmt ? [{
            label: 'Budget', data: months.map(() => budAmt), type: 'line',
            borderColor: '#f59e0b', borderWidth: 2, borderDash: [4, 3],
            pointRadius: 0, fill: false
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
      const cid = linkedId(t.category_id);
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

    const daysLeft  = daysLeftInMonth();
    const daysGone  = new Date().getDate();
    const avgDaily  = daysGone > 0 ? alreadySpent / daysGone : 0;
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
      <div style="margin-top:0.75rem;margin-bottom:0.25rem;font-weight:600;font-size:0.85rem">Fixed commitments this month:</div>
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
        activeRange  = btn.dataset.range;
        t2DrillGroup = null;
        loadAll().catch(console.error);
      });
    });
  }

  /* ── Modals ── */
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
  document.addEventListener('DOMContentLoaded', async () => {
    initPeriodButtons();
    initMeterToggle();
    initModals();
    initPlayroom();
    initPanelCollapses();   // E7
    initSyncPanel();        // E4
    initT1ViewMode();       // E5
    await loadSyncPoint();  // E4
    loadAll().catch(err => console.error('Dashboard load failed:', err));
  });
})();
