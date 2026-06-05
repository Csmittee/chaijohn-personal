/* ── M4.3 Time Management — timemanagement.injector.js ── */
(function () {
  'use strict';

  // ── Module state ──────────────────────────────────────────────────────────
  let initialized      = false;
  let items            = [];
  let projectTasks     = [];
  let budgets          = [];
  let liabilities      = [];
  let flowView         = 'today';
  let calView          = 'month';
  let calSelected      = null;
  let routineModalOpen = false;
  let showProjectTasks = true;
  let skippedGhosts    = new Set();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function panel() { return document.getElementById('panel-timemanagement'); }

  function today() { return new Date().toISOString().split('T')[0]; }

  function fmt(date) {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
  }

  function formatMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  function formatDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function weekDates() {
    const now  = new Date();
    const dow  = now.getDay();
    const sun  = new Date(now); sun.setDate(now.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }

  function monthDates() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const days  = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1))
      days.push(d.toISOString().split('T')[0]);
    return days;
  }

  // F5: detect if a routine item is currently in its active time slot
  function isActiveRoutine(item) {
    if (item.pane !== 'Schedule' || item.schedule_type !== 'Routine') return false;
    if (!item.schedule_time) return false;
    const now = new Date();
    const [sh, sm] = item.schedule_time.split(':').map(Number);
    const start = new Date(); start.setHours(sh, sm, 0, 0);
    const end   = new Date();
    if (item.end_time) {
      const [eh, em] = item.end_time.split(':').map(Number);
      end.setHours(eh, em, 0, 0);
    } else {
      end.setHours(sh, sm + 15, 0, 0);
    }
    return now >= start && now <= end;
  }

  // F6: period label for ghost items
  function getPeriodLabel(dueDate, todayStr) {
    if (dueDate < todayStr) return { text: `OVERDUE · ${formatMonth(dueDate)}`, cls: 'tm-period-overdue' };
    if (dueDate === todayStr) return { text: 'DUE TODAY', cls: 'tm-period-today' };
    const daysAhead = Math.ceil((new Date(dueDate) - new Date(todayStr)) / 86400000);
    if (daysAhead <= 7) return { text: `DUE SOON · ${formatDay(dueDate)}`, cls: 'tm-period-soon' };
    return { text: `UPCOMING · ${formatMonth(dueDate)}`, cls: 'tm-period-upcoming' };
  }

  // F6: generate due dates within the 30d past / 21d ahead window
  function generateGhostDueDates(dueDay) {
    const now         = new Date();
    const windowStart = new Date(now); windowStart.setDate(now.getDate() - 30);
    const windowEnd   = new Date(now); windowEnd.setDate(now.getDate() + 21);
    const candidates  = [];
    for (let mo = -1; mo <= 2; mo++) {
      const d = new Date(now.getFullYear(), now.getMonth() + mo, dueDay);
      if (d >= windowStart && d <= windowEnd)
        candidates.push(d.toISOString().split('T')[0]);
    }
    return candidates;
  }

  // ── ensureStyles ──────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('tm-styles')) return;
    const s = document.createElement('style');
    s.id = 'tm-styles';
    s.textContent = `
      @keyframes tm-blink        { 50% { opacity: 0.2; } }
      @keyframes tm-blink-yellow { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      .tm-high-impact         { animation: tm-blink 1s step-start infinite; }
      .tm-node-active-routine { animation: tm-blink-yellow 1s step-start infinite; border: 2px solid var(--yellow) !important; }
      .tm-node-red    { background: #ef4444; color: #fff; }
      .tm-node-yellow { background: var(--yellow); color: #0a0a10; }
      .tm-node-blue   { background: #3b82f6; color: #fff; }
      .tm-project-card  { border-left: 3px solid #3b82f6 !important; }
      .tm-project-title { color: #3b82f6; }
      .tm-active-routine-row { border-left: 3px solid var(--yellow) !important; }
      .tm-pane-body { overflow-y: auto; flex: 1; min-height: 0; }
      .tm-weekday-col { background: rgba(255,255,255,0.03); }
      .tm-today-col   { background: rgba(245,197,24,0.08); }
      #panel-timemanagement.active { display: flex; flex-direction: column; }
      .tm-zone { flex-shrink: 0; }
      .tm-panes-area { display: grid; grid-template-columns: 1fr 1fr minmax(220px,1.3fr) minmax(220px,1.3fr); gap: 0.75rem; flex: 1; min-height: 0; overflow: hidden; }
      .tm-pane { display: flex; flex-direction: column; background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; min-height: 0; }
      .tm-pane-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.75rem; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
      .tm-pane-name   { font-family: var(--font-mono); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); flex: 1; }
      .tm-count-badge { font-family: var(--font-mono); font-size: 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.1rem 0.45rem; color: var(--text-dim); }
      .tm-add-btn  { font-family: var(--font-mono); font-size: 0.68rem; padding: 0.2rem 0.5rem; background: rgba(245,197,24,0.08); border: 1px solid rgba(245,197,24,0.3); border-radius: var(--radius); color: var(--yellow); cursor: pointer; transition: background 0.15s; white-space: nowrap; }
      .tm-add-btn:hover { background: rgba(245,197,24,0.18); }
      .tm-item-card { padding: 0.45rem 0.65rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.2rem; cursor: default; }
      .tm-item-card:last-child { border-bottom: none; }
      .tm-item-top    { display: flex; align-items: flex-start; gap: 0.35rem; }
      .tm-item-title  { font-size: 0.82rem; flex: 1; line-height: 1.35; word-break: break-word; }
      .tm-item-title.done-title { text-decoration: line-through; opacity: 0.45; }
      .tm-item-sub    { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); }
      .tm-item-actions { display: flex; gap: 0.25rem; margin-top: 0.1rem; align-self: flex-start; }
      .tm-action-btn  { background: none; border: 1px solid var(--border); border-radius: 4px; font-size: 0.68rem; min-width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; color: var(--text-dim); flex-shrink: 0; padding: 0 0.25rem; }
      .tm-action-btn:hover      { border-color: var(--border-strong); color: var(--text); }
      .tm-action-btn.done-btn:hover { border-color: var(--green); color: var(--green); }
      .tm-action-btn.del-btn:hover  { border-color: var(--red);   color: var(--red); }
      .tm-badge        { font-size: 0.68rem; flex-shrink: 0; cursor: default; }
      .tm-badge-force  { color: var(--yellow); }
      .tm-badge-impact { color: var(--red); }
      .tm-badge-done   { color: var(--green); }
      .tm-inline-form  { padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border); background: var(--bg); }
      .tm-inline-form textarea, .tm-inline-form input, .tm-inline-form select { font-size: 0.8rem; padding: 0.3rem 0.5rem; margin-bottom: 0.35rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--text); width: 100%; }
      .tm-inline-form textarea { resize: vertical; min-height: 2.5rem; }
      .tm-inline-form .tm-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-bottom: 0.35rem; }
      .tm-cb-row  { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.4rem; }
      .tm-cb-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
      .tm-cb-item input[type=checkbox] { width: auto; margin: 0; accent-color: var(--yellow); }
      .tm-form-btns  { display: flex; gap: 0.4rem; }
      .tm-save-btn   { font-size: 0.78rem; padding: 0.3rem 0.75rem; background: var(--yellow); color: #0a0a10; border: none; border-radius: var(--radius); cursor: pointer; font-weight: 600; }
      .tm-cancel-btn { font-size: 0.78rem; padding: 0.3rem 0.6rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; color: var(--text-muted); }
      .tm-empty { padding: 1.25rem 0.75rem; font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); text-align: center; }
      .tm-flow-strip  { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.75rem; margin-bottom: 0.75rem; }
      .tm-flow-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.4rem; }
      .tm-flow-title  { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); }
      .tm-flow-toggle { display: flex; gap: 0.3rem; }
      .tm-flow-btn    { font-family: var(--font-mono); font-size: 0.68rem; padding: 0.2rem 0.6rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-dim); cursor: pointer; transition: all 0.15s; }
      .tm-flow-btn.active { background: var(--nav-active-bg); border-color: var(--yellow); color: var(--yellow); }
      .tm-flow-nodes  { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.25rem; }
      .tm-node        { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; border-radius: 100px; font-size: 0.68rem; font-family: var(--font-mono); white-space: nowrap; cursor: default; flex-shrink: 0; }
      .tm-week-grid   { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.35rem; }
      .tm-week-col    { border-radius: var(--radius); padding: 0.35rem; min-height: 60px; }
      .tm-week-col-label { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-dim); margin-bottom: 0.25rem; text-align: center; }
      .tm-doit-strip  { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem; }
      .tm-doit-col    { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.65rem 0.75rem; }
      .tm-doit-title  { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 0.4rem; }
      .tm-doit-card   { display: flex; align-items: flex-start; gap: 0.35rem; padding: 0.3rem 0; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
      .tm-doit-card:last-child { border-bottom: none; }
      .tm-cal         { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.75rem; margin-bottom: 0.75rem; }
      .tm-cal-header  { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.4rem; }
      .tm-cal-title   { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); }
      .tm-cal-grid    { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .tm-cal-dow     { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-dim); text-align: center; padding: 0.2rem 0; }
      .tm-cal-day     { border-radius: 4px; padding: 0.2rem; min-height: 32px; cursor: pointer; transition: background 0.12s; display: flex; flex-direction: column; align-items: center; }
      .tm-cal-day:hover    { background: rgba(255,255,255,0.06); }
      .tm-cal-day.today-day    { background: rgba(245,197,24,0.12); border: 1px solid rgba(245,197,24,0.3); }
      .tm-cal-day.selected-day { background: rgba(245,197,24,0.2) !important; border: 1px solid var(--yellow) !important; }
      .tm-cal-day-num { font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); }
      .tm-cal-dots    { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; margin-top: 2px; }
      .tm-cal-dot     { width: 5px; height: 5px; border-radius: 50%; }
      .tm-routine-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 600; display: flex; align-items: center; justify-content: center; }
      .tm-routine-card  { background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 1.25rem; width: min(480px, 92vw); max-height: 80vh; overflow-y: auto; }
      .tm-kpi-strip   { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
      .tm-chip        { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.55rem 0.85rem; min-width: 110px; }
      .tm-chip-label  { display: block; font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); letter-spacing: 0.04em; margin-bottom: 0.15rem; }
      .tm-chip-val    { font-family: var(--font-mono); font-size: 0.92rem; font-weight: 600; color: var(--text); }
      .tm-ghost-item  { border: 1px dashed var(--border-strong) !important; background: rgba(255,255,255,0.02) !important; }
      .tm-period-badge   { font-family: var(--font-mono); font-size: 0.62rem; font-weight: 600; padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0; white-space: nowrap; }
      .tm-period-overdue  { background: rgba(239,68,68,0.15);  color: var(--red); }
      .tm-period-today    { background: rgba(34,197,94,0.15);  color: var(--green); }
      .tm-period-soon     { background: rgba(245,197,24,0.15); color: var(--yellow); }
      .tm-period-upcoming { background: rgba(255,255,255,0.08); color: var(--text-dim); }
      @media (max-width: 860px) { .tm-panes-area { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 540px) { .tm-panes-area { grid-template-columns: 1fr; } .tm-doit-strip { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(s);
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadData() {
    const [itemsRes, tasksRes, budgetsRes, liabRes] = await Promise.allSettled([
      fetch('/api/daily-items').then(r => r.json()),
      fetch('/api/project-tasks?due_today=true').then(r => r.json()),
      fetch('/api/budgets').then(r => r.json()),
      fetch('/api/liabilities').then(r => r.json())
    ]);

    items        = itemsRes.status   === 'fulfilled' ? (itemsRes.value.records   || []) : [];
    projectTasks = tasksRes.status   === 'fulfilled' ? (tasksRes.value.records   || []) : [];
    budgets      = budgetsRes.status === 'fulfilled' ? (budgetsRes.value.records || []) : [];
    liabilities  = liabRes.status    === 'fulfilled' ? (liabRes.value.records    || []) : [];
  }

  // ── Inject project tasks as DailyItems (no duplicates) ───────────────────
  async function injectProjectTasks() {
    const existingTaskIds = new Set(items.map(i => i.project_task_id).filter(Boolean));
    const toInject        = projectTasks.filter(t => !existingTaskIds.has(t.id));

    for (const task of toInject) {
      try {
        const res = await fetch('/api/daily-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:           task.title,
            pane:            'Do',
            source:          'project',
            project_task_id: task.id,
            project_id:      Array.isArray(task.project_id) ? task.project_id[0] : (task.project_id || ''),
            project_name:    task.project_name || '',
            date:            task.finish_by || null
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.record) items.push(data.record);
        }
      } catch (err) {
        console.error('Task injection failed:', err.message);
      }
    }
  }

  // ── Budget + liability dropdown builder (F3) ─────────────────────────────
  function buildBudgetDropdown(selectedId) {
    const budgetOpts = budgets
      .filter(b => {
        const active = b.fields ? b.fields.active : b.active;
        return active !== false;
      })
      .map(b => ({
        id:    b.id,
        label: b.fields ? (b.fields.label || b.fields.name || b.id) : (b.label || b.id)
      }));

    // Deduplicate by label — keep first occurrence
    const seen = new Set();
    const uniqueBudgets = budgetOpts.filter(o => {
      if (seen.has(o.label)) return false;
      seen.add(o.label); return true;
    });

    const liabOpts = liabilities
      .filter(l => {
        const active = l.fields ? l.fields.active : l.active;
        return active !== false;
      })
      .map(l => ({
        id:    l.id,
        label: l.fields ? (l.fields.name || l.id) : (l.name || l.id)
      }));

    // TODO: ProjectResources group — add when project purchase flow is defined

    const toOption = (o) =>
      `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${o.label}</option>`;

    return `<select id="tm-form-budget" class="tm-budget-select" name="budget_id">
      <option value="">— Budget —</option>
      <optgroup label="Budget">${uniqueBudgets.map(toOption).join('')}</optgroup>
      <optgroup label="Debt Payment">${liabOpts.map(toOption).join('')}</optgroup>
    </select>`;
  }

  // ── Ghost recurring payments (F6) ─────────────────────────────────────────
  function renderGhostItems() {
    const todayStr = today();
    const ghosts   = [];

    liabilities.forEach(l => {
      const f      = l.fields || l;
      const dueDay = Number(f.payment_due_day);
      if (!dueDay || f.active === false) return;
      generateGhostDueDates(dueDay).forEach(dueDate => {
        const ghostId = `ghost-liab-${l.id}-${dueDate}`;
        if (skippedGhosts.has(ghostId)) return;
        ghosts.push({
          id: ghostId, label: f.name || l.id,
          amount: f.monthly_payment || 0, dueDate,
          budgetId: ''
        });
      });
    });

    budgets.forEach(b => {
      const f      = b.fields || b;
      const dueDay = Number(f.period_due_day);
      if (!dueDay || f.active === false) return;
      generateGhostDueDates(dueDay).forEach(dueDate => {
        const ghostId = `ghost-budget-${b.id}-${dueDate}`;
        if (skippedGhosts.has(ghostId)) return;
        ghosts.push({
          id: ghostId, label: f.label || f.name || b.id,
          amount: f.amount || 0, dueDate,
          budgetId: b.id
        });
      });
    });

    if (!ghosts.length) return '';

    return ghosts.map(g => {
      const { text: periodText, cls: periodCls } = getPeriodLabel(g.dueDate, todayStr);
      const amtDisplay = g.amount ? ` · ฿${Number(g.amount).toLocaleString()}` : '';
      const safeLabel  = g.label.replace(/"/g, '&quot;');
      return `<div class="tm-item-card tm-ghost-item"
          data-ghost-id="${g.id}"
          data-ghost-label="${safeLabel}"
          data-ghost-amount="${g.amount}"
          data-ghost-budget="${g.budgetId}">
        <div class="tm-item-top">
          <span class="tm-period-badge ${periodCls}">${periodText}</span>
          <span class="tm-item-title" style="flex:1;margin-left:0.35rem">${truncate(g.label, 22)}${amtDisplay}</span>
          <div class="tm-item-actions">
            <button type="button" class="tm-action-btn"
              data-ghost-book="${g.id}"
              style="font-size:0.58rem;width:auto;padding:0 0.35rem;color:var(--green);border-color:rgba(34,197,94,0.4)"
              title="Book this payment">Book</button>
            <button type="button" class="tm-action-btn del-btn"
              data-ghost-skip="${g.id}" title="Skip for session">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── KPI strip ─────────────────────────────────────────────────────────────
  function renderKpi() {
    const todayStr = today();

    // B3 fix: Schedule items as "today" if date===today OR (no date AND created today)
    const schedTodayItems = items.filter(i =>
      i.pane === 'Schedule' && (
        i.date === todayStr ||
        (!i.date && (i.created_at || '').startsWith(todayStr))
      )
    );
    const schedHit   = schedTodayItems.filter(i => i.done).length;
    const schedTotal = schedTodayItems.length;

    const delayed  = items.filter(i => !i.done && i.force && i.date && i.date < todayStr).length;
    const highOpen = items.filter(i => i.high_impact && !i.done).length;

    // B4 fix: single total count of project-sourced tasks due today
    const projTasksTotal = items.filter(i => i.source === 'project' && i.date === todayStr && !i.done).length;

    return `
      <div class="tm-kpi-strip tm-zone">
        <div class="tm-chip">
          <span class="tm-chip-label">SCHEDULE HIT</span>
          <span class="tm-chip-val">${schedHit}/${schedTotal}</span>
        </div>
        <div class="tm-chip">
          <span class="tm-chip-label">DELAYED TASKS</span>
          <span class="tm-chip-val" style="color:${delayed > 0 ? 'var(--red)' : 'var(--text)'}">${delayed}</span>
        </div>
        <div class="tm-chip">
          <span class="tm-chip-label">HIGH IMPACT OPEN</span>
          <span class="tm-chip-val" style="color:${highOpen > 0 ? 'var(--red)' : 'var(--text)'}">${highOpen}</span>
        </div>
        <div class="tm-chip" style="min-width:140px;${!showProjectTasks ? 'opacity:0.4' : ''}">
          <span class="tm-chip-label">PROJECT TASKS TODAY</span>
          <span class="tm-chip-val">${projTasksTotal || '—'}</span>
        </div>
      </div>`;
  }

  // ── Flow strip ────────────────────────────────────────────────────────────
  function renderFlow() {
    const todayStr = today();

    function nodeHtml(item) {
      let cls = 'tm-node';
      const active = isActiveRoutine(item);
      if (item.high_impact && !item.done) cls += ' tm-node-red tm-high-impact';
      else if (active)                    cls += ' tm-node-blue tm-node-active-routine';
      else if (item.schedule_type === 'Routine') cls += ' tm-node-blue';
      else cls += ' tm-node-yellow';

      const lbl         = truncate(item.title, 12);
      const timeDisplay = item.schedule_time
        ? (item.end_time ? ` ${item.schedule_time}–${item.end_time}` : ` ${item.schedule_time}`)
        : '';
      const tip = `${item.title} · ${item.pane || ''}${item.date ? ' · ' + item.date : ''}`;
      return `<span class="${cls}" title="${tip}">${lbl}${timeDisplay}</span>`;
    }

    let nodesHtml = '';
    if (flowView === 'today') {
      const flowItems = items.filter(i =>
        (i.schedule_time || (i.high_impact && !i.done)) &&
        (!i.date || i.date <= todayStr) &&
        (showProjectTasks || i.source !== 'project')
      ).sort((a, b) => {
        const at = a.schedule_time || '99:99';
        const bt = b.schedule_time || '99:99';
        if (at !== bt) return at.localeCompare(bt);
        return (a.end_time || '99:99').localeCompare(b.end_time || '99:99');
      });
      nodesHtml = `<div class="tm-flow-nodes">${
        flowItems.length
          ? flowItems.map(nodeHtml).join('')
          : '<span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim)">No flow items today.</span>'
      }</div>`;
    } else {
      const dates = weekDates();
      const cols  = dates.map(d => {
        const isToday   = d === todayStr;
        const isWeekend = [0, 6].includes(new Date(d + 'T00:00:00').getDay());
        const dayItems  = items.filter(i =>
          (i.schedule_time || (i.high_impact && !i.done)) &&
          (!i.date || i.date === d || (i.high_impact && !i.done && d === todayStr)) &&
          (showProjectTasks || i.source !== 'project')
        );
        const dow    = ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(d + 'T00:00:00').getDay()];
        const dayNum = d.slice(8);
        const colCls = isToday ? 'tm-week-col tm-today-col' : isWeekend ? 'tm-week-col' : 'tm-week-col tm-weekday-col';
        return `<div class="${colCls}">
          <div class="tm-week-col-label">${dow} ${dayNum}</div>
          ${dayItems.map(nodeHtml).join('')}
        </div>`;
      });
      nodesHtml = `<div class="tm-week-grid">${cols.join('')}</div>`;
    }

    return `
      <div class="tm-flow-strip tm-zone">
        <div class="tm-flow-header">
          <span class="tm-flow-title">⟡ Flow</span>
          <div style="display:flex;gap:0.4rem;align-items:center">
            <div class="tm-flow-toggle">
              <button type="button" class="tm-flow-btn ${flowView === 'today' ? 'active' : ''}" data-fv="today">Today</button>
              <button type="button" class="tm-flow-btn ${flowView === 'week'  ? 'active' : ''}" data-fv="week">This Week</button>
            </div>
            <button type="button" id="tm-routine-btn" style="font-family:var(--font-mono);font-size:0.68rem;padding:0.2rem 0.55rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius);color:#3b82f6;cursor:pointer">⚙ Routine</button>
          </div>
        </div>
        ${nodesHtml}
      </div>`;
  }

  // ── DO IT strip ───────────────────────────────────────────────────────────
  function renderDoIt() {
    const todayStr = today();

    function doitCard(item) {
      const isProject = item.source === 'project';
      const orphan    = isProject && !item.project_task_id;
      const titleDisp = truncate(item.title, 24) + (orphan ? ' ⚠' : '');
      const impactMark = item.high_impact ? `<span class="tm-badge tm-badge-impact" title="High Impact">●</span>` : '';
      const forceMark  = item.force       ? `<span class="tm-badge tm-badge-force"  title="Force">⚡</span>` : '';
      return `<div class="tm-doit-card ${isProject ? 'tm-project-card' : ''}" style="border-radius:4px;padding:0.3rem 0.4rem">
        <span class="tm-badge">${forceMark}${impactMark}</span>
        <span class="${isProject ? 'tm-project-title' : ''}" style="font-size:0.8rem;flex:1" title="${item.title}">${titleDisp}</span>
        <button type="button" class="tm-action-btn done-btn" data-id="${item.id}" data-action="done" title="Mark done">✓</button>
        <button type="button" class="tm-action-btn del-btn"  data-id="${item.id}" data-action="del"  title="Remove">✕</button>
      </div>`;
    }

    // B1 fix: high_impact OR (force AND date <= today)
    const doItems = items
      .filter(i => i.pane === 'Do' && !i.done && (
        i.high_impact || (i.force && i.date && i.date <= todayStr)
      ))
      .filter(i => showProjectTasks || i.source !== 'project')
      .sort((a, b) => (b.high_impact ? 1 : 0) - (a.high_impact ? 1 : 0))
      .slice(0, 5);

    const buyItems = items
      .filter(i => i.pane === 'BuyPay' && !i.done && (
        i.high_impact || (i.force && i.date && i.date <= todayStr)
      ))
      .sort((a, b) => (b.high_impact ? 1 : 0) - (a.high_impact ? 1 : 0))
      .slice(0, 5);

    if (!doItems.length && !buyItems.length) return '';

    const doCol  = doItems.length  ? `<div class="tm-doit-col"><div class="tm-doit-title">⚡ Do Today</div>${doItems.map(doitCard).join('')}</div>` : '';
    const buyCol = buyItems.length ? `<div class="tm-doit-col"><div class="tm-doit-title">💳 Buy/Pay Today</div>${buyItems.map(doitCard).join('')}</div>` : '';

    return `<div class="tm-doit-strip tm-zone">${doCol}${buyCol}</div>`;
  }

  // ── Mini calendar ─────────────────────────────────────────────────────────
  function renderCalendar() {
    const todayStr = today();
    const DOWS     = ['Su','Mo','Tu','We','Th','Fr','Sa'];

    function dotRow(dateStr) {
      const dayItems = items.filter(i => i.date === dateStr);
      if (!dayItems.length) return '';
      const dots = [];
      if (dayItems.some(i => i.high_impact && !i.done)) dots.push('<span class="tm-cal-dot" style="background:#ef4444"></span>');
      if (dayItems.some(i => i.schedule_type === 'Routine')) dots.push('<span class="tm-cal-dot" style="background:#3b82f6"></span>');
      if (dayItems.some(i => i.schedule_type === 'General')) dots.push('<span class="tm-cal-dot" style="background:var(--yellow)"></span>');
      if (dayItems.some(i => i.pane === 'Do' || i.pane === 'BuyPay')) dots.push('<span class="tm-cal-dot" style="background:rgba(255,255,255,0.3)"></span>');
      return `<div class="tm-cal-dots">${[...new Set(dots)].join('')}</div>`;
    }

    let gridHtml = '';
    if (calView === 'week') {
      const dates = weekDates();
      gridHtml = `<div class="tm-cal-grid">${DOWS.map(d => `<div class="tm-cal-dow">${d}</div>`).join('')}${
        dates.map(d => {
          const selCls = calSelected === d ? ' selected-day' : '';
          const todCls = d === todayStr   ? ' today-day' : '';
          return `<div class="tm-cal-day${todCls}${selCls}" data-date="${d}">
            <div class="tm-cal-day-num">${d.slice(8)}</div>
            ${dotRow(d)}
          </div>`;
        }).join('')
      }</div>`;
    } else {
      const now      = new Date();
      const year     = now.getFullYear();
      const month    = now.getMonth();
      const firstDow = new Date(year, month, 1).getDay();
      const days     = monthDates();
      const blanks   = Array(firstDow).fill('<div></div>').join('');
      gridHtml = `<div class="tm-cal-grid">${DOWS.map(d => `<div class="tm-cal-dow">${d}</div>`).join('')}${blanks}${
        days.map(d => {
          const selCls = calSelected === d ? ' selected-day' : '';
          const todCls = d === todayStr   ? ' today-day' : '';
          return `<div class="tm-cal-day${todCls}${selCls}" data-date="${d}">
            <div class="tm-cal-day-num">${d.slice(8)}</div>
            ${dotRow(d)}
          </div>`;
        }).join('')
      }</div>`;
    }

    const clearBtn = calSelected
      ? `<button type="button" id="tm-cal-clear" style="font-family:var(--font-mono);font-size:0.68rem;padding:0.15rem 0.45rem;background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.3);border-radius:var(--radius);color:var(--yellow);cursor:pointer">✕ Clear filter</button>`
      : '';

    return `
      <div class="tm-cal tm-zone">
        <div class="tm-cal-header">
          <span class="tm-cal-title">📅 Calendar${calSelected ? ' · ' + fmt(calSelected) : ''}</span>
          <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap">
            ${clearBtn}
            <button type="button" class="tm-flow-btn ${showProjectTasks ? 'active' : ''}" data-toggle-projects="">Projects ${showProjectTasks ? 'ON' : 'OFF'}</button>
            <div class="tm-flow-toggle">
              <button type="button" class="tm-flow-btn ${calView === 'month' ? 'active' : ''}" data-cv="month">Month</button>
              <button type="button" class="tm-flow-btn ${calView === 'week'  ? 'active' : ''}" data-cv="week">Week</button>
            </div>
          </div>
        </div>
        ${gridHtml}
      </div>`;
  }

  // ── Pane item card ────────────────────────────────────────────────────────
  function itemCard(item) {
    const isProject = item.source === 'project';
    const orphan    = isProject && !item.project_task_id;
    const titleBase = truncate(item.title, 28) + (orphan ? ' ⚠' : '');
    const impactMark = item.high_impact ? `<span class="tm-badge tm-badge-impact ${item.done ? '' : 'tm-high-impact'}" title="High Impact — appears in Flow">●</span>` : '';
    const forceMark  = item.force       ? `<span class="tm-badge tm-badge-force"  title="Force — must complete by date">⚡</span>` : '';
    const doneMark   = item.done        ? `<span class="tm-badge tm-badge-done"   title="Done">✓</span>` : '';

    let sub = '';
    if (item.date) sub += fmt(item.date);
    if (item.schedule_time) {
      const timeStr = item.end_time ? `${item.schedule_time}–${item.end_time}` : item.schedule_time;
      sub += (sub ? ' · ' : '') + timeStr;
    }
    if (item.pane === 'BuyPay' && item.budget_label) sub += (sub ? ' · ' : '') + item.budget_label;
    if (isProject && item.project_name) sub = `${item.project_name} · due ${item.date ? fmt(item.date) : '—'}`;

    const editBtn = !isProject
      ? `<button type="button" class="tm-action-btn" data-id="${item.id}" data-action="edit" title="Edit" style="font-size:0.6rem">✎</button>`
      : '';

    const activeRoutine = isActiveRoutine(item);
    const rowClass = [
      'tm-item-card',
      isProject ? 'tm-project-card' : '',
      activeRoutine ? 'tm-active-routine-row' : ''
    ].filter(Boolean).join(' ');

    return `<div class="${rowClass}" data-id="${item.id}">
      <div class="tm-item-top">
        <span>${forceMark}${impactMark}${doneMark}</span>
        <span class="tm-item-title ${item.done ? 'done-title' : ''} ${isProject ? 'tm-project-title' : ''}" title="${item.title}">${titleBase}</span>
        <div class="tm-item-actions">
          ${editBtn}
          <button type="button" class="tm-action-btn done-btn" data-id="${item.id}" data-action="done" title="Mark done">✓</button>
          <button type="button" class="tm-action-btn del-btn"  data-id="${item.id}" data-action="del"  title="Remove">✕</button>
        </div>
      </div>
      ${sub ? `<div class="tm-item-sub">${sub}</div>` : ''}
    </div>`;
  }

  // ── Inline add form ───────────────────────────────────────────────────────
  function addForm(pane) {
    const isBuyPay   = pane === 'BuyPay';
    const isSchedule = pane === 'Schedule';

    return `<div class="tm-inline-form" data-form-pane="${pane}">
      <textarea id="tm-form-title" placeholder="Title…" rows="2" style="margin-bottom:0.35rem"></textarea>
      ${isSchedule ? `
        <div class="tm-form-row">
          <input type="time" id="tm-form-time" placeholder="Start time">
          <select id="tm-form-stype"><option value="General">General</option><option value="Routine">Routine</option></select>
        </div>
        <div class="tm-form-row">
          <input type="time" id="tm-form-end-time" placeholder="End time (optional)">
          <input type="date" id="tm-form-date">
        </div>
      ` : ''}
      ${isBuyPay ? `
        <div class="tm-form-row">
          <input type="text" id="tm-form-amount" placeholder="Amount ฿" inputmode="numeric" pattern="[0-9.]*">
          ${buildBudgetDropdown('')}
        </div>
        <input type="date" id="tm-form-date" style="margin-bottom:0.35rem">
      ` : ''}
      ${!isSchedule && !isBuyPay ? `<input type="date" id="tm-form-date" style="margin-bottom:0.35rem">` : ''}
      <div class="tm-cb-row">
        <label class="tm-cb-item" title="Force — must complete by date">
          <input type="checkbox" id="tm-form-force"> <span>⚡</span>
        </label>
        <label class="tm-cb-item" title="High Impact — appears in Flow">
          <input type="checkbox" id="tm-form-impact"> <span style="color:var(--red)">●</span>
        </label>
        <label class="tm-cb-item" title="Mark done">
          <input type="checkbox" id="tm-form-done"> <span style="color:var(--green)">✓</span>
        </label>
      </div>
      <div id="tm-form-force-date" style="display:none;margin-bottom:0.35rem">
        <input type="date" id="tm-form-force-date-input" placeholder="Required date (force)">
      </div>
      <div class="tm-form-btns">
        <button type="button" class="tm-save-btn"   data-save-pane="${pane}">Save</button>
        <button type="button" class="tm-cancel-btn" data-cancel-pane="${pane}">Cancel</button>
      </div>
    </div>`;
  }

  // ── 4 Panes ───────────────────────────────────────────────────────────────
  function renderPanes() {
    const todayStr  = today();
    const panes     = ['Do', 'Follow', 'Schedule', 'BuyPay'];
    const paneIcons = { Do: '⚡', Follow: '👁', Schedule: '📅', BuyPay: '💳' };

    return `<div class="tm-panes-area">${panes.map(pane => {
      let paneItems = items.filter(i => i.pane === pane);
      if (calSelected) paneItems = paneItems.filter(i => i.date === calSelected);
      if (pane === 'Do' && !showProjectTasks) {
        paneItems = paneItems.filter(i => i.source !== 'project');
      }
      paneItems.sort((a, b) => {
        const aFloat = (!a.done && a.high_impact) || (!a.done && a.date && a.date < todayStr) ? 1 : 0;
        const bFloat = (!b.done && b.high_impact) || (!b.done && b.date && b.date < todayStr) ? 1 : 0;
        if (bFloat !== aFloat) return bFloat - aFloat;
        return (b.date || '').localeCompare(a.date || '');
      });

      const ghostsHtml = pane === 'BuyPay' ? renderGhostItems() : '';
      const hasGhosts  = ghostsHtml.length > 0;
      const realItems  = paneItems.length
        ? paneItems.map(itemCard).join('')
        : (!hasGhosts ? `<div class="tm-empty">Nothing here. Tap + to add.</div>` : '');
      const body = ghostsHtml + realItems;

      return `<div class="tm-pane" data-pane="${pane}">
        <div class="tm-pane-header">
          <span class="tm-pane-name">${paneIcons[pane]} ${pane}</span>
          <span class="tm-count-badge">${paneItems.length}</span>
          <button type="button" class="tm-add-btn" data-add-pane="${pane}">+ Add</button>
        </div>
        <div class="tm-pane-body">${body}</div>
      </div>`;
    }).join('')}</div>`;
  }

  // ── Full render ───────────────────────────────────────────────────────────
  function renderPanel() {
    const p = panel();
    if (!p) return;
    p.innerHTML = `
      <div style="padding:1.25rem;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
        <div class="panel-header tm-zone" style="flex-shrink:0;margin-bottom:0.75rem">
          <div class="panel-title">Time Management</div>
          <div class="panel-subtitle">// tasks · schedule · today goal · flow</div>
        </div>
        ${renderKpi()}
        ${renderFlow()}
        ${renderDoIt()}
        ${renderCalendar()}
        ${renderPanes()}
      </div>`;
    wireEvents(p);
  }

  // ── Event delegation ──────────────────────────────────────────────────────
  function wireEvents(root) {
    if (root._tmWired) return;
    root._tmWired = true;

    root.addEventListener('click', async function (e) {
      const t = e.target;

      // Flow view toggle
      const fv = t.dataset.fv;
      if (fv) { flowView = fv; renderPanel(); return; }

      // Calendar view toggle
      const cv = t.dataset.cv;
      if (cv) { calView = cv; renderPanel(); return; }

      // F1: Projects ON/OFF toggle
      if ('toggleProjects' in t.dataset) {
        showProjectTasks = !showProjectTasks;
        renderPanel();
        return;
      }

      // Calendar day click
      const dateStr = t.dataset.date || t.closest('[data-date]')?.dataset.date;
      if (dateStr && t.closest('.tm-cal-day')) {
        calSelected = calSelected === dateStr ? null : dateStr;
        renderPanel();
        return;
      }

      // Clear calendar filter
      if (t.id === 'tm-cal-clear') { calSelected = null; renderPanel(); return; }

      // Routine modal
      if (t.id === 'tm-routine-btn') { showRoutineModal(); return; }

      // Add pane button
      const addPane = t.dataset.addPane;
      if (addPane) { openAddForm(addPane); return; }

      // B2 fix: cancel — always prevent default to avoid accidental form submit
      const cancelPane = t.dataset.cancelPane;
      if (cancelPane) { e.preventDefault(); removeForm(cancelPane); return; }

      // Save form
      const savePane = t.dataset.savePane;
      if (savePane) { await saveItem(savePane, t); return; }

      // F6: Ghost Book
      const ghostBook = t.dataset.ghostBook;
      if (ghostBook) {
        const card = t.closest('[data-ghost-id]');
        if (card) {
          openAddForm('BuyPay', {
            title:     card.dataset.ghostLabel,
            amount:    card.dataset.ghostAmount,
            budget_id: card.dataset.ghostBudget
          });
        }
        return;
      }

      // F6: Ghost Skip
      const ghostSkip = t.dataset.ghostSkip;
      if (ghostSkip) { skippedGhosts.add(ghostSkip); renderPanel(); return; }

      // Action buttons (panes + DO IT strip share same delegation)
      const action = t.dataset.action;
      const id     = t.dataset.id;
      if (action && id) {
        if (action === 'done') await markDone(id, t);
        if (action === 'del')  await removeItem(id, t);
        if (action === 'edit') openEditForm(id);
      }

      // Force checkbox toggle
      if (t.id === 'tm-form-force') {
        const fdWrap = document.getElementById('tm-form-force-date');
        if (fdWrap) fdWrap.style.display = t.checked ? 'block' : 'none';
      }
    });
  }

  function openAddForm(pane, prefill) {
    const p      = panel();
    const paneEl = p?.querySelector(`.tm-pane[data-pane="${pane}"]`);
    if (!paneEl) return;
    const body    = paneEl.querySelector('.tm-pane-body');
    const existing = body?.querySelector('.tm-inline-form');
    if (existing) { existing.remove(); }
    body?.insertAdjacentHTML('afterbegin', addForm(pane));

    if (prefill) {
      if (prefill.title)     { const el = body?.querySelector('#tm-form-title');  if (el) el.value = prefill.title; }
      if (prefill.amount)    { const el = body?.querySelector('#tm-form-amount'); if (el) el.value = prefill.amount; }
      if (prefill.budget_id) { const el = body?.querySelector('#tm-form-budget'); if (el) el.value = prefill.budget_id; }
    }

    body?.querySelector('#tm-form-title')?.focus();
  }

  function removeForm(pane) {
    const p      = panel();
    const paneEl = p?.querySelector(`.tm-pane[data-pane="${pane}"]`);
    paneEl?.querySelector('.tm-inline-form')?.remove();
  }

  async function saveItem(pane, btn) {
    if (btn.disabled) return;
    const p    = panel();
    const form = p?.querySelector(`[data-form-pane="${pane}"]`);
    if (!form) return;

    const title = form.querySelector('#tm-form-title')?.value.trim();
    if (!title) { form.querySelector('#tm-form-title')?.focus(); return; }

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const forceChecked  = form.querySelector('#tm-form-force')?.checked;
    const impactChecked = form.querySelector('#tm-form-impact')?.checked;
    const doneChecked   = form.querySelector('#tm-form-done')?.checked;
    const dateVal       = form.querySelector('#tm-form-date')?.value;
    const forceDateVal  = form.querySelector('#tm-form-force-date-input')?.value;
    const timeVal       = form.querySelector('#tm-form-time')?.value;
    const endTimeVal    = form.querySelector('#tm-form-end-time')?.value;
    const stypeVal      = form.querySelector('#tm-form-stype')?.value;
    const amountVal     = form.querySelector('#tm-form-amount')?.value;
    const budgetVal     = form.querySelector('#tm-form-budget')?.value;

    if (forceChecked && !forceDateVal && !dateVal) {
      alert('Force requires a date.');
      btn.disabled = false; btn.textContent = 'Save';
      return;
    }

    const body = { title, pane, source: 'manual' };
    if (forceChecked)  body.force         = true;
    if (impactChecked) body.high_impact   = true;
    if (doneChecked)   body.done          = true;
    if (dateVal || forceDateVal) body.date = forceDateVal || dateVal;
    if (timeVal)       body.schedule_time = timeVal;
    if (endTimeVal)    body.end_time      = endTimeVal;
    if (stypeVal)      body.schedule_type = stypeVal;
    if (amountVal)     body.amount        = parseFloat(amountVal) || 0;
    if (budgetVal)     body.budget_id     = budgetVal;

    try {
      const res  = await fetch('/api/daily-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.record) items.push(data.record);
      renderPanel();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Save';
      console.error('Save failed:', err.message);
    }
  }

  async function markDone(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res  = await fetch(`/api/daily-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true })
      });
      const data = await res.json();
      if (data.record) {
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) items[idx] = data.record;

        // F2: sync done status to project task
        const updated = data.record;
        if (updated?.source === 'project' && updated?.project_task_id) {
          try {
            await fetch(`/api/project-tasks/${updated.project_task_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'Done' })
            });
          } catch (err) {
            console.warn('ProjectTask sync failed (silently ignored):', err.message);
          }
        }
      }
      renderPanel();
    } catch (err) {
      if (btn) btn.disabled = false;
      console.error('Mark done failed:', err.message);
    }
  }

  async function removeItem(id, btn) {
    const item = items.find(i => i.id === id);

    // F2: bidirectional delete — project-sourced items delete from both sides
    if (item?.source === 'project' && item?.project_task_id) {
      if (!confirm(`Delete from both Time Management and Project?\nThis cannot be undone.`)) return;
      if (btn) btn.disabled = true;
      try {
        await fetch(`/api/project-tasks/${item.project_task_id}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Project task delete failed, continuing with DailyItem delete:', err.message);
      }
    } else {
      if (!confirm(`Remove "${item?.title || id}"?`)) return;
      if (btn) btn.disabled = true;
    }

    try {
      await fetch(`/api/daily-items/${id}`, { method: 'DELETE' });
      items = items.filter(i => i.id !== id);
      renderPanel();
    } catch (err) {
      if (btn) btn.disabled = false;
      console.error('Remove failed:', err.message);
    }
  }

  function openEditForm(id) {
    const item = items.find(i => i.id === id);
    if (!item || item.source === 'project') return;
    const p    = panel();
    const card = p?.querySelector(`.tm-item-card[data-id="${id}"]`);
    if (!card) return;
    const pane = item.pane;

    const formEl = document.createElement('div');
    formEl.innerHTML = addForm(pane);
    const form = formEl.firstElementChild;
    form.dataset.editId = id;

    const titleEl = form.querySelector('#tm-form-title');
    if (titleEl) titleEl.value = item.title || '';
    if (item.date)          { const el = form.querySelector('#tm-form-date');         if (el) el.value = item.date; }
    if (item.force)         { const el = form.querySelector('#tm-form-force');        if (el) el.checked = true; }
    if (item.high_impact)   { const el = form.querySelector('#tm-form-impact');       if (el) el.checked = true; }
    if (item.schedule_time) { const el = form.querySelector('#tm-form-time');         if (el) el.value = item.schedule_time; }
    if (item.end_time)      { const el = form.querySelector('#tm-form-end-time');     if (el) el.value = item.end_time; }
    if (item.schedule_type) { const el = form.querySelector('#tm-form-stype');        if (el) el.value = item.schedule_type; }
    if (item.amount)        { const el = form.querySelector('#tm-form-amount');       if (el) el.value = item.amount; }
    if (item.budget_id)     { const el = form.querySelector('#tm-form-budget');       if (el) el.value = item.budget_id; }

    const saveBtn = form.querySelector('[data-save-pane]');
    if (saveBtn) {
      saveBtn.removeAttribute('data-save-pane');
      saveBtn.dataset.editSavePane = pane;
    }

    card.replaceWith(form);

    form.addEventListener('click', async function (ev) {
      if (ev.target.dataset.editSavePane) await saveEditItem(id, form, pane, ev.target);
      if (ev.target.dataset.cancelPane)   { ev.preventDefault(); await loadAndRender(); }
    });
  }

  async function saveEditItem(id, form, pane, btn) {
    if (btn.disabled) return;
    const title = form.querySelector('#tm-form-title')?.value.trim();
    if (!title) return;
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const body = { title };
    const forceEl   = form.querySelector('#tm-form-force');
    const impactEl  = form.querySelector('#tm-form-impact');
    const dateEl    = form.querySelector('#tm-form-date');
    const timeEl    = form.querySelector('#tm-form-time');
    const endTimeEl = form.querySelector('#tm-form-end-time');
    const stypeEl   = form.querySelector('#tm-form-stype');
    const amtEl     = form.querySelector('#tm-form-amount');
    const budEl     = form.querySelector('#tm-form-budget');

    if (forceEl)   body.force         = forceEl.checked;
    if (impactEl)  body.high_impact   = impactEl.checked;
    if (dateEl)    body.date          = dateEl.value || null;
    if (timeEl)    body.schedule_time = timeEl.value || null;
    if (endTimeEl) body.end_time      = endTimeEl.value || null;
    if (stypeEl)   body.schedule_type = stypeEl.value || null;
    if (amtEl)     body.amount        = parseFloat(amtEl.value) || 0;
    if (budEl)     body.budget_id     = budEl.value || null;

    try {
      const res  = await fetch(`/api/daily-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.record) {
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) items[idx] = data.record;
      }
      renderPanel();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  // ── Routine modal ─────────────────────────────────────────────────────────
  function showRoutineModal() {
    const routines = items.filter(i => i.pane === 'Schedule' && i.schedule_type === 'Routine');
    const listHtml = routines.length
      ? routines.map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.82rem">${r.schedule_time ? r.schedule_time + ' · ' : ''}${r.title}</span>
            <button type="button" style="background:none;border:1px solid var(--red);border-radius:4px;color:var(--red);font-size:0.68rem;padding:0.15rem 0.45rem;cursor:pointer" data-del-routine="${r.id}">✕</button>
          </div>`).join('')
      : '<div style="font-size:0.82rem;color:var(--text-dim);padding:0.5rem 0">No routines set.</div>';

    const modal = document.createElement('div');
    modal.className = 'tm-routine-modal';
    modal.id        = 'tm-routine-modal';
    modal.innerHTML = `<div class="tm-routine-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
        <span style="font-weight:700;font-size:0.95rem">⚙ Routines</span>
        <button type="button" id="tm-routine-close" style="background:none;border:1px solid var(--border);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;color:var(--text-muted)">✕</button>
      </div>
      <div id="tm-routine-list">${listHtml}</div>
      <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:0.75rem">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:0.4rem">+ Add Routine</div>
        <input type="text" id="tm-routine-title" placeholder="Routine name" style="margin-bottom:0.4rem">
        <input type="time" id="tm-routine-time" style="margin-bottom:0.4rem">
        <button type="button" id="tm-routine-save" style="font-size:0.78rem;padding:0.3rem 0.75rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">Add</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', async function (ev) {
      if (ev.target.id === 'tm-routine-close' || ev.target === modal) { modal.remove(); return; }

      if (ev.target.dataset.delRoutine) {
        const rid = ev.target.dataset.delRoutine;
        await removeItem(rid);
        modal.remove();
        showRoutineModal();
        return;
      }

      if (ev.target.id === 'tm-routine-save') {
        const title = document.getElementById('tm-routine-title')?.value.trim();
        if (!title) return;
        const time  = document.getElementById('tm-routine-time')?.value.trim();
        const body  = { title, pane: 'Schedule', schedule_type: 'Routine', source: 'manual' };
        if (time) body.schedule_time = time;
        ev.target.disabled    = true;
        ev.target.textContent = 'Saving…';
        try {
          const res  = await fetch('/api/daily-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          if (data.record) items.push(data.record);
          modal.remove();
          renderPanel();
        } catch (err) {
          ev.target.disabled = false;
          ev.target.textContent = 'Add';
        }
      }
    });
  }

  // ── Load + render ─────────────────────────────────────────────────────────
  async function loadAndRender() {
    const p = panel();
    if (p) p.innerHTML = '<div style="padding:2rem;font-family:var(--font-mono);font-size:0.78rem;color:var(--text-dim)">Loading…</div>';
    await loadData();
    await injectProjectTasks();
    initialized = true;
    renderPanel();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    ensureStyles();

    window.addEventListener('panelactivated', function (e) {
      if (e.detail !== 'timemanagement') return;
      loadAndRender();
    });

    const p = panel();
    if (p && p.classList.contains('active')) {
      loadAndRender();
    }

    // F5: re-check active routine blink every 60s
    setInterval(function () {
      if (!initialized) return;
      const p2 = panel();
      if (p2 && p2.classList.contains('active')) renderPanel();
    }, 60000);
  }

  init();
})();
