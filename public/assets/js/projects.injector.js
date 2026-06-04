/* projects.injector.js — M3.4 Project Asset panel */
(function () {
  'use strict';

  /* ── Utils ───────────────────────────────────────────────────────────────── */
  const fmt  = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const el   = id => document.getElementById(id);
  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function toDateStr(d) { return d.toISOString().split('T')[0]; }
  function todayStr()   { return toDateStr(new Date()); }

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `API ${r.status}`); }
    return r.json();
  }

  /* ── Phase meta ──────────────────────────────────────────────────────────── */
  const PHASE_COLORS = { DS:'#3b82f6', PT:'#8b5cf6', PD:'#06b6d4', PV:'#f59e0b', LA:'#22c55e' };
  const PHASE_NAMES  = { DS:'Design', PT:'Prototyping', PD:'Process dev', PV:'Product develop', LA:'Launch' };

  /* ── Module state ────────────────────────────────────────────────────────── */
  let allProjects    = [];
  let currentView    = 'card';
  let currentFilter  = 'all';
  let selectedId     = null;
  let weekOffset     = 0;
  let showConn       = false;
  let initialized    = false;

  // Task focus state
  let _taskSectionCollapsed = {};
  let _taskFilter           = {};   // keyed by projectId
  let _resCollapsed         = false;
  let _currentTasks         = [];   // flat tasks array for last-rendered focus project
  let _currentPhaseCodeMap  = {};   // phaseId → phase_code for last-rendered focus project

  // Drawer state
  let drawerMode     = null;   // null | 'create' | 'edit' | 'redclear'
  let drawerProjId   = null;
  let drawerResources  = [];
  let drawerTasks      = [];
  let drawerResourcesExpanded = false;
  let drawerTasksExpanded     = false;
  let isSubmitting   = false;

  /* ── Panel root ──────────────────────────────────────────────────────────── */
  function panelEl()   { return el('panel-proj-assets'); }
  function contentEl() { return el('proj-content'); }

  /* ── Data load ───────────────────────────────────────────────────────────── */
  async function loadAll() {
    const res = await api('/api/projects');
    allProjects = res.records || [];
  }

  /* ── Stats ───────────────────────────────────────────────────────────────── */
  function computeStats() {
    const active    = allProjects.filter(p => p.type === 'Active');
    const pending   = allProjects.reduce((s, p) => s + (p.pending_tasks  || 0), 0);
    const total     = allProjects.reduce((s, p) => s + (p.total_tasks    || 0), 0);
    const delayed   = allProjects.reduce((s, p) => s + (p.delayed_tasks  || 0), 0);
    const launches  = active.map(p => p.days_to_launch).filter(d => d !== null && d !== undefined);
    const nearest   = launches.length ? Math.min(...launches) : null;
    return { activeCount: active.length, pending, total, delayed, nearest };
  }

  function renderStats() {
    const zone = el('proj-stats');
    if (!zone) return;
    const s = computeStats();
    const delayPct = s.total > 0 ? Math.round(s.delayed / s.total * 100) : 0;
    zone.innerHTML = `
      <div class="stat-chip"><span class="chip-label">active</span><span class="chip-value" style="color:var(--green)">${s.activeCount}</span></div>
      <div class="stat-chip"><span class="chip-label">tasks pending</span><span class="chip-value">${s.pending}/${s.total}</span></div>
      <div class="stat-chip" title="${s.delayed} delayed tasks">
        <span class="chip-label">delayed</span>
        <span class="chip-value" style="color:${s.delayed>0?'var(--red)':'var(--green)'}">${s.delayed}</span>
        <div style="height:3px;width:60px;background:var(--border);border-radius:2px;margin-top:2px;overflow:hidden">
          <div style="height:100%;width:${delayPct}%;background:#ef4444;border-radius:2px"></div>
        </div>
      </div>
      <div class="stat-chip">
        <span class="chip-label">nearest launch</span>
        <span class="chip-value" style="color:var(--yellow)">${s.nearest !== null ? s.nearest + 'd' : '—'}</span>
      </div>`;
  }

  /* ── Filter bar ──────────────────────────────────────────────────────────── */
  function renderFilterBar() {
    const zone = el('proj-filter-bar');
    if (!zone) return;
    zone.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <button id="proj-create-btn" style="font-size:0.78rem;padding:0.3rem 0.75rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700">+ Create project</button>
        <div class="range-toggle">
          ${['card','lane'].map(v=>`<button class="range-btn${currentView===v?' active':''}" data-projview="${v}" style="font-size:0.75rem">${v==='card'?'Card':'Lane'}</button>`).join('')}
        </div>
        <select id="proj-filter-sel" style="font-size:0.75rem;padding:0.25rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="all"   ${currentFilter==='all'   ?'selected':''}>All</option>
          <option value="Active"${currentFilter==='Active'?'selected':''}>Active</option>
          <option value="Draft" ${currentFilter==='Draft' ?'selected':''}>Draft</option>
          <option value="Pause" ${currentFilter==='Pause' ?'selected':''}>Pause</option>
        </select>
        ${currentView==='lane'?`<label style="font-size:0.72rem;color:var(--text-dim);display:flex;align-items:center;gap:0.3rem;cursor:pointer">
          <input type="checkbox" id="proj-show-conn" ${showConn?'checked':''} style="width:auto"> Connections</label>`:''}
      </div>`;

    document.getElementById('proj-create-btn')?.addEventListener('click', () => openDrawer('create', null));
    document.getElementById('proj-filter-sel')?.addEventListener('change', e => { currentFilter = e.target.value; renderZone(); });
    document.getElementById('proj-show-conn')?.addEventListener('change', e => { showConn = e.target.checked; renderZone(); });
    zone.querySelectorAll('[data-projview]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.projview;
        renderFilterBar();
        renderZone();
      });
    });
  }

  /* ── Zone router ─────────────────────────────────────────────────────────── */
  function renderZone() {
    if (selectedId !== null) { renderFocusView(selectedId); return; }
    if (currentView === 'lane') renderLaneView();
    else renderCardView();
  }

  /* ── Filtered projects ───────────────────────────────────────────────────── */
  function filtered() {
    return currentFilter === 'all' ? allProjects : allProjects.filter(p => p.type === currentFilter);
  }

  /* ── Heartbeat helper ────────────────────────────────────────────────────── */
  function heartbeat(p) {
    if (p.type !== 'Active') return null;
    const isRed = (p.delayed_tasks || 0) > 0;
    return isRed ? 'red' : 'green';
  }

  function heartbeatDot(p, small = false) {
    const hb = heartbeat(p);
    if (!hb) return '';
    const sz = small ? 8 : 10;
    const cls = hb === 'red' ? 'proj-hb-red' : 'proj-hb-green';
    return `<span class="${cls}" style="display:inline-block;width:${sz}px;height:${sz}px;border-radius:50%;cursor:pointer" title="${hb==='red'?`Delayed · ${p.delayed_tasks} task(s)`:p.pending_tasks>0?`On plan · ${p.pending_tasks} pending`:'No tasks'}"></span>`;
  }

  function phaseBadge(code) {
    const c = PHASE_COLORS[code] || '#6b7280';
    return `<span style="font-size:0.6rem;padding:0.07rem 0.4rem;border-radius:3px;background:${c}33;color:${c};border:1px solid ${c}55;font-weight:700">${esc(code||'—')}</span>`;
  }

  function typeBadge(type) {
    const map = { Active:'#22c55e', Draft:'#6b7280', Pause:'#f59e0b' };
    const c   = map[type] || '#6b7280';
    return `<span style="font-size:0.6rem;padding:0.07rem 0.4rem;border-radius:3px;background:${c}22;color:${c};border:1px solid ${c}44;font-weight:600">${esc(type||'—')}</span>`;
  }

  /* ── Card view ───────────────────────────────────────────────────────────── */
  function renderCardView() {
    const zone = contentEl();
    if (!zone) return;
    const projs = filtered();
    if (!projs.length) {
      zone.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:2rem 0;font-size:0.85rem">No projects yet — create one above</div>`;
      return;
    }

    zone.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.85rem;padding:0.25rem 0">
        ${projs.map(p => {
          const borderColor = p.type === 'Active' ? '#22c55e' : p.type === 'Pause' ? '#f59e0b' : 'var(--border)';
          const borderStyle = p.type === 'Draft' ? 'dashed' : 'solid';
          const borderWidth = p.type === 'Active' ? '1.5px' : '1px';
          const inv  = Number(p.investment_total || 0);
          const revMo= Number(p.target_revenue_monthly || 0);
          const sga  = Number(p.sga_pct || 10) / 100;
          const netMo= revMo * (1 - sga);
          const payback = netMo > 0 ? (inv / netMo / 12).toFixed(1) : null;

          return `<div class="proj-card" data-projid="${p.id}"
            style="border:${borderWidth} ${borderStyle} ${borderColor};border-radius:var(--radius);padding:0.85rem;
            background:var(--bg-card);cursor:pointer;transition:box-shadow 0.15s">
            <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem;flex-wrap:wrap">
              <span style="width:10px;height:10px;border-radius:50%;background:${borderColor};flex-shrink:0"></span>
              <strong style="font-size:0.88rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</strong>
              ${phaseBadge(p.current_phase)}
              ${heartbeatDot(p)}
            </div>
            <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem;flex-wrap:wrap">
              ${typeBadge(p.type)}
              ${p.customer_group ? `<span style="font-size:0.62rem;color:var(--text-dim)">${esc(p.customer_group)}</span>` : ''}
            </div>
            <!-- Phase milestone bar: 4 segments -->
            <div style="display:flex;gap:2px;margin-bottom:0.4rem" title="DS · PT · PD · PV">
              ${['DS','PT','PD','PV'].map(ph => {
                const c = PHASE_COLORS[ph];
                // milestone status stored in allProjects lazily — show filled if phase code <= current
                const phases = ['DS','PT','PD','PV','LA'];
                const cur    = phases.indexOf(p.current_phase);
                const idx    = phases.indexOf(ph);
                const done   = idx < cur;
                const active = idx === cur;
                return `<div style="flex:1;height:5px;border-radius:2px;background:${done?c:active?c+'88':'var(--border)'}"></div>`;
              }).join('')}
            </div>
            <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:0.5rem">
              ${p.total_tasks||0} tasks · ${p.delayed_tasks||0} delayed · ${fmt(p.investment_total)}
            </div>
            ${(revMo > 0 || payback) ? `<div style="font-size:0.7rem;color:var(--text-dim)">${fmt(revMo)}/mo · ${payback ? payback + ' yr payback' : '—'}</div>` : ''}
            <div style="display:flex;gap:0.4rem;margin-top:0.6rem;justify-content:flex-end" onclick="event.stopPropagation()">
              <button class="proj-edit-btn" data-projid="${p.id}" title="Edit"
                style="font-size:0.68rem;padding:0.18rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">✏ Edit</button>
              ${heartbeat(p) === 'red' ? `<button class="proj-hb-btn" data-projid="${p.id}"
                style="font-size:0.68rem;padding:0.18rem 0.45rem;border:1px solid #ef4444;border-radius:3px;background:rgba(239,68,68,0.1);color:#ef4444;cursor:pointer">⚡ Clear</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    // Wire card clicks
    zone.querySelectorAll('.proj-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        selectedId = card.dataset.projid;
        renderAll();
      });
      card.addEventListener('mouseenter', () => card.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)');
      card.addEventListener('mouseleave', () => card.style.boxShadow = '');
    });
    zone.querySelectorAll('.proj-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openDrawer('edit', btn.dataset.projid));
    });
    zone.querySelectorAll('.proj-hb-btn').forEach(btn => {
      btn.addEventListener('click', () => openRedClearance(btn.dataset.projid));
    });
  }

  /* ── Lane view ───────────────────────────────────────────────────────────── */

  function getWeekStart(offset = 0) {
    const now  = new Date();
    const day  = now.getDay(); // 0=Sun
    const mon  = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7)); // Monday
    mon.setDate(mon.getDate() - 14 + offset * 7); // -2 weeks from today + offset
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  function renderLaneView() {
    const zone = contentEl();
    if (!zone) return;
    const projs = filtered();

    const WEEKS     = 12;
    const COL_W     = 80; // px per week
    const LABEL_W   = 200;

    const baseStart = getWeekStart(weekOffset);
    // Build week headers
    const weekHeaders = [];
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(baseStart);
      d.setDate(d.getDate() + i * 7);
      const wn  = weekNumber(d);
      const lbl = `W${wn} ${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
      weekHeaders.push({ date: new Date(d), label: lbl });
    }
    const viewEnd = new Date(baseStart); viewEnd.setDate(viewEnd.getDate() + WEEKS * 7 - 1);

    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const todayOffset = Math.max(0, (today - baseStart) / (7 * 86400000)); // weeks from baseStart
    const todayPx = LABEL_W + todayOffset * COL_W;

    let html = `
      <div style="overflow-x:auto">
        <div style="min-width:${LABEL_W + WEEKS * COL_W + 40}px;position:relative">
          <!-- Nav -->
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
            <button id="proj-lane-prev" style="padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text);cursor:pointer">◀</button>
            <button id="proj-lane-next" style="padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text);cursor:pointer">▶</button>
            <span style="font-size:0.75rem;color:var(--text-dim)">${baseStart.toLocaleDateString('en',{month:'short',year:'numeric'})} – ${viewEnd.toLocaleDateString('en',{month:'short',year:'numeric'})}</span>
          </div>
          <!-- Week header -->
          <div style="display:flex;border-bottom:1px solid var(--border);padding-bottom:0.3rem;margin-bottom:0.25rem">
            <div style="width:${LABEL_W}px;flex-shrink:0"></div>
            ${weekHeaders.map((w,i) => `<div style="width:${COL_W}px;flex-shrink:0;font-size:0.62rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;padding:0 2px">${esc(w.label)}</div>`).join('')}
          </div>
          <!-- Today line -->
          ${todayOffset >= 0 && todayOffset <= WEEKS ? `<div style="position:absolute;top:40px;bottom:0;left:${todayPx}px;width:1.5px;background:rgba(239,68,68,0.5);z-index:2;pointer-events:none"></div>` : ''}
          <!-- SVG overlay for connection lines -->
          <svg id="proj-conn-svg" style="position:absolute;top:40px;left:0;width:100%;height:${Math.max(1, projs.length) * 72}px;pointer-events:none;z-index:1;${showConn?'':'display:none'}"></svg>
          <!-- Lanes -->
          <div id="proj-lanes">
            ${projs.length === 0 ? `<div style="text-align:center;color:var(--text-dim);padding:2rem;font-size:0.85rem">No projects — create one above</div>` :
              projs.map((p, laneIdx) => renderLane(p, laneIdx, baseStart, WEEKS, COL_W, LABEL_W)).join('')}
          </div>
        </div>
      </div>`;

    zone.innerHTML = html;

    document.getElementById('proj-lane-prev')?.addEventListener('click', () => { weekOffset -= 4; renderZone(); });
    document.getElementById('proj-lane-next')?.addEventListener('click', () => { weekOffset += 4; renderZone(); });

    zone.querySelectorAll('.proj-lane-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        selectedId = row.dataset.projid;
        renderAll();
      });
    });
    zone.querySelectorAll('.proj-hb-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openRedClearance(btn.dataset.projid); });
    });
  }

  function renderLane(p, laneIdx, baseStart, WEEKS, COL_W, LABEL_W) {
    const hb  = heartbeat(p);
    const clr = p.type === 'Active' ? '#22c55e' : p.type === 'Pause' ? '#f59e0b' : '#6b7280';

    // Determine task date range per phase code
    // For simplicity, render a single band across the entire lane
    // Future enhancement: per-phase bands when task data is loaded in lane

    return `
      <div class="proj-lane-row" data-projid="${p.id}"
        style="display:flex;align-items:center;border-bottom:1px solid var(--border);padding:0.35rem 0;cursor:pointer;transition:background 0.1s"
        onmouseover="this.style.background='rgba(59,130,246,0.04)'" onmouseout="this.style.background=''">
        <!-- Label -->
        <div style="width:${LABEL_W}px;flex-shrink:0;padding-right:0.5rem;overflow:hidden">
          <div style="display:flex;align-items:center;gap:0.35rem">
            <span style="width:8px;height:8px;border-radius:50%;background:${clr};flex-shrink:0"></span>
            <span style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.3rem;margin-top:0.15rem">
            ${phaseBadge(p.current_phase)}
            ${hb ? `<button class="${hb==='red'?'proj-hb-btn':''}" data-projid="${p.id}"
              style="width:8px;height:8px;border-radius:50%;border:none;cursor:pointer;padding:0;
              background:${hb==='red'?'#ef4444':'#22c55e'};animation:proj-pulse 1.5s infinite"
              title="${hb==='red'?`${p.delayed_tasks} delayed`:'On plan'}"></button>` : ''}
          </div>
          <div style="font-size:0.63rem;color:var(--text-dim);margin-top:0.1rem">${p.total_tasks||0} tasks · ${fmt(p.investment_total)}</div>
        </div>
        <!-- Timeline bar -->
        <div style="position:relative;display:flex;align-items:center;height:36px;flex:1">
          ${Array.from({length:WEEKS}).map((_,i)=>`<div style="width:${COL_W}px;height:100%;border-left:1px solid var(--border);opacity:0.3;flex-shrink:0"></div>`).join('')}
          <!-- Phase segments: 5 equal bands, current phase highlighted -->
          ${p.type !== 'Draft' ? (() => {
            const phaseOrder = ['DS','PT','PD','PV','LA'];
            const curIdx = phaseOrder.indexOf(p.current_phase);
            const segW = 100 / phaseOrder.length;
            return phaseOrder.map((ph, i) => {
              const clr = PHASE_COLORS[ph] || '#6b7280';
              const isCur  = i === curIdx;
              const isDone = i < curIdx;
              const bg = isDone ? clr + '44' : isCur ? clr + 'bb' : clr + '11';
              const left = (i * segW).toFixed(1);
              return `<div title="${ph}" style="position:absolute;left:${left}%;width:${segW.toFixed(1)}%;top:28%;height:44%;background:${bg};border-radius:2px;${isCur?'border:1px solid '+clr+'88':''}"></div>`;
            }).join('');
          })() : ''}
          <!-- Today dot -->
          ${(() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const todayOff = (today - baseStart) / (7 * 86400000);
            if (todayOff < 0 || todayOff > WEEKS) return '';
            const xPx = todayOff * COL_W;
            return `<div style="position:absolute;left:${xPx}px;top:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:50%;background:rgba(239,68,68,0.7);z-index:2"></div>`;
          })()}
          <!-- Days to launch marker -->
          ${p.days_to_launch !== null && p.days_to_launch !== undefined ? (() => {
            const launchDate = new Date(); launchDate.setDate(launchDate.getDate() + p.days_to_launch);
            const offsetWeeks = (launchDate - baseStart) / (7 * 86400000);
            if (offsetWeeks < 0 || offsetWeeks > WEEKS) return '';
            const xPx = offsetWeeks * COL_W;
            return `<div title="Launch in ${p.days_to_launch}d"
              style="position:absolute;left:${xPx}px;top:50%;transform:translate(-50%,-50%);
              width:10px;height:10px;background:#22c55e;clip-path:polygon(50% 0,100% 100%,0 100%);
              cursor:pointer"></div>`;
          })() : ''}
        </div>
      </div>`;
  }

  function weekNumber(d) {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }

  function computePhaseExits(tasks) {
    const exits = {};
    ['DS','PT','PD','PV','LA'].forEach(pc => {
      const phaseTasks = tasks.filter(t => (t.phase_code || 'DS') === pc && t.finish_by);
      if (!phaseTasks.length) return;
      const latest = phaseTasks.reduce((max, t) => t.finish_by > max ? t.finish_by : max, '');
      const d = new Date(latest + 'T00:00:00');
      d.setDate(d.getDate() + 3);
      exits[pc] = d.toISOString().split('T')[0];
    });
    return exits;
  }

  /* ── Task zone builder (called from renderFocusView + filter delegation) ── */

  function buildTaskZone(tasks, pid) {
    const phaseOrder = ['DS','PT','PD','PV','LA'];
    const activeFilter = _taskFilter[pid] || 'all';
    const byPhase = {};
    phaseOrder.forEach(pc => { byPhase[pc] = []; });
    tasks.forEach(t => {
      const phIdRef = Array.isArray(t.phase_id) ? t.phase_id[0] : (t.phase_id || null);
      const pc = t.phase_code || (phIdRef ? _currentPhaseCodeMap[phIdRef] : null) || 'DS';
      if (byPhase[pc]) byPhase[pc].push(t);
      else byPhase['DS'].push(t);
    });
    return phaseOrder.map(pc => {
      const ts = (activeFilter === 'all' || activeFilter === pc) ? byPhase[pc] : [];
      if (!ts.length) return '';
      const collapsed = _taskSectionCollapsed[pid + '_' + pc];
      const clr = PHASE_COLORS[pc];
      const doneCount = ts.filter(t => t.status === 'Done').length;
      return `<div style="margin-bottom:0.35rem">
        <div data-task-sec="${pid}_${pc}"
          style="display:flex;align-items:center;gap:0.4rem;padding:0.25rem 0.4rem;
          background:${clr}11;border-left:3px solid ${clr};border-radius:0 3px 3px 0;
          cursor:pointer;user-select:none;margin-bottom:0.15rem">
          <span class="sec-arrow" style="font-size:0.65rem;color:${clr}">${collapsed ? '▸' : '▾'}</span>
          <span style="font-size:0.72rem;font-weight:700;color:${clr}">${pc} — ${PHASE_NAMES[pc]}</span>
          <span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto">${doneCount}/${ts.length} done</span>
        </div>
        <div data-task-body="${pid}_${pc}" style="${collapsed ? 'display:none' : ''}">
          <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:0.75rem">
            <colgroup><col style="width:56px"><col><col style="width:80px"><col style="width:110px"></colgroup>
            <tbody>${ts.map(t => {
              const overdue = t.finish_by && t.finish_by < todayStr() && t.status !== 'Done';
              const statusClr = t.status==='Done'?'#22c55e':t.status==='Delayed'?'#ef4444':t.status==='In progress'?'#3b82f6':'var(--text-dim)';
              return `<tr style="border-bottom:1px solid var(--border);${overdue?'background:rgba(239,68,68,0.04)':''}">
                <td style="padding:0.2rem 0.35rem 0.2rem 0">${phaseBadge(pc)}</td>
                <td style="padding:0.2rem 0.35rem;min-width:0" title="${t.measure?esc(t.measure):''}">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.status==='Done'?'text-decoration:line-through;opacity:0.55':''}">${esc(t.title)}</div>
                  ${t.assigned_to && t.assigned_to !== 'Me' ? `<div style="font-size:0.65rem;color:var(--text-dim)">${esc(t.assigned_to)}</div>` : ''}
                </td>
                <td style="padding:0.2rem 0.35rem;white-space:nowrap;font-size:0.68rem;color:var(--text-dim);text-align:right">${fmtDate(t.finish_by)}</td>
                <td style="padding:0.2rem 0.35rem 0.2rem 0">
                  <select class="proj-status-sel" data-taskid="${t.id}" data-projid="${pid}"
                    style="width:100%;font-size:0.68rem;padding:0.15rem 0.3rem;background:var(--bg-page);border:1px solid ${statusClr}44;border-radius:3px;color:${statusClr}">
                    ${['Open','In progress','Done','Delayed'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
                  </select>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
    }).filter(Boolean).join('');
  }

  /* ── Focus view ──────────────────────────────────────────────────────────── */

  async function renderFocusView(projectId) {
    const zone = contentEl();
    if (!zone) return;
    zone.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem;padding:1rem">Loading…</div>`;

    try {
      const res     = await api('/api/projects/' + projectId);
      const p       = res.record;
      const phases  = res.phases       || [];
      const milestones = res.milestones || [];
      const tasks   = res.tasks        || [];
      const resources = res.resources  || [];

      const phaseOrder = ['DS','PT','PD','PV','LA'];

      // Store at module level for delegation handlers
      _currentTasks = tasks;
      _currentPhaseCodeMap = {};
      phases.forEach(ph => { if (ph.id && ph.phase_code) _currentPhaseCodeMap[ph.id] = ph.phase_code; });

      const phaseExits = computePhaseExits(tasks);

      const inv  = resources.reduce((s,r)=>s+Number(r.cost||0),0);
      const revMo= Number(p.target_revenue_monthly||0);
      const sga  = Number(p.sga_pct||10)/100;
      const netMo= revMo*(1-sga);
      const payback= netMo>0?(inv/netMo/12).toFixed(1):null;
      const hb   = heartbeat(p);

      zone.innerHTML = `
        <div style="padding:0 0.25rem">
          <!-- Breadcrumb -->
          <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.75rem">
            <span id="proj-back-btn" style="cursor:pointer;text-decoration:underline;color:var(--yellow)">Projects</span>
            <span> / ${esc(p.name)}</span>
          </div>
          <!-- Header -->
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
            <h2 style="font-size:1rem;font-weight:700;margin:0">${esc(p.name)}</h2>
            ${phaseBadge(p.current_phase)}
            ${typeBadge(p.type)}
            ${hb ? `<span style="width:10px;height:10px;border-radius:50%;background:${hb==='red'?'#ef4444':'#22c55e'};display:inline-block;animation:proj-pulse 1.5s infinite"></span>` : ''}
          </div>
          <!-- Phase pills -->
          <div style="display:flex;gap:0.35rem;margin-bottom:0.75rem;flex-wrap:wrap">
            ${phaseOrder.map(pc=>{
              const ph  = phases.find(p=>p.phase_code===pc);
              const cur = p.current_phase === pc;
              const done= ph?.status === 'Complete';
              const clr = PHASE_COLORS[pc];
              return `<div style="padding:0.2rem 0.65rem;border-radius:20px;font-size:0.72rem;font-weight:600;
                border:1.5px solid ${clr};background:${done?clr:cur?clr+'33':'transparent'};color:${done||cur?'#fff':clr}">
                ${pc} — ${PHASE_NAMES[pc]}${done?' ✓':''}${phaseExits[pc] ? `<span style="font-size:0.62rem;opacity:0.8;font-weight:400"> · ${fmtDate(phaseExits[pc])}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
          <!-- Milestones -->
          ${milestones.length ? `
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
            ${milestones.map(ms=>{
              const clr = ms.status==='Reached'?'#22c55e':ms.status==='Blocked'?'#ef4444':'var(--text-dim)';
              return `<div style="font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid ${clr}55;border-radius:3px;color:${clr}">
                ${esc(ms.name)} · ${ms.auto_date||ms.status==='Pending'?fmtDate(ms.auto_date):ms.status}
              </div>`;
            }).join('')}
          </div>` : ''}
          <!-- Tasks by phase -->
          <div style="margin-bottom:0.75rem">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;flex-wrap:wrap;gap:0.3rem">
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em">TASKS</div>
              <div style="display:flex;gap:0.25rem;flex-wrap:wrap">
                ${['all',...phaseOrder].map(f=>{
                  const active = (_taskFilter[projectId]||'all') === f;
                  return `<button data-task-filter="${f}" data-projid="${projectId}"
                    style="font-size:0.62rem;padding:0.12rem 0.4rem;border-radius:3px;cursor:pointer;
                    border:1px solid ${f==='all'?'var(--border)':PHASE_COLORS[f]||'var(--border)'};
                    background:${active?(f==='all'?'var(--border)':PHASE_COLORS[f]||'var(--border)'):'transparent'};
                    color:${active?'#fff':(f==='all'?'var(--text-dim)':PHASE_COLORS[f]||'var(--text-dim)')}">
                    ${f==='all'?'All':f}</button>`;
                }).join('')}
              </div>
            </div>
            <div data-task-zone data-projid="${projectId}">${buildTaskZone(tasks, projectId)}</div>
            <button id="proj-add-task-btn" data-projid="${projectId}"
              style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer;margin-top:0.35rem">+ Add task</button>
          </div>
          <!-- Resources -->
          <div style="margin-bottom:0.75rem">
            <div data-res-sec style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;user-select:none;margin-bottom:0.4rem">
              <span class="sec-arrow" style="font-size:0.65rem;color:var(--text-dim)">${_resCollapsed ? '▸' : '▾'}</span>
              <span style="font-size:0.75rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em">RESOURCES</span>
              ${resources.length ? `<span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto">${resources.length} items · ${fmt(inv)}</span>` : ''}
            </div>
            <div data-res-body style="${_resCollapsed ? 'display:none' : ''}">
              ${resources.length ? `
              <table style="width:100%;border-collapse:collapse;font-size:0.75rem">
                <thead><tr style="border-bottom:1px solid var(--border)">
                  <th style="text-align:left;padding:0.2rem">Item</th>
                  <th style="text-align:left;padding:0.2rem">Time</th>
                  <th style="text-align:right;padding:0.2rem">Cost</th>
                  <th style="text-align:left;padding:0.2rem">Status</th>
                </tr></thead>
                <tbody>${resources.map(r=>`<tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:0.2rem">${esc(r.item)}</td>
                  <td style="padding:0.2rem;color:var(--text-dim)">${esc(r.time_needed||'—')}</td>
                  <td style="padding:0.2rem;text-align:right">${fmt(r.cost)}</td>
                  <td style="padding:0.2rem;color:var(--text-dim)">${esc(r.status||'—')}</td>
                </tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="2" style="padding:0.3rem;font-weight:700">Total</td>
                  <td style="text-align:right;padding:0.3rem;font-weight:700">${fmt(inv)}</td><td></td></tr></tfoot>
              </table>` : `<div style="font-size:0.75rem;color:var(--text-dim)">No resources added yet.</div>`}
            </div>
          </div>
          <!-- P&L summary -->
          <div style="margin-bottom:0.75rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-bottom:0.4rem;letter-spacing:0.04em">P&L SUMMARY</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 1rem;font-size:0.78rem">
              <div>Investment total <strong>${fmt(inv)}</strong></div>
              <div>Monthly revenue <strong>${fmt(revMo)}</strong></div>
              <div>SG&A (${p.sga_pct||10}%) <strong>-${fmt(revMo*sga)}</strong></div>
              <div>Net monthly <strong style="color:#22c55e">${fmt(netMo)}</strong></div>
              ${payback ? `<div>Payback <strong>${payback} yr</strong></div>` : ''}
            </div>
            ${p.sales_forecast_sent ? `<div style="margin-top:0.5rem;font-size:0.72rem;color:#14b8a6;font-weight:700">✓ LIVE IN M2.2 SALES · ${fmt(revMo)}/mo forecast active</div>` : ''}
          </div>
          <!-- Action buttons -->
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button id="proj-focus-edit" data-projid="${p.id}"
              style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">Edit</button>
            ${!p.finance_opened ? `<button id="proj-focus-finance" data-projid="${p.id}"
              style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid #22c55e;border-radius:var(--radius);background:transparent;color:#22c55e;cursor:pointer">Open Finance</button>` : ''}
            ${p.sales_forecast_sent
              ? `<button disabled style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid #14b8a6;border-radius:var(--radius);background:rgba(20,184,166,0.1);color:#14b8a6;cursor:default;opacity:0.7">✓ In Sales</button>`
              : (p.type === 'Active' && revMo > 0
                ? `<button id="proj-focus-sales" data-projid="${p.id}"
                    style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid #14b8a6;border-radius:var(--radius);background:transparent;color:#14b8a6;cursor:pointer">→ Send to Sales</button>`
                : (p.type === 'Active' ? `<button disabled title="Set target_revenue_monthly first" style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-dim);cursor:not-allowed;opacity:0.5">→ Send to Sales</button>` : '')
              )}
            ${hb === 'red' ? `<button id="proj-focus-clear" data-projid="${p.id}"
              style="font-size:0.78rem;padding:0.3rem 0.75rem;border:1px solid #ef4444;border-radius:var(--radius);background:rgba(239,68,68,0.1);color:#ef4444;cursor:pointer">⚡ Clear red</button>` : ''}
          </div>
          <div id="proj-focus-msg" style="display:none;font-size:0.78rem;margin-top:0.5rem"></div>
        </div>`;

      document.getElementById('proj-back-btn')?.addEventListener('click', () => { selectedId = null; renderAll(); });
      document.getElementById('proj-focus-edit')?.addEventListener('click', () => openDrawer('edit', projectId));
      document.getElementById('proj-focus-finance')?.addEventListener('click', async () => {
        try {
          await api('/api/projects/' + projectId, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finance_opened: true })
          });
          await loadAll();
        } catch (_) {}
        window.location.hash = 'projects';
      });
      document.getElementById('proj-focus-sales')?.addEventListener('click', () => sendToSales(projectId));
      document.getElementById('proj-focus-clear')?.addEventListener('click', () => openRedClearance(projectId));
      document.getElementById('proj-add-task-btn')?.addEventListener('click', () => openDrawer('addtask', projectId));

      // ONE delegated listener per zone lifetime — survives innerHTML re-renders
      if (!zone._focusBound) {
        zone._focusBound = true;
        zone.addEventListener('click', e => {
          // Task section collapse
          const taskSec = e.target.closest('[data-task-sec]');
          if (taskSec) {
            const key = taskSec.dataset.taskSec;
            _taskSectionCollapsed[key] = !_taskSectionCollapsed[key];
            const body  = zone.querySelector(`[data-task-body="${key}"]`);
            const arrow = taskSec.querySelector('.sec-arrow');
            if (body)  body.style.display  = _taskSectionCollapsed[key] ? 'none' : '';
            if (arrow) arrow.textContent   = _taskSectionCollapsed[key] ? '▸' : '▾';
            return;
          }
          // Resource section collapse
          const resSec = e.target.closest('[data-res-sec]');
          if (resSec) {
            _resCollapsed = !_resCollapsed;
            const body  = zone.querySelector('[data-res-body]');
            const arrow = resSec.querySelector('.sec-arrow');
            if (body)  body.style.display  = _resCollapsed ? 'none' : '';
            if (arrow) arrow.textContent   = _resCollapsed ? '▸' : '▾';
            return;
          }
          // Task phase filter
          const filterBtn = e.target.closest('[data-task-filter]');
          if (filterBtn) {
            const pid = filterBtn.dataset.projid;
            _taskFilter[pid] = filterBtn.dataset.taskFilter;
            zone.querySelectorAll('[data-task-filter]').forEach(b => {
              const active = b.dataset.taskFilter === _taskFilter[pid];
              b.style.background = active
                ? (b.dataset.taskFilter === 'all' ? 'var(--border)' : PHASE_COLORS[b.dataset.taskFilter] || 'var(--border)')
                : 'transparent';
              b.style.color = active ? '#fff'
                : (b.dataset.taskFilter === 'all' ? 'var(--text-dim)' : PHASE_COLORS[b.dataset.taskFilter] || 'var(--text-dim)');
            });
            const taskZone = zone.querySelector('[data-task-zone]');
            if (taskZone) taskZone.innerHTML = buildTaskZone(_currentTasks, pid);
            return;
          }
        });
        zone.addEventListener('change', e => {
          const sel = e.target.closest('.proj-status-sel');
          if (!sel) return;
          const taskId = sel.dataset.taskid;
          const pid    = sel.dataset.projid;
          (async () => {
            try {
              await api(`/api/project-tasks/${taskId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: sel.value })
              });
              await loadAll();
              renderFocusView(pid);
            } catch (err) {
              const msg = el('proj-focus-msg');
              if (msg) { msg.textContent = err.message; msg.style.color = '#ef4444'; msg.style.display = 'block'; }
            }
          })();
        });
      }

    } catch (err) {
      zone.innerHTML = `<div style="color:#ef4444;font-size:0.85rem">${err.message}</div>`;
    }
  }

  /* ── Drawer ──────────────────────────────────────────────────────────────── */

  function openDrawer(mode, projectId) {
    drawerMode   = mode;
    drawerProjId = projectId;
    if (mode === 'create') {
      drawerResources = [];
      drawerTasks     = [];
      drawerResourcesExpanded = false;
      drawerTasksExpanded     = false;
    }
    renderDrawer();
  }

  function closeDrawer() {
    const d = el('proj-drawer');
    const b = el('proj-drawer-backdrop');
    if (d) d.style.transform = 'translateX(100%)';
    if (b) b.style.display   = 'none';
    setTimeout(() => {
      drawerMode = null;
      if (d) d.remove();
      if (b) b.remove();
    }, 280);
  }

  async function renderDrawer() {
    // Remove existing
    el('proj-drawer')?.remove();
    el('proj-drawer-backdrop')?.remove();

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'proj-drawer-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:400';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    // Drawer
    const drawer = document.createElement('div');
    drawer.id = 'proj-drawer';
    drawer.style.cssText = 'position:fixed;top:0;right:0;width:min(560px,100vw);height:100vh;background:var(--bg-raised);z-index:401;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,0.2);transform:translateX(100%);transition:transform 0.28s ease';

    let prefill = {};
    if ((drawerMode === 'edit' || drawerMode === 'addtask') && drawerProjId) {
      try {
        const res = await api('/api/projects/' + drawerProjId);
        prefill = res.record || {};
        if (drawerMode === 'edit') {
          drawerResources = (res.resources || []).map(r => ({ id: r.id, item: r.item, time_needed: r.time_needed||'', cost: r.cost||0, status: r.status||'Planned' }));
          drawerTasks     = (res.tasks     || []).map(t => ({ id: t.id, title: t.title, finish_by: t.finish_by||'', assigned_to: t.assigned_to||'Me', measure: t.measure||'', phase_code: t.phase_code||'DS' }));
        }
      } catch {}
    }

    const isEdit     = drawerMode === 'edit';
    const isAddTask  = drawerMode === 'addtask';
    const titleText  = isEdit ? 'Edit project' : isAddTask ? 'Add task' : 'Create project';

    if (isAddTask) {
      drawer.innerHTML = buildAddTaskDrawer(prefill);
    } else {
      drawer.innerHTML = buildProjectDrawer(prefill, isEdit, titleText);
    }

    document.body.appendChild(drawer);
    requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });

    // Wire close btn
    drawer.querySelector('#proj-drawer-close')?.addEventListener('click', closeDrawer);

    if (isAddTask) {
      wireAddTaskDrawer(drawer, drawerProjId);
      return;
    }

    wireProjectDrawer(drawer, isEdit);
  }

  function buildProjectDrawer(pre, isEdit, titleText) {
    return `
      <div style="padding:1rem 1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="margin:0;font-size:0.95rem;font-weight:700">${titleText}</h3>
          <button id="proj-drawer-close" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1.1rem">✕</button>
        </div>

        <!-- Section 1: Concept -->
        <div style="margin-bottom:0.75rem">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em;margin-bottom:0.5rem">CONCEPT</div>
          <div style="display:grid;gap:0.5rem">
            <div>
              <label style="font-size:0.72rem;color:var(--text-dim)">Project name *</label>
              <input id="pd-name" type="text" value="${esc(pre.name||'')}" placeholder="Project name"
                style="width:100%;font-size:0.85rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:0.72rem;color:var(--text-dim)">Core idea — what is this?</label>
              <textarea id="pd-idea" rows="2" placeholder="Core concept…"
                style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;box-sizing:border-box">${esc(pre.idea||'')}</textarea>
            </div>
            <div>
              <label style="font-size:0.72rem;color:var(--text-dim)">Target customer group</label>
              <input id="pd-customer" type="text" value="${esc(pre.customer_group||'')}" placeholder="Who is this for?"
                style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:0.72rem;color:var(--text-dim)">Problem this solves</label>
              <textarea id="pd-problem" rows="2" placeholder="What problem does this solve?"
                style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;box-sizing:border-box">${esc(pre.problem_solved||'')}</textarea>
            </div>
            <div>
              <label style="font-size:0.72rem;color:var(--text-dim)">Competitor URL (optional)</label>
              <input id="pd-competitor" type="url" value="${esc(pre.competitor_url||'')}" placeholder="https://…"
                style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
              <div>
                <label style="font-size:0.72rem;color:var(--text-dim)">Revenue/mo (฿)</label>
                <input id="pd-revenue" type="number" value="${pre.target_revenue_monthly||''}" placeholder="0"
                  style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
              </div>
              <div>
                <label style="font-size:0.72rem;color:var(--text-dim)">SG&A % (default 10)</label>
                <input id="pd-sga" type="number" value="${pre.sga_pct||10}" min="0" max="100"
                  style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2: Resources (collapsible) -->
        <div style="margin-bottom:0.75rem;border:1px solid var(--border);border-radius:var(--radius)">
          <div id="pd-res-toggle" style="padding:0.5rem 0.75rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none">
            <span style="font-size:0.78rem;font-weight:600" id="pd-res-summary">Resources</span>
            <span id="pd-res-chevron" style="font-size:0.75rem;color:var(--text-dim);transition:transform 0.2s">${drawerResourcesExpanded?'▲':'▼'}</span>
          </div>
          <div id="pd-res-body" style="${drawerResourcesExpanded?'':'display:none'};padding:0 0.75rem 0.75rem">
            <div id="pd-res-rows">
              ${drawerResources.map((r,i) => resourceRowHtml(r, i)).join('')}
            </div>
            <button id="pd-res-add" style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer;margin-top:0.35rem">+ Add resource</button>
          </div>
        </div>

        <!-- Section 3: Tasks (collapsible) -->
        <div style="margin-bottom:0.75rem;border:1px solid var(--border);border-radius:var(--radius)">
          <div id="pd-task-toggle" style="padding:0.5rem 0.75rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none">
            <span style="font-size:0.78rem;font-weight:600" id="pd-task-summary">Key tasks</span>
            <span id="pd-task-chevron" style="font-size:0.75rem;color:var(--text-dim);transition:transform 0.2s">${drawerTasksExpanded?'▲':'▼'}</span>
          </div>
          <div id="pd-task-body" style="${drawerTasksExpanded?'':'display:none'};padding:0 0.75rem 0.75rem">
            <div id="pd-task-rows">
              ${drawerTasks.map((t,i) => taskRowHtml(t, i)).join('')}
            </div>
            <button id="pd-task-add" style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer;margin-top:0.35rem">+ Add task</button>
          </div>
        </div>

        <!-- Buttons -->
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem">
          <button id="pd-save-draft" style="flex:1;min-width:0;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer;font-size:0.82rem">
            ${isEdit?'Save changes':'Save draft'}
          </button>
          <button id="pd-push" style="flex:1;min-width:0;padding:0.45rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-size:0.82rem;font-weight:700">
            ${isEdit?'Update + Active':'⚡ Push Active'}
          </button>
        </div>
        <div id="pd-ai-section" style="margin-top:0.5rem">
          <button id="pd-ai-toggle" style="font-size:0.72rem;padding:0.2rem 0.6rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">🤖 AI inquiry ▾</button>
          <div id="pd-ai-menu" style="display:none;margin-top:0.3rem;display:flex;gap:0.35rem;flex-wrap:wrap">
            <button class="pd-ai-btn" data-type="feasibility" style="font-size:0.68rem;padding:0.18rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">Feasibility</button>
            <button class="pd-ai-btn" data-type="tasks" style="font-size:0.68rem;padding:0.18rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">Generate tasks</button>
            <button class="pd-ai-btn" data-type="extend" style="font-size:0.68rem;padding:0.18rem 0.45rem;border:1px solid var(--border);border-radius:3px;background:transparent;color:var(--text-dim);cursor:pointer">Extend idea</button>
          </div>
          <div id="pd-ai-result" style="display:none;margin-top:0.5rem;font-size:0.78rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:0.5rem;max-height:200px;overflow-y:auto"></div>
        </div>
        <div id="pd-msg" style="display:none;font-size:0.78rem;margin-top:0.5rem"></div>
      </div>`;
  }

  function resourceRowHtml(r, i) {
    return `<div class="pd-res-row" data-idx="${i}" style="display:grid;grid-template-columns:1fr 0.6fr 0.6fr 0.6fr auto;gap:0.3rem;align-items:center;margin-top:0.35rem">
      <input class="pd-res-item" data-idx="${i}" type="text" value="${esc(r.item||'')}" placeholder="Item"
        style="font-size:0.72rem;padding:0.2rem 0.35rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
      <input class="pd-res-time" data-idx="${i}" type="text" value="${esc(r.time_needed||'')}" placeholder="Time"
        style="font-size:0.72rem;padding:0.2rem 0.35rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
      <input class="pd-res-cost" data-idx="${i}" type="number" value="${r.cost||''}" placeholder="฿"
        style="font-size:0.72rem;padding:0.2rem 0.35rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text);text-align:right">
      <select class="pd-res-status" data-idx="${i}" style="font-size:0.68rem;padding:0.2rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
        <option value="Planned" ${(r.status||'Planned')==='Planned'?'selected':''}>Planned</option>
        <option value="Purchased" ${r.status==='Purchased'?'selected':''}>Purchased</option>
        <option value="In use" ${r.status==='In use'?'selected':''}>In use</option>
      </select>
      <button class="pd-res-del" data-idx="${i}" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.8rem">−</button>
    </div>`;
  }

  function taskRowHtml(t, i) {
    return `<div class="pd-task-row" data-idx="${i}" style="border:1px solid var(--border);border-radius:3px;padding:0.4rem;margin-top:0.35rem">
      <div style="display:grid;grid-template-columns:1fr 0.5fr 0.5fr 0.5fr 0.4fr auto;gap:0.25rem;align-items:center">
        <input class="pd-task-title" data-idx="${i}" type="text" value="${esc(t.title||'')}" placeholder="Task title"
          style="font-size:0.72rem;padding:0.2rem 0.35rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
        <input class="pd-task-date" data-idx="${i}" type="date" value="${esc(t.finish_by||'')}"
          style="font-size:0.68rem;padding:0.2rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
        <input class="pd-task-who" data-idx="${i}" type="text" value="${esc(t.assigned_to||'Me')}" placeholder="Who"
          style="font-size:0.68rem;padding:0.2rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
        <input class="pd-task-measure" data-idx="${i}" type="text" value="${esc(t.measure||'')}" placeholder="Measure"
          style="font-size:0.68rem;padding:0.2rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
        <select class="pd-task-phase" data-idx="${i}" style="font-size:0.65rem;padding:0.2rem;background:var(--bg-page);border:1px solid var(--border);border-radius:3px;color:var(--text)">
          ${['DS','PT','PD','PV','LA'].map(pc=>`<option value="${pc}" ${(t.phase_code||'DS')===pc?'selected':''}>${pc}</option>`).join('')}
        </select>
        <button class="pd-task-del" data-idx="${i}" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.8rem">−</button>
      </div>
    </div>`;
  }

  function buildAddTaskDrawer(pre) {
    return `<div style="padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0;font-size:0.95rem;font-weight:700">Add task — ${esc(pre.name||'')}</h3>
        <button id="proj-drawer-close" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1.1rem">✕</button>
      </div>
      <div style="display:grid;gap:0.5rem">
        <div><label style="font-size:0.72rem;color:var(--text-dim)">Task title *</label>
          <input id="at-title" type="text" placeholder="Task title"
            style="width:100%;font-size:0.85rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
          <div><label style="font-size:0.72rem;color:var(--text-dim)">Finish by</label>
            <input id="at-date" type="date" style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box"></div>
          <div><label style="font-size:0.72rem;color:var(--text-dim)">Phase</label>
            <select id="at-phase" style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
              ${['DS','PT','PD','PV','LA'].map(pc=>`<option value="${pc}">${pc} — ${PHASE_NAMES[pc]}</option>`).join('')}
            </select></div>
        </div>
        <div><label style="font-size:0.72rem;color:var(--text-dim)">Assigned to</label>
          <input id="at-who" type="text" value="Me" style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box"></div>
        <div><label style="font-size:0.72rem;color:var(--text-dim)">Measure of success</label>
          <input id="at-measure" type="text" placeholder="How do you know it's done?"
            style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box"></div>
        <div><label style="font-size:0.72rem;color:var(--text-dim)">Priority</label>
          <select id="at-priority" style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Low">Low</option>
          </select></div>
      </div>
      <button id="at-save" style="width:100%;margin-top:0.75rem;padding:0.45rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700;font-size:0.85rem">Save task</button>
      <div id="at-msg" style="display:none;font-size:0.78rem;margin-top:0.4rem"></div>
    </div>`;
  }

  function wireAddTaskDrawer(drawer, projectId) {
    drawer.querySelector('#at-save')?.addEventListener('click', async () => {
      const title = el('at-title')?.value?.trim();
      if (!title) { showMsg('at-msg', 'Title required', false); return; }
      const body = {
        project_id:  projectId,
        title,
        phase_code:  el('at-phase')?.value,
        finish_by:   el('at-date')?.value || undefined,
        assigned_to: el('at-who')?.value || 'Me',
        measure:     el('at-measure')?.value || undefined,
        priority:    el('at-priority')?.value
      };
      try {
        await api('/api/project-tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        await loadAll();
        closeDrawer();
        renderFocusView(projectId);
      } catch (err) {
        showMsg('at-msg', err.message, false);
      }
    });
  }

  function wireProjectDrawer(drawer, isEdit) {
    // Resources section toggle
    const resToggle = drawer.querySelector('#pd-res-toggle');
    const resBody   = drawer.querySelector('#pd-res-body');
    const resChev   = drawer.querySelector('#pd-res-chevron');
    resToggle?.addEventListener('click', () => {
      drawerResourcesExpanded = !drawerResourcesExpanded;
      resBody.style.display = drawerResourcesExpanded ? '' : 'none';
      resChev.textContent   = drawerResourcesExpanded ? '▲' : '▼';
      syncDrawerResourceSummary(drawer);
    });

    // Tasks section toggle
    const taskToggle = drawer.querySelector('#pd-task-toggle');
    const taskBody   = drawer.querySelector('#pd-task-body');
    const taskChev   = drawer.querySelector('#pd-task-chevron');
    taskToggle?.addEventListener('click', () => {
      drawerTasksExpanded = !drawerTasksExpanded;
      taskBody.style.display = drawerTasksExpanded ? '' : 'none';
      taskChev.textContent   = drawerTasksExpanded ? '▲' : '▼';
      syncDrawerTaskSummary(drawer);
    });

    // Add resource row — harvest current DOM values first to preserve existing rows
    drawer.querySelector('#pd-res-add')?.addEventListener('click', () => {
      readDrawerData(drawer);
      drawerResources.push({ item:'', time_needed:'', cost:0, status:'Planned' });
      const cont = drawer.querySelector('#pd-res-rows');
      cont.innerHTML = drawerResources.map((r, j) => resourceRowHtml(r, j)).join('');
      wireResourceRows(drawer);
      syncDrawerResourceSummary(drawer);
    });

    // Add task row — harvest current DOM values first to preserve existing rows
    drawer.querySelector('#pd-task-add')?.addEventListener('click', () => {
      readDrawerData(drawer);
      drawerTasks.push({ title:'', finish_by:'', assigned_to:'Me', measure:'', phase_code:'DS' });
      const cont = drawer.querySelector('#pd-task-rows');
      cont.innerHTML = drawerTasks.map((t, j) => taskRowHtml(t, j)).join('');
      wireTaskRows(drawer);
      syncDrawerTaskSummary(drawer);
    });

    wireResourceRows(drawer);
    wireTaskRows(drawer);
    syncDrawerResourceSummary(drawer);
    syncDrawerTaskSummary(drawer);

    // Save draft
    drawer.querySelector('#pd-save-draft')?.addEventListener('click', () => {
      readDrawerData(drawer);
      saveProject('Draft', isEdit, false);
    });

    // Push
    drawer.querySelector('#pd-push')?.addEventListener('click', () => {
      readDrawerData(drawer);
      saveProject('Active', isEdit, true);
    });

    // AI inquiry
    const aiToggle = drawer.querySelector('#pd-ai-toggle');
    const aiMenu   = drawer.querySelector('#pd-ai-menu');
    aiToggle?.addEventListener('click', () => {
      const visible = aiMenu.style.display !== 'none' && aiMenu.style.display !== '';
      aiMenu.style.display = visible ? 'none' : 'flex';
    });
    drawer.querySelectorAll('.pd-ai-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        readDrawerData(drawer);
        runAiInquiry(btn.dataset.type, drawer);
      });
    });
  }

  let drawerData = {};
  function readDrawerData(drawer) {
    drawerData = {
      name:                   drawer.querySelector('#pd-name')?.value?.trim() || '',
      idea:                   drawer.querySelector('#pd-idea')?.value?.trim() || '',
      customer_group:         drawer.querySelector('#pd-customer')?.value?.trim() || '',
      problem_solved:         drawer.querySelector('#pd-problem')?.value?.trim() || '',
      competitor_url:         drawer.querySelector('#pd-competitor')?.value?.trim() || '',
      target_revenue_monthly: Number(drawer.querySelector('#pd-revenue')?.value || 0) || undefined,
      sga_pct:                Number(drawer.querySelector('#pd-sga')?.value     || 10)
    };
    // Sync resource state
    drawerResources = drawerResources.map((r, i) => ({
      ...r,
      item:        drawer.querySelector(`.pd-res-item[data-idx="${i}"]`)?.value?.trim() || r.item,
      time_needed: drawer.querySelector(`.pd-res-time[data-idx="${i}"]`)?.value?.trim() || r.time_needed,
      cost:        Number(drawer.querySelector(`.pd-res-cost[data-idx="${i}"]`)?.value || r.cost),
      status:      drawer.querySelector(`.pd-res-status[data-idx="${i}"]`)?.value || r.status
    }));
    drawerTasks = drawerTasks.map((t, i) => ({
      ...t,
      title:       drawer.querySelector(`.pd-task-title[data-idx="${i}"]`)?.value?.trim() || t.title,
      finish_by:   drawer.querySelector(`.pd-task-date[data-idx="${i}"]`)?.value || t.finish_by,
      assigned_to: drawer.querySelector(`.pd-task-who[data-idx="${i}"]`)?.value || t.assigned_to,
      measure:     drawer.querySelector(`.pd-task-measure[data-idx="${i}"]`)?.value || t.measure,
      phase_code:  drawer.querySelector(`.pd-task-phase[data-idx="${i}"]`)?.value || t.phase_code
    }));
  }

  async function saveProject(type, isEdit, push) {
    if (isSubmitting) return;
    const body = {
      ...drawerData,
      type,
      resources: drawerResources.filter(r => r.item),
      tasks:     drawerTasks.filter(t => t.title).map(t => ({ ...t, assigned_to: t.assigned_to || 'Me' }))
    };
    if (!body.name) { showMsg('pd-msg', 'Project name is required', false); return; }

    isSubmitting = true;
    const saveDraftBtn = el('pd-save-draft');
    const pushBtn      = el('pd-push');
    const activeBtn    = push ? pushBtn : saveDraftBtn;
    const origText     = activeBtn?.textContent || '';
    if (saveDraftBtn) { saveDraftBtn.disabled = true; }
    if (pushBtn)      { pushBtn.disabled      = true; }
    if (activeBtn)    { activeBtn.textContent  = 'Saving…'; }

    try {
      let res;
      if (isEdit && drawerProjId) {
        res = await api('/api/projects/' + drawerProjId, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
      } else {
        const r = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', body: JSON.stringify(body)
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 409) {
          showMsg('pd-msg', j.error || 'A project with this name already exists', false);
          return;
        }
        if (!r.ok) throw new Error(j.error || `API ${r.status}`);
        res = j;
      }
      await loadAll();
      closeDrawer();
      renderAll();

      if (push && res.record) {
        const projId = res.record.id;
        const doOpen = window.confirm('Open M2.4 Finance for this project?');
        if (doOpen) window.location.hash = 'projects';
      }
    } catch (err) {
      showMsg('pd-msg', err.message, false);
      if (saveDraftBtn) { saveDraftBtn.disabled = false; }
      if (pushBtn)      { pushBtn.disabled      = false; }
      if (activeBtn)    { activeBtn.textContent  = origText; }
    } finally {
      isSubmitting = false;
    }
  }

  async function sendToSales(projectId) {
    const msg = document.getElementById('proj-focus-msg');
    if (!confirm('Send this project\'s monthly revenue forecast to M2.2 Sales?\nThe project will appear as a revenue lane until it matures into an active business.')) return;
    try {
      const res = await api('/api/projects/' + projectId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales_forecast_sent: true })
      });
      await loadAll();
      renderFocusView(projectId);
      if (msg) { msg.textContent = '✓ Now live in M2.2 Sales'; msg.style.color = '#14b8a6'; msg.style.display = 'block'; }
    } catch (err) {
      if (msg) { msg.textContent = err.message; msg.style.color = '#ef4444'; msg.style.display = 'block'; }
    }
  }

  async function pushProject(projectId) {
    try {
      await api('/api/projects/' + projectId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'Active' })
      });
      await loadAll();
      renderAll();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }

  function wireResourceRows(drawer) {
    drawer.querySelectorAll('.pd-res-del').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.idx);
        drawerResources.splice(i, 1);
        const cont = drawer.querySelector('#pd-res-rows');
        cont.innerHTML = drawerResources.map((r, j) => resourceRowHtml(r, j)).join('');
        wireResourceRows(drawer);
        syncDrawerResourceSummary(drawer);
      };
    });
    drawer.querySelectorAll('.pd-res-cost').forEach(inp => {
      inp.addEventListener('input', () => syncDrawerResourceSummary(drawer));
    });
  }

  function wireTaskRows(drawer) {
    drawer.querySelectorAll('.pd-task-del').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.idx);
        drawerTasks.splice(i, 1);
        const cont = drawer.querySelector('#pd-task-rows');
        cont.innerHTML = drawerTasks.map((t, j) => taskRowHtml(t, j)).join('');
        wireTaskRows(drawer);
        syncDrawerTaskSummary(drawer);
      };
    });
  }

  function syncDrawerResourceSummary(drawer) {
    const total = drawerResources.reduce((s, r) => {
      const inp = drawer.querySelector(`.pd-res-cost[data-idx="${drawerResources.indexOf(r)}"]`);
      return s + Number(inp?.value || r.cost || 0);
    }, 0);
    const summEl = drawer.querySelector('#pd-res-summary');
    if (summEl) summEl.textContent = `Resources — ${drawerResources.length} items · ${fmt(total)}`;
  }

  function syncDrawerTaskSummary(drawer) {
    const summEl = drawer.querySelector('#pd-task-summary');
    if (summEl) summEl.textContent = `Key tasks — ${drawerTasks.length} defined`;
  }

  /* ── Red clearance drawer ────────────────────────────────────────────────── */

  async function openRedClearance(projectId) {
    el('proj-drawer')?.remove();
    el('proj-drawer-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'proj-drawer-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:400';
    backdrop.addEventListener('click', closeDrawer);
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = 'proj-drawer';
    drawer.style.cssText = 'position:fixed;top:0;right:0;width:min(560px,100vw);height:100vh;background:var(--bg-raised);z-index:401;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,0.2);transform:translateX(100%);transition:transform 0.28s ease';

    let delayed = [];
    try {
      const res = await api('/api/project-tasks?project_id=' + projectId);
      delayed = (res.records || []).filter(t => t.status === 'Delayed');
    } catch {}

    const today = todayStr();
    drawer.innerHTML = `<div style="padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:#ef4444">⚡ Red clearance</h3>
        <button id="proj-drawer-close" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1.1rem">✕</button>
      </div>
      ${delayed.length === 0 ? '<div style="color:var(--text-dim)">No delayed tasks found.</div>' : `
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-bottom:0.4rem">DELAYED TASKS</div>
        ${delayed.map(t => {
          const overdueDays = t.finish_by ? Math.max(0, Math.ceil((new Date() - new Date(t.finish_by + 'T00:00:00')) / 86400000)) : 0;
          return `<div style="padding:0.4rem 0;border-bottom:1px solid var(--border)">
            <div style="font-size:0.82rem;color:#ef4444;font-weight:600">${esc(t.title)}</div>
            <div style="font-size:0.68rem;color:var(--text-dim)">Due ${fmtDate(t.finish_by)} · ${overdueDays}d overdue</div>
          </div>`;
        }).join('')}
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:0.75rem;margin-bottom:0.4rem">RESOLVE CHECKLIST</div>
        ${delayed.map((t, i) => `
          <label style="display:flex;align-items:flex-start;gap:0.4rem;padding:0.3rem 0;cursor:pointer">
            <input type="checkbox" class="rc-chk" data-i="${i}" style="width:auto;margin-top:2px">
            <span style="font-size:0.78rem">${esc(t.title.toLowerCase().includes('decide') || t.title.toLowerCase().includes('decision') ? `Decision made on: ${t.title}` : t.title.toLowerCase().includes('build') || t.title.toLowerCase().includes('develop') ? `New date set for: ${t.title}` : `Resolved or removed: ${t.title}`)}</span>
          </label>`).join('')}
        <div style="margin-top:0.75rem">
          <label style="font-size:0.72rem;color:var(--text-dim)">Evidence — what happened and what is the new plan</label>
          <textarea id="rc-evidence" rows="3" placeholder="Describe what changed and next steps…"
            style="width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;box-sizing:border-box;margin-top:0.25rem"></textarea>
        </div>
        <button id="rc-submit" disabled
          style="width:100%;margin-top:0.75rem;padding:0.45rem;background:#ef4444;color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700;font-size:0.85rem;opacity:0.4">
          Mark resolved</button>
        <div id="rc-msg" style="display:none;font-size:0.78rem;margin-top:0.4rem"></div>
      `}
    </div>`;

    document.body.appendChild(drawer);
    requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });

    drawer.querySelector('#proj-drawer-close')?.addEventListener('click', closeDrawer);

    const checkboxes = drawer.querySelectorAll('.rc-chk');
    const submitBtn  = drawer.querySelector('#rc-submit');

    function checkAllDone() {
      if (!submitBtn) return;
      const allChecked = [...checkboxes].every(c => c.checked);
      submitBtn.disabled = !allChecked;
      submitBtn.style.opacity = allChecked ? '1' : '0.4';
    }
    checkboxes.forEach(c => c.addEventListener('change', checkAllDone));

    submitBtn?.addEventListener('click', async () => {
      const evidence = el('rc-evidence')?.value?.trim();
      if (!evidence) { showMsg('rc-msg', 'Evidence is required', false); return; }
      try {
        // Mark all delayed tasks as In progress
        for (const t of delayed) {
          await api(`/api/project-tasks/${t.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'In progress' })
          });
        }
        // Append to project notes
        const ts    = new Date().toLocaleString('en-GB');
        const entry = `\n[${ts}] RED CLEARANCE: ${evidence}`;
        await api('/api/projects/' + projectId, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: entry })
        });
        await loadAll();
        closeDrawer();
        if (selectedId === projectId) renderFocusView(projectId);
        else renderAll();
      } catch (err) {
        showMsg('rc-msg', err.message, false);
      }
    });
  }

  /* ── AI inquiry ──────────────────────────────────────────────────────────── */

  async function runAiInquiry(type, drawer) {
    const resultEl = drawer.querySelector('#pd-ai-result');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.textContent   = 'Thinking…';

    const prompts = {
      feasibility: `You are a business advisor. Assess the feasibility of this project:\nName: ${drawerData.name}\nIdea: ${drawerData.idea}\nCustomer: ${drawerData.customer_group}\nProblem: ${drawerData.problem_solved}\nAnswer in 3-5 bullet points.`,
      tasks:       `Generate a task list for launching this project as a JSON array only. No explanation, no markdown, just the JSON array.\nName: ${drawerData.name}\nIdea: ${drawerData.idea}\nPhases: DS (Design), PT (Prototyping), PD (Process dev), PV (Product develop), LA (Launch)\nReturn 3-5 tasks per phase as a JSON array of objects with fields: title (string), phase_code (DS/PT/PD/PV/LA), measure (string, how you know it's done). Example: [{"title":"...","phase_code":"DS","measure":"..."}]`,
      extend:      `Extend and improve this business idea:\nName: ${drawerData.name}\nIdea: ${drawerData.idea}\nCustomer: ${drawerData.customer_group}\nSuggest 3 extensions or pivot angles.`
    };

    try {
      const res = await api('/api/ai-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompts[type] }], session_id: 'project-ai-' + Date.now(), stream: false })
      });
      const reply = res.reply || res.message || '';

      if (type === 'tasks') {
        let parsed = null;
        try {
          const jsonStr = reply.trim().replace(/^```json\s*/,'').replace(/```\s*$/,'').replace(/^```\s*/,'');
          parsed = JSON.parse(jsonStr);
        } catch (_) {}

        if (parsed && Array.isArray(parsed) && parsed.length) {
          resultEl.innerHTML = `<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.4rem">${parsed.length} tasks generated:</div>
            ${parsed.map(t=>`<div style="padding:0.2rem 0;border-bottom:1px solid var(--border);font-size:0.75rem">
              <span style="font-size:0.62rem;font-weight:700;color:${PHASE_COLORS[t.phase_code]||'var(--text-dim)'};margin-right:0.3rem">${esc(t.phase_code||'?')}</span>
              ${esc(t.title)}
              ${t.measure?`<div style="font-size:0.65rem;color:var(--text-dim)">${esc(t.measure)}</div>`:''}
            </div>`).join('')}
            <button id="pd-ai-add-tasks" style="margin-top:0.5rem;font-size:0.75rem;padding:0.3rem 0.75rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-weight:700">Add ${parsed.length} tasks</button>`;

          drawer.querySelector('#pd-ai-add-tasks')?.addEventListener('click', async () => {
            const addBtn = drawer.querySelector('#pd-ai-add-tasks');
            if (addBtn) addBtn.disabled = true;
            const projectId = drawerProjId;
            if (!projectId) {
              resultEl.insertAdjacentHTML('beforeend', '<div style="color:#ef4444;font-size:0.75rem;margin-top:0.3rem">Save the project first before adding tasks.</div>');
              if (addBtn) addBtn.disabled = false;
              return;
            }
            let added = 0;
            for (const t of parsed) {
              try {
                await api('/api/project-tasks', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ project_id: projectId, title: t.title, phase_code: t.phase_code || 'DS', measure: t.measure || '', assigned_to: 'Me' })
                });
                added++;
              } catch (_) {}
            }
            resultEl.insertAdjacentHTML('beforeend', `<div style="color:#22c55e;font-size:0.75rem;margin-top:0.3rem">✓ ${added} tasks added</div>`);
            if (addBtn) { addBtn.disabled = true; addBtn.textContent = `✓ Added ${added}`; }
          });
        } else {
          resultEl.style.whiteSpace = 'pre-wrap';
          resultEl.textContent = reply || 'No response';
        }
      } else {
        resultEl.style.whiteSpace = 'pre-wrap';
        resultEl.textContent = reply || 'No response';
      }
    } catch (err) {
      resultEl.textContent = 'AI error: ' + err.message;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  function showMsg(id, text, ok = true) {
    const msgEl = el(id) || document.getElementById(id);
    if (!msgEl) return;
    msgEl.textContent  = text;
    msgEl.style.color  = ok ? '#22c55e' : '#ef4444';
    msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
  }

  /* ── Full re-render ──────────────────────────────────────────────────────── */

  function renderAll() {
    renderStats();
    renderFilterBar();
    renderZone();
  }

  /* ── Panel wiring ────────────────────────────────────────────────────────── */

  function buildPanelShell() {
    const panel = panelEl();
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">Project Assets</div>
        <div class="panel-subtitle">// digital · IP · tools</div>
      </div>
      <div id="proj-stats" class="stat-strip" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem"></div>
      <div id="proj-filter-bar" style="margin-bottom:0.75rem"></div>
      <div id="proj-content"></div>`;
  }

  /* ── Inject CSS ──────────────────────────────────────────────────────────── */

  function injectCSS() {
    if (el('proj-style')) return;
    const s = document.createElement('style');
    s.id = 'proj-style';
    s.textContent = `
      @keyframes proj-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      .proj-hb-green { background:#22c55e; animation:proj-pulse 2s infinite; }
      .proj-hb-red   { background:#ef4444; animation:proj-pulse 0.8s infinite; }
      .proj-card:hover { box-shadow:0 2px 12px rgba(0,0,0,0.12); }
    `;
    document.head.appendChild(s);
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */

  async function init() {
    if (initialized) return; initialized = true;
    injectCSS();
    buildPanelShell();
    try {
      await loadAll();
    } catch (err) {
      const zone = contentEl();
      if (zone) zone.innerHTML = `<div style="color:#ef4444;font-size:0.85rem">Failed to load projects: ${err.message}</div>`;
      return;
    }
    renderAll();
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'proj-assets') init(); });
  if (document.getElementById('panel-proj-assets')?.classList.contains('active')) init();
})();
