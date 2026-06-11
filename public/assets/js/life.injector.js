/* life.injector.js — M4.5 Life Timeline — IIFE panel injector */
(function () {
  'use strict';

  const ROUTE    = 'life';
  const PANEL_ID = 'panel-life';

  // ── Module state ──
  let _initialized    = false;
  let _allRecords     = [];       // year-level rows (month=null)
  let _allVisitRecords = [];      // month rows with location (visit dots in Life View)
  let _allMonthsByYear = {};      // { year: [monthRows] } for aggregation in Year View
  let _monthRecords   = {};       // { year: [rows] } for Entry View Month mode
  let _edges          = [];       // MindMapEdges
  let _lifeScores     = {};       // { recordId: score }
  let _finMin         = 0;
  let _finMax         = 0;

  // View state
  let _mode        = 'life';   // 'life' | 'entry'
  let _entryMode   = 'year';   // 'year' | 'month'
  let _entryYear   = new Date().getFullYear();
  let _activeLines = { financial: true, happiness: false, health: false, lifescore: false };
  let _scale       = 'full';   // 'full' | '10yr'
  let _yearOffset  = 0;
  let _activeStory = null;     // record id of open year story
  let _activeRefId = null;     // Ideas diary record ID shown in story panel
  let _ideasCache  = {};       // { diaryRecordId: {id, fields:{}} } for on-demand fetch
  let _yearRecord  = null;     // year-level record for Month View inheritance

  // Dirty tracking for Save All
  let _dirty       = {};       // { recordId: { fieldName: value, ... } }

  // Drag fill state
  let _dragField     = null;
  let _dragValue     = null;
  let _dragging      = false;
  let _dragStartId   = null;
  let _preDragDirty  = null;
  let _dragFilledIds = [];
  let _dragStopFn    = null;

  // Location palette (6-8 distinct colors, no library)
  const LOC_COLORS = [
    '#3b82f6','#22c55e','#f59e0b','#ec4899',
    '#8b5cf6','#06b6d4','#a3e635','#f97316'
  ];

  function locColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
    return LOC_COLORS[h % LOC_COLORS.length];
  }

  function panel() { return document.getElementById(PANEL_ID); }

  function escapeAttr(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── CSS injection ──
  function ensureStyles() {
    if (document.getElementById('life-styles')) return;
    const s = document.createElement('style');
    s.id = 'life-styles';
    s.textContent = `
      /* height:100% + overflow:hidden constrains the panel to its allocated space so
         flex:1 children with overflow:auto can scroll rather than expanding the page */
      #panel-life.active { display:flex; flex-direction:column; height:100%; overflow:hidden; }
      #panel-life { padding:0 !important; }

      .life-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:1rem 1.5rem 0.6rem; flex-shrink:0; flex-wrap:wrap; gap:0.5rem;
      }
      .life-header-left { display:flex; flex-direction:column; }
      .life-title { font-family:var(--font-display); font-weight:800; font-size:1.4rem;
        color:var(--text); letter-spacing:-0.01em; }
      .life-subtitle { font-family:var(--font-mono); font-size:0.72rem;
        color:var(--text-dim); margin-top:0.2rem; }

      .life-kpi-strip {
        display:flex; gap:0.75rem; padding:0 1.5rem 0.75rem; flex-wrap:wrap; flex-shrink:0;
      }
      .life-kpi-chip { background:var(--bg-card); border:1px solid var(--border);
        border-radius:var(--radius); padding:0.5rem 0.8rem; min-width:110px; }
      .life-kpi-label { display:block; font-family:var(--font-mono); font-size:0.62rem;
        color:var(--text-dim); letter-spacing:0.04em; margin-bottom:0.18rem; }
      .life-kpi-val { font-family:var(--font-mono); font-size:0.9rem; font-weight:600; }

      .life-mode-toggle {
        display:flex; gap:0.4rem; padding:0 1.5rem 0.75rem; flex-shrink:0;
      }
      .life-mode-btn {
        font-family:var(--font-mono); font-size:0.75rem; padding:0.3rem 0.85rem;
        background:var(--bg-raised); border:1px solid var(--border);
        border-radius:var(--radius); color:var(--text-dim); cursor:pointer;
        transition:all 0.15s;
      }
      .life-mode-btn.active {
        background:rgba(245,197,24,0.12); border-color:var(--yellow); color:var(--yellow);
      }

      /* ── Life View ── */
      .life-view-body { flex:1; display:flex; flex-direction:column; overflow-y:auto; }
      .life-graph-controls {
        display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;
        padding:0 1.5rem 0.5rem; flex-shrink:0;
      }
      .life-line-btn {
        font-family:var(--font-mono); font-size:0.7rem; padding:0.22rem 0.65rem;
        background:var(--bg-raised); border:1px solid var(--border);
        border-radius:var(--radius); color:var(--text-dim); cursor:pointer;
        transition:all 0.15s;
      }
      .life-line-btn.active { color:#0a0a10; }
      .life-line-btn[data-line="financial"].active  { background:#22c55e; border-color:#22c55e; }
      .life-line-btn[data-line="happiness"].active  { background:#f5c518; border-color:#f5c518; }
      .life-line-btn[data-line="health"].active     { background:#38bdf8; border-color:#38bdf8; }
      .life-line-btn[data-line="lifescore"].active  { background:#a78bfa; border-color:#a78bfa; }
      .life-line-btn[data-line="all"].active        { background:var(--yellow); border-color:var(--yellow); }

      .life-scale-controls {
        display:flex; align-items:center; gap:0.35rem; margin-left:auto;
      }
      .life-scale-btn {
        font-family:var(--font-mono); font-size:0.7rem; padding:0.22rem 0.55rem;
        background:var(--bg-raised); border:1px solid var(--border);
        border-radius:var(--radius); color:var(--text-dim); cursor:pointer; transition:all 0.15s;
      }
      .life-scale-btn.active { background:rgba(245,197,24,0.12); border-color:var(--yellow); color:var(--yellow); }
      .life-scale-nav { background:none; border:1px solid var(--border); border-radius:var(--radius);
        color:var(--text-dim); font-size:0.85rem; padding:0.1rem 0.4rem; cursor:pointer; }
      .life-scale-nav:hover { border-color:var(--yellow); color:var(--yellow); }

      .life-svg-wrap {
        padding:0 1.5rem; flex-shrink:0;
        overflow:visible; width:100%; min-width:100%;
        box-sizing:border-box;
      }
      .life-svg-wrap svg { overflow:visible; display:block; width:100%; min-width:100%; }

      .life-tooltip {
        position:fixed; background:var(--bg-raised); border:1px solid var(--border-strong);
        border-radius:var(--radius); padding:0.45rem 0.7rem;
        font-family:var(--font-mono); font-size:0.72rem; color:var(--text);
        pointer-events:none; z-index:300; white-space:nowrap;
        box-shadow:0 4px 16px rgba(0,0,0,0.4); display:none;
      }

      /* ── Story panel ── */
      .life-story-panel {
        overflow-y:auto; padding:1rem 1.5rem;
        border-top:1px solid var(--border);
        background:var(--bg);
      }
      .life-story-header {
        display:flex; align-items:flex-start; justify-content:space-between;
        margin-bottom:0.75rem;
      }
      .life-story-year { font-family:var(--font-display); font-size:1.6rem; font-weight:800; color:var(--yellow); }
      .life-story-meta { font-family:var(--font-mono); font-size:0.72rem; color:var(--text-dim); margin-top:0.25rem; }
      .life-story-close {
        background:none; border:1px solid var(--border); border-radius:var(--radius);
        color:var(--text-dim); cursor:pointer; font-size:0.78rem; padding:0.25rem 0.55rem;
        flex-shrink:0;
      }
      .life-story-section { margin-bottom:1rem; }
      .life-story-section-title {
        font-family:var(--font-mono); font-size:0.68rem; color:var(--text-dim);
        text-transform:uppercase; letter-spacing:0.08em;
        border-bottom:1px solid var(--border); padding-bottom:0.25rem; margin-bottom:0.5rem;
        cursor:pointer; user-select:none;
      }
      .life-story-text { font-size:0.88rem; color:var(--text-muted); line-height:1.65; white-space:pre-wrap; }
      .life-story-edit-btn {
        font-family:var(--font-mono); font-size:0.72rem; padding:0.28rem 0.65rem;
        background:rgba(245,197,24,0.08); border:1px solid rgba(245,197,24,0.3);
        color:var(--yellow); border-radius:var(--radius); cursor:pointer; margin-top:0.5rem;
      }
      .life-story-save-btn {
        font-family:var(--font-mono); font-size:0.72rem; padding:0.28rem 0.65rem;
        background:var(--yellow); border:1px solid var(--yellow);
        color:#0a0a10; border-radius:var(--radius); cursor:pointer; margin-top:0.5rem;
        display:none;
      }
      .life-story-field { width:100%; background:var(--bg-raised); border:1px solid var(--border-strong);
        border-radius:var(--radius); padding:0.4rem 0.6rem; font-size:0.85rem; color:var(--text);
        font-family:var(--font-body); outline:none; resize:vertical;
      }
      .life-story-field:focus { border-color:var(--yellow); }

      /* ── Entry View ── */
      /* overflow:hidden on a flex ancestor breaks position:sticky on descendants — use min-height:0 instead */
      .life-entry-body { flex:1; display:flex; flex-direction:column; min-height:0; }
      .life-entry-controls {
        display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;
        padding:0 1.5rem 0.75rem; flex-shrink:0;
      }
      .life-entry-submode-btn {
        font-family:var(--font-mono); font-size:0.73rem; padding:0.28rem 0.75rem;
        background:var(--bg-raised); border:1px solid var(--border);
        border-radius:var(--radius); color:var(--text-dim); cursor:pointer; transition:all 0.15s;
      }
      .life-entry-submode-btn.active {
        background:rgba(245,197,24,0.12); border-color:var(--yellow); color:var(--yellow);
      }
      .life-year-select {
        font-family:var(--font-mono); font-size:0.75rem; padding:0.28rem 0.55rem;
        background:var(--bg-raised); border:1px solid var(--border);
        border-radius:var(--radius); color:var(--text); outline:none; cursor:pointer;
      }
      .life-save-all-btn {
        margin-left:auto; font-family:var(--font-mono); font-size:0.75rem;
        padding:0.28rem 0.9rem; background:var(--yellow); border:none;
        color:#0a0a10; border-radius:var(--radius); cursor:pointer; font-weight:600;
      }

      /* Grid */
      .life-grid-wrap { flex:1; overflow:auto; padding:0 1.5rem 1.5rem; }
      /* border-collapse:separate is required — collapse breaks position:sticky on th */
      .life-grid-table { border-collapse:separate; border-spacing:0; font-size:0.75rem; min-width:900px; width:100%; }

      /* Two sticky header rows */
      .life-grid-table thead tr:first-child th {
        font-family:var(--font-mono); font-size:0.72rem; color:var(--text-dim);
        font-weight:600; padding:0.28rem 0.5rem; height:30px;
        border-bottom:none; text-align:left; white-space:nowrap;
        position:sticky; top:0; background:var(--bg); z-index:4;
      }
      .life-grid-table thead tr:last-child th {
        font-family:var(--font-mono); font-size:0.68rem; color:var(--text-dim);
        font-weight:400; padding:0.12rem 0.5rem; letter-spacing:0.04em; text-transform:uppercase;
        border-bottom:1px solid var(--border); white-space:nowrap;
        position:sticky; top:30px; background:var(--bg); z-index:3;
      }
      .life-grid-table td { padding:0.2rem 0.3rem; border-bottom:1px solid rgba(255,255,255,0.04); }
      .life-grid-year-cell {
        font-family:var(--font-mono); font-size:0.78rem; font-weight:600;
        white-space:nowrap; padding:0.2rem 0.5rem;
        position:sticky; left:0; background:var(--bg); z-index:1;
        min-width:56px;
      }
      .life-grid-year-cell.has-data { color:var(--yellow); }
      .life-grid-year-cell.no-data  { color:var(--text-dim); }

      .life-grid-group-header {
        font-family:var(--font-mono); font-size:0.72rem; font-weight:600;
        color:var(--text-dim); text-transform:uppercase; letter-spacing:0.08em;
        padding:0.35rem 0.5rem; background:var(--bg-raised);
        cursor:pointer; user-select:none;
      }

      .life-grid-input {
        width:72px; background:transparent; border:1px solid transparent;
        border-radius:3px; padding:0.18rem 0.3rem; font-family:var(--font-mono);
        font-size:0.73rem; color:var(--text); text-align:right;
        outline:none; cursor:pointer;
      }
      .life-grid-input:focus { background:var(--bg-raised); border-color:var(--yellow);
        box-shadow:0 0 0 2px rgba(245,197,24,0.15); cursor:text; }
      .life-grid-input.dirty { background:rgba(245,197,24,0.08); }
      .life-grid-input::placeholder { opacity:0.35; font-style:italic; font-weight:400; }

      .life-grid-text-input {
        width:100%; min-width:110px; background:transparent; border:1px solid transparent;
        border-radius:3px; padding:0.18rem 0.3rem; font-size:0.73rem; color:var(--text);
        outline:none; cursor:pointer;
      }
      .life-grid-text-input:focus { background:var(--bg-raised); border-color:var(--yellow); cursor:text; }
      .life-grid-text-input.dirty { background:rgba(245,197,24,0.08); }
      .life-grid-text-input::placeholder { opacity:0.35; font-style:italic; }
      .life-grid-longtext-input { min-width:180px !important; }

      /* Drag fill handle */
      .life-drag-handle {
        display:inline-block; width:6px; height:6px;
        background:var(--yellow); border-radius:50%;
        cursor:crosshair; margin-left:3px; vertical-align:middle;
        opacity:0; transition:opacity 0.1s;
      }
      .life-grid-input:hover + .life-drag-handle,
      .life-grid-input:focus + .life-drag-handle { opacity:1; }

      /* Save status */
      .life-save-status {
        font-family:var(--font-mono); font-size:0.72rem; padding:0.2rem 0.6rem;
        color:var(--text-muted);
      }

      /* Heartbeat animation */
      @keyframes life-heartbeat {
        0%   { r:4; opacity:1; }
        14%  { r:8; opacity:0.8; }
        28%  { r:4; opacity:1; }
        42%  { r:6; opacity:0.9; }
        70%  { r:4; opacity:1; }
        100% { r:4; opacity:1; }
      }
      .life-node-pulse { animation: life-heartbeat 1.8s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
  }

  // ── Helpers ──
  function fmtBaht(v) {
    if (!v) return '฿0';
    if (Math.abs(v) >= 1e6) return '฿' + (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return '฿' + (v / 1e3).toFixed(0) + 'k';
    return '฿' + Math.round(v).toLocaleString();
  }

  function hasData(r) {
    const numFields = [
      'financial_earn','knowledge_earn','happiness_factor','health','relationship',
      'creation','achievement','failure','travel','hobby'
    ];
    return numFields.some(f => r[f] != null) || r.note || r.location || r.decision;
  }

  function norm110(v) {
    if (!v) return 0;
    return ((v - 1) / 9) * 20 - 10;
  }

  function normalizeFinancial(v) {
    if (!v || _finMax === _finMin) return 0;
    return ((v - _finMin) / (_finMax - _finMin)) * 20 - 10;
  }

  function computeLifeScore(row) {
    const finNorm    = normalizeFinancial(row.financial_earn);
    const happNorm   = norm110(row.happiness_factor) * 3;
    const healthNorm = norm110(row.health) * 2;
    const relNorm    = norm110(row.relationship) * 1.5;
    const aImpact    = (row.a_impact || 5);
    const fImpact    = (row.f_impact || 5);
    const achNorm    = norm110(row.achievement) * (aImpact / 5);
    const failPen    = norm110(row.failure) * (fImpact / 5) * -1.5;
    const finScore   = (finNorm || 0) * 2;
    const totalWeight = 3 + 2 + 1.5 + (aImpact / 5) + 2;
    const raw = (happNorm + healthNorm + relNorm + achNorm + failPen + finScore) / totalWeight;
    return Math.max(-10, Math.min(10, raw));
  }

  function buildFinancialRange(records) {
    const vals = records.filter(r => r.financial_earn != null).map(r => r.financial_earn);
    _finMin = vals.length ? Math.min(...vals) : 0;
    _finMax = vals.length ? Math.max(...vals) : 0;
  }

  function buildLifeScores(records) {
    buildFinancialRange(records);
    _lifeScores = {};
    for (const r of records) _lifeScores[r.id] = computeLifeScore(r);
  }

  // ── Data fetch ──
  async function loadData() {
    const [ltRes, edgeRes] = await Promise.allSettled([
      fetch('/api/life-timeline').then(r => r.json()),
      fetch('/api/mindmap-edges').then(r => r.json())
    ]);

    if (ltRes.status === 'fulfilled') {
      const records = ltRes.value.records || [];
      _allRecords      = records.filter(r => !r.month);
      // Capture month rows that have a location for visit dots in Life View
      _allVisitRecords = records.filter(r => r.month && r.location);
      // Index all month rows by year for Year View aggregation (L208)
      _allMonthsByYear = {};
      for (const r of records.filter(rc => rc.month != null)) {
        if (!_allMonthsByYear[r.year]) _allMonthsByYear[r.year] = [];
        _allMonthsByYear[r.year].push(r);
      }
    }

    if (edgeRes.status === 'fulfilled') {
      _edges = edgeRes.value.records || [];
    }

    buildLifeScores(_allRecords);
  }

  async function loadMonthData(year) {
    // Set year record for Month View inheritance display
    _yearRecord = _allRecords.find(r => r.year === year) || null;

    if (_monthRecords[year]) return;
    const res  = await fetch(`/api/life-timeline?year=${year}`);
    const data = await res.json();
    const months = (data.records || []).filter(r => r.month != null);
    _monthRecords[year] = months;

    if (months.length === 0) {
      const created = [];
      for (let m = 1; m <= 12; m++) {
        const r2 = await fetch('/api/life-timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month: m })
        });
        if (r2.ok) {
          const d = await r2.json();
          if (d.record) created.push(d.record);
        }
      }
      _monthRecords[year] = created.sort((a, b) => a.month - b.month);
    }
  }

  // ── KPI strip ──
  function buildKpiHtml() {
    const yearsRecorded = _allRecords.filter(r => hasData(r)).length;
    const storyEntries  = _allRecords.filter(r => r.note).length;
    const lifetimeEarn  = _allRecords.reduce((s, r) => s + (r.financial_earn || 0), 0);

    let peakYear = '—';
    let peakScore = -Infinity;
    for (const r of _allRecords) {
      const sc = _lifeScores[r.id] || 0;
      if (sc > peakScore) { peakScore = sc; peakYear = r.year ? String(r.year) : '—'; }
    }

    const lifeIds  = new Set(_allRecords.map(r => r.id));
    const connCount = _edges.filter(e => lifeIds.has(e.from_id) || lifeIds.has(e.to_id)).length;

    return `
      <div class="life-kpi-strip">
        <div class="life-kpi-chip">
          <span class="life-kpi-label">Years recorded</span>
          <span class="life-kpi-val" style="color:var(--yellow)">${yearsRecorded}</span>
        </div>
        <div class="life-kpi-chip">
          <span class="life-kpi-label">Peak life score</span>
          <span class="life-kpi-val" style="color:#22c55e">${peakYear}</span>
        </div>
        <div class="life-kpi-chip">
          <span class="life-kpi-label">Lifetime earn</span>
          <span class="life-kpi-val" style="color:#a78bfa">${fmtBaht(lifetimeEarn)}</span>
        </div>
        <div class="life-kpi-chip">
          <span class="life-kpi-label">Story entries</span>
          <span class="life-kpi-val" style="color:#38bdf8">${storyEntries}</span>
        </div>
        <div class="life-kpi-chip">
          <span class="life-kpi-label">Connections</span>
          <span class="life-kpi-val" style="color:#f97316">${connCount > 0 ? connCount : '—'}</span>
        </div>
      </div>`;
  }

  // ── Life View SVG ──
  function getVisibleYears() {
    const curYear = new Date().getFullYear();
    const dataMax = Math.max(2037, curYear + 1);
    if (_scale === 'full') return { start: 1972, end: dataMax };
    const center = 1972 + _yearOffset * 5;
    return { start: center, end: center + 9 };
  }

  function buildLifeViewHtml() {
    const { start, end } = getVisibleYears();
    const yearRange = end - start + 1;

    const SVG_W    = _scale === '10yr' ? 900 : 1400;
    const SVG_H    = 480;
    const MARGIN_L = 30;
    const MARGIN_R = 20;
    const MARGIN_T = 55;
    const MARGIN_B = 140;
    const GRAPH_W  = SVG_W - MARGIN_L - MARGIN_R;
    const GRAPH_H  = SVG_H - MARGIN_T - MARGIN_B;
    const BASELINE_Y = MARGIN_T + GRAPH_H / 2;

    // Layout constants
    const SWIMLANE_Y   = BASELINE_Y + 110; // Below failure branches (max ~+88+label)
    const BAR_H        = 18;
    const VISIT_DOT_Y  = MARGIN_T - 15;    // Above all curves, near top of SVG
    const STEP_W       = GRAPH_W / Math.max(1, yearRange - 1);

    const visible = _allRecords.filter(r => r.year >= start && r.year <= end);

    function yearToX(y) {
      return MARGIN_L + ((y - start) / Math.max(1, end - start)) * GRAPH_W;
    }
    function scoreToY(val, range) {
      return BASELINE_Y - (val / range) * (GRAPH_H / 2 - 8);
    }
    function buildPath(points) {
      const filtered = points.filter(p => p.val != null && !isNaN(p.val));
      if (filtered.length < 2) return '';
      let d = '';
      for (let i = 0; i < filtered.length; i++) {
        const p = filtered[i];
        if (i === 0) {
          d += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        } else {
          const prev = filtered[i - 1];
          const cpx  = (prev.x + p.x) / 2;
          d += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)} ${cpx.toFixed(1)} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }
      }
      return d;
    }

    const finPoints = visible.map(r => {
      const val = normalizeFinancial(r.financial_earn);
      return { x: yearToX(r.year), y: scoreToY(val, 10), val, year: r.year };
    });
    const happPoints = visible.map(r => {
      const val = r.happiness_factor != null ? norm110(r.happiness_factor) / 2 : null;
      return { x: yearToX(r.year), y: scoreToY(val != null ? val : 0, 5), val, year: r.year };
    });
    const healthPoints = visible.map(r => {
      const val = r.health != null ? norm110(r.health) / 2 : null;
      return { x: yearToX(r.year), y: scoreToY(val != null ? val : 0, 5), val, year: r.year };
    });
    const lifePoints = visible.map(r => {
      const val = _lifeScores[r.id] != null ? _lifeScores[r.id] : null;
      return { x: yearToX(r.year), y: scoreToY(val != null ? val : 0, 10), val, year: r.year };
    });

    // Year nodes
    const nodeCircles = visible.map(r => {
      const score    = _lifeScores[r.id] || 0;
      const color    = score > 3 ? '#22c55e' : (score < -3 ? '#ef4444' : 'rgba(232,232,240,0.35)');
      const hasStory = r.note ? ' life-node-pulse' : '';
      const cx       = yearToX(r.year).toFixed(1);
      const cy       = BASELINE_Y.toFixed(1);
      const ttData   = JSON.stringify({
        year: r.year, loc: r.location || '', score: score.toFixed(1), tags: r.tags || ''
      }).replace(/"/g, '&quot;');
      return `<circle class="life-year-node${hasStory}" cx="${cx}" cy="${cy}" r="4"
        fill="${color}" stroke="var(--bg)" stroke-width="1.5"
        data-id="${r.id}" data-tt="${ttData}" style="cursor:pointer"/>`;
    }).join('\n');

    // Branch stems
    const branches = visible.flatMap(r => {
      const segs = [];
      if (r.achievement && r.achievement > 1) {
        const imp   = r.a_impact || 5;
        const h     = 20 + imp * 8;
        const cx    = yearToX(r.year);
        const cy    = BASELINE_Y;
        const label = (r.tags || 'achievement').slice(0, 20);
        segs.push(`
          <line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}"
            x2="${cx.toFixed(1)}" y2="${(cy - h).toFixed(1)}"
            stroke="#22c55e" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.7"/>
          <rect x="${(cx - 30).toFixed(1)}" y="${(cy - h - 12).toFixed(1)}"
            width="60" height="12" rx="3" fill="rgba(34,197,94,0.15)"
            stroke="#22c55e" stroke-width="0.8"/>
          <text x="${cx.toFixed(1)}" y="${(cy - h - 3).toFixed(1)}"
            text-anchor="middle" font-size="8" fill="#22c55e"
            font-family="'IBM Plex Mono',monospace">${label}</text>`);
      }
      if (r.failure && r.failure > 1) {
        const imp   = r.f_impact || 5;
        const h     = 18 + imp * 7;
        const cx    = yearToX(r.year);
        const cy    = BASELINE_Y;
        const label = (r.tags || 'failure').slice(0, 20);
        segs.push(`
          <line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}"
            x2="${cx.toFixed(1)}" y2="${(cy + h).toFixed(1)}"
            stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.7"/>
          <rect x="${(cx - 25).toFixed(1)}" y="${(cy + h).toFixed(1)}"
            width="50" height="12" rx="3" fill="rgba(239,68,68,0.12)"
            stroke="#ef4444" stroke-width="0.8"/>
          <text x="${cx.toFixed(1)}" y="${(cy + h + 9).toFixed(1)}"
            text-anchor="middle" font-size="8" fill="#ef4444"
            font-family="'IBM Plex Mono',monospace">${label}</text>`);
      }
      return segs;
    }).join('\n');

    // ── L191: Location display ──
    // STAYS (year-level rows): swimlane colored bars below the curve
    const stayBars = (() => {
      const segs = [];
      let runLoc = null, runStartYear = null, runEndYear = null;

      for (let i = 0; i <= visible.length; i++) {
        const r   = i < visible.length ? visible[i] : null;
        const loc = r ? r.location : null;

        if (loc && loc === runLoc) {
          runEndYear = r.year;
        } else {
          if (runLoc) {
            const x1    = yearToX(runStartYear);
            const x2    = yearToX(runEndYear) + STEP_W * 0.7;
            const w     = Math.max(6, x2 - x1);
            const color = locColor(runLoc);
            const years = runEndYear - runStartYear + 1;
            const label = runLoc.slice(0, 22);
            const midX  = (x1 + x2) / 2;
            const ttData = JSON.stringify({ loc: runLoc, from: runStartYear, to: runEndYear, years })
              .replace(/"/g, '&quot;');
            const fits = w > 55;
            segs.push(`
              <rect x="${x1.toFixed(1)}" y="${SWIMLANE_Y.toFixed(1)}"
                width="${w.toFixed(1)}" height="${BAR_H}"
                rx="3" fill="${color}" opacity="0.18"
                stroke="${color}" stroke-width="1" stroke-opacity="0.6"
                data-stay-tt="${ttData}" style="cursor:pointer"/>
              ${fits
                ? `<text x="${midX.toFixed(1)}" y="${(SWIMLANE_Y + 12).toFixed(1)}"
                    text-anchor="middle" font-size="8" fill="${color}"
                    font-family="'IBM Plex Mono',monospace"
                    pointer-events="none">${escapeAttr(label)}</text>`
                : `<text x="${(x1 - 3).toFixed(1)}" y="${(SWIMLANE_Y + 12).toFixed(1)}"
                    text-anchor="end" font-size="8" fill="${color}"
                    font-family="'IBM Plex Mono',monospace"
                    pointer-events="none">${escapeAttr(label)}</text>`
              }`);
          }
          runLoc = loc ? loc : null;
          runStartYear = loc ? r.year : null;
          runEndYear   = loc ? r.year : null;
        }
      }
      return segs.join('\n');
    })();

    // VISITS (month-level rows with location): small orange dots above baseline
    const visitDots = (() => {
      const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const inView  = _allVisitRecords.filter(r => r.year >= start && r.year <= end);
      return inView.map(r => {
        const cx     = yearToX(r.year);
        const ttData = JSON.stringify({ loc: r.location, month: MONTHS[r.month] || r.month, year: r.year })
          .replace(/"/g, '&quot;');
        return `<circle cx="${cx.toFixed(1)}" cy="${VISIT_DOT_Y.toFixed(1)}" r="4"
          fill="#f97316" opacity="0.7"
          data-visit-tt="${ttData}" style="cursor:pointer"/>`;
      }).join('\n');
    })();

    // ── story_refs: purple square nodes above year node, on-demand fetch ──
    const storyRefNodes = (() => {
      const segs = [];
      for (const r of visible) {
        if (!r.story_refs) continue;
        const refs = r.story_refs.split(',').map(s => s.trim()).filter(Boolean);
        if (!refs.length) continue;
        const cx         = yearToX(r.year);
        const stemBottomY = BASELINE_Y - 12;
        const totalH      = 30 + refs.length * 14;
        segs.push(`<line x1="${cx.toFixed(1)}" y1="${stemBottomY.toFixed(1)}"
          x2="${cx.toFixed(1)}" y2="${(stemBottomY - totalH).toFixed(1)}"
          stroke="rgba(139,92,246,0.3)" stroke-width="1" stroke-dasharray="2 2"
          pointer-events="none"/>`);
        refs.forEach((refId, idx) => {
          const sqY    = stemBottomY - 30 - idx * 14;
          const ttText = `Story ref ${idx + 1} of ${refs.length} · click to view`;
          segs.push(`<rect x="${(cx - 3).toFixed(1)}" y="${sqY.toFixed(1)}"
            width="6" height="6" rx="1"
            fill="#8b5cf6" opacity="0.8"
            data-story-ref-id="${escapeAttr(refId)}"
            data-story-ref-tt="${escapeAttr(ttText)}"
            style="cursor:pointer"/>`);
        });
      }
      return segs.join('\n');
    })();

    // Connection arcs
    const lifeIds      = new Set(_allRecords.map(r => r.id));
    const lifeIdToYear = Object.fromEntries(_allRecords.map(r => [r.id, r.year]));
    const arcColors    = { led_to: '#22c55e', failed_to: '#ef4444', inspired_by: '#f5c518' };
    const arcs = _edges
      .filter(e => lifeIds.has(e.from_id) && lifeIds.has(e.to_id))
      .filter(e => {
        const y1 = lifeIdToYear[e.from_id];
        const y2 = lifeIdToYear[e.to_id];
        return y1 >= start && y1 <= end && y2 >= start && y2 <= end;
      })
      .map(e => {
        const y1    = lifeIdToYear[e.from_id];
        const y2    = lifeIdToYear[e.to_id];
        const x1    = yearToX(y1);
        const x2    = yearToX(y2);
        const arcH  = Math.abs(x2 - x1) * 0.4;
        const midX  = (x1 + x2) / 2;
        const color = arcColors[e.edge_type] || 'rgba(255,255,255,0.2)';
        const ttData = JSON.stringify({ from: y1, to: y2, type: e.edge_type, label: e.label || '' })
          .replace(/"/g, '&quot;');
        return `<path d="M${x1.toFixed(1)} ${(BASELINE_Y - 10).toFixed(1)}
            Q ${midX.toFixed(1)} ${(BASELINE_Y - 10 - arcH).toFixed(1)}
            ${x2.toFixed(1)} ${(BASELINE_Y - 10).toFixed(1)}"
          fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"
          data-arc-tt="${ttData}" style="cursor:pointer"/>
          ${e.label ? `<text x="${midX.toFixed(1)}" y="${(BASELINE_Y - 10 - arcH - 4).toFixed(1)}"
            text-anchor="middle" font-size="9" fill="${color}" opacity="0.8"
            font-family="'IBM Plex Mono',monospace">${escapeAttr(e.label.slice(0, 20))}</text>` : ''}`;
      }).join('\n');

    // Year axis labels
    const axisLabels = visible
      .filter((_, i) => i % Math.max(1, Math.ceil(yearRange / 20)) === 0)
      .map(r => `<text x="${yearToX(r.year).toFixed(1)}" y="${(BASELINE_Y + 20).toFixed(1)}"
        text-anchor="middle" font-size="9" fill="rgba(232,232,240,0.35)"
        font-family="'IBM Plex Mono',monospace">${r.year}</text>`)
      .join('\n');

    // Baseline
    const baseline = `<line x1="${MARGIN_L}" y1="${BASELINE_Y.toFixed(1)}"
      x2="${(SVG_W - MARGIN_R).toFixed(1)}" y2="${BASELINE_Y.toFixed(1)}"
      stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;

    const lines = [];
    if (_activeLines.financial) {
      const d = buildPath(finPoints);
      if (d) lines.push(`<path d="${d}" fill="none" stroke="#22c55e" stroke-width="2" opacity="0.85"/>`);
    }
    if (_activeLines.happiness) {
      const d = buildPath(happPoints);
      if (d) lines.push(`<path d="${d}" fill="none" stroke="#f5c518" stroke-width="1.5" opacity="0.75"/>`);
    }
    if (_activeLines.health) {
      const d = buildPath(healthPoints);
      if (d) lines.push(`<path d="${d}" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.75"/>`);
    }
    if (_activeLines.lifescore) {
      const d = buildPath(lifePoints);
      if (d) lines.push(`<path d="${d}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="5 3" opacity="0.85"/>`);
    }

    const scaleNav = _scale === '10yr' ? `
      <button class="life-scale-nav" id="life-prev-decade">‹</button>
      <button class="life-scale-nav" id="life-next-decade">›</button>` : '';

    // Story / Ideas ref panel
    const storySection = _activeRefId
      ? buildIdeasRefHtml(_activeRefId)
      : (_activeStory ? buildStoryHtml(_activeStory) : '');

    // Visit dots legend label (small)
    const visitLegend = _allVisitRecords.length > 0
      ? `<text x="${MARGIN_L.toFixed(1)}" y="${VISIT_DOT_Y.toFixed(1)}"
          font-size="8" fill="#f97316" opacity="0.55"
          font-family="'IBM Plex Mono',monospace">visits</text>`
      : '';

    return `
      <div class="life-view-body">
        <div class="life-graph-controls">
          ${['financial','happiness','health','lifescore'].map(k => `
            <button class="life-line-btn${_activeLines[k] ? ' active' : ''}" data-line="${k}">${k}</button>
          `).join('')}
          <button class="life-line-btn" data-line="all">All</button>
          <div class="life-scale-controls">
            <button class="life-scale-btn${_scale === 'full' ? ' active' : ''}" data-scale="full">Full life</button>
            <button class="life-scale-btn${_scale === '10yr' ? ' active' : ''}" data-scale="10yr">10yr</button>
            ${scaleNav}
          </div>
        </div>
        <div class="life-svg-wrap">
          <svg viewBox="0 0 ${SVG_W} ${SVG_H}" style="height:${SVG_H}px;overflow:visible" id="life-svg">
            ${baseline}
            ${arcs}
            ${branches}
            ${lines.join('\n')}
            ${storyRefNodes}
            ${nodeCircles}
            ${stayBars}
            ${visitDots}
            ${visitLegend}
            ${axisLabels}
          </svg>
        </div>
        ${storySection}
      </div>`;
  }

  // ── Story panel — year record ──
  function buildStoryHtml(id) {
    const r = _allRecords.find(r => r.id === id);
    if (!r) return '';
    const score      = (_lifeScores[id] || 0).toFixed(1);
    const scoreColor = parseFloat(score) > 3 ? '#22c55e' : (parseFloat(score) < -3 ? '#ef4444' : 'var(--text-muted)');

    const relEdges = _edges.filter(e => e.from_id === id || e.to_id === id);
    const connHtml = relEdges.length === 0
      ? '<div style="font-size:0.82rem;color:var(--text-dim)">No connections yet.</div>'
      : relEdges.map(e => {
        const otherId    = e.from_id === id ? e.to_id : e.from_id;
        const otherRec   = _allRecords.find(r2 => r2.id === otherId);
        const otherLabel = otherRec ? `${otherRec.year}` : otherId.slice(0, 8);
        return `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.25rem">
          <span style="color:var(--text-dim);font-size:0.68rem">[${e.edge_type}]</span>
          → <span style="color:var(--yellow)">${otherLabel}</span>
          ${e.label ? `<span style="color:var(--text-dim)"> — ${e.label}</span>` : ''}
        </div>`;
      }).join('');

    return `
      <div class="life-story-panel" id="life-story-panel">
        <div class="life-story-header">
          <div>
            <div class="life-story-year">${r.year}</div>
            <div class="life-story-meta">
              ${r.location ? `📍 ${r.location}` : ''}
              &nbsp;·&nbsp; Life score: <span style="color:${scoreColor}">${score}</span>
              ${r.tags ? `&nbsp;·&nbsp; ${r.tags}` : ''}
            </div>
          </div>
          <button class="life-story-close" id="life-story-close">✕ Close</button>
        </div>

        <div class="life-story-section">
          <div class="life-story-section-title" data-section="note">Note</div>
          <div id="life-story-text-note">
            ${r.note
              ? `<div class="life-story-text">${r.note}</div>`
              : '<div style="font-size:0.82rem;color:var(--text-dim)">No note yet.</div>'}
          </div>
        </div>

        <div class="life-story-section">
          <div class="life-story-section-title" data-section="decision">Decision</div>
          <div id="life-story-text-decision">
            ${r.decision
              ? `<div class="life-story-text">${r.decision}</div>`
              : '<div style="font-size:0.82rem;color:var(--text-dim)">No key decision recorded.</div>'}
          </div>
        </div>

        <div class="life-story-section">
          <div class="life-story-section-title" data-section="people">People</div>
          <div id="life-story-text-people">
            ${r.people
              ? `<div class="life-story-text">${r.people}</div>`
              : '<div style="font-size:0.82rem;color:var(--text-dim)">No key people recorded.</div>'}
          </div>
        </div>

        <div class="life-story-section">
          <div class="life-story-section-title">Connections</div>
          <div>${connHtml}</div>
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button class="life-story-edit-btn" id="life-story-edit-btn">✎ Edit</button>
          <button class="life-story-save-btn" id="life-story-save-btn">Save</button>
        </div>
      </div>`;
  }

  // ── Ideas ref panel — on-demand fetched content ──
  function buildIdeasRefHtml(refId) {
    const entry = _ideasCache[refId];
    if (!entry) {
      return `<div class="life-story-panel" id="life-story-panel">
        <div class="life-story-header">
          <div class="life-story-year" style="font-size:1rem;color:#8b5cf6">Loading…</div>
          <button class="life-story-close" id="life-story-close">✕ Close</button>
        </div>
      </div>`;
    }
    if (entry._error) {
      return `<div class="life-story-panel" id="life-story-panel">
        <div class="life-story-header">
          <div><div class="life-story-year" style="font-size:1rem;color:#ef4444">Referenced story not available</div></div>
          <button class="life-story-close" id="life-story-close">✕ Close</button>
        </div>
      </div>`;
    }
    const f = entry.fields || entry;
    return `
      <div class="life-story-panel" id="life-story-panel">
        <div class="life-story-header">
          <div>
            <div class="life-story-year" style="font-size:1.1rem;color:#8b5cf6">${escapeAttr(f.title || 'Untitled')}</div>
            <div class="life-story-meta">
              <span style="background:rgba(139,92,246,0.15);color:#8b5cf6;padding:0.08rem 0.4rem;border-radius:4px;font-size:0.67rem;font-weight:600">Ideas · Story</span>
              &nbsp;·&nbsp; ${f.date || ''}
              ${f.tags ? `&nbsp;·&nbsp; ${escapeAttr(f.tags)}` : ''}
            </div>
          </div>
          <button class="life-story-close" id="life-story-close">✕ Close</button>
        </div>
        <div class="life-story-section">
          <div class="life-story-text">${escapeAttr(f.content || 'No content.')}</div>
        </div>
      </div>`;
  }

  // ── Entry View ──
  // Definitive GROUPS — matches L204 field schema (2026-06-11)
  const GROUPS = [
    {
      id: 'performance', label: 'Performance',
      fields: [
        { key: 'financial_earn',  label: 'Financial ฿',    type: 'num'  },
        { key: 'achievement',     label: 'Achievement',    type: 'text' },
        { key: 'a_impact',        label: 'Impact',         type: 'text' },
        { key: 'failure',         label: 'Failure',        type: 'text' },
        { key: 'f_impact',        label: 'F.Impact',       type: 'text' },
        { key: 'company-school',  label: 'Company/School', type: 'text' },
        { key: 'title',           label: 'Title / Role',   type: 'text' }
      ]
    },
    {
      id: 'emotional', label: 'Strength',
      fields: [
        { key: 'happiness_factor', label: 'Happiness',    type: 'num'  },
        { key: 'health',           label: 'Health',       type: 'num'  },
        { key: 'relationship',     label: 'Relationship', type: 'text' },
        { key: 'knowledge_earn',   label: 'Skill',        type: 'text' }
      ]
    },
    {
      id: 'hobby', label: 'Experience',
      fields: [
        { key: 'hobby',    label: 'Hobby',    type: 'text' },
        { key: 'h_impact', label: 'H.Impact', type: 'text' },
        { key: 'travel',   label: 'Travel',   type: 'text' },
        { key: 't_impact', label: 'T.Impact', type: 'text' },
        { key: 'creation', label: 'Creation', type: 'text' }
      ]
    },
    {
      id: 'story', label: 'Story',
      fields: [
        { key: 'decision',   label: 'Decision',   type: 'text'     },
        { key: 'note',       label: 'Note',       type: 'longtext' },
        { key: 'people',     label: 'People',     type: 'text'     },
        { key: 'tags',       label: 'Tags',       type: 'text'     },
        { key: 'story_refs', label: 'Story Node', type: 'readonly' }
      ]
    }
  ];

  const _groupCollapsed = { performance: true, emotional: true, hobby: true, story: true };

  // Collapsed group cell: meaningful summary per group (L196)
  function csvCount(val) {
    if (!val) return 0;
    return String(val).split(',').map(function(s) { return s.trim(); }).filter(Boolean).length;
  }

  // Returns month rows for a year-level row if in Year View and months were loaded (L208)
  function getYearMonths(row) {
    if (_entryMode !== 'year') return null;
    const months = _allMonthsByYear[row.year];
    return (months && months.length > 0) ? months : null;
  }

  function collapsedSummary(groupId, row) {
    if (groupId === 'performance') {
      const monthRows = getYearMonths(row);
      let fin = row.financial_earn;
      let ach = row.achievement;
      if (monthRows) {
        const mFins = monthRows.filter(m => m.financial_earn != null);
        if (mFins.length > 0) fin = mFins.reduce(function(s, m) { return s + m.financial_earn; }, 0);
        const mAchs = monthRows.filter(m => m.achievement);
        if (mAchs.length > 0) ach = [row.achievement, ...mAchs.map(m => m.achievement)].filter(Boolean).join(',');
      }
      const finPct = (_finMax > 0 && fin != null && fin > 0)
        ? Math.min(100, Math.round((fin / _finMax) * 100)) : 0;
      const achItems = csvCount(ach);
      const achBonus = Math.min(100 - finPct, achItems * 20);
      if (fin == null && !ach) return '—';
      return (finPct + achBonus) + '%';
    }
    if (groupId === 'emotional') {
      const monthRows = getYearMonths(row);
      let hap = row.happiness_factor, hlt = row.health, rel = row.relationship, skl = row.knowledge_earn;
      if (monthRows) {
        const mHap = monthRows.filter(m => m.happiness_factor != null);
        if (mHap.length > 0) hap = mHap.reduce(function(s, m) { return s + m.happiness_factor; }, 0) / mHap.length;
        const mHlt = monthRows.filter(m => m.health != null);
        if (mHlt.length > 0) hlt = mHlt.reduce(function(s, m) { return s + m.health; }, 0) / mHlt.length;
        const mRel = monthRows.filter(m => m.relationship);
        if (mRel.length > 0) rel = mRel.map(m => m.relationship).join(',');
        const mSkl = monthRows.filter(m => m.knowledge_earn);
        if (mSkl.length > 0) skl = mSkl.map(m => m.knowledge_earn).join(',');
      }
      const allEmpty = hap == null && hlt == null && !rel && !skl;
      if (allEmpty) return '—';
      const hapVal = hap != null ? (hap / 10) * 25 : 0;
      const hltVal = hlt != null ? (hlt / 10) * 25 : 0;
      const relVal = Math.min(25, csvCount(rel) * 5);
      const sklVal = Math.min(25, csvCount(skl) * 5);
      return Math.min(100, Math.round(hapVal + hltVal + relVal + sklVal)) + '%';
    }
    if (groupId === 'hobby') {
      const monthRows = getYearMonths(row);
      let hb = row.hobby, tv = row.travel, cr = row.creation;
      if (monthRows) {
        const mHb = monthRows.filter(m => m.hobby);
        if (mHb.length > 0) hb = [row.hobby, ...mHb.map(m => m.hobby)].filter(Boolean).join(',');
        const mTv = monthRows.filter(m => m.travel);
        if (mTv.length > 0) tv = [row.travel, ...mTv.map(m => m.travel)].filter(Boolean).join(',');
        const mCr = monthRows.filter(m => m.creation);
        if (mCr.length > 0) cr = [row.creation, ...mCr.map(m => m.creation)].filter(Boolean).join(',');
      }
      const hCount = csvCount(hb), tCount = csvCount(tv), cCount = csvCount(cr);
      const total = hCount + tCount + cCount;
      if (total === 0) return '—';
      const parts = [hCount ? hCount+'h' : '', tCount ? tCount+'t' : '', cCount ? cCount+'c' : ''].filter(Boolean).join(' ');
      return '<span title="' + parts + '">' + total + 'p</span>';
    }
    if (groupId === 'story') {
      const monthRows = getYearMonths(row);
      let notePresent = !!row.note;
      const allIds = new Set();
      (row.story_refs || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(id) { allIds.add(id); });
      if (monthRows) {
        for (const m of monthRows) {
          if (m.note) notePresent = true;
          (m.story_refs || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(id) { allIds.add(id); });
        }
      }
      const total = (notePresent ? 1 : 0) + allIds.size;
      return total > 0 ? (total + ' refs') : '—';
    }
    return '—';
  }

  function buildEntryViewHtml(rows) {
    const yearSelect = (() => {
      if (_entryMode !== 'month') return '';
      let opts = '';
      for (let y = 1972; y <= 2037; y++) {
        opts += `<option value="${y}"${y === _entryYear ? ' selected' : ''}>${y}</option>`;
      }
      return `<select class="life-year-select" id="life-entry-year-select">${opts}</select>`;
    })();

    const dirtyCount = Object.keys(_dirty).length;
    const saveLabel  = dirtyCount > 0 ? `Save All (${dirtyCount})` : 'Save All';

    return `
      <div class="life-entry-body">
        <div class="life-entry-controls">
          <button class="life-entry-submode-btn${_entryMode === 'year' ? ' active' : ''}" data-submode="year">Year View</button>
          <button class="life-entry-submode-btn${_entryMode === 'month' ? ' active' : ''}" data-submode="month">Month View</button>
          ${yearSelect}
          <span class="life-save-status" id="life-save-status"></span>
          <button class="life-save-all-btn" id="life-save-all-btn">${saveLabel}</button>
        </div>
        <div class="life-grid-wrap" id="life-grid-wrap">
          <table class="life-grid-table" id="life-grid-table">
            ${buildGridHeader()}
            <tbody id="life-grid-body">
              ${buildGridRows(rows)}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function buildGridHeader() {
    const yearLabel = _entryMode === 'month' ? 'Mo' : 'Year';
    const groupRow = GROUPS.map(g => {
      const collapsed = _groupCollapsed[g.id];
      const span = collapsed ? 1 : g.fields.length;
      return `<th colspan="${span}"
        class="life-grid-group-header" data-group-toggle="${g.id}"
        style="cursor:pointer;user-select:none;text-align:left;border-bottom:1px solid var(--border)">
        ${g.label} ${collapsed ? '▶' : '▼'}
      </th>`;
    }).join('');

    const fieldLabelCells = GROUPS.flatMap(g => {
      if (_groupCollapsed[g.id]) {
        return [`<th style="text-align:center;min-width:40px"></th>`];
      }
      return g.fields.map(f =>
        `<th style="font-weight:400;white-space:nowrap;min-width:${f.type === 'num' ? '74' : f.type === 'readonly' ? '60' : '110'}px">${f.label}</th>`
      );
    }).join('');

    return `<thead>
      <tr>
        <th rowspan="2" style="width:64px;min-width:64px;position:sticky;left:0;background:var(--bg);z-index:5;vertical-align:bottom;border-bottom:1px solid var(--border)">${yearLabel}</th>
        <th rowspan="2" style="min-width:100px;position:sticky;left:64px;background:var(--bg);z-index:5;vertical-align:bottom;border-bottom:1px solid var(--border);padding:0.28rem 0.5rem;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);font-weight:600;white-space:nowrap">Location</th>
        ${groupRow}
      </tr>
      <tr>${fieldLabelCells}</tr>
    </thead>`;
  }

  function buildGridRows(rows) {
    return rows.map(row => {
      const yearLabel = _entryMode === 'month'
        ? (['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][row.month] || row.month)
        : row.year;
      const dataFlag = hasData(row) ? ' has-data' : ' no-data';

      const cells = GROUPS.flatMap(g => {
        if (_groupCollapsed[g.id]) {
          const summary = collapsedSummary(g.id, row);
          return [`<td style="text-align:center;font-family:var(--font-mono);font-size:0.68rem;color:var(--text-dim);padding:0.2rem 0.4rem">${summary}</td>`];
        }
        return g.fields.map(f => {
          const val        = row[f.key];
          const dirtyVal   = (_dirty[row.id] || {})[f.key];
          // val === val is false for NaN — guards against poisoned local record state
          const displayVal = dirtyVal !== undefined ? dirtyVal : (val != null && val === val ? val : '');

          // L194: inherited year value for empty month-mode cells
          const inheritedVal = (
            _entryMode === 'month' && _yearRecord && val == null && dirtyVal === undefined
          ) ? (_yearRecord[f.key] != null ? _yearRecord[f.key] : null) : null;

          const isDirty = dirtyVal !== undefined;

          if (f.type === 'readonly') {
            // story_refs: aggregate month rows in Year View (L209) — raw row.story_refs
            // only holds year-level refs; refs mounted to month rows would otherwise show —
            const monthRows = getYearMonths(row);
            let refCount;
            if (monthRows) {
              const allIds = new Set();
              (val || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(id) { allIds.add(id); });
              for (const m of monthRows) {
                (m.story_refs || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(id) { allIds.add(id); });
              }
              refCount = allIds.size;
            } else {
              refCount = csvCount(val);
            }
            const badge = refCount > 0
              ? `<span style="font-family:var(--font-mono);font-size:0.67rem;color:#8b5cf6;background:rgba(139,92,246,0.12);padding:0.1rem 0.4rem;border-radius:3px;white-space:nowrap">${refCount} refs</span>`
              : `<span style="font-family:var(--font-mono);font-size:0.67rem;color:var(--text-dim)">—</span>`;
            return `<td style="text-align:center;padding:0.2rem 0.4rem">${badge}</td>`;
          }
          if (f.type === 'num') {
            const placeholderAttr = (inheritedVal != null)
              ? `placeholder="${escapeAttr(inheritedVal)}" data-has-inherited="1"`
              : '';
            return `<td>
              <input type="text" inputmode="numeric" pattern="[0-9.\\-]*"
                class="life-grid-input${isDirty ? ' dirty' : ''}"
                data-record-id="${row.id}" data-field="${f.key}"
                value="${escapeAttr(displayVal)}"
                ${placeholderAttr}
                title="${f.key}">
              <span class="life-drag-handle" data-drag-field="${f.key}" data-record-id="${row.id}"></span>
            </td>`;
          }
          // text + longtext — same input element, longtext just gets wider min-width via CSS class
          {
            const placeholderAttr = (inheritedVal != null)
              ? `placeholder="${escapeAttr(inheritedVal)}" data-has-inherited="1"`
              : '';
            const extraClass = f.type === 'longtext' ? ' life-grid-longtext-input' : '';
            return `<td>
              <input type="text"
                class="life-grid-text-input${extraClass}${isDirty ? ' dirty' : ''}"
                data-record-id="${row.id}" data-field="${f.key}"
                value="${escapeAttr(displayVal)}"
                ${placeholderAttr}
                title="${f.key}">
            </td>`;
          }
        });
      });

      // L198: age = row.year − 1972 (born 1972 = age 0), never NaN
      const ageBase = _entryMode === 'month' ? _entryYear : row.year;
      const ageNum  = (typeof ageBase === 'number' && !isNaN(ageBase)) ? (ageBase - 1972) : null;
      const ageHtml = ageNum !== null
        ? `<div style="font-size:0.63rem;color:var(--text-dim);font-weight:400;margin-top:0.08rem">age ${ageNum}</div>`
        : '';

      const locVal     = (_dirty[row.id] || {}).location !== undefined ? (_dirty[row.id] || {}).location : (row.location || '');
      const isDirtyLoc = (_dirty[row.id] || {}).location !== undefined;

      return `<tr data-record-id="${row.id}">
        <td class="life-grid-year-cell${dataFlag}" style="width:64px;min-width:64px">
          <div>${yearLabel}</div>
          ${ageHtml}
        </td>
        <td style="position:sticky;left:64px;background:var(--bg);z-index:1;padding:0.2rem 0.3rem;min-width:100px">
          <input type="text"
            class="life-grid-text-input${isDirtyLoc ? ' dirty' : ''}"
            data-record-id="${row.id}" data-field="location"
            value="${escapeAttr(locVal)}"
            title="location">
        </td>
        ${cells.join('')}
      </tr>`;
    }).join('');
  }

  // ── Render ──
  function renderPanel() {
    const p = panel();
    if (!p) return;

    const kpiHtml  = buildKpiHtml();
    const modeHtml = `
      <div class="life-mode-toggle">
        <button class="life-mode-btn${_mode === 'life' ? ' active' : ''}" data-mode="life">Life View</button>
        <button class="life-mode-btn${_mode === 'entry' ? ' active' : ''}" data-mode="entry">Entry View</button>
      </div>`;

    let bodyHtml = '';
    if (_mode === 'life') {
      bodyHtml = buildLifeViewHtml();
    } else {
      const rows = _entryMode === 'month'
        ? (_monthRecords[_entryYear] || [])
        : _allRecords;
      bodyHtml = buildEntryViewHtml(rows);
    }

    p.innerHTML = `
      <div class="life-header">
        <div class="life-header-left">
          <div class="life-title">LIFE</div>
          <div class="life-subtitle">// your story through time</div>
        </div>
      </div>
      ${kpiHtml}
      ${modeHtml}
      ${bodyHtml}
      <div class="life-tooltip" id="life-tooltip"></div>`;

    bindEvents();
  }

  // ── Event binding ──
  function bindEvents() {
    const p = panel();
    if (!p) return;

    p.querySelectorAll('.life-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _mode = btn.dataset.mode;
        if (_mode === 'entry' && _entryMode === 'month') {
          loadMonthData(_entryYear).then(renderPanel);
          return;
        }
        renderPanel();
      });
    });

    if (_mode === 'life') {
      bindLifeViewEvents(p);
    } else {
      bindEntryViewEvents(p);
    }
  }

  function bindLifeViewEvents(p) {
    p.querySelectorAll('.life-line-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const line = btn.dataset.line;
        if (line === 'all') {
          const allOn = Object.values(_activeLines).every(v => v);
          const newVal = !allOn;
          Object.keys(_activeLines).forEach(k => { _activeLines[k] = newVal; });
        } else {
          _activeLines[line] = !_activeLines[line];
        }
        renderPanel();
      });
    });

    p.querySelectorAll('.life-scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _scale = btn.dataset.scale;
        renderPanel();
      });
    });

    const prevBtn = p.querySelector('#life-prev-decade');
    const nextBtn = p.querySelector('#life-next-decade');
    if (prevBtn) prevBtn.addEventListener('click', () => { _yearOffset = Math.max(0, _yearOffset - 1); renderPanel(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { _yearOffset = _yearOffset + 1; renderPanel(); });

    const tooltip = p.querySelector('#life-tooltip') || document.getElementById('life-tooltip');
    const svg = p.querySelector('#life-svg');

    if (svg) {
      svg.addEventListener('mousemove', e => {
        const node = e.target.closest('.life-year-node');
        if (node) {
          try {
            const tt = JSON.parse(node.dataset.tt.replace(/&quot;/g, '"'));
            tooltip.innerHTML = `<b>${tt.year}</b>${tt.loc ? `<br>📍 ${tt.loc}` : ''}${tt.score ? `<br>Score: ${tt.score}` : ''}${tt.tags ? `<br>${tt.tags}` : ''}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8) + 'px';
          } catch (_) {}
          return;
        }
        const arc = e.target.closest('[data-arc-tt]');
        if (arc) {
          try {
            const tt = JSON.parse(arc.dataset.arcTt.replace(/&quot;/g, '"'));
            tooltip.innerHTML = `${tt.from} → ${tt.to}<br>${tt.type}${tt.label ? `<br>${tt.label}` : ''}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8) + 'px';
          } catch (_) {}
          return;
        }
        // Swimlane stay bars
        const stay = e.target.closest('[data-stay-tt]');
        if (stay) {
          try {
            const tt = JSON.parse(stay.dataset.stayTt.replace(/&quot;/g, '"'));
            const yrs = tt.from === tt.to ? String(tt.from) : `${tt.from}–${tt.to}`;
            tooltip.innerHTML = `📍 ${tt.loc}<br>${yrs} · ${tt.years} yr${tt.years !== 1 ? 's' : ''}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8) + 'px';
          } catch (_) {}
          return;
        }
        // Visit dots
        const visit = e.target.closest('[data-visit-tt]');
        if (visit) {
          try {
            const tt = JSON.parse(visit.dataset.visitTt.replace(/&quot;/g, '"'));
            tooltip.innerHTML = `🔹 ${tt.loc}<br>${tt.month} ${tt.year} (visit)`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8) + 'px';
          } catch (_) {}
          return;
        }
        // Story ref squares
        const refNode = e.target.closest('[data-story-ref-tt]');
        if (refNode) {
          tooltip.innerHTML = refNode.dataset.storyRefTt;
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top  = (e.clientY - 8) + 'px';
          return;
        }
        tooltip.style.display = 'none';
      });

      svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      svg.addEventListener('click', e => {
        // Story ref square node click → fetch Ideas entry on demand
        const refSq = e.target.closest('[data-story-ref-id]');
        if (refSq) {
          const refId = refSq.dataset.storyRefId;
          _activeRefId = refId;
          _activeStory = null;
          if (_ideasCache[refId]) {
            renderPanel();
          } else {
            fetch(`/api/diary/${refId}`)
              .then(r => r.json())
              .then(data => {
                _ideasCache[refId] = data.record || data;
                renderPanel();
              })
              .catch(() => {
                _ideasCache[refId] = { _error: true };
                renderPanel();
              });
          }
          return;
        }
        // Year node click → open/close year story panel
        const node = e.target.closest('.life-year-node');
        if (node) {
          _activeRefId = null;
          _activeStory = _activeStory === node.dataset.id ? null : node.dataset.id;
          renderPanel();
        }
      });
    }

    const closeBtn = p.querySelector('#life-story-close');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      _activeStory = null;
      _activeRefId = null;
      renderPanel();
    });

    const editBtn = p.querySelector('#life-story-edit-btn');
    const saveBtn = p.querySelector('#life-story-save-btn');
    if (editBtn && saveBtn) {
      editBtn.addEventListener('click', () => {
        if (!_activeStory) return;
        const r = _allRecords.find(x => x.id === _activeStory);
        if (!r) return;
        ['note', 'decision', 'people'].forEach(field => {
          const container = document.getElementById(`life-story-text-${field}`);
          if (container) {
            container.innerHTML = `<textarea class="life-story-field" data-field="${field}" rows="4">${escapeAttr(r[field] || '')}</textarea>`;
          }
        });
        editBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
      });

      saveBtn.addEventListener('click', async () => {
        if (!_activeStory) return;
        const fields = {};
        ['note','decision','people'].forEach(field => {
          const ta = document.querySelector(`.life-story-field[data-field="${field}"]`);
          if (ta) fields[field] = ta.value;
        });
        try {
          const res = await fetch(`/api/life-timeline/${_activeStory}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
          });
          if (res.ok) {
            const data = await res.json();
            const idx  = _allRecords.findIndex(x => x.id === _activeStory);
            if (idx !== -1) _allRecords[idx] = data.record;
            buildLifeScores(_allRecords);
            renderPanel();
          }
        } catch (err) { console.error('Story save failed:', err); }
      });
    }
  }

  function bindEntryViewEvents(p) {
    p.querySelectorAll('.life-entry-submode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _entryMode = btn.dataset.submode;
        if (_entryMode === 'month') {
          loadMonthData(_entryYear).then(renderPanel);
        } else {
          _yearRecord = null;
          renderPanel();
        }
      });
    });

    const yearSel = p.querySelector('#life-entry-year-select');
    if (yearSel) {
      yearSel.addEventListener('change', () => {
        _entryYear = parseInt(yearSel.value, 10);
        delete _monthRecords[_entryYear]; // force refresh
        loadMonthData(_entryYear).then(renderPanel);
      });
    }

    p.querySelectorAll('[data-group-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const g = el.dataset.groupToggle;
        _groupCollapsed[g] = !_groupCollapsed[g];
        renderPanel();
      });
    });

    const grid = p.querySelector('#life-grid-table');
    if (grid) {
      // Input change — dirty tracking; respect inherited placeholders
      grid.addEventListener('input', e => {
        const input = e.target.closest('[data-record-id][data-field]');
        if (!input) return;
        const id    = input.dataset.recordId;
        const field = input.dataset.field;
        const val   = input.value;

        if (val === '' && input.dataset.hasInherited) {
          // Cleared back to empty — revert to inherited placeholder, not dirty
          if (_dirty[id]) {
            delete _dirty[id][field];
            if (Object.keys(_dirty[id]).length === 0) delete _dirty[id];
          }
          input.classList.remove('dirty');
        } else {
          if (!_dirty[id]) _dirty[id] = {};
          _dirty[id][field] = val;
          input.classList.add('dirty');
        }

        const saveBtn = p.querySelector('#life-save-all-btn');
        if (saveBtn) {
          const count = Object.keys(_dirty).length;
          saveBtn.textContent = count > 0 ? `Save All (${count})` : 'Save All';
        }
      });

      // Drag fill — register listeners inside mousedown so each drag gets fresh cleanup
      grid.addEventListener('mousedown', e => {
        const handle = e.target.closest('.life-drag-handle');
        if (!handle) return;
        e.preventDefault();
        const id    = handle.dataset.recordId;
        const field = handle.dataset.dragField;
        const input = grid.querySelector(`input[data-record-id="${id}"][data-field="${field}"]`);
        _dragField     = field;
        _dragValue     = input ? input.value : '';
        _dragging      = true;
        _dragStartId   = id;
        _preDragDirty  = JSON.parse(JSON.stringify(_dirty));
        _dragFilledIds = [];

        if (_dragStopFn) _dragStopFn();

        function stopDrag() {
          _dragging    = false;
          _dragField   = null;
          _dragStartId = null;
          document.removeEventListener('mouseup', stopDrag);
          document.removeEventListener('keydown', onEscape);
          p.removeEventListener('mouseleave', stopDrag);
          _dragStopFn = null;
        }

        function onEscape(ev) {
          if (ev.key !== 'Escape') return;
          for (const rid of _dragFilledIds) {
            const inp = grid.querySelector(`input[data-record-id="${rid}"][data-field="${_dragField}"]`);
            if (inp) {
              const prev = (_preDragDirty[rid] || {})[_dragField];
              inp.value = prev !== undefined ? prev : '';
              if (prev !== undefined) {
                if (!_dirty[rid]) _dirty[rid] = {};
                _dirty[rid][_dragField] = prev;
              } else {
                if (_dirty[rid]) {
                  delete _dirty[rid][_dragField];
                  if (Object.keys(_dirty[rid]).length === 0) delete _dirty[rid];
                }
                inp.classList.remove('dirty');
              }
            }
          }
          _dirty = _preDragDirty;
          stopDrag();
        }

        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('keydown', onEscape);
        p.addEventListener('mouseleave', stopDrag);
        _dragStopFn = stopDrag;
      });

      grid.addEventListener('mousemove', e => {
        if (!_dragging) return;
        const row = e.target.closest('tr[data-record-id]');
        if (!row) return;
        const targetId = row.dataset.recordId;
        if (targetId === _dragStartId) return;
        const targetInput = grid.querySelector(`input[data-record-id="${targetId}"][data-field="${_dragField}"]`);
        if (targetInput && targetInput.value !== _dragValue) {
          targetInput.value = _dragValue;
          targetInput.classList.add('dirty');
          if (!_dirty[targetId]) _dirty[targetId] = {};
          _dirty[targetId][_dragField] = _dragValue;
          if (!_dragFilledIds.includes(targetId)) _dragFilledIds.push(targetId);
        }
      });
    }

    // Save All — batch PATCH, respects all field types including text
    const saveAllBtn = p.querySelector('#life-save-all-btn');
    if (saveAllBtn) {
      saveAllBtn.addEventListener('click', async () => {
        const updates = Object.entries(_dirty).map(([id, fields]) => ({ id, fields }));
        if (updates.length === 0) return;

        const statusEl = p.querySelector('#life-save-status');
        if (statusEl) statusEl.textContent = `Saving ${updates.length} rows…`;
        saveAllBtn.disabled = true;

        // Must match L204 schema exactly
        const NUM_FIELDS  = ['year', 'month', 'age', 'financial_earn', 'happiness_factor', 'health'];
        const TEXT_FIELDS = [
          'name', 'location', 'knowledge_earn', 'relationship', 'creation',
          'achievement', 'failure', 'travel', 'hobby', 'tags', 'people',
          'story_refs', 'company-school', 'title',
          'a_impact', 'f_impact', 't_impact', 'h_impact', 'decision', 'note'
        ];

        const errors = [];
        for (let i = 0; i < updates.length; i += 10) {
          const batch = updates.slice(i, i + 10);
          try {
            const res = await fetch('/api/life-timeline/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: batch })
            });
            if (!res.ok) {
              errors.push(await res.text());
            } else {
              for (const u of batch) {
                const rec = _allRecords.find(r => r.id === u.id)
                  || (_monthRecords[_entryYear] || []).find(r => r.id === u.id);
                if (rec) {
                  for (const [k, v] of Object.entries(u.fields)) {
                    if (NUM_FIELDS.includes(k))  { const n = Number(v); rec[k] = (v !== '' && v != null && !isNaN(n)) ? Math.round(n) : null; }
                    if (TEXT_FIELDS.includes(k)) rec[k] = v || null;
                  }
                }
                // Saved — safe to clear this record's dirty state
                delete _dirty[u.id];
              }
            }
          } catch (err) {
            errors.push(err.message);
          }
        }

        // Failed batches keep their _dirty entries — typed values survive
        // the re-render and the user can retry Save All.
        buildLifeScores(_allRecords);
        saveAllBtn.disabled = false;

        if (errors.length === 0) {
          if (statusEl) {
            statusEl.textContent = 'Saved ✓';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
          }
        } else {
          if (statusEl) statusEl.textContent = `${errors.length} error(s): ${errors[0]}`;
        }

        renderPanel();
      });
    }
  }

  // ── Init ──
  async function init() {
    if (_initialized) {
      await loadData();
      renderPanel();
      return;
    }
    _initialized = true;
    ensureStyles();

    const p = panel();
    if (!p) return;
    p.innerHTML = `<div style="padding:2rem;font-family:var(--font-mono);font-size:0.8rem;color:var(--text-dim)">Loading life timeline…</div>`;

    await loadData();
    renderPanel();
  }

  // ── Two-check pattern (L045) ──
  window.addEventListener('panelactivated', e => {
    if (e.detail !== ROUTE) return;
    init();
  });

  const _p = document.getElementById(PANEL_ID);
  if (_p && _p.classList.contains('active')) init();

})();
