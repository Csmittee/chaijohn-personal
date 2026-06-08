/* dash-overview.injector.js — M1.0 Dashboard Circuit Board v2
 * SVG viewBox: 0 0 900 680. Layout locked per L172–L178.
 * Coordinates: Earn/Asset y=108 h=165 midY=191. Expense/Liability y=283 h=165 midY=366.
 * YOU: cx=450 cy=330 r=46. South: y=520 h=148.
 */
(function () {
  'use strict';

  let initialized = false;
  let _bizActive = { iflex: true, daje: true, satu: false, ploikong: false };
  let _data = null;
  let _nodePos = {};
  const KV_POS_KEY = 'dashboard:node-positions';

  window._dcJustDragged = false;

  const fmt = n => '฿' + Math.round(Number(n || 0)).toLocaleString('en');

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw Object.assign(new Error('API ' + r.status), { status: r.status });
    return r.json();
  }

  const flat = r => (r && r.fields) ? { id: r.id, ...r.fields } : r;

  /* ── KV node position helpers ── */
  async function loadNodePositions() {
    try {
      const r = await fetch('/api/kv?key=' + KV_POS_KEY, { credentials: 'same-origin' });
      if (r.ok) {
        const d = await r.json();
        return d.value ? JSON.parse(d.value) : null;
      }
    } catch { /* KV endpoint absent — session-only drag */ }
    return null;
  }

  async function saveNodePositions(pos) {
    try {
      await fetch('/api/kv', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: KV_POS_KEY, value: JSON.stringify(pos) })
      });
    } catch { /* ignore */ }
  }

  /* ── Styles ── */
  function ensureStyles() {
    if (document.getElementById('dc-css')) return;
    const s = document.createElement('style');
    s.id = 'dc-css';
    s.textContent = `
      #panel-dashboard.active{display:flex;flex-direction:column;overflow-y:auto;min-height:0}
      @keyframes flow-fwd{to{stroke-dashoffset:-18}}
      @keyframes flow-rev{to{stroke-dashoffset:18}}
      @keyframes blink-ring{0%,100%{opacity:1}50%{opacity:0.1}}
      @keyframes blink-lbl{0%,100%{opacity:1}50%{opacity:0.1}}
      @keyframes hb-s{0%,100%{opacity:1}10%,30%{opacity:0.1}20%{opacity:1}}
      @keyframes hb-n{0%,100%{opacity:1}15%{opacity:0.2}}
      .tf-earn{stroke-dasharray:6 3;animation:flow-fwd 1.2s linear infinite;stroke:#22c55e}
      .tf-exp{stroke-dasharray:6 3;animation:flow-fwd 1.0s linear infinite;stroke:#ef4444}
      .tf-drain{stroke-dasharray:6 3;animation:flow-rev 1.0s linear infinite;stroke:#ef4444}
      .tf-asset{stroke-dasharray:6 3;animation:flow-fwd 2.0s linear infinite;stroke:#3b82f6}
      .tf-liab-p{stroke-dasharray:6 3;animation:flow-fwd 2.0s linear infinite;stroke:#8b5cf6}
      .tf-orange{stroke-dasharray:6 3;animation:flow-fwd 2.0s linear infinite;stroke:#f97316}
      .tf-ff{stroke-dasharray:6 3;animation:flow-fwd 2.4s linear infinite;stroke:#f59e0b}
      .tf-cyan{stroke-dasharray:6 3;animation:flow-fwd 1.8s linear infinite;stroke:#22c55e}
      .tf-repay{stroke-dasharray:4 4;animation:flow-fwd 3.0s linear infinite;stroke:#a78bfa;opacity:.65}
      .tf-sub-blue{stroke-dasharray:6 3;animation:flow-fwd 2.0s linear infinite;stroke:#3b82f6}
      .tf-sub-purp{stroke-dasharray:6 3;animation:flow-fwd 2.1s linear infinite;stroke:#8b5cf6}
      .tf-sub-cyan{stroke-dasharray:6 3;animation:flow-fwd 2.2s linear infinite;stroke:#06b6d4}
      .blink-ring{animation:blink-ring 1.4s ease-in-out infinite}
      .blink-lbl{animation:blink-lbl 1.4s ease-in-out infinite}
      .hb-s{animation:hb-s 2.2s ease-in-out infinite}
      .hb-n{animation:hb-n 3.2s ease-in-out infinite}
      .kpi-strip{display:flex;gap:5px;padding:8px 12px 6px;background:#0a0a10;flex-shrink:0;border-bottom:1px solid #1a2030}
      .kpi-c{flex:1;background:#0f1623;border-radius:5px;padding:6px 7px;border-top:3px solid var(--cc,#374151)}
      .kpi-lbl{font:500 7px/1 monospace;text-transform:uppercase;color:#4b5563;letter-spacing:.05em}
      .kpi-val{font:700 13px/1.4 monospace;color:#f3f4f6;margin:2px 0 1px}
      .kpi-sub{font:400 6.5px/1 monospace;color:#374151}
      .kpi-bar{height:3px;border-radius:2px;background:#1f2937;margin-top:4px;overflow:hidden}
      .kpi-fill{height:100%;border-radius:2px;background:var(--cc,#374151)}
      .cw{flex:1;padding:4px 8px 8px;display:flex;justify-content:center;align-items:flex-start;min-height:0}
      .c-svg{width:100%;max-width:900px;height:auto;display:block}
      .nt{cursor:pointer}.nt:hover{opacity:.82}
      .drag-node{cursor:grab}.drag-node:active{cursor:grabbing}
    `;
    document.head.appendChild(s);
  }

  /* ── KPI strip — logic unchanged from v1 ── */
  function kpiHTML(d) {
    const ym = new Date().toISOString().slice(0, 7);
    const earn = (d.tx || []).filter(t => t.type === 'Income' && t.source !== 'LiabilityCreation' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const exp  = (d.tx || []).filter(t => t.type === 'Expense' && t.source !== 'LiabilityPayment' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const budEnv = (d.budgets || []).filter(b => b.active !== false).reduce((s, b) => {
      const a = Number(b.amount || 0), p = b.period || 'Monthly';
      return s + (p === 'Annual' ? a / 12 : p === '3x-year' ? a * 3 / 12 : p === '6x-year' ? a * 6 / 12 : a);
    }, 0);
    const expPct = budEnv > 0 ? Math.min(200, Math.round(exp / budEnv * 100)) : 0;

    const liabBal = (d.liab || []).filter(l => l.active !== false).reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const liabPay = (d.liab || []).filter(l => l.active !== false).reduce((s, l) => s + Number(l.monthly_payment || 0), 0);
    const liabPct = liabBal > 0 ? Math.min(100, Math.round(liabPay / liabBal * 100)) : 0;

    const haMV   = (d.hardAssets || []).reduce((s, a) => s + Number(a.current_value || 0), 0);
    const haCost = (d.hardAssets || []).reduce((s, a) => s + Number(a.purchase_price || 0), 0);
    const lev    = haCost > 0 ? haMV / haCost : 0;

    const cells = [
      { label:'Income Sufficiency', c:'#22c55e', v: earn>0?fmt(earn):'—',          sub:'current month earn',       bar: earn>0?Math.min(100,Math.round(earn/50000*100)):0 },
      { label:'Expense Discipline', c:'#ef4444', v: budEnv>0?expPct+'%':'—',        sub: exp>0?fmt(exp)+' used':'of budget', bar: expPct },
      { label:'Liability Load',     c:'#f59e0b', v: liabBal>0?liabPct+'%':'—',      sub:'monthly pmts ÷ balance',   bar: liabPct },
      { label:'Asset Leverage',     c:'#3b82f6', v: haCost>0?lev.toFixed(2)+'×':'—',sub: haMV>0?fmt(haMV)+' mkt':'—', bar: Math.min(100,lev>1?Math.round((lev-1)*50):0) },
      { label:'Project Conversion', c:'#06b6d4', v:'0/2',                            sub:'Satu · Ploikong · Aug 2026', bar:0 },
    ];

    return `<div class="kpi-strip">${cells.map(c=>`
      <div class="kpi-c" style="--cc:${c.c}">
        <div class="kpi-lbl">${c.label}</div>
        <div class="kpi-val">${c.v}</div>
        <div class="kpi-sub">${c.sub}</div>
        <div class="kpi-bar"><div class="kpi-fill" style="width:${c.bar}%"></div></div>
      </div>`).join('')}</div>`;
  }

  /* ── 4 Meter cards ── */
  function meterCards(d) {
    const haMV    = (d.hardAssets || []).reduce((s, a) => s + Number(a.current_value || 0), 0);
    const collVal = (d.assets || []).filter(a => a.status !== 'Sold').reduce((s, a) => s + Number(a.estimated_value || 0), 0);
    const liabBal = (d.liab || []).filter(l => l.active !== false).reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const nw      = haMV + collVal - liabBal;
    const nwStr   = nw >= 0 ? fmt(nw) : '−' + fmt(-nw);
    const d2z     = d.syncPoint?.daysToZero ?? (d.syncPoint?.days_to_zero ?? '—');
    const debtStr = liabBal > 0 ? fmt(liabBal) : '—';

    const cards = [
      { label:'Net Worth',     value: nwStr,               color:'#a78bfa' },
      { label:'Days to ฿0',   value: String(d2z),          color:'#ef4444' },
      { label:'Total Debt',    value: debtStr,              color:'#f59e0b' },
      { label:'Project Value', value:'0 / 2 · Satu+Ploi',  color:'#22c55e' },
    ];

    return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px 12px 7px;background:#0a0a10;flex-shrink:0;border-bottom:1px solid #1a2030">
${cards.map(c=>`  <div style="background:#111827;border:1px solid #1f2937;border-radius:5px;padding:6px 8px;min-width:0">
    <div style="font:500 6.5px/1 monospace;text-transform:uppercase;color:#4b5563;letter-spacing:.04em">${c.label}</div>
    <div style="font:700 13px/1.6 monospace;color:${c.color};margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.value}</div>
  </div>`).join('\n')}
</div>`;
  }

  /* ── SVG Circuit v2 ── */
  function svgCircuit(d) {
    const ym = new Date().toISOString().slice(0, 7);
    const earn = (d.tx || []).filter(t => t.type === 'Income' && t.source !== 'LiabilityCreation' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const exp  = (d.tx || []).filter(t => t.type === 'Expense' && t.source !== 'LiabilityPayment' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const surplus      = earn - exp;
    const surplusColor = surplus >= 0 ? '#22c55e' : '#ef4444';
    const surplusStr   = (earn > 0 || exp > 0) ? (surplus >= 0 ? fmt(surplus) : '−' + fmt(-surplus)) : '—';

    const haMV        = (d.hardAssets || []).reduce((s, a) => s + Number(a.current_value || 0), 0);
    const haCost      = (d.hardAssets || []).reduce((s, a) => s + Number(a.purchase_price || 0), 0);
    const collVal     = (d.assets || []).filter(a => a.status !== 'Sold').reduce((s, a) => s + Number(a.estimated_value || 0), 0);
    const liabBal     = (d.liab || []).filter(l => l.active !== false).reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const totalAssets = haMV + collVal;
    const assetLev    = haCost > 0 ? haMV / haCost : 0;
    const haLev       = haCost > 0 ? assetLev.toFixed(2) + '×' : '—';
    const nw          = totalAssets - liabBal;
    const nwStr       = nw >= 0 ? fmt(nw) : '−' + fmt(-nw);

    const bankDebt = (d.liab || []).filter(l => l.active !== false && l.creditor_type === 'Bank')
      .reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const ffDebt   = (d.liab || []).filter(l => l.active !== false && (l.creditor_type === 'Friend' || l.creditor_type === 'Family'))
      .reduce((s, l) => s + Number(l.current_balance || 0), 0);

    let o = '';

    /* grid + north label */
    o += `<rect width="900" height="680" fill="url(#pcbg2)"/>
<text x="450" y="10" text-anchor="middle" fill="#1a2535" font-size="7" letter-spacing="2" font-family="monospace">NORTH · INCOME GENERATORS</text>`;

    /* ── West boundary ── */
    o += `<rect x="18" y="100" width="220" height="390" rx="5" fill="none" stroke="#1a4028" stroke-width="1" stroke-dasharray="5 4"/>
<text x="128" y="97" text-anchor="middle" fill="#22c55e" font-size="7" font-weight="700" font-family="monospace">WEST · M2.1 CASHFLOW</text>`;

    /* M2.2 Earn block — midY=191 */
    o += `<g class="nt" onclick="window._dNav('sales')">
  <rect x="28" y="108" width="200" height="165" rx="5" fill="#040d06" stroke="#22c55e" stroke-width="1.5"/>
  <text x="128" y="124" text-anchor="middle" fill="#22c55e" font-size="10" font-weight="700" font-family="monospace">M2.2 EARN IN</text>
  <text x="128" y="162" text-anchor="middle" fill="#4ade80" font-size="28" font-weight="700">${earn>0?fmt(earn):'—'}</text>
  <text x="128" y="180" text-anchor="middle" fill="#4ade80" font-size="9">income this month</text>
  <text x="128" y="196" text-anchor="middle" fill="#1a4028" font-size="7">click → Sales panel</text>
  <text x="128" y="210" text-anchor="middle" fill="#1a4028" font-size="7">● ● ●</text>
</g>`;

    /* M2.3 Expense block — midY=366 */
    o += `<g class="nt" onclick="window._dNav('expenses')">
  <rect x="28" y="283" width="200" height="165" rx="5" fill="#0d0404" stroke="#ef4444" stroke-width="1.5"/>
  <text x="128" y="299" text-anchor="middle" fill="#ef4444" font-size="10" font-weight="700" font-family="monospace">M2.3 EXPENSE OUT</text>
  <text x="128" y="337" text-anchor="middle" fill="#f87171" font-size="28" font-weight="700">${exp>0?fmt(exp):'—'}</text>
  <text x="128" y="355" text-anchor="middle" fill="#f87171" font-size="9">spent this month</text>
  <text x="52" y="370" fill="#4b1c1c" font-size="7">① Life drain →</text>
  <text x="52" y="382" fill="#4b1c1c" font-size="7">② Interest → debt entity →</text>
  <text x="52" y="394" fill="#4b1c1c" font-size="7">③ Owner invest → Liability →</text>
</g>`;

    /* West: surplus + net worth row */
    o += `<rect x="28" y="458" width="96" height="24" rx="4" fill="#08100d"/>
<text x="36" y="467" fill="#2d4a3a" font-size="6" font-weight="700">SURPLUS</text>
<text x="36" y="477" fill="${surplusColor}" font-size="7" font-weight="700" class="hb-s">${surplusStr}</text>
<rect x="132" y="458" width="96" height="24" rx="4" fill="#08100d"/>
<text x="140" y="467" fill="#2d2d4a" font-size="6" font-weight="700">NET WORTH</text>
<text x="140" y="477" fill="#a78bfa" font-size="7" font-weight="700" class="hb-n">${nwStr}</text>`;

    /* ── East boundary ── */
    o += `<rect x="662" y="100" width="220" height="390" rx="5" fill="none" stroke="#1a3a5c" stroke-width="1" stroke-dasharray="5 4"/>
<text x="772" y="97" text-anchor="middle" fill="#3b82f6" font-size="7" font-weight="700" font-family="monospace">EAST · M3 BOUNDARY</text>`;

    /* Total Assets block — midY=191 */
    o += `<g class="nt" onclick="window._dNav('hard-assets')">
  <rect x="672" y="108" width="200" height="165" rx="5" fill="#04060d" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="772" y="124" text-anchor="middle" fill="#3b82f6" font-size="10" font-weight="700" font-family="monospace">TOTAL ASSETS</text>
  <text x="772" y="162" text-anchor="middle" fill="#60a5fa" font-size="28" font-weight="700">${totalAssets>0?fmt(totalAssets):'—'}</text>
  <text x="772" y="180" text-anchor="middle" fill="#3b82f6" font-size="9">market value · ${haLev} leverage</text>
  <text x="772" y="196" text-anchor="middle" fill="#1e3a5f" font-size="7">← sub-assets inject from left</text>
  <text x="772" y="210" text-anchor="middle" fill="#1e3a5f" font-size="7">● ● ●</text>
</g>`;

    /* Total Liabilities block — midY=366 */
    o += `<g class="nt" onclick="window._dNav('liabilities')">
  <rect x="672" y="283" width="200" height="165" rx="5" fill="#0d0404" stroke="#ef4444" stroke-width="2"/>
  <text x="772" y="299" text-anchor="middle" fill="#ef4444" font-size="10" font-weight="700" font-family="monospace">TOTAL LIABILITIES</text>
  <text x="772" y="337" text-anchor="middle" fill="#f87171" font-size="28" font-weight="700">${liabBal>0?fmt(liabBal):'—'}</text>
  <text x="772" y="355" text-anchor="middle" fill="#ef4444" font-size="9">all active debt</text>
  <text x="692" y="370" fill="#4b1c1c" font-size="7">① Bank debt: ${bankDebt>0?fmt(bankDebt):'฿0'}</text>
  <text x="692" y="382" fill="#4b1c1c" font-size="7">② F/F debt: ${ffDebt>0?fmt(ffDebt):'฿0'}</text>
  <text x="692" y="394" fill="#4b1c1c" font-size="7">③ Owner (projects): ฿0</text>
</g>`;

    /* East: net asset row */
    o += `<rect x="672" y="458" width="200" height="24" rx="4" fill="#0a080f"/>
<text x="682" y="474" fill="#a78bfa" font-size="9" font-weight="700">NET ASSET POSITION · ${nwStr} NET</text>`;

    /* ── Sub-asset circles (cx=632 — between YOU and East boundary) ── */
    /* M3.3 Hard Assets */
    o += `<g class="nt" onclick="window._dNav('hard-assets')">
  <circle cx="632" cy="135" r="28" fill="#04060d" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="632" y="130" text-anchor="middle" fill="#3b82f6" font-size="7" font-weight="700">M3.3</text>
  <text x="632" y="141" text-anchor="middle" fill="#60a5fa" font-size="7">Hard Assets</text>
  <text x="632" y="152" text-anchor="middle" fill="#3b82f6" font-size="6">${haMV>0?fmt(haMV):'—'}</text>
</g>`;

    /* M3.2 Collection */
    o += `<g class="nt" onclick="window._dNav('collection')">
  <circle cx="632" cy="210" r="28" fill="#08050d" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="632" y="205" text-anchor="middle" fill="#8b5cf6" font-size="7" font-weight="700">M3.2</text>
  <text x="632" y="216" text-anchor="middle" fill="#a78bfa" font-size="7">Collection</text>
  <text x="632" y="227" text-anchor="middle" fill="#8b5cf6" font-size="6">${collVal>0?fmt(collVal):'—'}</text>
</g>`;

    /* M3.4 Projects */
    o += `<g class="nt" onclick="window._dNav('proj-assets')">
  <circle cx="632" cy="285" r="28" fill="#05080d" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="632" y="280" text-anchor="middle" fill="#06b6d4" font-size="7" font-weight="700">M3.4</text>
  <text x="632" y="291" text-anchor="middle" fill="#67e8f9" font-size="7">Projects</text>
  <text x="632" y="302" text-anchor="middle" fill="#06b6d4" font-size="6">(launch→North)</text>
</g>`;

    /* MindMap / Ideas */
    o += `<g class="nt" onclick="window._dNav('mindmap')">
  <circle cx="632" cy="355" r="22" fill="#060608" stroke="#374151" stroke-width="1" stroke-dasharray="3 3"/>
  <text x="632" y="351" text-anchor="middle" fill="#4b5563" font-size="7" font-weight="700">MindMap</text>
  <text x="632" y="362" text-anchor="middle" fill="#374151" font-size="5">idea seeds project</text>
</g>`;

    /* ── South boundary ── */
    o += `<rect x="120" y="520" width="660" height="148" rx="6" fill="none" stroke="#2d1f4a" stroke-width="1" stroke-dasharray="4 4"/>
<text x="450" y="516" text-anchor="middle" fill="#4c1d95" font-size="7" font-family="monospace">SOUTH · LIABILITY CREATORS</text>`;

    /* South circles — draggable */
    const southNodes = [
      { key:'house',  cx:250, cy:558, r:34, label:'HOUSE',          detail:'10yr loan · ฿2.9M→7M+', sub:'↑ debt out',    stroke:'#8b5cf6', da:'',                    fill:'#08050f', subColor:'#ef4444' },
      { key:'car',    cx:380, cy:558, r:34, label:'CAR',            detail:'loan → biz cash',        sub:'↑ debt out',    stroke:'#8b5cf6', da:'',                    fill:'#08050f', subColor:'#ef4444' },
      { key:'family', cx:250, cy:616, r:34, label:'FAMILY/FRIENDS', detail:'no interest · obligation',sub:'↑ obligation',  stroke:'#f59e0b', da:'stroke-dasharray="5 3"', fill:'#09070a', subColor:'#f59e0b' },
      { key:null,     cx:380, cy:616, r:34, label:'+ NEW',          detail:'future slot',             sub:'',              stroke:'#1f2937', da:'stroke-dasharray="3 4"', fill:'#06060a', subColor:'#374151' },
    ];

    southNodes.forEach(n => {
      const pos  = _nodePos[n.key || '_new'] || { dx:0, dy:0 };
      const drag = n.key ? `data-draggable="true" data-node-key="${n.key}" class="drag-node"` : 'class="nt"';
      const click= n.key ? `onclick="if(!window._dcJustDragged)window._dLiab('${n.key}')"` : '';
      o += `<g ${drag} transform="translate(${pos.dx},${pos.dy})" ${click}>
  <circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="1.5" ${n.da}/>
  <text x="${n.cx}" y="${n.cy-12}" text-anchor="middle" fill="${n.stroke}" font-size="10" font-weight="700">${n.label}</text>
  <text x="${n.cx}" y="${n.cy+2}"  text-anchor="middle" fill="#6b7280" font-size="8">${n.detail}</text>
  <text x="${n.cx}" y="${n.cy+15}" text-anchor="middle" fill="${n.subColor}" font-size="7">${n.sub}</text>
</g>`;
    });

    /* ── North circles — draggable ── */
    const bizDefs = [
      { key:'iflex',    cx:190, cy:58 },
      { key:'daje',     cx:340, cy:46 },
      { key:'satu',     cx:490, cy:42 },
      { key:'ploikong', cx:630, cy:46 },
    ];
    const bizLabels = { iflex:'i-Flex Pilates', daje:'Daje Claw', satu:'Satu', ploikong:'Ploikong' };

    bizDefs.forEach(biz => {
      const act   = _bizActive[biz.key];
      const pos   = _nodePos[biz.key] || { dx:0, dy:0 };
      const stk   = act ? '#22c55e' : '#1a4028';
      const da    = act ? '' : 'stroke-dasharray="4 3"';
      const tc    = act ? '#4ade80' : '#374151';
      const sc    = act ? '#22c55e' : '#374151';
      const sl    = act ? '● ACTIVE' : '○ INACTIVE';
      const fill  = act ? '#050f08' : '#080d14';
      o += `<g class="drag-node" data-draggable="true" data-node-key="${biz.key}" transform="translate(${pos.dx},${pos.dy})" onclick="if(!window._dcJustDragged)window._dTog('${biz.key}')">
  <circle cx="${biz.cx}" cy="${biz.cy}" r="36" fill="${fill}" stroke="${stk}" stroke-width="${act?1.8:1}" ${da}/>
  <text x="${biz.cx}" y="${biz.cy-12}" text-anchor="middle" fill="${tc}"  font-size="9"  font-weight="700">${bizLabels[biz.key]}</text>
  <text x="${biz.cx}" y="${biz.cy+3}"  text-anchor="middle" fill="${act?'#2d6a4f':'#2d3748'}" font-size="8">฿0 value</text>
  <text x="${biz.cx}" y="${biz.cy+17}" text-anchor="middle" fill="${sc}"  font-size="7"  font-weight="700">${sl}</text>
</g>`;
    });

    /* ── YOU node ── */
    o += `<circle cx="450" cy="330" r="56" fill="none" stroke="#4c1d95" stroke-width="1" stroke-dasharray="3 3" class="blink-ring"/>
<circle cx="450" cy="330" r="46" fill="#08050f" stroke="#7c3aed" stroke-width="2"/>
<text x="450" y="326" text-anchor="middle" fill="#a78bfa" font-size="16" font-weight="700">YOU</text>
<text x="450" y="340" text-anchor="middle" fill="#4c1d95" font-size="7">command center</text>`;

    /* ── YOU hands — 4 thick static lines to exact block midpoints (L173) ── */
    /* → Earn: (404,300) → (228,191) */
    o += `<line x1="404" y1="300" x2="228" y2="191" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>
<circle cx="228" cy="191" r="5" fill="#22c55e"/>`;
    /* → Expense: (404,350) → (228,366) */
    o += `<line x1="404" y1="350" x2="228" y2="366" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
<circle cx="228" cy="366" r="5" fill="#ef4444"/>`;
    /* → Asset: (496,300) → (672,191) */
    o += `<line x1="496" y1="300" x2="672" y2="191" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
<circle cx="672" cy="191" r="5" fill="#3b82f6"/>`;
    /* → Liability: (496,350) → (672,366) */
    o += `<line x1="496" y1="350" x2="672" y2="366" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
<circle cx="672" cy="366" r="5" fill="#ef4444"/>`;

    /* ── Animated flows ── */

    /* Biz earn → M2.2 top (active nodes only) */
    const earnEntryXs = [60, 95, 130, 165];
    bizDefs.forEach((biz, i) => {
      if (!_bizActive[biz.key]) return;
      const pos = _nodePos[biz.key] || { dx:0, dy:0 };
      const fx  = biz.cx + pos.dx;
      const fy  = biz.cy + 36 + pos.dy;
      const tx  = earnEntryXs[i], ty = 108;
      o += `<path d="M${fx} ${fy} C${fx} ${fy+20} ${tx} ${ty-18} ${tx} ${ty}" fill="none" stroke-width="1.8" class="tf-earn"/>`;
    });

    /* M2.2 Earn → YOU left: (228,191) → (404,310) */
    o += `<path d="M228 191 C300 191 360 310 404 310" fill="none" stroke-width="1.5" class="tf-cyan"/>`;

    /* Expense ① Life drain exits left: (28,366) → (8,500) */
    o += `<path d="M28 366 C18 366 8 430 8 500" fill="none" stroke-width="1.5" class="tf-drain"/>`;

    /* Expense ② Interest → House: (128,448) → (250,524) */
    o += `<path d="M128 448 C128 484 250 490 250 524" fill="none" stroke-width="1.3" class="tf-exp"/>`;

    /* Expense ② Interest → Car: (128,448) → (380,524) */
    o += `<path d="M128 448 C160 490 340 490 380 524" fill="none" stroke-width="1.2" class="tf-exp"/>`;

    /* Expense ③ Owner invest → Liability: (228,394) → (672,394) (L176 — orange) */
    o += `<path d="M228 394 C400 394 500 394 672 394" fill="none" stroke-width="1.3" class="tf-orange"/>`;

    /* South House → Liability bottom (250,524) → (772,448) */
    o += `<path d="M250 524 C250 480 772 480 772 448" fill="none" stroke-width="1.5" class="tf-liab-p"/>`;

    /* South Car → Liability bottom (380,524) → (772,448) */
    o += `<path d="M380 524 C380 490 772 490 772 448" fill="none" stroke-width="1.3" class="tf-liab-p"/>`;

    /* South F/F → Liability bottom (250,582) → (772,448) — amber (L176 — no interest, different colour) */
    o += `<path d="M250 582 C250 530 772 530 772 448" fill="none" stroke-width="1.2" class="tf-ff"/>`;

    /* YOU surplus → South House repay (450,376) → (250,524) — dashed purple */
    o += `<path d="M450 376 C450 460 250 460 250 524" fill="none" stroke-width="1.2" class="tf-repay"/>`;

    /* Sub-assets → Asset block left edge (672) */
    o += `<path d="M660 135 C664 135 668 140 672 148" fill="none" stroke-width="1.3" class="tf-sub-blue"/>`;
    o += `<path d="M660 210 C664 210 668 202 672 196" fill="none" stroke-width="1.3" class="tf-sub-purp"/>`;
    o += `<path d="M660 285 C664 272 668 215 672 208" fill="none" stroke-width="1.3" class="tf-sub-cyan"/>`;

    /* MindMap → M3.4 Projects (static dashed) */
    o += `<line x1="632" y1="333" x2="632" y2="313" stroke="#374151" stroke-width="1" stroke-dasharray="3 3"/>`;

    /* Static: Asset block → active North circles (thick, no animation) */
    bizDefs.forEach(biz => {
      if (!_bizActive[biz.key]) return;
      const pos = _nodePos[biz.key] || { dx:0, dy:0 };
      const tx  = biz.cx + pos.dx;
      const ty  = biz.cy - 36 + pos.dy;
      o += `<path d="M672 155 C672 90 ${tx} ${ty+40} ${tx} ${ty}" fill="none" stroke="#3b82f6" stroke-width="2"/>`;
    });

    /* ── Focus blink labels (L175) ── */
    const focusItems = [];
    if (earn < exp)                      focusItems.push({ x:240, y:90,  text:'⚡ EARN TOO SMALL',      fill:'#ef4444' });
    if (assetLev < 2.0)                  focusItems.push({ x:700, y:90,  text:'⚡ BUILD ASSETS',         fill:'#f59e0b' });
    if (liabBal > totalAssets * 0.5)     focusItems.push({ x:700, y:480, text:'⚡ DEBT HIGH vs ASSET',   fill:'#ef4444' });
    if (earn >= exp && surplus > 0)      focusItems.push({ x:450, y:90,  text:'✓ SURPLUS POSITIVE',      fill:'#22c55e' });

    focusItems.forEach(fi => {
      o += `<text x="${fi.x}" y="${fi.y}" text-anchor="middle" fill="${fi.fill}" font-size="8" font-family="monospace" class="blink-lbl">${fi.text}</text>`;
    });

    return `<svg class="c-svg" viewBox="0 0 900 680" xmlns="http://www.w3.org/2000/svg" style="background:#060a10;border-radius:8px">
<defs>
  <pattern id="pcbg2" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M20 0L0 0 0 20" fill="none" stroke="#0c1018" stroke-width="0.5"/>
  </pattern>
</defs>
${o}
</svg>`;
  }

  /* ── Drag implementation ── */
  function wireDrag(svgEl) {
    if (svgEl._dragWired) return;
    svgEl._dragWired = true;

    let dragEl = null, nodeKey = null;
    let startSVGX = 0, startSVGY = 0, startDX = 0, startDY = 0;

    function getSVGPoint(e) {
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svgEl.getScreenCTM().inverse());
    }

    svgEl.addEventListener('pointerdown', e => {
      let el = e.target;
      while (el && el !== svgEl) {
        if (el.dataset && el.dataset.draggable) { dragEl = el; nodeKey = el.dataset.nodeKey; break; }
        el = el.parentElement;
      }
      if (!dragEl) return;
      const pt = getSVGPoint(e);
      startSVGX = pt.x; startSVGY = pt.y;
      const pos = _nodePos[nodeKey] || { dx:0, dy:0 };
      startDX = pos.dx; startDY = pos.dy;
      window._dcJustDragged = false;
      svgEl.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });

    svgEl.addEventListener('pointermove', e => {
      if (!dragEl) return;
      const pt  = getSVGPoint(e);
      const dx  = startDX + (pt.x - startSVGX);
      const dy  = startDY + (pt.y - startSVGY);
      if (Math.abs(pt.x - startSVGX) > 4 || Math.abs(pt.y - startSVGY) > 4) {
        window._dcJustDragged = true;
      }
      _nodePos[nodeKey] = { dx, dy };
      dragEl.setAttribute('transform', `translate(${dx},${dy})`);
    });

    svgEl.addEventListener('pointerup', () => {
      if (!dragEl) return;
      if (window._dcJustDragged) saveNodePositions(_nodePos);
      dragEl = null;
      setTimeout(() => { window._dcJustDragged = false; }, 80);
    });
  }

  /* ── Panel HTML ── */
  function renderPanel(d) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 4px;border-bottom:1px solid #1a2030;flex-shrink:0">
  <h2 style="margin:0;font-size:1rem;font-weight:700;color:var(--text)">Dashboard</h2>
  <span style="font-size:0.65rem;color:#374151;font-family:monospace">M1.0 · CIRCUIT</span>
</div>
${meterCards(d)}
${kpiHTML(d)}
<div class="cw">${svgCircuit(d)}</div>`;
  }

  /* ── Load and render ── */
  async function loadAndRender() {
    const p = document.getElementById('panel-dashboard');
    if (!p) return;
    p.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 4px;border-bottom:1px solid #1a2030;flex-shrink:0">
  <h2 style="margin:0;font-size:1rem;font-weight:700;color:var(--text)">Dashboard</h2>
  <span style="font-size:0.65rem;color:#374151;font-family:monospace">M1.0 · CIRCUIT</span>
</div>
<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#374151;font-size:0.75rem;font-family:monospace">Loading circuit…</div>`;

    const startD = new Date();
    startD.setMonth(startD.getMonth() - 5);

    const [txR, liR, bR, haR, asR, syncR] = await Promise.allSettled([
      api('/api/transactions?start=' + startD.toISOString().split('T')[0]),
      api('/api/liabilities'),
      api('/api/budgets'),
      api('/api/hard-assets'),
      api('/api/assets'),
      api('/api/cashflow-sync'),
    ]);

    _data = {
      tx:         (txR.status  === 'fulfilled' ? txR.value.records  || [] : []).map(flat),
      liab:       (liR.status  === 'fulfilled' ? liR.value.records  || [] : []).map(flat),
      budgets:    (bR.status   === 'fulfilled' ? bR.value.records   || [] : []).map(flat),
      hardAssets: (haR.status  === 'fulfilled' ? haR.value.records  || [] : []).map(flat),
      assets:     (asR.status  === 'fulfilled' ? asR.value.records  || [] : []).map(flat),
      syncPoint:  syncR.status === 'fulfilled' ? syncR.value        : null,
    };

    p.innerHTML = renderPanel(_data);

    const svg = p.querySelector('.c-svg');
    if (svg) wireDrag(svg);
  }

  /* ── Init ── */
  async function init() {
    ensureStyles();

    const saved = await loadNodePositions();
    if (saved) _nodePos = saved;

    window._dNav = route => { window.location.hash = route; };
    window._dTog = key => {
      _bizActive[key] = !_bizActive[key];
      const p = document.getElementById('panel-dashboard');
      if (p && _data) {
        p.innerHTML = renderPanel(_data);
        const svg = p.querySelector('.c-svg');
        if (svg) wireDrag(svg);
      }
    };
    window._dLiab = key => {
      if (!key) return;
      const msgs = {
        house:  'My house is a 10-year loan asset. Market value ~7M THB, outstanding balance ~2.9M THB, loan-bound to bank. What is the true economic position and net equity of this asset in my personal balance sheet?',
        car:    'My car loan funds business cash flow operations. What is the true cost of this liability versus its operational value to the business?',
        family: 'I have family and friend loans with no interest. These are real obligations requiring visibility and respect. How should I track and communicate about these?',
      };
      window.location.hash = 'ai';
      setTimeout(() => {
        const inp = document.getElementById('ai-chat-input') || document.querySelector('[data-ai-input]');
        if (inp) { inp.value = msgs[key] || ''; inp.dispatchEvent(new Event('input')); }
      }, 400);
    };

    await loadAndRender();
  }

  window.addEventListener('panelactivated', e => {
    if (e.detail !== 'dashboard') return;
    if (!initialized) { initialized = true; init().catch(console.error); return; }
    loadAndRender().catch(console.error);
  });

  if (document.getElementById('panel-dashboard')?.classList.contains('active')) {
    initialized = true; init().catch(console.error);
  }
})();
