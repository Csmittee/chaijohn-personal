/* liabilities-panel.injector.js — Liabilities panel (M2.6)
 * 9B3: cards grouped by creditor_type (Bank → Family → Other), interest on face,
 *      proportional sizing matching expenses, static (no expand)
 */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const pct = (a,b) => b > 0 ? Math.round(a/b*100) : 0;

  let barChart = null, trendChart = null;
  let liabilities = [], initialized = false;
  function el(id) { return document.getElementById(id); }

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  function renderStats() {
    const active = liabilities.filter(l => l.active !== false && Number(l.current_balance||0) > 0);
    const totalDebt  = active.reduce((s,l) => s + Number(l.current_balance||0), 0);
    const monthlyPay = active.reduce((s,l) => s + Number(l.monthly_payment||0), 0);
    const monthlyInt = active.reduce((s,l) => s + Number(l.current_balance||0) * Number(l.interest_rate||0) / 100 / 12, 0);

    let totalRemInterest = 0;
    active.forEach(l => {
      const B = Number(l.current_balance || 0);
      const p = Number(l.monthly_payment || 0);
      const r = Number(l.interest_rate  || 0) / 100 / 12;
      if (p <= 0) return;
      if (r > 0 && p > r * B) {
        const n = -Math.log(1 - r * B / p) / Math.log(1 + r);
        totalRemInterest += Math.max(0, n * p - B);
      }
    });

    const set = (id,v) => { const e = el(id); if (e) e.textContent = v; };
    set('liab-total-debt',   fmt(totalDebt));
    set('liab-monthly-pay',  fmt(monthlyPay));
    set('liab-monthly-int',  fmt(Math.round(monthlyInt)));
    set('liab-rem-interest', fmt(Math.round(totalRemInterest)));
  }

  function renderBar() {
    const canvas = el('liab-bar-chart');
    if (!canvas) return;
    if (barChart) { barChart.destroy(); barChart = null; }

    const active = liabilities
      .filter(l => l.active !== false && Number(l.current_balance||0) > 0)
      .sort((a,b) => Number(b.current_balance||0) - Number(a.current_balance||0));
    if (!active.length) return;

    barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: active.map(l => l.name || '—'),
        datasets: [
          { label: 'Balance',    data: active.map(l => Number(l.current_balance||0)),
            backgroundColor: '#ef4444', borderRadius: 4 },
          { label: 'Loan Size',  data: active.map(l => Math.max(0, Number(l.loan_size||0) - Number(l.current_balance||0))),
            backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { mode:'index', intersect:false } },
        scales: {
          x: { stacked: true, ticks: { font:{size:9}, callback: v => '฿'+(v/1000).toFixed(0)+'k' } },
          y: { stacked: true, ticks: { font:{size:9} } }
        }
      }
    });
  }

  function renderTrend() {
    const canvas = el('liab-trend-chart');
    if (!canvas) return;
    if (trendChart) { trendChart.destroy(); trendChart = null; }

    const active = liabilities.filter(l => l.active !== false && Number(l.current_balance||0) > 0 && Number(l.monthly_payment||0) > 0);
    if (!active.length) return;

    const months = 24;
    const labels = [];
    const now = new Date();
    for (let i = 0; i <= months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      labels.push(d.toLocaleDateString('en',{month:'short',year:'2-digit'}));
    }

    const balByMonth = Array(months + 1).fill(0);
    const intByMonth = Array(months + 1).fill(0);

    active.forEach(l => {
      let B = Number(l.current_balance || 0);
      const p = Number(l.monthly_payment || 0);
      const r = Number(l.interest_rate  || 0) / 100 / 12;
      let accumInt = 0;
      for (let i = 0; i <= months; i++) {
        balByMonth[i] += B;
        intByMonth[i]  += accumInt;
        if (B <= 0) break;
        const intCharge = B * r;
        const principal = Math.min(B, Math.max(0, p - intCharge));
        accumInt += intCharge;
        B = Math.max(0, B - principal);
      }
    });

    trendChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Total Balance', data: balByMonth, borderColor: '#ef4444', borderWidth: 2,
          fill: true, backgroundColor: 'rgba(239,68,68,0.07)', pointRadius: 0, tension: 0.3 },
        { label: 'Accum. Interest', data: intByMonth, borderColor: '#f59e0b', borderWidth: 1.5,
          fill: false, pointRadius: 0, tension: 0.3, borderDash: [4,2] }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font:{size:9}, boxWidth:12 } } },
        scales: {
          x: { ticks: { font:{size:9}, maxTicksLimit:8 } },
          y: { ticks: { font:{size:9}, callback: v => '฿'+(v/1000).toFixed(0)+'k' } }
        }
      }
    });
  }

  /* ── Cards — grouped by creditor_type, proportional size, interest on face ── */
  function renderCards() {
    const zone = el('liab-cards');
    if (!zone) return;
    const active = liabilities.filter(l => l.active !== false && Number(l.current_balance||0) > 0);
    if (!active.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem">No active liabilities</p>';
      return;
    }

    const maxBal = Math.max(...active.map(l => Number(l.current_balance||0)), 1);

    /* Group order: Bank → Family → Other */
    const GROUP_ORDER = ['Bank', 'Family', 'Friend', 'Other'];
    const groups = {};
    active.forEach(l => {
      const type = l.creditor_type || 'Other';
      const key  = GROUP_ORDER.includes(type) ? type : 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });

    const orderedGroups = GROUP_ORDER.filter(k => groups[k]);

    zone.style.cssText = '';
    zone.innerHTML = orderedGroups.map(groupKey => {
      const items = groups[groupKey].sort((a,b) => Number(b.current_balance||0) - Number(a.current_balance||0));
      const cards = items.map(l => {
        const bal      = Number(l.current_balance || 0);
        const orig     = Number(l.loan_size || bal);
        const paid     = Math.max(0, orig - bal);
        const progress = pct(paid, orig);
        const monthInt = Math.round(bal * Number(l.interest_rate||0) / 100 / 12);
        const barC     = progress >= 75 ? '#22c55e' : progress >= 40 ? '#f59e0b' : '#ef4444';
        const h        = Math.max(72, Math.sqrt(bal / maxBal) * 160);

        return `<div class="liab-content-card" style="min-height:${h}px;display:flex;flex-direction:column;justify-content:space-between;background:var(--bg-card,var(--bg-raised))">
          <div style="padding:0.7rem 0.85rem">
            <div style="font-size:0.82rem;font-weight:600;color:var(--text,var(--text-primary))">${esc(l.name||'—')}</div>
            <div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.15rem">${fmt(Number(l.monthly_payment||0))}/mo${monthInt > 0 ? ' · int ' + fmt(monthInt) + '/mo' : ''}</div>
          </div>
          <div style="padding:0 0.85rem 0.7rem">
            <div style="font-size:0.88rem;font-weight:700;color:#ef4444;margin-bottom:0.4rem">${fmt(bal)}</div>
            <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:${progress}%;height:100%;background:${barC};border-radius:3px;transition:width 0.4s"></div>
            </div>
            <div style="font-size:0.62rem;text-align:right;margin-top:0.15rem;color:var(--text-dim)">${progress}% paid</div>
          </div>
        </div>`;
      }).join('');

      return `<div class="section-band">${esc(groupKey.toUpperCase())}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.75rem;margin-bottom:1rem">
${cards}
</div>`;
    }).join('');
  }

  async function loadAndRender() {
    const r = await api('/api/liabilities?all=true');
    liabilities = (r.records || []).map(rec => ({ id: rec.id, ...rec.fields }));
    renderStats();
    renderBar();
    renderTrend();
    renderCards();
  }

  function init() {
    if (initialized) return; initialized = true;
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'liabilities') init(); });
  if (el('panel-liabilities')?.classList.contains('active')) init();
})();
