/* sales.injector.js — M2.2 Sales panel */
(function () {
  'use strict';

  /* ── Utils ────────────────────────────────────────────────────────────────── */
  const fmt     = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc     = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const el      = id => document.getElementById(id);
  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `API ${r.status}`); }
    return r.json();
  }

  /* ── State ───────────────────────────────────────────────────────────────── */
  let salesData       = null;
  let currentPeriod   = '6m';
  let currentBusFilter = 'all';
  let currentView     = 'card';
  let chartMain       = null;
  let chartPareto     = null;
  let initialized     = false;

  /* ── Panel shell ─────────────────────────────────────────────────────────── */
  function buildShell() {
    const panel = el('panel-sales');
    if (!panel) return;
    panel.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    panel.innerHTML = `
      <div class="sales-sticky" style="flex-shrink:0">
        <!-- Summary strip -->
        <div id="sales-strip" style="display:flex;gap:0.5rem;flex-wrap:wrap;padding:0.75rem 1rem 0;"></div>
        <!-- Graph + pareto zone -->
        <div style="display:grid;grid-template-columns:1fr 180px;gap:0.5rem;padding:0.5rem 1rem;min-height:0">
          <div style="min-width:0">
            <div id="sales-filter-row" style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;margin-bottom:0.4rem"></div>
            <div style="height:200px;position:relative"><canvas id="sales-chart-main"></canvas></div>
          </div>
          <div style="min-width:0;display:flex;flex-direction:column">
            <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.25rem;font-weight:700;letter-spacing:0.04em">PARETO</div>
            <div style="height:200px;position:relative"><canvas id="sales-chart-pareto"></canvas></div>
          </div>
        </div>
      </div>
      <!-- Body: scrollable -->
      <div class="sales-body" style="flex:1;overflow-y:auto;min-height:0;padding:0 1rem 1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border);margin-bottom:0.5rem">
          <div id="sales-view-btns" style="display:flex;gap:0.25rem"></div>
          <button id="sales-entry-btn" style="font-size:0.75rem;padding:0.3rem 0.75rem;background:var(--accent);color:#000;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700">+ Entry</button>
        </div>
        <div id="sales-overdue-section"></div>
        <div id="sales-lanes"></div>
      </div>
      <!-- Detail modal overlay -->
      <div id="sales-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center">
        <div id="sales-modal-body" style="background:var(--bg-card);border-radius:var(--radius);padding:1.25rem;max-width:480px;width:90%;max-height:85vh;overflow-y:auto;position:relative"></div>
      </div>`;
  }

  /* ── Load + render ───────────────────────────────────────────────────────── */
  async function loadAndRender(forceRefresh) {
    const lanesEl = el('sales-lanes');
    if (lanesEl) lanesEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.8rem">Loading…</div>';
    try {
      const params = new URLSearchParams({ period: currentPeriod });
      if (currentBusFilter !== 'all') params.set('bus_id', currentBusFilter);
      salesData = await api('/api/sales?' + params);
    } catch (err) {
      if (lanesEl) lanesEl.innerHTML = `<div style="padding:2rem;color:#ef4444;font-size:0.8rem">Failed to load sales: ${esc(err.message)}</div>`;
      return;
    }
    renderAll();
  }

  function renderAll() {
    if (!salesData) return;
    renderStrip();
    renderFilterRow();
    renderViewBtns();
    renderChart();
    renderPareto();
    renderOverdue();
    renderLanes();
  }

  /* ── Summary strip ───────────────────────────────────────────────────────── */
  function renderStrip() {
    const s = salesData.summary;
    const nearOD = s.nearest_overdue ? fmtDate(s.nearest_overdue) : null;
    const strip = el('sales-strip');
    if (!strip) return;
    strip.innerHTML = [
      bubble('MTD Earned',   fmt(s.total_earned_mtd), s.total_earned_mtd > 0 ? '#22c55e' : null),
      bubble('AR Outstanding', fmt(s.total_ar), s.total_ar > 0 ? '#f59e0b' : null),
      bubble('Total Overdue', fmt(s.total_overdue), s.total_overdue > 0 ? '#ef4444' : null),
      bubble('Open Quotes', fmt(s.open_quotes_total) + ` (${s.open_quotes})`, s.open_quotes > 0 ? '#8b5cf6' : null),
      nearOD ? bubble('Nearest Due', nearOD, '#ef4444') : '',
      bubble('YTD Revenue', fmt(s.ytd_revenue), null)
    ].join('');
  }

  function bubble(label, value, color) {
    return `<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:0.35rem 0.75rem;font-size:0.72rem;white-space:nowrap">
      <div style="color:var(--text-dim)">${label}</div>
      <div style="font-weight:700;color:${color || 'var(--text)'}">${value}</div>
    </div>`;
  }

  /* ── Filter row ──────────────────────────────────────────────────────────── */
  function renderFilterRow() {
    const row = el('sales-filter-row');
    if (!row) return;
    const businesses = salesData.businesses || [];
    const periodBtns = ['6m','12m','all'].map(p =>
      `<button class="sales-period-btn" data-p="${p}" style="font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${currentPeriod===p?'var(--accent)':'transparent'};color:${currentPeriod===p?'#000':'var(--text)'};cursor:pointer">${p}</button>`
    ).join('');
    const bizBtns = [
      `<button class="sales-biz-btn" data-bid="all" style="font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${currentBusFilter==='all'?'var(--accent)':'transparent'};color:${currentBusFilter==='all'?'#000':'var(--text)'};cursor:pointer">All</button>`,
      ...businesses.map(b =>
        `<button class="sales-biz-btn" data-bid="${esc(b.bus_id)}" style="font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${currentBusFilter===b.bus_id?'var(--accent)':'transparent'};color:${currentBusFilter===b.bus_id?'#000':'var(--text)'};cursor:pointer">${esc(b.brand_name||b.bus_id)}</button>`
      )
    ].join('');
    row.innerHTML = periodBtns + `<span style="color:var(--border);margin:0 0.2rem">|</span>` + bizBtns
      + (salesData.biz_unavailable ? `<span style="font-size:0.65rem;color:#f59e0b;margin-left:0.5rem">⚠ Business data unavailable</span>` : '');

    row.querySelectorAll('.sales-period-btn').forEach(btn => {
      btn.onclick = () => { currentPeriod = btn.dataset.p; loadAndRender(); };
    });
    row.querySelectorAll('.sales-biz-btn').forEach(btn => {
      btn.onclick = () => { currentBusFilter = btn.dataset.bid; loadAndRender(); };
    });
  }

  /* ── View toggle buttons ─────────────────────────────────────────────────── */
  function renderViewBtns() {
    const vb = el('sales-view-btns');
    if (!vb) return;
    vb.innerHTML = ['card','list'].map(v =>
      `<button class="sales-view-btn" data-v="${v}" style="font-size:0.72rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${currentView===v?'var(--accent)':'transparent'};color:${currentView===v?'#000':'var(--text)'};cursor:pointer">${v}</button>`
    ).join('');
    vb.querySelectorAll('.sales-view-btn').forEach(btn => {
      btn.onclick = () => { currentView = btn.dataset.v; renderViewBtns(); renderLanes(); };
    });
  }

  /* ── Chart: stacked bar by month ─────────────────────────────────────────── */
  function renderChart() {
    const canvas = el('sales-chart-main');
    if (!canvas || !window.Chart) return;
    if (chartMain) { chartMain.destroy(); chartMain = null; }

    const s       = salesData.summary;
    const byMonth = s.by_month || [];
    const labels  = byMonth.map(m => {
      const d = new Date(m.month + '-01');
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    });

    // Per-business + personal per month
    const businesses = salesData.businesses || [];
    const BIZ_COLORS = ['rgba(59,130,246,0.75)','rgba(139,92,246,0.75)','rgba(245,158,11,0.75)',
      'rgba(20,184,166,0.75)','rgba(244,63,94,0.75)','rgba(34,197,94,0.75)'];

    const datasets = businesses.map((b, i) => ({
      label: b.brand_name || b.bus_id,
      data: byMonth.map(m => b.invoices
        .flatMap(inv => inv.payments.filter(p => p.date?.startsWith(m.month)).map(p => p.amount))
        .reduce((s, v) => s + v, 0)),
      backgroundColor: BIZ_COLORS[i % BIZ_COLORS.length],
      stack: 'a'
    }));

    // Personal (assets + manual)
    const personal = salesData.personal || {};
    datasets.push({
      label: 'Personal',
      data: byMonth.map(m =>
        (personal.asset_sales || []).filter(a => a.sold_date?.startsWith(m.month)).reduce((s,a)=>s+a.sold_price,0)
        + (personal.manual_entries || []).filter(t => t.fields?.date?.startsWith(m.month)).reduce((s,t)=>s+Number(t.fields?.amount||0),0)
      ),
      backgroundColor: 'rgba(212,175,55,0.75)',
      stack: 'a'
    });

    // Cumulative YTD line
    let cum = 0;
    const cumData = byMonth.map(m => { cum += m.total; return cum; });
    datasets.push({
      label: 'Cumulative',
      data: cumData,
      type: 'line',
      borderColor: 'rgba(255,255,255,0.5)',
      borderWidth: 1.5,
      pointRadius: 2,
      fill: false,
      yAxisID: 'y2',
      tension: 0.3
    });

    chartMain = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true, ticks: { font: { size: 9 } } },
          y: { stacked: true, ticks: { font: { size: 9 }, callback: v => '฿' + (v/1000).toFixed(0) + 'k' } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 9 }, callback: v => '฿' + (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  /* ── Pareto chart ────────────────────────────────────────────────────────── */
  function renderPareto() {
    const canvas = el('sales-chart-pareto');
    if (!canvas || !window.Chart) return;
    if (chartPareto) { chartPareto.destroy(); chartPareto = null; }

    let labels = [], data = [], colors = [];
    const BIZ_COLORS = ['rgba(59,130,246,0.8)','rgba(139,92,246,0.8)','rgba(245,158,11,0.8)',
      'rgba(20,184,166,0.8)','rgba(244,63,94,0.8)','rgba(34,197,94,0.8)'];

    if (currentBusFilter === 'all') {
      // Revenue by business
      (salesData.businesses || []).forEach((b, i) => {
        labels.push(b.brand_name || b.bus_id);
        data.push(b.summary.total_received);
        colors.push(BIZ_COLORS[i % BIZ_COLORS.length]);
      });
    } else {
      // Top products for selected business
      const biz = (salesData.businesses || []).find(b => b.bus_id === currentBusFilter);
      if (biz) {
        const prodMap = {};
        biz.invoices.forEach(inv => {
          const key = inv.product_name || 'Other';
          prodMap[key] = (prodMap[key] || 0) + inv.paid_total;
        });
        const sorted = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        labels = sorted.map(([k]) => k.length > 12 ? k.slice(0, 12) + '…' : k);
        data   = sorted.map(([, v]) => v);
        colors = sorted.map((_, i) => BIZ_COLORS[i % BIZ_COLORS.length]);
      }
    }

    chartPareto = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: {
        indexAxis: 'x',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 8 }, maxRotation: 45 } },
          y: { ticks: { font: { size: 8 }, callback: v => '฿' + (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  /* ── Overdue section ─────────────────────────────────────────────────────── */
  function renderOverdue() {
    const zone = el('sales-overdue-section');
    if (!zone) return;
    const overdue = (salesData.businesses || []).flatMap(b =>
      b.invoices.filter(i => i.is_overdue).map(i => ({ ...i, _biz: b }))
    );
    if (!overdue.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div style="background:rgba(239,68,68,0.08);border:1px solid #ef4444;border-radius:var(--radius);padding:0.75rem;margin-bottom:0.75rem">
        <div style="font-size:0.72rem;font-weight:700;color:#ef4444;margin-bottom:0.5rem;letter-spacing:0.04em">🔴 OVERDUE (${overdue.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          ${overdue.map(inv => invoiceCardHtml(inv, true)).join('')}
        </div>
      </div>`;
    zone.querySelectorAll('.sales-inv-card[data-qid]').forEach(card => {
      card.addEventListener('click', () => openInvoiceModal(card.dataset.qid));
    });
  }

  /* ── Main lanes ──────────────────────────────────────────────────────────── */
  function renderLanes() {
    const zone = el('sales-lanes');
    if (!zone) return;
    const businesses = salesData.businesses || [];
    const projects   = salesData.projects   || [];
    const personal   = salesData.personal   || {};
    let html = '';

    // Active Business section
    html += sectionHeader('ACTIVE BUSINESS', 'sales-sec-biz');
    html += `<div id="sales-sec-biz-body">`;
    if (businesses.length === 0) {
      html += `<div style="padding:0.75rem;font-size:0.78rem;color:var(--text-dim)">No business lanes — add businesses to Business ID table.</div>`;
      if (salesData.biz_unavailable) html += `<div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:#f59e0b">⚠ Business data unavailable — check AIRTABLE_BUSINESS_BASE_ID env var.</div>`;
    } else {
      businesses.forEach(biz => { html += renderBizLane(biz); });
    }
    html += '</div>';

    // Projects section
    if (projects.length > 0) {
      html += sectionHeader('PROJECTS (forecast)', 'sales-sec-proj');
      html += `<div id="sales-sec-proj-body" style="padding:0.5rem 0">`;
      projects.forEach(p => { html += projectLaneCard(p); });
      html += '</div>';
    }

    // Personal section
    const hasSold = (personal.asset_sales || []).length > 0;
    const hasManual = (personal.manual_entries || []).length > 0;
    if (hasSold || hasManual) {
      html += sectionHeader('PERSONAL', 'sales-sec-personal');
      html += `<div id="sales-sec-personal-body">`;
      if (hasSold) {
        html += `<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);padding:0.3rem 0;letter-spacing:0.04em">ASSET SALES</div>`;
        html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem">`;
        (personal.asset_sales || []).forEach(a => { html += assetSaleCard(a); });
        html += '</div>';
      }
      if (hasManual) {
        html += `<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);padding:0.3rem 0;letter-spacing:0.04em">MANUAL ENTRIES</div>`;
        html += `<div style="font-size:0.75rem;color:var(--text-dim)">`;
        (personal.manual_entries || []).forEach(t => {
          const f = t.fields || t;
          html += `<div style="padding:0.2rem 0;border-bottom:1px solid var(--border)">${fmtDate(f.date)} · ${esc(f.entity||'')} · ${fmt(f.amount)}</div>`;
        });
        html += '</div>';
      }
      html += '</div>';
    }

    zone.innerHTML = html;

    // Wire section collapse toggles
    zone.querySelectorAll('.sales-sec-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const bodyId = btn.dataset.target;
        const body = el(bodyId);
        if (!body) return;
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        btn.textContent = hidden ? '▼' : '▶';
      });
    });

    // Wire invoice card clicks
    zone.querySelectorAll('.sales-inv-card[data-qid]').forEach(card => {
      card.addEventListener('click', () => openInvoiceModal(card.dataset.qid));
    });

    // Wire project lane links
    zone.querySelectorAll('.sales-proj-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        window.location.hash = 'projects';
      });
    });

    // Auto-activate list view on narrow screen
    if (window.innerWidth < 600 && currentView !== 'list') {
      currentView = 'list';
      renderViewBtns();
    }
  }

  function sectionHeader(label, id) {
    return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border);margin-bottom:0.35rem;margin-top:0.5rem">
      <button class="sales-sec-toggle" data-target="${id}-body" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.75rem;padding:0">▼</button>
      <span style="font-size:0.72rem;font-weight:700;color:var(--text-dim);letter-spacing:0.05em">${label}</span>
    </div>`;
  }

  function renderBizLane(biz) {
    const hasInvoices = biz.invoices.length > 0;
    const collapsed   = !hasInvoices ? 'style="display:none"' : '';
    const arrow       = !hasInvoices ? '▶' : '▼';
    const laneId      = 'sales-biz-' + biz.bus_id;
    let html = `<div style="margin-bottom:0.5rem">
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.biz-arrow').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'">
        <span class="biz-arrow" style="font-size:0.7rem;color:var(--text-dim)">${arrow}</span>
        <span style="font-size:0.78rem;font-weight:700">${esc(biz.business_name)}</span>
        <span style="font-size:0.65rem;color:var(--text-dim)">${esc(biz.bus_id)}</span>
        <span style="font-size:0.7rem;font-weight:700;color:#22c55e;margin-left:auto">${fmt(biz.summary.total_received)}</span>
        ${biz.summary.total_ar ? `<span style="font-size:0.68rem;background:rgba(245,158,11,0.15);color:#f59e0b;padding:0.1rem 0.4rem;border-radius:999px">AR ${fmt(biz.summary.total_ar)}</span>` : ''}
        ${biz.unavailable ? `<span style="font-size:0.65rem;color:#f59e0b">⚠ data unavailable</span>` : ''}
      </div>
      <div id="${laneId}" ${collapsed}>
        ${!hasInvoices ? `<div style="padding:0.35rem 1rem;font-size:0.72rem;color:var(--text-dim)">No sales in this period.</div>` : ''}
        ${currentView === 'list' ? listViewHtml(biz.invoices) : cardViewHtml(biz.invoices)}
      </div>
    </div>`;
    return html;
  }

  function cardViewHtml(invoices) {
    return `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.25rem 0">${invoices.map(inv => invoiceCardHtml(inv, false)).join('')}</div>`;
  }

  function listViewHtml(invoices) {
    if (!invoices.length) return '';
    return `<table style="width:100%;border-collapse:collapse;font-size:0.72rem">
      <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:0.2rem 0.4rem">Date</th>
        <th style="text-align:left;padding:0.2rem 0.4rem">Customer</th>
        <th style="text-align:left;padding:0.2rem 0.4rem">Product</th>
        <th style="text-align:right;padding:0.2rem 0.4rem">Invoice</th>
        <th style="text-align:right;padding:0.2rem 0.4rem">Paid</th>
        <th style="text-align:right;padding:0.2rem 0.4rem">Balance</th>
        <th style="text-align:center;padding:0.2rem 0.4rem">Stage</th>
      </tr></thead>
      <tbody>${invoices.map(inv => `<tr class="sales-inv-card" data-qid="${esc(inv.quote_id)}" style="cursor:pointer;border-bottom:1px solid var(--border)${inv.is_overdue?';background:rgba(239,68,68,0.04)':''}">
        <td style="padding:0.25rem 0.4rem">${fmtDate(inv.sale_date)}</td>
        <td style="padding:0.25rem 0.4rem">${esc(inv.customer_name)}</td>
        <td style="padding:0.25rem 0.4rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(inv.product_name)}</td>
        <td style="text-align:right;padding:0.25rem 0.4rem">${fmt(inv.invoice_total)}</td>
        <td style="text-align:right;padding:0.25rem 0.4rem">${fmt(inv.paid_total)}</td>
        <td style="text-align:right;padding:0.25rem 0.4rem;color:${inv.balance>0?'#f59e0b':'var(--text-dim)'}">${fmt(inv.balance)}</td>
        <td style="text-align:center;padding:0.25rem 0.4rem">${stageBadge(inv.status)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function invoiceCardHtml(inv, isOverdue) {
    const pct = inv.invoice_total > 0 ? Math.round(inv.paid_total / inv.invoice_total * 100) : 0;
    const lastPmt = inv.payments.length ? inv.payments.slice().sort((a,b)=>b.date.localeCompare(a.date))[0] : null;
    const border = isOverdue ? '#ef4444' : inv.is_ar ? '#f59e0b' : 'var(--border)';
    const pulse  = isOverdue ? 'animation:pulse 1.5s infinite' : '';
    return `<div class="sales-inv-card" data-qid="${esc(inv.quote_id)}"
      style="background:var(--bg-card);border:1.5px solid ${border};border-radius:var(--radius);padding:0.65rem;min-width:200px;max-width:260px;cursor:pointer;${pulse}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.25rem">
        ${inv.product_image ? `<img src="${esc(inv.product_image)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:0.5rem;flex-shrink:0" loading="lazy">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:0.72rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(inv.customer_name)}</div>
          <div style="font-size:0.63rem;color:var(--text-dim)">${esc(inv.invoice_no)}</div>
        </div>
        ${stageBadge(inv.status)}
      </div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(inv.product_name)}</div>
      <div style="border-top:1px solid var(--border);margin:0.3rem 0;padding-top:0.3rem;font-size:0.72rem">
        <div>Invoice <strong>${fmt(inv.invoice_total)}</strong></div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          <span>Paid ${fmt(inv.paid_total)}</span>
          <div style="flex:1;height:5px;background:var(--border);border-radius:999px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=100?'#22c55e':'#f59e0b'}"></div>
          </div>
        </div>
        ${inv.balance > 0 ? `<div style="color:${isOverdue?'#ef4444':'#f59e0b'}">Balance ${fmt(inv.balance)}</div>` : ''}
      </div>
      <div style="font-size:0.63rem;color:var(--text-dim)">${fmtDate(inv.sale_date)}${lastPmt ? ` · ${inv.days_since_last_payment}d since last pmt` : ''}</div>
      ${isOverdue && inv.due_date ? `<div style="font-size:0.65rem;color:#ef4444;font-weight:700">Overdue since ${fmtDate(inv.due_date)}</div>` : ''}
    </div>`;
  }

  function stageBadge(status) {
    const c = { Paid:'#22c55e', Partial:'#f59e0b', Overdue:'#ef4444', Open:'#8b5cf6' }[status] || 'var(--text-dim)';
    return `<span style="font-size:0.6rem;padding:0.1rem 0.35rem;border-radius:999px;background:${c}20;color:${c};font-weight:700;white-space:nowrap">${status}</span>`;
  }

  function projectLaneCard(p) {
    const PHASE_C = { DS:'#3b82f6', PT:'#8b5cf6', PD:'#06b6d4', PV:'#f59e0b', LA:'#22c55e' };
    const phColor = PHASE_C[p.current_phase] || '#666';
    const phases  = ['DS','PT','PD','PV','LA'];
    const phIdx   = phases.indexOf(p.current_phase);
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:0.65rem;margin-bottom:0.4rem">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">
        <span style="font-weight:700;font-size:0.78rem">${esc(p.name)}</span>
        <span style="font-size:0.65rem;padding:0.1rem 0.4rem;border-radius:999px;background:${phColor}20;color:${phColor};font-weight:700">${p.current_phase}</span>
        <span style="font-size:0.68rem;color:#14b8a6;margin-left:auto">Expected ${fmt(p.target_revenue_monthly)}/mo</span>
      </div>
      <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.35rem">
        ${p.days_to_launch != null ? `Launch in ${p.days_to_launch} days` : 'Launch date not set'}
      </div>
      <div style="display:flex;gap:2px;margin-bottom:0.35rem">
        ${phases.map((ph, i) => `<div style="flex:1;height:5px;border-radius:999px;background:${i<=phIdx?PHASE_C[ph]:'var(--border)'}"></div>`).join('')}
      </div>
      <a class="sales-proj-link" href="#" style="font-size:0.68rem;color:var(--accent);text-decoration:none">Go to Project ↗</a>
    </div>`;
  }

  function assetSaleCard(a) {
    const gain    = a.sold_price - a.cost_price;
    const gainCol = gain >= 0 ? '#22c55e' : '#ef4444';
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:0.65rem;min-width:160px;max-width:210px">
      ${a.image_url ? `<img src="${esc(a.image_url)}" style="width:100%;height:80px;object-fit:cover;border-radius:4px;margin-bottom:0.4rem" loading="lazy">` : ''}
      <div style="font-weight:700;font-size:0.75rem;margin-bottom:0.15rem">${esc(a.name)}</div>
      <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.2rem">${esc(a.category)}</div>
      <div style="font-size:0.72rem">Sold ${fmt(a.sold_price)}${a.sold_via ? ` · via ${esc(a.sold_via)}` : ''}</div>
      <div style="font-size:0.68rem;color:var(--text-dim)">${fmtDate(a.sold_date)}</div>
      ${a.cost_price > 0 ? `<div style="font-size:0.68rem;color:${gainCol}">Gain ${fmt(gain)}</div>` : ''}
    </div>`;
  }

  /* ── Invoice detail modal ────────────────────────────────────────────────── */
  function openInvoiceModal(quoteId) {
    const allInvoices = (salesData.businesses || []).flatMap(b => b.invoices.map(i => ({ ...i, _biz: b })));
    const inv = allInvoices.find(i => i.quote_id === quoteId);
    if (!inv) return;
    const modal = el('sales-modal');
    const body  = el('sales-modal-body');
    if (!modal || !body) return;

    const pct = inv.invoice_total > 0 ? Math.round(inv.paid_total / inv.invoice_total * 100) : 0;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem">
        <div>
          <div style="font-weight:700;font-size:0.88rem">${esc(inv.customer_name)}</div>
          <div style="font-size:0.7rem;color:var(--text-dim)">${esc(inv.invoice_no)} · ${esc(inv._biz?.business_name||'')}</div>
        </div>
        <button id="sales-modal-close" style="background:none;border:none;color:var(--text-dim);font-size:1.2rem;cursor:pointer;padding:0">✕</button>
      </div>
      <div style="font-size:0.78rem;font-weight:700;margin-bottom:0.2rem">${esc(inv.product_name)}</div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:0.5rem">
        <span>Invoice ${fmt(inv.invoice_total)}</span>
        <span>Paid ${fmt(inv.paid_total)}</span>
        <span style="color:${inv.balance>0?'#f59e0b':'#22c55e'}">Balance ${fmt(inv.balance)}</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:999px;overflow:hidden;margin-bottom:0.5rem">
        <div style="height:100%;width:${pct}%;background:${pct>=100?'#22c55e':'#f59e0b'}"></div>
      </div>
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);margin-bottom:0.35rem;letter-spacing:0.04em">PAYMENT HISTORY</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.72rem;margin-bottom:0.75rem">
        ${inv.payments.map(p => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:0.2rem 0">${fmtDate(p.date)}</td>
          <td style="padding:0.2rem 0;color:var(--text-dim)">${esc(p.stage)}</td>
          <td style="padding:0.2rem 0;text-align:right;font-weight:700">${fmt(p.amount)}</td>
        </tr>`).join('')}
        ${!inv.payments.length ? `<tr><td colspan="3" style="color:var(--text-dim);padding:0.3rem 0">No payments recorded</td></tr>` : ''}
      </table>
      <div style="display:flex;gap:0.4rem;font-size:0.72rem">
        <span style="color:var(--text-dim)">Sale date: ${fmtDate(inv.sale_date)}</span>
        ${inv.due_date ? `<span style="color:${inv.is_overdue?'#ef4444':'var(--text-dim)'};margin-left:0.5rem">Due: ${fmtDate(inv.due_date)}</span>` : ''}
      </div>`;

    modal.style.display = 'flex';
    el('sales-modal-close').onclick = () => { modal.style.display = 'none'; };
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
  }

  /* ── Entry button ────────────────────────────────────────────────────────── */
  function wireEntry() {
    const btn = el('sales-entry-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('open-entry-drawer', { detail: { tab: 'transactions', type: 'earn' } }));
    });
    // Re-fetch after entry drawer closes (if it dispatches a close event)
    document.addEventListener('entry-drawer-saved', () => { loadAndRender(); }, { once: false });
  }

  /* ── CSS keyframe for pulse ──────────────────────────────────────────────── */
  function ensureStyles() {
    if (el('sales-styles')) return;
    const s = document.createElement('style');
    s.id = 'sales-styles';
    s.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`;
    document.head.appendChild(s);
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */
  function init() {
    if (initialized) return;
    initialized = true;
    ensureStyles();
    buildShell();
    wireEntry();
    loadAndRender();
  }

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  function tryInit() {
    const panel = el('panel-sales');
    if (panel?.classList.contains('active')) init();
  }

  document.addEventListener('panelactivated', e => {
    if (e.detail?.panelId === 'panel-sales') init();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
