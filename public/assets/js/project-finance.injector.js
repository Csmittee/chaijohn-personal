/* project-finance.injector.js — M2.4 Finance Projects panel */
(function () {
  'use strict';

  const fmt     = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc     = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const el      = id => document.getElementById(id);
  const todayIso = () => new Date().toISOString().split('T')[0];

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

  const PHASE_COLORS = { DS:'#3b82f6', PT:'#8b5cf6', PD:'#06b6d4', PV:'#f59e0b', LA:'#22c55e' };

  let allProjects      = [];
  let presaleByProject = {}; // project_id → [transactions]
  let expandedId       = null;
  let initialized      = false;

  function panelEl() { return el('panel-projects'); }

  // ── Data ──────────────────────────────────────────────────────────────────
  async function loadAll() {

    const [projRes, txRes] = await Promise.allSettled([
      api('/api/projects'),
      api('/api/transactions?source=presale')
    ]);

    const projects = projRes.status === 'fulfilled'
      ? (projRes.value.records || [])
      : [];

    // Build presale map by project_id
    presaleByProject = {};
    if (txRes.status === 'fulfilled') {
      (txRes.value.records || []).forEach(r => {
        const pid = r.fields?.project_id;
        if (!pid) return;
        if (!presaleByProject[pid]) presaleByProject[pid] = [];
        presaleByProject[pid].push({ id: r.id, ...r.fields });
      });
    }

    // Filter: Active OR finance_opened
    allProjects = projects.filter(p => p.type === 'Active' || p.finance_opened);
    // Sort: Active first, then by investment_total desc
    allProjects.sort((a, b) => {
      if (a.type === 'Active' && b.type !== 'Active') return -1;
      if (b.type === 'Active' && a.type !== 'Active') return 1;
      return Number(b.investment_total || 0) - Number(a.investment_total || 0);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const panel = panelEl();
    if (!panel) return;

    if (allProjects.length === 0) {
      panel.innerHTML = `
        <div style="padding:1rem">
          <div style="font-size:0.85rem;color:var(--text-secondary);text-align:center;padding:2rem">
            No active or finance-opened projects yet.<br>
            Create a project in Project Assets and set it Active.
          </div>
        </div>`;
      return;
    }

    // Summary strip calculations
    const pipelineCount    = allProjects.length;
    const totalCapex       = allProjects.reduce((s, p) => s + Number(p.investment_total || 0), 0);
    const activePjs        = allProjects.filter(p => p.type === 'Active');
    const totalRevMonthly  = activePjs.reduce((s, p) => s + Number(p.target_revenue_monthly || 0), 0);
    const paybackVals      = allProjects.map(p => {
      const sga    = Number(p.sga_pct || 10) / 100;
      const revMo  = Number(p.target_revenue_monthly || 0);
      const inv    = Number(p.investment_total || 0);
      const netMo  = revMo * (1 - sga);
      return netMo > 0 ? inv / netMo : null; // months
    }).filter(v => v !== null);
    const avgPaybackMonths = paybackVals.length
      ? paybackVals.reduce((s, v) => s + v, 0) / paybackVals.length
      : null;
    const avgPayback = avgPaybackMonths !== null
      ? (avgPaybackMonths < 12 ? Math.round(avgPaybackMonths) + ' mo' : (avgPaybackMonths / 12).toFixed(1) + ' yr')
      : null;

    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
        <div id="pf-strip" style="flex-shrink:0;padding:0.75rem 1rem;border-bottom:1px solid var(--border);
          display:flex;gap:0.75rem;flex-wrap:wrap">
          ${bubbleHtml('Pipeline', pipelineCount, 'projects')}
          ${bubbleHtml('Total CAPEX', fmt(totalCapex), '')}
          ${bubbleHtml('Monthly Rev (Active)', fmt(totalRevMonthly), '')}
          ${bubbleHtml('Avg Payback', avgPayback !== null ? avgPayback : '—', '')}
        </div>
        <div id="pf-body" style="flex:1;overflow-y:auto;padding:0.75rem 1rem">
          ${allProjects.map(p => boundaryCardHtml(p)).join('')}
        </div>
      </div>`;

    wireCards();
  }

  function bubbleHtml(label, value, unit) {
    return `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);
        padding:0.5rem 0.75rem;min-width:110px">
        <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">${label}</div>
        <div style="font-size:1rem;font-weight:700;margin-top:0.1rem">${value}${unit ? '<span style="font-size:0.75rem;font-weight:400;color:var(--text-secondary);margin-left:0.2rem">'+unit+'</span>' : ''}</div>
      </div>`;
  }

  function boundaryCardHtml(p) {
    const sga       = Number(p.sga_pct || 10) / 100;
    const revMo     = Number(p.target_revenue_monthly || 0);
    const inv       = Number(p.investment_total || 0);
    const netMo     = revMo * (1 - sga);
    const paybackMo = netMo > 0 ? inv / netMo : null;
    const payback   = paybackMo !== null ? (paybackMo < 12 ? Math.round(paybackMo) + ' mo' : (paybackMo / 12).toFixed(1) + ' yr') : null;
    const presales  = presaleByProject[p.id] || [];
    const presaleTotal = presales.reduce((s, t) => s + Number(t.amount || 0), 0);
    const phaseColor = PHASE_COLORS[p.current_phase] || '#94a3b8';
    const isExpanded = expandedId === p.id;

    return `
      <div class="pf-card" data-proj-id="${p.id}"
        style="border:1px solid var(--border);border-radius:var(--radius);
        margin-bottom:0.75rem;background:var(--bg-card);overflow:hidden">
        <div class="pf-card-header" data-proj-id="${p.id}"
          style="display:flex;align-items:center;justify-content:space-between;
          padding:0.75rem 1rem;cursor:pointer;user-select:none">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <strong style="font-size:0.95rem">${esc(p.name)}</strong>
              ${p.current_phase ? `<span style="font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;
                border-radius:20px;background:${phaseColor}22;color:${phaseColor}">${p.current_phase}</span>` : ''}
              ${p.type === 'Active' ? `<span style="font-size:0.7rem;padding:0.1rem 0.4rem;
                border-radius:20px;background:#22c55e22;color:#22c55e">Active</span>` : ''}
            </div>
            <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.2rem">
              P&amp;L: ${fmt(revMo)}/mo · ${payback !== null ? payback + ' payback' : 'no revenue set'}
            </div>
            ${inv > 0 ? fundingBarHtml(p) : ''}
            ${presaleTotal > 0 ? `<div style="font-size:0.75rem;color:#22c55e;margin-top:0.2rem">
              Presale confirmed: ${fmt(presaleTotal)}</div>` : ''}
            ${p.days_to_launch !== null && p.days_to_launch !== undefined ? `
              <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.1rem">
                Days to first revenue: ${p.days_to_launch > 0 ? p.days_to_launch + ' days' : 'overdue'}</div>` : ''}
          </div>
          <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:0.75rem;
            transition:transform 0.3s;display:inline-block;
            transform:${isExpanded ? 'rotate(180deg)' : ''}">▼</span>
        </div>
        ${isExpanded ? expandedHtml(p) : ''}
      </div>`;
  }

  function fundingBarHtml(p) {
    const inv    = Number(p.investment_total || 0);
    return `
      <div style="margin-top:0.35rem">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;
          color:var(--text-secondary);margin-bottom:0.2rem">
          <span>CAPEX</span><span>${fmt(inv)}</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:100%;background:#94a3b8;border-radius:3px"></div>
        </div>
      </div>`;
  }

  function expandedHtml(p) {
    const presales = presaleByProject[p.id] || [];
    const salesSent = p.sales_forecast_sent;
    const hasRevenue = Number(p.target_revenue_monthly || 0) > 0;
    const inputStyle = 'width:100%;box-sizing:border-box;font-size:0.78rem;padding:0.3rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)';

    return `
      <div class="pf-expanded" data-proj-id="${p.id}"
        style="border-top:1px solid var(--border);padding:0.75rem 1rem">
        <div id="pf-resources-${p.id}" style="margin-bottom:1rem">
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);
            text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Budget Cards</div>
          <div id="pf-res-list-${p.id}" style="display:flex;flex-wrap:wrap;gap:0.25rem;align-items:flex-start">
            <div style="font-size:0.82rem;color:var(--text-secondary)">Loading…</div>
          </div>
        </div>

        <div style="margin-bottom:1rem" id="pf-presale-section-${p.id}">
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);
            text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Presale Records</div>
          <div id="pf-presale-list-${p.id}" style="display:flex;flex-wrap:wrap;gap:0.25rem;align-items:flex-start">
            ${presales.map(t => presaleCardHtml(t)).join('')}
          </div>
          <div id="pf-presale-form-${p.id}" style="display:none;margin-top:0.5rem;border:1px solid var(--border);border-radius:var(--radius);padding:0.65rem;background:var(--bg-raised)">
            <div style="font-size:0.75rem;font-weight:600;margin-bottom:0.5rem;color:var(--yellow)">Add Presale</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.4rem">
              <div>
                <label style="font-size:0.72rem;display:block;margin-bottom:0.15rem">Amount (฿)</label>
                <input class="pf-presale-amount" style="${inputStyle}" type="number" placeholder="0">
              </div>
              <div>
                <label style="font-size:0.72rem;display:block;margin-bottom:0.15rem">Date</label>
                <input class="pf-presale-date" style="${inputStyle}" type="date" value="${todayIso()}">
              </div>
              <div>
                <label style="font-size:0.72rem;display:block;margin-bottom:0.15rem">Customer / Entity</label>
                <input class="pf-presale-entity" style="${inputStyle}" type="text" placeholder="Customer name">
              </div>
              <div>
                <label style="font-size:0.72rem;display:block;margin-bottom:0.15rem">Note (optional)</label>
                <input class="pf-presale-note" style="${inputStyle}" type="text" placeholder="Note">
              </div>
            </div>
            <div style="display:flex;gap:0.4rem">
              <button class="pf-presale-save" data-proj-id="${p.id}" data-proj-name="${esc(p.name)}"
                style="padding:0.3rem 0.7rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;font-weight:600;cursor:pointer;font-size:0.78rem">Save presale</button>
              <button class="pf-presale-cancel" data-proj-id="${p.id}"
                style="padding:0.3rem 0.7rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer;font-size:0.78rem">Cancel</button>
            </div>
            <div class="pf-presale-msg" data-proj-id="${p.id}" style="display:none;font-size:0.75rem;margin-top:0.3rem"></div>
          </div>
          <button class="pf-add-presale-btn" data-proj-id="${p.id}"
            style="margin-top:0.4rem;font-size:0.75rem;padding:0.25rem 0.65rem;border:1px dashed var(--border);border-radius:var(--radius);background:transparent;color:var(--text-secondary);cursor:pointer">+ Add presale</button>
        </div>

        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="pf-send-sales btn" data-proj-id="${p.id}"
            style="font-size:0.82rem;padding:0.35rem 0.75rem;
            background:${salesSent ? '#22c55e' : (hasRevenue ? 'var(--yellow)' : '#94a3b8')};
            color:${hasRevenue && !salesSent ? '#0a0a10' : 'white'};border:none;border-radius:var(--radius);cursor:${salesSent || !hasRevenue ? 'default' : 'pointer'}"
            ${salesSent || !hasRevenue ? 'disabled title="' + (salesSent ? 'Already live in Sales' : 'Set target revenue first') + '"' : ''}>
            ${salesSent ? '✓ Sales Active' : 'Send to Sales ↑'}
          </button>
          <button class="pf-view-project btn btn-outline" data-proj-id="${p.id}"
            style="font-size:0.82rem;padding:0.35rem 0.75rem">
            → View Project
          </button>
        </div>
        <div class="pf-action-msg" data-proj-id="${p.id}"
          style="display:none;font-size:0.78rem;margin-top:0.4rem"></div>
      </div>`;
  }

  function presaleCardHtml(t) {
    return `
      <div style="display:inline-flex;flex-direction:column;min-width:160px;max-width:220px;width:auto;
        vertical-align:top;margin:0.25rem;border:1px solid var(--border);border-radius:var(--radius);
        padding:0.6rem 0.75rem;background:rgba(34,197,94,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:0.78rem;color:var(--text-secondary)">${fmtDate(t.date)}</span>
          <span style="font-weight:700;color:#22c55e">+${fmt(t.amount)}</span>
        </div>
        ${t.entity ? `<div style="font-size:0.82rem;margin-top:0.15rem">${esc(t.entity)}</div>` : ''}
        ${t.description ? `<div style="font-size:0.78rem;color:var(--text-secondary)">${esc(t.description)}</div>` : ''}
        <span style="display:inline-block;margin-top:0.25rem;font-size:0.7rem;
          padding:0.1rem 0.4rem;border-radius:20px;background:#22c55e22;color:#22c55e">Pre-sale</span>
      </div>`;
  }

  // ── Load resources for an expanded project ────────────────────────────────
  async function loadProjectResources(projId) {
    const container = el(`pf-res-list-${projId}`);
    if (!container) return;
    try {
      const res = await api(`/api/projects/${projId}`);
      const resources = res.resources || [];
      if (resources.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem;color:var(--text-secondary)">No budget items yet — add resources in Project Assets.</div>';
        return;
      }
      container.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.25rem;align-items:flex-start';
      container.innerHTML = resources.map(r => resourceCardHtml(r)).join('');
      wireConfirmButtons(container, projId);
    } catch (err) {
      container.innerHTML = `<div style="font-size:0.82rem;color:#ef4444">${err.message}</div>`;
    }
  }

  function resourceCardHtml(r) {
    const statusColor = r.status === 'In use' ? '#22c55e' : r.status === 'Purchased' ? '#f59e0b' : '#94a3b8';
    const showConfirm = r.status === 'Planned';
    return `
      <div class="pf-res-card" data-res-id="${r.id}"
        style="display:inline-flex;flex-direction:column;min-width:160px;max-width:220px;width:auto;
        vertical-align:top;margin:0.25rem;border:1px solid var(--border);border-radius:var(--radius);
        padding:0.6rem 0.75rem;background:var(--bg-card)">
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.15rem">
          <strong style="font-size:0.85rem">${esc(r.item)}</strong>
          <span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:20px;
            background:${statusColor}22;color:${statusColor}">${r.status || 'Planned'}</span>
        </div>
        ${r.time_needed ? `<div style="font-size:0.75rem;color:var(--text-secondary)">Time: ${esc(r.time_needed)}</div>` : ''}
        <div style="font-size:0.82rem;font-weight:600;margin-top:0.1rem;margin-bottom:${showConfirm?'0.4rem':'0'}">${fmt(r.cost)}</div>
        ${showConfirm ? `<button class="pf-confirm-res" data-res-id="${r.id}" data-item="${esc(r.item)}" data-cost="${r.cost||0}"
          style="font-size:0.78rem;padding:0.25rem 0.6rem;
          background:var(--color-primary);color:white;border:none;
          border-radius:var(--radius);cursor:pointer;align-self:flex-start">Confirm →</button>` : ''}
      </div>`;
  }

  function wireConfirmButtons(container, projId) {
    container.querySelectorAll('.pf-confirm-res').forEach(btn => {
      btn.addEventListener('click', async () => {
        const resId    = btn.dataset.resId;
        const resItem  = btn.dataset.item || 'Resource';
        const resCost  = Number(btn.dataset.cost || 0);
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await api(`/api/project-resources/${resId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Purchased' })
          });
          // Post project_funding expense to Cashflow (excluded from M2.3 Expenses)
          const proj = allProjects.find(p => p.id === projId);
          if (resCost > 0) {
            const today = new Date().toISOString().split('T')[0];
            await api('/api/transactions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'Expense', source: 'project_funding',
                project_id: projId,
                amount: resCost, date: today,
                entity: proj ? proj.name : '',
                description: `Project funding — ${resItem}`
              })
            }).catch(e => console.warn('project_funding tx not saved:', e.message));
          }
          await loadProjectResources(projId);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Confirm →';
          alert(err.message);
        }
      });
    });
  }

  // ── Wire card interactions ────────────────────────────────────────────────
  function wireCards() {
    const panel = panelEl();
    if (!panel) return;

    panel.querySelectorAll('.pf-card-header').forEach(header => {
      header.addEventListener('click', () => {
        const pid = header.dataset.projId;
        expandedId = expandedId === pid ? null : pid;
        render();
        if (expandedId) loadProjectResources(expandedId);
      });
    });

    panel.querySelectorAll('.pf-send-sales').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const pid = btn.dataset.projId;
        const msgEl = panel.querySelector(`.pf-action-msg[data-proj-id="${pid}"]`);
        btn.disabled = true;
        try {
          await api(`/api/projects/${pid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_forecast_sent: true })
          });
          // Update local state
          const proj = allProjects.find(p => p.id === pid);
          if (proj) proj.sales_forecast_sent = true;
          render();
          if (expandedId) loadProjectResources(expandedId);
        } catch (err) {
          if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
          btn.disabled = false;
        }
      });
    });

    panel.querySelectorAll('.pf-view-project').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.location.hash = 'proj-assets';
      });
    });

    // Presale form wiring
    panel.querySelectorAll('.pf-add-presale-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const pid = btn.dataset.projId;
        const form = document.getElementById(`pf-presale-form-${pid}`);
        if (form) { form.style.display = 'block'; btn.style.display = 'none'; }
      });
    });

    panel.querySelectorAll('.pf-presale-cancel').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const pid = btn.dataset.projId;
        const form = document.getElementById(`pf-presale-form-${pid}`);
        const addBtn = panel.querySelector(`.pf-add-presale-btn[data-proj-id="${pid}"]`);
        if (form) form.style.display = 'none';
        if (addBtn) addBtn.style.display = '';
      });
    });

    panel.querySelectorAll('.pf-presale-save').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const pid       = btn.dataset.projId;
        const projName  = btn.dataset.projName || '';
        const formEl    = document.getElementById(`pf-presale-form-${pid}`);
        const msgEl     = formEl?.querySelector('.pf-presale-msg');
        const amount    = parseFloat(formEl?.querySelector('.pf-presale-amount')?.value);
        const date      = formEl?.querySelector('.pf-presale-date')?.value;
        const entity    = formEl?.querySelector('.pf-presale-entity')?.value?.trim() || undefined;
        const note      = formEl?.querySelector('.pf-presale-note')?.value?.trim() || undefined;

        if (!amount || isNaN(amount)) {
          if (msgEl) { msgEl.textContent = 'Amount is required'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
          return;
        }
        if (!date) {
          if (msgEl) { msgEl.textContent = 'Date is required'; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
          return;
        }

        btn.disabled = true; btn.textContent = 'Saving…';

        try {
          const txBody = {
            type: 'Income', source: 'presale',
            project_id: pid,
            amount, date, entity, note,
            description: 'Pre-sale — ' + projName
          };
          Object.keys(txBody).forEach(k => { if (txBody[k] === undefined) delete txBody[k]; });

          await api('/api/transactions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(txBody)
          });

          // Reload presales for this project
          const txRes = await api(`/api/transactions?source=presale&project_id=${pid}`).catch(() => ({ records: [] }));
          presaleByProject[pid] = (txRes.records || []).map(r => ({ id: r.id, ...r.fields }));

          // Re-render just the presale list
          const listEl = document.getElementById(`pf-presale-list-${pid}`);
          if (listEl) listEl.innerHTML = (presaleByProject[pid] || []).map(t => presaleCardHtml(t)).join('');

          // Hide form, show add button
          if (formEl) formEl.style.display = 'none';
          const addBtn = panel.querySelector(`.pf-add-presale-btn[data-proj-id="${pid}"]`);
          if (addBtn) addBtn.style.display = '';

          // Reset form
          if (formEl) {
            formEl.querySelector('.pf-presale-amount').value = '';
            formEl.querySelector('.pf-presale-entity').value = '';
            formEl.querySelector('.pf-presale-note').value   = '';
            formEl.querySelector('.pf-presale-date').value   = todayIso();
          }

          // Update card header presale total
          const proj = allProjects.find(p => p.id === pid);
          if (!proj) return;
          // Re-render full card header to update presale total
          render();
          if (expandedId) loadProjectResources(expandedId);

        } catch (err) {
          if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block'; }
        } finally {
          btn.disabled = false; btn.textContent = 'Save presale';
        }
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (initialized) return;
    initialized = true;
    const panel = panelEl();
    if (!panel) return;
    panel.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);font-size:0.85rem">Loading…</div>';
    try {
      await loadAll();
    } catch (err) {
      if (panel) panel.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:0.85rem">Failed to load: ${err.message}</div>`;
      return;
    }
    render();
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'projects') init(); });
  if (document.getElementById('panel-projects')?.classList.contains('active')) init();
})();
