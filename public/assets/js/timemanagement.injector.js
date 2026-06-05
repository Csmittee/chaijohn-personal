/* ── M4.3 Time Management — timemanagement.injector.js ── */
(function () {
  'use strict';

  let initialized      = false;
  let items            = [];
  let projectTasks     = [];
  let budgets          = [];
  let liabilities      = [];
  let flowView         = 'today';
  let calView          = 'month';
  let calSelected      = null;
  let showProjectTasks = true;
  let skippedGhosts    = new Set();

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
    const now = new Date();
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }

  function monthDates() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const days = [];
    for (let d = new Date(year, month, 1), last = new Date(year, month + 1, 0); d <= last; d.setDate(d.getDate() + 1))
      days.push(d.toISOString().split('T')[0]);
    return days;
  }

  // ── Type classification ───────────────────────────────────────────────────
  function isTypeA(item) {
    return item.pane === 'Schedule' && item.schedule_type === 'Routine' && !item.date;
  }
  function isTypeB(item) {
    return item.pane === 'Schedule' && !!item.period_end;
  }
  function isSchedulePaneVisible(item) {
    if (item.pane !== 'Schedule') return false;
    if (item.schedule_type === 'Routine' && !item.date) return false;
    return true;
  }
  function isTodayDone(item) {
    if (item.period_end) {
      try { return JSON.parse(item.hit_log || '[]').includes(today()); } catch { return false; }
    }
    return item.done === true;
  }
  function hitCount(item) {
    try { return JSON.parse(item.hit_log || '[]').filter(d => d >= item.date && d <= item.period_end).length; }
    catch { return 0; }
  }
  function totalDays(item) {
    return Math.ceil((new Date(item.period_end + 'T00:00:00') - new Date(item.date + 'T00:00:00')) / 86400000) + 1;
  }

  // ── Active / conflict detection ───────────────────────────────────────────
  function isActiveNow(item) {
    if (!item.schedule_time) return false;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const start = toMins(item.schedule_time);
    const end   = item.end_time ? toMins(item.end_time) : start + 15;
    return nowMins >= start && nowMins <= end;
  }

  function hasTimeConflict(a, b) {
    if (!a.schedule_time || !b.schedule_time) return false;
    const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const aStart = toMins(a.schedule_time), aEnd = a.end_time ? toMins(a.end_time) : aStart + 30;
    const bStart = toMins(b.schedule_time), bEnd = b.end_time ? toMins(b.end_time) : bStart + 30;
    return aStart < bEnd && bStart < aEnd;
  }

  function buildConflictSet(arr) {
    const s = new Set();
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        if (hasTimeConflict(arr[i], arr[j])) { s.add(arr[i].id); s.add(arr[j].id); }
    return s;
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function showFlash(msg) {
    let el = document.getElementById('tm-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tm-flash';
      el.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--bg-raised);border:1px solid var(--border-strong);border-radius:var(--radius);padding:0.45rem 1rem;font-family:var(--font-mono);font-size:0.78rem;color:var(--text);z-index:800;pointer-events:none;transition:opacity 0.3s';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  function showFormError(form, msg) {
    let el = form.querySelector('.tm-form-error');
    if (!el) {
      el = document.createElement('div');
      el.className = 'tm-form-error';
      const btns = form.querySelector('.tm-form-btns');
      if (btns) btns.insertAdjacentElement('beforebegin', el);
      else form.appendChild(el);
    }
    el.textContent = msg;
  }

  // ── Ghost helpers ─────────────────────────────────────────────────────────
  function getPeriodLabel(dueDate, todayStr) {
    if (dueDate < todayStr) return { text: `OVERDUE · ${formatMonth(dueDate)}`, cls: 'tm-period-overdue' };
    if (dueDate === todayStr) return { text: 'DUE TODAY', cls: 'tm-period-today' };
    const days = Math.ceil((new Date(dueDate) - new Date(todayStr)) / 86400000);
    if (days <= 7) return { text: `DUE SOON · ${formatDay(dueDate)}`, cls: 'tm-period-soon' };
    return { text: `UPCOMING · ${formatMonth(dueDate)}`, cls: 'tm-period-upcoming' };
  }

  function generateGhostDueDates(dueDay) {
    const now = new Date();
    const ws = new Date(now); ws.setDate(now.getDate() - 30);
    const we = new Date(now); we.setDate(now.getDate() + 21);
    const out = [];
    for (let mo = -1; mo <= 2; mo++) {
      const d = new Date(now.getFullYear(), now.getMonth() + mo, dueDay);
      if (d >= ws && d <= we) out.push(d.toISOString().split('T')[0]);
    }
    return out;
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('tm-styles')) return;
    const s = document.createElement('style');
    s.id = 'tm-styles';
    s.textContent = `
      @keyframes tm-blink        { 50% { opacity: 0.2; } }
      @keyframes tm-blink-yellow { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes tm-blink-amber  { 0%, 100% { opacity: 1; border-color: var(--yellow); } 50% { opacity: 0.5; border-color: transparent; } }
      .tm-high-impact        { animation: tm-blink 1s step-start infinite; }
      .tm-node-active        { animation: tm-blink-yellow 1s step-start infinite; border: 2px solid var(--yellow) !important; }
      .tm-node-conflict      { animation: tm-blink-amber 0.8s step-start infinite; border: 2px solid var(--yellow) !important; filter: brightness(0.7); }
      .tm-active-routine-row { border-left: 3px solid var(--yellow) !important; }
      .tm-node-red    { background: #ef4444; color: #fff; }
      .tm-node-yellow { background: var(--yellow); color: #0a0a10; }
      .tm-node-blue   { background: #3b82f6; color: #fff; }
      .tm-project-card  { border-left: 3px solid #3b82f6 !important; }
      .tm-project-title { color: #3b82f6; }
      .tm-pane-body { overflow-y: auto; flex: 1; min-height: 0; }
      .tm-weekday-col { background: rgba(255,255,255,0.03); }
      .tm-today-col   { background: rgba(245,197,24,0.08); }
      #panel-timemanagement.active { display: flex; flex-direction: column; }
      .tm-zone { flex-shrink: 0; }
      .tm-panes-area { display: grid; grid-template-columns: 1fr 1fr minmax(220px,1.3fr) minmax(220px,1.3fr); gap: 0.75rem; flex: 1; min-height: 0; overflow: hidden; }
      .tm-pane { display: flex; flex-direction: column; background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; min-height: 0; }
      .tm-pane-header { display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.75rem; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
      .tm-pane-name   { font-family: var(--font-mono); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }
      .tm-count-badge { font-family: var(--font-mono); font-size: 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.1rem 0.45rem; color: var(--text-dim); }
      .tm-add-btn  { font-family: var(--font-mono); font-size: 0.68rem; padding: 0.2rem 0.5rem; background: rgba(245,197,24,0.08); border: 1px solid rgba(245,197,24,0.3); border-radius: var(--radius); color: var(--yellow); cursor: pointer; white-space: nowrap; margin-left: auto; }
      .tm-add-btn:hover { background: rgba(245,197,24,0.18); }
      .tm-item-card { padding: 0.45rem 0.65rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.2rem; }
      .tm-item-card:last-child { border-bottom: none; }
      .tm-item-top    { display: flex; align-items: flex-start; gap: 0.35rem; }
      .tm-item-title  { font-size: 0.82rem; flex: 1; line-height: 1.35; word-break: break-word; }
      .tm-item-title.done-title { text-decoration: line-through; opacity: 0.45; }
      .tm-item-sub    { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); }
      .tm-item-actions { display: flex; gap: 0.25rem; align-self: flex-start; }
      .tm-action-btn  { background: none; border: 1px solid var(--border); border-radius: 4px; font-size: 0.68rem; min-width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-dim); flex-shrink: 0; padding: 0 0.25rem; }
      .tm-action-btn:hover      { border-color: var(--border-strong); color: var(--text); }
      .tm-action-btn.done-btn:hover { border-color: var(--green); color: var(--green); }
      .tm-action-btn.del-btn:hover  { border-color: var(--red); color: var(--red); }
      .tm-badge        { font-size: 0.68rem; flex-shrink: 0; }
      .tm-badge-force  { color: var(--yellow); }
      .tm-badge-impact { color: var(--red); }
      .tm-badge-done   { color: var(--green); }
      .tm-hit-badge    { font-family: var(--font-mono); font-size: 0.62rem; background: rgba(59,130,246,0.15); color: #3b82f6; border-radius: 3px; padding: 0.1rem 0.35rem; flex-shrink: 0; white-space: nowrap; }
      .tm-inline-form  { padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border); background: var(--bg); }
      .tm-inline-form textarea, .tm-inline-form input, .tm-inline-form select { font-size: 0.8rem; padding: 0.3rem 0.5rem; margin-bottom: 0.35rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--text); width: 100%; box-sizing: border-box; }
      .tm-inline-form textarea { resize: vertical; min-height: 2.5rem; }
      .tm-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-bottom: 0.35rem; }
      .tm-cb-row  { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.4rem; }
      .tm-cb-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
      .tm-cb-item input[type=checkbox] { width: auto; margin: 0; accent-color: var(--yellow); }
      .tm-form-btns  { display: flex; gap: 0.4rem; }
      .tm-save-btn   { font-size: 0.78rem; padding: 0.3rem 0.75rem; background: var(--yellow); color: #0a0a10; border: none; border-radius: var(--radius); cursor: pointer; font-weight: 600; }
      .tm-cancel-btn { font-size: 0.78rem; padding: 0.3rem 0.6rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; color: var(--text-muted); }
      .tm-form-error { color: var(--red); font-family: var(--font-mono); font-size: 0.72rem; margin-bottom: 0.4rem; }
      .tm-empty { padding: 1.25rem 0.75rem; font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); text-align: center; }
      .tm-flow-strip  { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.75rem; margin-bottom: 0.75rem; }
      .tm-flow-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.4rem; }
      .tm-flow-title  { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); }
      .tm-flow-toggle { display: flex; gap: 0.3rem; }
      .tm-flow-btn    { font-family: var(--font-mono); font-size: 0.68rem; padding: 0.2rem 0.6rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-dim); cursor: pointer; }
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
      .tm-cal-day     { border-radius: 4px; padding: 0.2rem; min-height: 32px; cursor: pointer; display: flex; flex-direction: column; align-items: center; }
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
      .tm-period-badge    { font-family: var(--font-mono); font-size: 0.62rem; font-weight: 600; padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0; white-space: nowrap; }
      .tm-period-overdue  { background: rgba(239,68,68,0.15); color: var(--red); }
      .tm-period-today    { background: rgba(34,197,94,0.15); color: var(--green); }
      .tm-period-soon     { background: rgba(245,197,24,0.15); color: var(--yellow); }
      .tm-period-upcoming { background: rgba(255,255,255,0.08); color: var(--text-dim); }
      .tm-attr-form { padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius); margin-top: 0.3rem; }
      .tm-attr-row  { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
      .tm-attr-tog  { font-family: var(--font-mono); font-size: 0.72rem; padding: 0.2rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; background: var(--bg-raised); color: var(--text-dim); }
      .tm-attr-tog.on { border-color: var(--yellow); color: var(--yellow); background: rgba(245,197,24,0.08); }
      @media (max-width: 860px) { .tm-panes-area { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 540px) { .tm-panes-area { grid-template-columns: 1fr; } .tm-doit-strip { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(s);
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadData() {
    const [ir, tr, br, lr] = await Promise.allSettled([
      fetch('/api/daily-items').then(r => r.json()),
      fetch('/api/project-tasks?due_today=true').then(r => r.json()),
      fetch('/api/budgets').then(r => r.json()),
      fetch('/api/liabilities').then(r => r.json())
    ]);
    items        = ir.status === 'fulfilled' ? (ir.value.records || []) : [];
    projectTasks = tr.status === 'fulfilled' ? (tr.value.records || []) : [];
    budgets      = br.status === 'fulfilled' ? (br.value.records || []) : [];
    liabilities  = lr.status === 'fulfilled' ? (lr.value.records || []) : [];
  }

  async function injectProjectTasks() {
    const existing = new Set(items.map(i => i.project_task_id).filter(Boolean));
    for (const task of projectTasks.filter(t => !existing.has(t.id))) {
      try {
        const res = await fetch('/api/daily-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title, pane: 'Do', source: 'project',
            project_task_id: task.id,
            project_id: Array.isArray(task.project_id) ? task.project_id[0] : (task.project_id || ''),
            project_name: task.project_name || '',
            date: task.finish_by || null
          })
        });
        if (res.ok) { const d = await res.json(); if (d.record) items.push(d.record); }
      } catch (err) { console.error('Inject failed:', err.message); }
    }
  }

  // ── Budget dropdown ───────────────────────────────────────────────────────
  function buildBudgetDropdown(selectedId) {
    const seen = new Set();
    const budOpts = budgets
      .filter(b => { const f = b.fields || b; return f.active !== false; })
      .map(b => { const f = b.fields || b; return { id: b.id, label: f.label || f.name || b.id }; })
      .filter(o => { if (seen.has(o.label)) return false; seen.add(o.label); return true; });
    const liabOpts = liabilities
      .filter(l => { const f = l.fields || l; return f.active !== false; })
      .map(l => { const f = l.fields || l; return { id: l.id, label: f.name || l.id }; });
    const opt = o => `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${o.label}</option>`;
    return `<select id="tm-form-budget" name="budget_id">
      <option value="">— Budget —</option>
      <optgroup label="Budget">${budOpts.map(opt).join('')}</optgroup>
      <optgroup label="Debt Payment">${liabOpts.map(opt).join('')}</optgroup>
    </select>`;
  }

  // ── Ghost items ───────────────────────────────────────────────────────────
  function renderGhostItems() {
    const todayStr = today();
    const ghosts = [];
    liabilities.forEach(l => {
      const f = l.fields || l;
      const dueDay = Number(f.payment_due_day);
      if (!dueDay || f.active === false) return;
      generateGhostDueDates(dueDay).forEach(dueDate => {
        const gid = `ghost-liab-${l.id}-${dueDate}`;
        if (!skippedGhosts.has(gid)) ghosts.push({ id: gid, label: f.name || l.id, amount: f.monthly_payment || 0, dueDate, budgetId: '' });
      });
    });
    budgets.forEach(b => {
      const f = b.fields || b;
      const dueDay = Number(f.period_due_day);
      if (!dueDay || f.active === false) return;
      generateGhostDueDates(dueDay).forEach(dueDate => {
        const gid = `ghost-budget-${b.id}-${dueDate}`;
        if (!skippedGhosts.has(gid)) ghosts.push({ id: gid, label: f.label || f.name || b.id, amount: f.amount || 0, dueDate, budgetId: b.id });
      });
    });
    if (!ghosts.length) return '';
    return ghosts.map(g => {
      const { text, cls } = getPeriodLabel(g.dueDate, todayStr);
      const amt = g.amount ? ` · ฿${Number(g.amount).toLocaleString()}` : '';
      return `<div class="tm-item-card tm-ghost-item" data-ghost-id="${g.id}" data-ghost-label="${g.label.replace(/"/g,'&quot;')}" data-ghost-amount="${g.amount}" data-ghost-budget="${g.budgetId}">
        <div class="tm-item-top">
          <span class="tm-period-badge ${cls}">${text}</span>
          <span class="tm-item-title" style="flex:1;margin-left:0.35rem">${truncate(g.label,22)}${amt}</span>
          <div class="tm-item-actions">
            <button type="button" class="tm-action-btn" data-ghost-book="${g.id}" style="font-size:0.58rem;width:auto;padding:0 0.35rem;color:var(--green);border-color:rgba(34,197,94,0.4)" title="Book">Book</button>
            <button type="button" class="tm-action-btn del-btn" data-ghost-skip="${g.id}" title="Skip">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── KPI strip ─────────────────────────────────────────────────────────────
  function renderKpi() {
    const todayStr = today();

    // B3: Schedule Hit — includes Type B period items active today
    const schedItems = items.filter(i => {
      if (!isSchedulePaneVisible(i)) return false;
      if (i.date === todayStr) return true;
      if (!i.date && (i.created_at || '').startsWith(todayStr)) return true;
      if (i.date && i.period_end) return i.date <= todayStr && i.period_end >= todayStr;
      return false;
    });
    const schedHit   = schedItems.filter(i => {
      if (i.period_end) { try { return JSON.parse(i.hit_log || '[]').includes(todayStr); } catch { return false; } }
      return i.done === true;
    }).length;
    const schedTotal = schedItems.length;

    const delayed  = items.filter(i => !isTodayDone(i) && i.force && i.date && i.date < todayStr).length;
    const highOpen = items.filter(i => i.high_impact && !isTodayDone(i)).length;

    // B4: project tasks due on or before today
    const projDueCount = items.filter(i => i.source === 'project' && !isTodayDone(i) && i.date && i.date <= todayStr).length;

    return `<div class="tm-kpi-strip tm-zone">
      <div class="tm-chip"><span class="tm-chip-label">SCHEDULE HIT</span><span class="tm-chip-val">${schedHit}/${schedTotal}</span></div>
      <div class="tm-chip"><span class="tm-chip-label">DELAYED TASKS</span><span class="tm-chip-val" style="color:${delayed>0?'var(--red)':'var(--text)'}">${delayed}</span></div>
      <div class="tm-chip"><span class="tm-chip-label">HIGH IMPACT OPEN</span><span class="tm-chip-val" style="color:${highOpen>0?'var(--red)':'var(--text)'}">${highOpen}</span></div>
      <div class="tm-chip" style="min-width:140px;${!showProjectTasks?'opacity:0.4':''}"><span class="tm-chip-label">PROJECT TASKS TODAY</span><span class="tm-chip-val">${projDueCount||'—'}</span></div>
    </div>`;
  }

  // ── Flow strip ────────────────────────────────────────────────────────────
  function renderFlow() {
    const todayStr = today();

    function getFlowItems(dayFilter) {
      return items.filter(i => {
        if (!showProjectTasks && i.source === 'project') return false;
        if (i.high_impact && !isTodayDone(i)) return true;
        if (isTypeA(i)) return true;
        if (isTypeB(i) && i.date && i.period_end && i.date <= todayStr && i.period_end >= todayStr) return true;
        if (i.pane === 'Schedule' && !isTypeA(i) && !isTypeB(i)) {
          return i.date === (dayFilter || todayStr);
        }
        if (i.schedule_time && i.pane !== 'Schedule') {
          if (dayFilter) return !i.date || i.date === dayFilter;
          return !i.date || i.date <= todayStr;
        }
        return false;
      }).sort((a, b) => (a.schedule_time || '99:99').localeCompare(b.schedule_time || '99:99'));
    }

    function nodeHtml(item, cs) {
      const inConflict = cs && cs.has(item.id);
      const active     = isActiveNow(item);
      const done       = isTodayDone(item);
      let cls = 'tm-node';
      if      (inConflict)                    cls += ' tm-node-conflict';
      else if (item.high_impact && !done)     cls += ' tm-node-red tm-high-impact';
      else if (active && isTypeA(item))       cls += ' tm-node-blue tm-node-active';
      else if (active)                        cls += ' tm-node-yellow tm-node-active';
      else if (isTypeA(item))                 cls += ' tm-node-blue';
      else                                    cls += ' tm-node-yellow';
      const lbl  = truncate(item.title, 12);
      const time = item.schedule_time ? (item.end_time ? ` ${item.schedule_time}–${item.end_time}` : ` ${item.schedule_time}`) : '';
      return `<span class="${cls}" title="${item.title} · ${item.pane}">${lbl}${time}</span>`;
    }

    let nodesHtml;
    if (flowView === 'today') {
      const fi = getFlowItems(null);
      const cs = buildConflictSet(fi);
      nodesHtml = `<div class="tm-flow-nodes">${fi.length ? fi.map(i => nodeHtml(i, cs)).join('') : '<span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim)">No flow items today.</span>'}</div>`;
    } else {
      const cols = weekDates().map(d => {
        const isToday = d === todayStr;
        const isWknd  = [0,6].includes(new Date(d+'T00:00:00').getDay());
        const fi = getFlowItems(d);
        const cs = buildConflictSet(fi);
        const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(d+'T00:00:00').getDay()];
        return `<div class="${isToday?'tm-week-col tm-today-col':isWknd?'tm-week-col':'tm-week-col tm-weekday-col'}">
          <div class="tm-week-col-label">${dow} ${d.slice(8)}</div>
          ${fi.map(i => nodeHtml(i, cs)).join('')}
        </div>`;
      });
      nodesHtml = `<div class="tm-week-grid">${cols.join('')}</div>`;
    }

    return `<div class="tm-flow-strip tm-zone">
      <div class="tm-flow-header">
        <span class="tm-flow-title">⟡ Flow</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <div class="tm-flow-toggle">
            <button type="button" class="tm-flow-btn ${flowView==='today'?'active':''}" data-fv="today">Today</button>
            <button type="button" class="tm-flow-btn ${flowView==='week'?'active':''}" data-fv="week">This Week</button>
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
    const mkCard = item => {
      const isProj = item.source === 'project';
      const orph   = isProj && !item.project_task_id;
      return `<div class="tm-doit-card ${isProj?'tm-project-card':''}" style="border-radius:4px;padding:0.3rem 0.4rem">
        <span class="tm-badge">${item.force?'<span class="tm-badge-force">⚡</span>':''}${item.high_impact?'<span class="tm-badge-impact">●</span>':''}</span>
        <span class="${isProj?'tm-project-title':''}" style="font-size:0.8rem;flex:1" title="${item.title}">${truncate(item.title,24)}${orph?' ⚠':''}</span>
        <button type="button" class="tm-action-btn done-btn" data-id="${item.id}" data-action="done" title="Mark done">✓</button>
        <button type="button" class="tm-action-btn del-btn"  data-id="${item.id}" data-action="del"  title="Remove">✕</button>
      </div>`;
    };
    const doItems  = items.filter(i => i.pane==='Do'     && !isTodayDone(i) && (i.high_impact||(i.force&&i.date&&i.date<=todayStr)) && (showProjectTasks||i.source!=='project')).sort((a,b)=>(b.high_impact?1:0)-(a.high_impact?1:0)).slice(0,5);
    const buyItems = items.filter(i => i.pane==='BuyPay' && !isTodayDone(i) && (i.high_impact||(i.force&&i.date&&i.date<=todayStr))).sort((a,b)=>(b.high_impact?1:0)-(a.high_impact?1:0)).slice(0,5);
    if (!doItems.length && !buyItems.length) return '';
    return `<div class="tm-doit-strip tm-zone">
      ${doItems.length  ? `<div class="tm-doit-col"><div class="tm-doit-title">⚡ Do Today</div>${doItems.map(mkCard).join('')}</div>` : ''}
      ${buyItems.length ? `<div class="tm-doit-col"><div class="tm-doit-title">💳 Buy/Pay Today</div>${buyItems.map(mkCard).join('')}</div>` : ''}
    </div>`;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  function renderCalendar() {
    const todayStr = today();
    const DOWS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const dotRow = d => {
      const di = items.filter(i => i.date === d);
      if (!di.length) return '';
      const dots = [];
      if (di.some(i => i.high_impact && !isTodayDone(i))) dots.push('<span class="tm-cal-dot" style="background:#ef4444"></span>');
      if (di.some(i => i.schedule_type === 'Routine'))     dots.push('<span class="tm-cal-dot" style="background:#3b82f6"></span>');
      if (di.some(i => i.schedule_type === 'General'))     dots.push('<span class="tm-cal-dot" style="background:var(--yellow)"></span>');
      if (di.some(i => i.pane==='Do'||i.pane==='BuyPay')) dots.push('<span class="tm-cal-dot" style="background:rgba(255,255,255,0.3)"></span>');
      return `<div class="tm-cal-dots">${[...new Set(dots)].join('')}</div>`;
    };
    const dayCell = d => {
      const sel = calSelected===d?' selected-day':'', tod = d===todayStr?' today-day':'';
      return `<div class="tm-cal-day${tod}${sel}" data-date="${d}"><div class="tm-cal-day-num">${d.slice(8)}</div>${dotRow(d)}</div>`;
    };
    let grid;
    if (calView === 'week') {
      const dates = weekDates();
      grid = `<div class="tm-cal-grid">${DOWS.map(d=>`<div class="tm-cal-dow">${d}</div>`).join('')}${dates.map(dayCell).join('')}</div>`;
    } else {
      const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
      const fdow = new Date(y, mo, 1).getDay();
      grid = `<div class="tm-cal-grid">${DOWS.map(d=>`<div class="tm-cal-dow">${d}</div>`).join('')}${Array(fdow).fill('<div></div>').join('')}${monthDates().map(dayCell).join('')}</div>`;
    }
    const clrBtn = calSelected ? `<button type="button" id="tm-cal-clear" style="font-family:var(--font-mono);font-size:0.68rem;padding:0.15rem 0.45rem;background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.3);border-radius:var(--radius);color:var(--yellow);cursor:pointer">✕ Clear filter</button>` : '';
    return `<div class="tm-cal tm-zone">
      <div class="tm-cal-header">
        <span class="tm-cal-title">📅 Calendar${calSelected?' · '+fmt(calSelected):''}</span>
        <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap">
          ${clrBtn}
          <button type="button" class="tm-flow-btn ${showProjectTasks?'active':''}" data-toggle-projects="">Projects ${showProjectTasks?'ON':'OFF'}</button>
          <div class="tm-flow-toggle">
            <button type="button" class="tm-flow-btn ${calView==='month'?'active':''}" data-cv="month">Month</button>
            <button type="button" class="tm-flow-btn ${calView==='week'?'active':''}" data-cv="week">Week</button>
          </div>
        </div>
      </div>
      ${grid}
    </div>`;
  }

  // ── Item card ─────────────────────────────────────────────────────────────
  function itemCard(item) {
    const isProj  = item.source === 'project';
    const typeBItem = isTypeB(item);
    const todayDone = isTodayDone(item);
    const orphan  = isProj && !item.project_task_id;

    const impactMark = item.high_impact ? `<span class="tm-badge tm-badge-impact ${todayDone?'':'tm-high-impact'}" title="High Impact">●</span>` : '';
    const forceMark  = item.force       ? `<span class="tm-badge tm-badge-force" title="Force">⚡</span>` : '';
    const doneMark   = todayDone        ? `<span class="tm-badge tm-badge-done" title="Done">✓</span>` : '';
    const hitBadge   = typeBItem        ? `<span class="tm-hit-badge">Hit ${hitCount(item)}/${totalDays(item)}</span>` : '';

    let sub = '';
    if (typeBItem) sub = `${fmt(item.date)} – ${fmt(item.period_end)}`;
    else if (item.date) sub = fmt(item.date);
    if (item.schedule_time) sub += (sub?' · ':'')+( item.end_time?`${item.schedule_time}–${item.end_time}`:item.schedule_time);
    if (item.pane==='BuyPay'&&item.budget_label) sub += (sub?' · ':'')+item.budget_label;
    if (isProj&&item.project_name) sub = `${item.project_name} · due ${item.date?fmt(item.date):'—'}`;

    const editIcon  = isProj ? '⚙' : '✎';
    const editTitle = isProj ? 'Edit attributes' : 'Edit';
    const editBtn   = `<button type="button" class="tm-action-btn" data-id="${item.id}" data-action="edit" title="${editTitle}" style="font-size:0.6rem">${editIcon}</button>`;

    // Type B: "+1" button, hide if already done today
    const doneBtn = (!typeBItem || !todayDone)
      ? `<button type="button" class="tm-action-btn done-btn" data-id="${item.id}" data-action="${typeBItem?'typeb-done':'done'}" title="${typeBItem?'Log hit for today':'Mark done'}">${typeBItem?'+1':'✓'}</button>`
      : '';

    const rowCls = ['tm-item-card', isProj?'tm-project-card':'', isActiveNow(item)?'tm-active-routine-row':''].filter(Boolean).join(' ');

    return `<div class="${rowCls}" data-id="${item.id}">
      <div class="tm-item-top">
        <span>${forceMark}${impactMark}${doneMark}</span>
        <span class="tm-item-title ${todayDone?'done-title':''} ${isProj?'tm-project-title':''}" title="${item.title}">${truncate(item.title,28)}${orphan?' ⚠':''}</span>
        ${hitBadge}
        <div class="tm-item-actions">${editBtn}${doneBtn}<button type="button" class="tm-action-btn del-btn" data-id="${item.id}" data-action="del" title="Remove">✕</button></div>
      </div>
      ${sub?`<div class="tm-item-sub">${sub}</div>`:''}
    </div>`;
  }

  // ── Add form ──────────────────────────────────────────────────────────────
  function addForm(pane) {
    const isBP  = pane === 'BuyPay';
    const isSch = pane === 'Schedule';
    return `<div class="tm-inline-form" data-form-pane="${pane}">
      <textarea id="tm-form-title" placeholder="Title…" rows="2"></textarea>
      ${isSch ? `
        <div class="tm-form-row">
          <input type="time" id="tm-form-time" placeholder="Start time">
          <select id="tm-form-stype"><option value="General">General</option><option value="Routine">Routine</option></select>
        </div>
        <div class="tm-form-row">
          <input type="time" id="tm-form-end-time" placeholder="End time (opt)">
          <input type="date" id="tm-form-date">
        </div>
        <div style="margin-bottom:0.35rem">
          <label style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);display:block;margin-bottom:0.2rem">End date (optional — creates period schedule)</label>
          <input type="date" id="tm-form-period-end">
        </div>
      ` : ''}
      ${isBP ? `
        <div class="tm-form-row">
          <input type="text" id="tm-form-amount" placeholder="Amount ฿" inputmode="numeric" pattern="[0-9.]*">
          ${buildBudgetDropdown('')}
        </div>
        <input type="date" id="tm-form-date" style="margin-bottom:0.35rem">
      ` : ''}
      ${!isSch && !isBP ? `<input type="date" id="tm-form-date" style="margin-bottom:0.35rem">` : ''}
      <div class="tm-cb-row">
        <label class="tm-cb-item"><input type="checkbox" id="tm-form-force"> <span>⚡</span></label>
        <label class="tm-cb-item"><input type="checkbox" id="tm-form-impact"> <span style="color:var(--red)">●</span></label>
        <label class="tm-cb-item"><input type="checkbox" id="tm-form-done"> <span style="color:var(--green)">✓</span></label>
      </div>
      <div id="tm-form-force-date" style="display:none;margin-bottom:0.35rem">
        <input type="date" id="tm-form-force-date-input">
      </div>
      <div class="tm-form-btns">
        <button type="button" class="tm-save-btn" data-save-pane="${pane}">Save</button>
        <button type="button" class="tm-cancel-btn" data-cancel-pane="${pane}">Cancel</button>
      </div>
    </div>`;
  }

  function validateScheduleForm(form) {
    const startTime = form.querySelector('#tm-form-time')?.value;
    const date      = form.querySelector('#tm-form-date')?.value;
    const periodEnd = form.querySelector('#tm-form-period-end')?.value;
    if (startTime && !date)                              return 'Start time requires a date';
    if (periodEnd  && !date)                             return 'End date requires a start date';
    if (periodEnd  && date && periodEnd < date)          return 'End date must be after start date';
    if (periodEnd  && !startTime)                        return 'Period schedule requires a start time';
    return null;
  }

  // ── Panes ─────────────────────────────────────────────────────────────────
  function renderPanes() {
    const todayStr  = today();
    const panes     = ['Do', 'Follow', 'Schedule', 'BuyPay'];
    const icons     = { Do: '⚡', Follow: '👁', Schedule: '📅', BuyPay: '💳' };

    return `<div class="tm-panes-area">${panes.map(pane => {
      let paneItems = items.filter(i => {
        if (i.pane !== pane) return false;
        if (pane === 'Schedule') return isSchedulePaneVisible(i);
        return true;
      });
      if (calSelected) paneItems = paneItems.filter(i => i.date === calSelected);
      if (pane === 'Do' && !showProjectTasks) paneItems = paneItems.filter(i => i.source !== 'project');
      paneItems.sort((a, b) => {
        const af = (!isTodayDone(a) && a.high_impact)||(!isTodayDone(a)&&a.date&&a.date<todayStr)?1:0;
        const bf = (!isTodayDone(b) && b.high_impact)||(!isTodayDone(b)&&b.date&&b.date<todayStr)?1:0;
        if (bf !== af) return bf - af;
        return (b.date||'').localeCompare(a.date||'');
      });

      const ghostsHtml = pane === 'BuyPay' ? renderGhostItems() : '';
      const body = ghostsHtml + (paneItems.length ? paneItems.map(itemCard).join('') : (!ghostsHtml ? `<div class="tm-empty">Nothing here. Tap + to add.</div>` : ''));

      // B4: DO pane [hide projects] link
      const projCount = pane === 'Do' ? items.filter(i => i.pane === 'Do' && i.source === 'project').length : 0;
      const projToggle = pane === 'Do' && projCount > 0
        ? `<button type="button" style="font-family:var(--font-mono);font-size:0.62rem;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0;text-decoration:underline" data-toggle-projects="">[${showProjectTasks?'hide':'show'} projects]</button>`
        : '';

      const countLabel = projCount > 0 ? `${paneItems.length} ← ${projCount} proj` : `${paneItems.length}`;

      return `<div class="tm-pane" data-pane="${pane}">
        <div class="tm-pane-header">
          <span class="tm-pane-name">${icons[pane]} ${pane}</span>
          ${projToggle}
          <span class="tm-count-badge">${countLabel}</span>
          <button type="button" class="tm-add-btn" data-add-pane="${pane}">+ Add</button>
        </div>
        <div class="tm-pane-body">${body}</div>
      </div>`;
    }).join('')}</div>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderPanel() {
    const p = panel();
    if (!p) return;
    p.innerHTML = `<div style="padding:1.25rem;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
      <div class="panel-header tm-zone" style="flex-shrink:0;margin-bottom:0.75rem">
        <div class="panel-title">Time Management</div>
        <div class="panel-subtitle">// tasks · schedule · today goal · flow</div>
      </div>
      ${renderKpi()}${renderFlow()}${renderDoIt()}${renderCalendar()}${renderPanes()}
    </div>`;
    wireEvents(p);
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function wireEvents(root) {
    if (root._tmWired) return;
    root._tmWired = true;
    root.addEventListener('click', async function (e) {
      const t = e.target;
      if (t.dataset.fv) { flowView = t.dataset.fv; renderPanel(); return; }
      if (t.dataset.cv) { calView  = t.dataset.cv; renderPanel(); return; }
      if ('toggleProjects' in t.dataset) { showProjectTasks = !showProjectTasks; renderPanel(); return; }
      const dateStr = t.dataset.date || t.closest('[data-date]')?.dataset.date;
      if (dateStr && t.closest('.tm-cal-day')) { calSelected = calSelected===dateStr?null:dateStr; renderPanel(); return; }
      if (t.id === 'tm-cal-clear')  { calSelected = null; renderPanel(); return; }
      if (t.id === 'tm-routine-btn') { showRoutineModal(); return; }
      if (t.dataset.addPane)    { openAddForm(t.dataset.addPane); return; }
      if (t.dataset.cancelPane) { e.preventDefault(); removeForm(t.dataset.cancelPane); return; }
      if (t.dataset.savePane)   { await saveItem(t.dataset.savePane, t); return; }
      if (t.dataset.ghostBook)  { const c = t.closest('[data-ghost-id]'); if (c) openAddForm('BuyPay',{title:c.dataset.ghostLabel,amount:c.dataset.ghostAmount,budget_id:c.dataset.ghostBudget}); return; }
      if (t.dataset.ghostSkip)  { skippedGhosts.add(t.dataset.ghostSkip); renderPanel(); return; }
      const { action, id } = t.dataset;
      if (action && id) {
        if (action === 'done')       await markDone(id, t);
        if (action === 'typeb-done') await markTypeBDone(id, t);
        if (action === 'del')        await removeItem(id, t);
        if (action === 'edit')       openEditForm(id);
      }
      if (t.id === 'tm-form-force') {
        const w = document.getElementById('tm-form-force-date');
        if (w) w.style.display = t.checked ? 'block' : 'none';
      }
    });
  }

  function openAddForm(pane, prefill) {
    const paneEl = panel()?.querySelector(`.tm-pane[data-pane="${pane}"]`);
    if (!paneEl) return;
    const body = paneEl.querySelector('.tm-pane-body');
    body?.querySelector('.tm-inline-form')?.remove();
    body?.insertAdjacentHTML('afterbegin', addForm(pane));
    if (prefill) {
      if (prefill.title)     { const el = body?.querySelector('#tm-form-title');  if (el) el.value = prefill.title; }
      if (prefill.amount)    { const el = body?.querySelector('#tm-form-amount'); if (el) el.value = prefill.amount; }
      if (prefill.budget_id) { const el = body?.querySelector('#tm-form-budget'); if (el) el.value = prefill.budget_id; }
    }
    body?.querySelector('#tm-form-title')?.focus();
  }

  function removeForm(pane) {
    panel()?.querySelector(`.tm-pane[data-pane="${pane}"] .tm-inline-form`)?.remove();
  }

  async function saveItem(pane, btn) {
    if (btn.disabled) return;
    const form = panel()?.querySelector(`[data-form-pane="${pane}"]`);
    if (!form) return;
    const title = form.querySelector('#tm-form-title')?.value.trim();
    if (!title) { form.querySelector('#tm-form-title')?.focus(); return; }
    if (pane === 'Schedule') {
      const err = validateScheduleForm(form);
      if (err) { showFormError(form, err); return; }
    }
    btn.disabled = true; btn.textContent = 'Saving…';
    const forceEl   = form.querySelector('#tm-form-force');
    const impactEl  = form.querySelector('#tm-form-impact');
    const doneEl    = form.querySelector('#tm-form-done');
    const dateEl    = form.querySelector('#tm-form-date');
    const fdEl      = form.querySelector('#tm-form-force-date-input');
    const timeEl    = form.querySelector('#tm-form-time');
    const endTimeEl = form.querySelector('#tm-form-end-time');
    const peEl      = form.querySelector('#tm-form-period-end');
    const stypeEl   = form.querySelector('#tm-form-stype');
    const amtEl     = form.querySelector('#tm-form-amount');
    const budEl     = form.querySelector('#tm-form-budget');
    if (forceEl?.checked && !fdEl?.value && !dateEl?.value) {
      showFormError(form, 'Force requires a date.');
      btn.disabled = false; btn.textContent = 'Save'; return;
    }
    const body = { title, pane, source: 'manual' };
    if (forceEl?.checked)  body.force         = true;
    if (impactEl?.checked) body.high_impact   = true;
    if (doneEl?.checked)   body.done          = true;
    const dateVal = fdEl?.value || dateEl?.value;
    if (dateVal)           body.date          = dateVal;
    if (timeEl?.value)     body.schedule_time = timeEl.value;
    if (endTimeEl?.value)  body.end_time      = endTimeEl.value;
    if (peEl?.value)       body.period_end    = peEl.value;
    if (stypeEl?.value)    body.schedule_type = stypeEl.value;
    if (amtEl?.value)      body.amount        = parseFloat(amtEl.value) || 0;
    if (budEl?.value)      body.budget_id     = budEl.value;
    try {
      const res = await fetch('/api/daily-items', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.record) items.push(data.record);
      renderPanel();
    } catch (err) { btn.disabled = false; btn.textContent = 'Save'; }
  }

  async function markDone(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res  = await fetch(`/api/daily-items/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ done: true }) });
      const data = await res.json();
      if (data.record) {
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) items[idx] = data.record;
        if (data.record?.source === 'project' && data.record?.project_task_id) {
          fetch(`/api/project-tasks/${data.record.project_task_id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'Done' }) }).catch(() => {});
        }
      }
      renderPanel();
    } catch { if (btn) btn.disabled = false; }
  }

  async function markTypeBDone(id, btn) {
    const todayStr = today();
    const item = items.find(i => i.id === id);
    if (!item) return;
    let log = [];
    try { log = JSON.parse(item.hit_log || '[]'); } catch {}
    if (log.includes(todayStr)) { showFlash('Already counted for today'); return; }
    log.push(todayStr);
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/daily-items/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ hit_log: JSON.stringify(log), done_at: todayStr }) });
      const data = await res.json();
      if (data.record) { const idx = items.findIndex(i => i.id === id); if (idx >= 0) items[idx] = data.record; }
      renderPanel();
    } catch { if (btn) btn.disabled = false; }
  }

  async function removeItem(id, btn) {
    const item = items.find(i => i.id === id);
    if (item?.source === 'project' && item?.project_task_id) {
      if (!confirm(`Delete from both Time Management and Project?\nThis cannot be undone.`)) return;
      if (btn) btn.disabled = true;
      await fetch(`/api/project-tasks/${item.project_task_id}`, { method: 'DELETE' }).catch(() => {});
    } else {
      if (!confirm(`Remove "${item?.title || id}"?`)) return;
      if (btn) btn.disabled = true;
    }
    try {
      await fetch(`/api/daily-items/${id}`, { method: 'DELETE' });
      items = items.filter(i => i.id !== id);
      renderPanel();
    } catch { if (btn) btn.disabled = false; }
  }

  function openEditForm(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const p    = panel();
    const card = p?.querySelector(`.tm-item-card[data-id="${id}"]`);
    if (!card) return;

    // Project items: mini attribute editor (high_impact, force, date)
    if (item.source === 'project') {
      const existing = card.querySelector('.tm-attr-form');
      if (existing) { existing.remove(); return; }
      const mini = document.createElement('div');
      mini.className = 'tm-attr-form';
      mini.innerHTML = `
        <div class="tm-attr-row">
          <button type="button" class="tm-attr-tog ${item.high_impact?'on':''}" data-attr-tog="high_impact">⚡ High impact</button>
          <button type="button" class="tm-attr-tog ${item.force?'on':''}" data-attr-tog="force">📌 Force</button>
          <input type="date" class="tm-attr-date" value="${item.date||''}" style="font-size:0.75rem;padding:0.2rem 0.4rem;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--bg-raised);color:var(--text);width:auto">
        </div>
        <div class="tm-attr-row">
          <button type="button" class="tm-save-btn" data-attr-save="${id}" style="font-size:0.72rem;padding:0.2rem 0.6rem">Save</button>
          <button type="button" class="tm-cancel-btn" data-attr-cancel style="font-size:0.72rem;padding:0.2rem 0.5rem">Cancel</button>
        </div>`;
      card.appendChild(mini);
      mini.addEventListener('click', async ev => {
        const tog = ev.target.dataset.attrTog;
        if (tog) { ev.target.classList.toggle('on'); return; }
        if ('attrCancel' in ev.target.dataset) { mini.remove(); return; }
        if (ev.target.dataset.attrSave) {
          const hi    = !!mini.querySelector('[data-attr-tog="high_impact"]')?.classList.contains('on');
          const force = !!mini.querySelector('[data-attr-tog="force"]')?.classList.contains('on');
          const date  = mini.querySelector('.tm-attr-date')?.value || null;
          ev.target.disabled = true; ev.target.textContent = 'Saving…';
          try {
            const res = await fetch(`/api/daily-items/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ high_impact: hi, force, date }) });
            const d = await res.json();
            if (d.record) { const idx = items.findIndex(i => i.id === id); if (idx >= 0) items[idx] = d.record; }
            renderPanel();
          } catch { ev.target.disabled = false; ev.target.textContent = 'Save'; }
        }
      });
      return;
    }

    // Non-project: full edit
    const formEl = document.createElement('div');
    formEl.innerHTML = addForm(item.pane);
    const form = formEl.firstElementChild;
    form.dataset.editId = id;
    const titleEl = form.querySelector('#tm-form-title'); if (titleEl) titleEl.value = item.title || '';
    if (item.date)          { const el = form.querySelector('#tm-form-date');       if (el) el.value = item.date; }
    if (item.period_end)    { const el = form.querySelector('#tm-form-period-end'); if (el) el.value = item.period_end; }
    if (item.force)         { const el = form.querySelector('#tm-form-force');      if (el) el.checked = true; }
    if (item.high_impact)   { const el = form.querySelector('#tm-form-impact');     if (el) el.checked = true; }
    if (item.schedule_time) { const el = form.querySelector('#tm-form-time');       if (el) el.value = item.schedule_time; }
    if (item.end_time)      { const el = form.querySelector('#tm-form-end-time');   if (el) el.value = item.end_time; }
    if (item.schedule_type) { const el = form.querySelector('#tm-form-stype');      if (el) el.value = item.schedule_type; }
    if (item.amount)        { const el = form.querySelector('#tm-form-amount');     if (el) el.value = item.amount; }
    if (item.budget_id)     { const el = form.querySelector('#tm-form-budget');     if (el) el.value = item.budget_id; }
    const saveBtn = form.querySelector('[data-save-pane]');
    if (saveBtn) { saveBtn.removeAttribute('data-save-pane'); saveBtn.dataset.editSavePane = item.pane; }
    card.replaceWith(form);
    form.addEventListener('click', async ev => {
      if (ev.target.dataset.editSavePane) {
        if (ev.target.disabled) return;
        const title = form.querySelector('#tm-form-title')?.value.trim();
        if (!title) return;
        if (item.pane === 'Schedule') { const err = validateScheduleForm(form); if (err) { showFormError(form, err); return; } }
        ev.target.disabled = true; ev.target.textContent = 'Saving…';
        const body = { title };
        const fe = form.querySelector('#tm-form-force');   if (fe) body.force         = fe.checked;
        const ie = form.querySelector('#tm-form-impact');  if (ie) body.high_impact   = ie.checked;
        const de = form.querySelector('#tm-form-date');    if (de) body.date          = de.value || null;
        const pe = form.querySelector('#tm-form-period-end'); if (pe) body.period_end = pe.value || null;
        const te = form.querySelector('#tm-form-time');    if (te) body.schedule_time = te.value || null;
        const ee = form.querySelector('#tm-form-end-time');if (ee) body.end_time      = ee.value || null;
        const se = form.querySelector('#tm-form-stype');   if (se) body.schedule_type = se.value || null;
        const ae = form.querySelector('#tm-form-amount');  if (ae) body.amount        = parseFloat(ae.value)||0;
        const be = form.querySelector('#tm-form-budget');  if (be) body.budget_id     = be.value || null;
        try {
          const res = await fetch(`/api/daily-items/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const d = await res.json();
          if (d.record) { const idx = items.findIndex(i => i.id === id); if (idx >= 0) items[idx] = d.record; }
          renderPanel();
        } catch { ev.target.disabled = false; ev.target.textContent = 'Save'; }
      }
      if (ev.target.dataset.cancelPane) { ev.preventDefault(); loadAndRender(); }
    });
  }

  // ── Routine modal (Type A only) ───────────────────────────────────────────
  function showRoutineModal() {
    const routines = items.filter(isTypeA);
    const listHtml = routines.length
      ? routines.map(r => `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border)">
          <span style="font-size:0.82rem">${r.schedule_time?r.schedule_time+' · ':''}${r.end_time?'→'+r.end_time+' · ':''}${r.title}</span>
          <button type="button" style="background:none;border:1px solid var(--red);border-radius:4px;color:var(--red);font-size:0.68rem;padding:0.15rem 0.45rem;cursor:pointer" data-del-routine="${r.id}">✕</button>
        </div>`).join('')
      : '<div style="font-size:0.82rem;color:var(--text-dim);padding:0.5rem 0">No flow routines set.</div>';

    const modal = document.createElement('div');
    modal.className = 'tm-routine-modal';
    modal.innerHTML = `<div class="tm-routine-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
        <div>
          <div style="font-weight:700;font-size:0.95rem">⚙ Flow Routines</div>
          <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);margin-top:0.15rem">Type A — no date, Flow strip only, not measured</div>
        </div>
        <button type="button" id="tm-routine-close" style="background:none;border:1px solid var(--border);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;color:var(--text-muted)">✕</button>
      </div>
      <div id="tm-routine-list">${listHtml}</div>
      <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:0.75rem">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:0.4rem">+ Add Flow Routine</div>
        <input type="text" id="tm-routine-title" placeholder="Routine name" style="display:block;width:100%;margin-bottom:0.4rem;padding:0.3rem 0.5rem;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--bg-raised);color:var(--text);font-size:0.8rem;box-sizing:border-box">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-bottom:0.5rem">
          <input type="time" id="tm-routine-time" style="padding:0.3rem 0.5rem;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--bg-raised);color:var(--text);font-size:0.8rem">
          <input type="time" id="tm-routine-end-time" style="padding:0.3rem 0.5rem;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--bg-raised);color:var(--text);font-size:0.8rem">
        </div>
        <button type="button" id="tm-routine-save" style="font-size:0.78rem;padding:0.3rem 0.75rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">Add</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', async ev => {
      if (ev.target.id === 'tm-routine-close' || ev.target === modal) { modal.remove(); return; }
      if (ev.target.dataset.delRoutine) {
        const rid = ev.target.dataset.delRoutine;
        try { await fetch(`/api/daily-items/${rid}`, { method: 'DELETE' }); items = items.filter(i => i.id !== rid); } catch {}
        modal.remove(); showRoutineModal(); renderPanel(); return;
      }
      if (ev.target.id === 'tm-routine-save') {
        const title   = document.getElementById('tm-routine-title')?.value.trim();
        if (!title) return;
        const time    = document.getElementById('tm-routine-time')?.value;
        const endTime = document.getElementById('tm-routine-end-time')?.value;
        // Type A: NO date field
        const body = { title, pane: 'Schedule', schedule_type: 'Routine', source: 'manual' };
        if (time)    body.schedule_time = time;
        if (endTime) body.end_time      = endTime;
        ev.target.disabled = true; ev.target.textContent = 'Saving…';
        try {
          const res = await fetch('/api/daily-items', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const d = await res.json();
          if (d.record) items.push(d.record);
          modal.remove(); renderPanel();
        } catch { ev.target.disabled = false; ev.target.textContent = 'Add'; }
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

  function init() {
    ensureStyles();
    window.addEventListener('panelactivated', e => { if (e.detail === 'timemanagement') loadAndRender(); });
    const p = panel();
    if (p && p.classList.contains('active')) loadAndRender();
    setInterval(() => { if (!initialized) return; const p2 = panel(); if (p2 && p2.classList.contains('active')) renderPanel(); }, 60000);
  }

  init();
})();
