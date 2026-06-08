/* dash-overview.injector.js — M1.0 Dashboard Circuit Board
 * Counter-clockwise blood flow: Asset(E) → Biz earn(N) → Cashflow(W) → Liability(S) → Asset(E)
 * SVG viewBox: 0 0 680 490. Pure vanilla JS — no Chart.js on this panel.
 */
(function () {
  'use strict';

  let initialized = false;
  let _bizActive = { iflex: true, daje: true, satu: false, ploikong: false };
  let _data = null;

  const fmt = n => '฿' + Math.round(Number(n || 0)).toLocaleString('en');

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw Object.assign(new Error('API ' + r.status), { status: r.status });
    return r.json();
  }

  const flat = r => (r && r.fields) ? { id: r.id, ...r.fields } : r;

  /* ── Styles ── */
  function ensureStyles() {
    if (document.getElementById('dc-css')) return;
    const s = document.createElement('style');
    s.id = 'dc-css';
    s.textContent = `
      #panel-dashboard.active{display:flex;flex-direction:column;overflow-y:auto;min-height:0}
      @keyframes te-f{to{stroke-dashoffset:-26}}
      @keyframes ta-f{to{stroke-dashoffset:-26}}
      @keyframes td-f{to{stroke-dashoffset:-26}}
      @keyframes tl-f{to{stroke-dashoffset:-30}}
      @keyframes ti-f{to{stroke-dashoffset:-26}}
      @keyframes hb-s{0%,100%{opacity:1}10%,30%{opacity:0.1}20%{opacity:1}}
      @keyframes hb-n{0%,100%{opacity:1}15%{opacity:0.2}}
      .te{stroke-dasharray:7 5;animation:te-f 1.1s linear infinite;stroke:#22c55e}
      .ta{stroke-dasharray:7 5;animation:ta-f 1.7s linear infinite;stroke:#3b82f6}
      .td{stroke-dasharray:5 5;animation:td-f 1.4s linear infinite;stroke:#ef4444}
      .tl{stroke-dasharray:6 6;animation:tl-f 2.2s linear infinite;stroke:#f59e0b}
      .ti{stroke-dasharray:3 5;animation:ti-f 3.0s linear infinite;stroke:#06b6d4}
      .hb-s{animation:hb-s 2.2s ease-in-out infinite}
      .hb-n{animation:hb-n 3.2s ease-in-out infinite}
      .kpi-strip{display:flex;gap:5px;padding:8px 12px 6px;background:#0a0a10;flex-shrink:0;border-bottom:1px solid #1a2030}
      .kpi-c{flex:1;background:#0f1623;border-radius:5px;padding:6px 7px;border-top:3px solid var(--cc,#374151)}
      .kpi-lbl{font:500 7px/1 monospace;text-transform:uppercase;color:#4b5563;letter-spacing:.05em}
      .kpi-val{font:700 13px/1.4 monospace;color:#f3f4f6;margin:2px 0 1px}
      .kpi-sub{font:400 6.5px/1 monospace;color:#374151}
      .kpi-bar{height:3px;border-radius:2px;background:#1f2937;margin-top:4px;overflow:hidden}
      .kpi-fill{height:100%;border-radius:2px;background:var(--cc,#374151)}
      .cw{flex:1;padding:6px 10px 10px;display:flex;justify-content:center;align-items:flex-start;min-height:0}
      .c-svg{width:100%;max-width:710px;height:auto;display:block}
      .nt{cursor:pointer}.nt:hover{opacity:.82}
      .bn{cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  /* ── KPI strip ── */
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
    const lev = haCost > 0 ? haMV / haCost : 0;

    const cells = [
      { label:'Income Sufficiency', c:'#22c55e', v: earn>0?fmt(earn):'—', sub:'current month earn', bar: earn>0?Math.min(100,Math.round(earn/50000*100)):0 },
      { label:'Expense Discipline', c:'#ef4444', v: budEnv>0?expPct+'%':'—', sub: exp>0?fmt(exp)+' used':'of budget', bar: expPct },
      { label:'Liability Load',     c:'#f59e0b', v: liabBal>0?liabPct+'%':'—', sub:'monthly pmts ÷ balance', bar: liabPct },
      { label:'Asset Leverage',     c:'#3b82f6', v: haCost>0?lev.toFixed(2)+'×':'—', sub: haMV>0?fmt(haMV)+' mkt':'—', bar: Math.min(100,lev>1?Math.round((lev-1)*50):0) },
      { label:'Project Conversion', c:'#06b6d4', v:'0/2', sub:'Satu · Ploikong · Aug 2026', bar:0 },
    ];

    return `<div class="kpi-strip">${cells.map(c=>`
      <div class="kpi-c" style="--cc:${c.c}">
        <div class="kpi-lbl">${c.label}</div>
        <div class="kpi-val">${c.v}</div>
        <div class="kpi-sub">${c.sub}</div>
        <div class="kpi-bar"><div class="kpi-fill" style="width:${c.bar}%"></div></div>
      </div>`).join('')}</div>`;
  }

  /* ── SVG Circuit ── */
  function svgCircuit(d) {
    const ym = new Date().toISOString().slice(0, 7);
    const earn = (d.tx || []).filter(t => t.type === 'Income' && t.source !== 'LiabilityCreation' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const exp  = (d.tx || []).filter(t => t.type === 'Expense' && t.source !== 'LiabilityPayment' && (t.date || '').startsWith(ym))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const surplus = earn - exp;
    const surplusColor = surplus >= 0 ? '#22c55e' : '#ef4444';
    const surplusStr = (earn > 0 || exp > 0)
      ? (surplus >= 0 ? fmt(surplus) : '−' + fmt(-surplus))
      : '—';

    const haMV   = (d.hardAssets || []).reduce((s, a) => s + Number(a.current_value || 0), 0);
    const haCost = (d.hardAssets || []).reduce((s, a) => s + Number(a.purchase_price || 0), 0);
    const haLev  = haCost > 0 ? (haMV / haCost).toFixed(2) + '×' : '—';
    const collVal = (d.assets || []).filter(a => a.status !== 'Sold').reduce((s, a) => s + Number(a.estimated_value || 0), 0);
    const liabBal = (d.liab || []).filter(l => l.active !== false).reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const nw = haMV + collVal - liabBal;
    const nwStr = nw >= 0 ? fmt(nw) : '−' + fmt(-nw);

    /* Layout constants — all coordinates verified for 680x490 viewBox */
    const BY=8, BH=80, BW=125;
    const BX=[65,207,349,491];

    const WX=8,  WY=98,  WW=212, WH=278;
    const E22X=WX+6, E22Y=WY+8, E22W=WW-12, E22H=118, E22B=WY+8+118;
    const E23X=WX+6, E23Y=E22B+6, E23W=WW-12, E23H=108, E23B=E22B+6+108;
    const HB1Y=E23B+5, HB2Y=HB1Y+16;
    const WCX=WX+WW/2;

    const EX=460, EY=98, EW=212, EH=278;
    const ENX=EX+10, ENW=EW-20, ENH=58;
    const EN_Y=[EY+8, EY+8+ENH+6, EY+8+2*(ENH+6), EY+8+3*(ENH+6)];
    const ECX=ENX+ENW/2;

    const SX=8, SY=385, SW=664, SH=97;
    const SNY=SY+8, SNH=SH-16;
    const SNW=Math.floor((SW-28-3*8)/4);
    const snx=[SX+12, SX+12+SNW+8, SX+12+2*(SNW+8), SX+12+3*(SNW+8)];

    const CX=339, CY=Math.round((WY+SY)/2);

    let o = '';

    /* NORTH: Business nodes */
    const bizDefs=[
      {key:'iflex',    name:'i-Flex Pilates'},
      {key:'daje',     name:'Daje Claw'},
      {key:'satu',     name:'Satu'},
      {key:'ploikong', name:'Ploikong'},
    ];
    const earnEntryXs=[E22X+28,E22X+78,E22X+128,E22X+168];

    bizDefs.forEach((biz,i)=>{
      const act=_bizActive[biz.key];
      const bx=BX[i];
      const stk=act?'#22c55e':'#1a4028';
      const da=act?'':'stroke-dasharray="4 3"';
      const op=act?1:0.35;
      const tc=act?'#4ade80':'#4b5563';
      const sc=act?'#22c55e':'#374151';
      const sl=act?'● ACTIVE':'○ ~Aug 2026';
      o+=`\n<g class="bn" style="opacity:${op}" onclick="window._dTog('${biz.key}')">
  <rect x="${bx}" y="${BY}" width="${BW}" height="${BH}" rx="5" fill="#091509" stroke="${stk}" stroke-width="${act?1.5:1}" ${da}/>
  <text x="${bx+BW/2}" y="${BY+15}" text-anchor="middle" fill="${tc}" font-size="8.5" font-weight="700">${biz.name}</text>
  <text x="${bx+BW/2}" y="${BY+29}" text-anchor="middle" fill="#2d3748" font-size="7">฿ profit/mo: —</text>
  <text x="${bx+BW/2}" y="${BY+42}" text-anchor="middle" fill="#1f2937" font-size="6.5">asset value: —</text>
  <text x="${bx+BW/2}" y="${BY+60}" text-anchor="middle" fill="${sc}" font-size="7" font-weight="700">${sl}</text>
</g>`;
    });

    /* Biz -> West earn traces */
    bizDefs.forEach((biz,i)=>{
      const act=_bizActive[biz.key];
      const fx=BX[i]+BW/2, fy=BY+BH;
      const tx2=earnEntryXs[i], ty=E22Y;
      o+=`\n<path d="M${fx} ${fy} C${fx} ${fy+20} ${tx2} ${ty-20} ${tx2} ${ty}" fill="none" stroke-width="1.5" ${act?'class="te"':`stroke="#1a4028"`} opacity="${act?1:0.15}"/>`;
    });

    /* Biz asset value placeholder label */
    o+=`\n<text x="${EX-4}" y="${EY+10}" text-anchor="end" fill="#172028" font-size="5.5">← biz asset value (future)</text>`;

    /* WEST: M2.1 boundary */
    o+=`\n<rect x="${WX}" y="${WY}" width="${WW}" height="${WH}" rx="5" fill="none" stroke="#183028" stroke-width="1" stroke-dasharray="5 4"/>
<text x="${WCX}" y="${WY-3}" text-anchor="middle" fill="#1a3a28" font-size="6.5" font-weight="700">M2.1 CASHFLOW</text>`;

    /* M2.2 earn box */
    o+=`\n<g class="nt" onclick="window._dNav('sales')">
  <rect x="${E22X}" y="${E22Y}" width="${E22W}" height="${E22H}" rx="4" fill="#04120a" stroke="#1a4028" stroke-width="1"/>
  <text x="${WCX}" y="${E22Y+12}" text-anchor="middle" fill="#22c55e" font-size="6.5" font-weight="700">M2.2 SALES / EARN IN</text>
  <text x="${WCX}" y="${E22Y+E22H/2+6}" text-anchor="middle" fill="#4ade80" font-size="17" font-weight="700">${earn>0?fmt(earn):'—'}</text>
  <text x="${WCX}" y="${E22Y+E22H-7}" text-anchor="middle" fill="#1a4028" font-size="6">click → sales panel</text>
</g>`;

    /* Internal earn->expense drain trace */
    o+=`\n<path d="M${WCX} ${E22B} L${WCX} ${E23Y}" fill="none" stroke-width="1.5" class="td" opacity="0.65"/>`;

    /* M2.3 expense box */
    o+=`\n<g class="nt" onclick="window._dNav('expenses')">
  <rect x="${E23X}" y="${E23Y}" width="${E23W}" height="${E23H}" rx="4" fill="#120404" stroke="#4a1515" stroke-width="1"/>
  <text x="${WCX}" y="${E23Y+12}" text-anchor="middle" fill="#ef4444" font-size="6.5" font-weight="700">M2.3 EXPENSES OUT</text>
  <text x="${WCX}" y="${E23Y+E23H/2+6}" text-anchor="middle" fill="#f87171" font-size="17" font-weight="700">${exp>0?fmt(exp):'—'}</text>
  <text x="${WCX}" y="${E23Y+E23H-7}" text-anchor="middle" fill="#4a1515" font-size="6">click → expenses panel</text>
</g>`;

    /* Heartbeat rows */
    o+=`\n<rect x="${WX+2}" y="${HB1Y}" width="${WW-4}" height="13" rx="3" fill="#08100d"/>
<text x="${WX+7}" y="${HB1Y+9}" fill="#2d4a3a" font-size="6" font-weight="700">MONTHLY SURPLUS</text>
<text x="${WX+WW-6}" y="${HB1Y+9}" text-anchor="end" fill="${surplusColor}" font-size="7" font-weight="700" class="hb-s">${surplusStr}</text>
<rect x="${WX+2}" y="${HB2Y}" width="${WW-4}" height="13" rx="3" fill="#08100d"/>
<text x="${WX+7}" y="${HB2Y+9}" fill="#2d2d4a" font-size="6" font-weight="700">NET WORTH</text>
<text x="${WX+WW-6}" y="${HB2Y+9}" text-anchor="end" fill="#a78bfa" font-size="7" font-weight="700" class="hb-n">${nwStr}</text>`;

    /* EAST: M3 asset boundary */
    o+=`\n<rect x="${EX}" y="${EY}" width="${EW}" height="${EH}" rx="5" fill="none" stroke="#0f1f2e" stroke-width="1" stroke-dasharray="5 4"/>
<text x="${EX+EW/2}" y="${EY-3}" text-anchor="middle" fill="#1e3a4a" font-size="6.5" font-weight="700">M3 ASSET BOUNDARY</text>`;

    const eNodes=[
      {label:'M3.1 IDEAS',       route:'mindmap',     color:'#06b6d4', dash:true,  note:'→ ignites M3.4',         note2:''},
      {label:'M3.4 PROJECTS',    route:'proj-assets', color:'#8b5cf6', dash:true,  note:'Satu · Ploikong',        note2:'0% → earn soon'},
      {label:'M3.3 HARD ASSETS', route:'hard-assets', color:'#3b82f6', dash:false, note:haMV>0?fmt(haMV)+' mkt':'—', note2:haLev+' · ⚠ loan-bound'},
      {label:'M3.2 COLLECTION',  route:'collection',  color:'#3b82f6', dash:false, note:collVal>0?fmt(collVal)+' sellable':'—', note2:'', op:0.7},
    ];

    eNodes.forEach((n,i)=>{
      const ny=EN_Y[i];
      const da=n.dash?'stroke-dasharray="3 3"':'';
      const op=n.op||1;
      o+=`\n<g class="nt" style="opacity:${op}" onclick="window._dNav('${n.route}')">
  <rect x="${ENX}" y="${ny}" width="${ENW}" height="${ENH}" rx="4" fill="#080d14" stroke="${n.color}" stroke-width="1.2" ${da}/>
  <text x="${ECX}" y="${ny+13}" text-anchor="middle" fill="${n.color}" font-size="7" font-weight="700">${n.label}</text>
  <text x="${ECX}" y="${ny+27}" text-anchor="middle" fill="#9ca3af" font-size="6.5">${n.note}</text>
  ${n.note2?`<text x="${ECX}" y="${ny+39}" text-anchor="middle" fill="#6b7280" font-size="6">${n.note2}</text>`:''}
</g>`;
    });

    /* M3.1 -> M3.4 idea trace (cyan) */
    o+=`\n<path d="M${ECX} ${EN_Y[0]+ENH} L${ECX} ${EN_Y[1]}" fill="none" stroke-width="1.2" class="ti"/>`;

    /* M3.3 -> M2.2 earn trace (blue) */
    const m33cy=EN_Y[2]+ENH/2, m22rx=E22X+E22W, m22cy=E22Y+E22H/2;
    o+=`\n<path d="M${ENX} ${m33cy} C${ENX-50} ${m33cy} ${m22rx+50} ${m22cy} ${m22rx} ${m22cy}" fill="none" stroke-width="1.5" class="ta"/>`;

    /* M3.2 -> M2.2 earn trace (blue, lighter) */
    const m32cy=EN_Y[3]+ENH/2;
    o+=`\n<path d="M${ENX} ${m32cy} C${ENX-50} ${m32cy} ${m22rx+50} ${m22cy+15} ${m22rx} ${m22cy+15}" fill="none" stroke-width="1" class="ta" opacity="0.55"/>`;

    /* SOUTH: Liability boundary */
    o+=`\n<rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="5" fill="none" stroke="#2d1f4a" stroke-width="1" stroke-dasharray="4 4"/>
<text x="${SX+SW/2}" y="${SY-3}" text-anchor="middle" fill="#4c2a7a" font-size="6.5" font-weight="700">SOUTH · LIABILITY CREATORS</text>`;

    const sNodes=[
      {label:'HOUSE',           color:'#8b5cf6', dash:false, l1:'10yr loan · ฿2.9M→7M+', l2:'drain → bank',          k:'house'},
      {label:'CAR',             color:'#8b5cf6', dash:false, l1:'loan → biz cash',                  l2:'drain → bank',          k:'car'},
      {label:'FAMILY/FRIENDS',  color:'#f59e0b', dash:true,  l1:'no interest · obligation',          l2:'respect · stay visible', k:'family'},
      {label:'+ NEW LIABILITY', color:'#374151', dash:true,  l1:'future slot',                             l2:'',                           k:null},
    ];

    sNodes.forEach((n,i)=>{
      const nx=snx[i];
      const da=n.dash?'stroke-dasharray="4 3"':'';
      o+=`\n<g class="nt" onclick="window._dLiab('${n.k}')">
  <rect x="${nx}" y="${SNY}" width="${SNW}" height="${SNH}" rx="4" fill="#09070f" stroke="${n.color}" stroke-width="1" ${da}/>
  <text x="${nx+SNW/2}" y="${SNY+14}" text-anchor="middle" fill="${n.color}" font-size="7" font-weight="700">${n.label}</text>
  <text x="${nx+SNW/2}" y="${SNY+28}" text-anchor="middle" fill="#6b7280" font-size="6">${n.l1}</text>
  ${n.l2?`<text x="${nx+SNW/2}" y="${SNY+40}" text-anchor="middle" fill="#4b5563" font-size="5.5">${n.l2}</text>`:''}
</g>`;
    });

    /* South -> M2.3 drain traces (amber) */
    [0,1,2].forEach(i=>{
      const nx2=snx[i]+SNW/2;
      const txo=E23X+E23W/2+(i-1)*20;
      o+=`\n<path d="M${nx2} ${SY} C${nx2} ${SY-30} ${txo} ${E23B+25} ${txo} ${E23B}" fill="none" stroke-width="${i===2?1:1.5}" class="tl" opacity="${i===2?0.5:0.85}"/>`;
    });

    /* House/Car -> M3.3 Hard Assets (loan-binds-asset, static) */
    [0,1].forEach(i=>{
      const rx2=snx[i]+SNW;
      const ry=SNY+SNH/2;
      const toY=EN_Y[2]+ENH/2+i*10;
      o+=`\n<path d="M${rx2} ${ry} C${rx2+30} ${ry} ${ENX-30} ${toY} ${ENX} ${toY}" fill="none" stroke="#2d1f4a" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.5"/>`;
    });
    o+=`\n<text x="${ENX-4}" y="${EN_Y[2]+ENH-4}" text-anchor="end" fill="#2d1f4a" font-size="5.5">loan binds asset</text>`;

    /* Center YOU node */
    o+=`\n<circle cx="${CX}" cy="${CY}" r="24" fill="#0a0a12" stroke="#2d3748" stroke-width="1" stroke-dasharray="3 3"/>
<text x="${CX}" y="${CY-5}" text-anchor="middle" fill="#6b7280" font-size="8" font-weight="700">YOU</text>
<text x="${CX}" y="${CY+8}" text-anchor="middle" fill="#374151" font-size="5.5">command</text>
<text x="${CX}" y="${CY+18}" text-anchor="middle" fill="#374151" font-size="5.5">center</text>`;

    return `<svg class="c-svg" viewBox="0 0 680 490" xmlns="http://www.w3.org/2000/svg" style="background:#0d1117;border-radius:8px">
<defs>
  <pattern id="pcbg" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M20 0L0 0 0 20" fill="none" stroke="#111827" stroke-width="0.5"/>
  </pattern>
</defs>
<rect width="680" height="490" fill="url(#pcbg)"/>
<text x="340" y="7" text-anchor="middle" fill="#1a2535" font-size="6" letter-spacing="2">NORTH · INCOME GENERATORS</text>
${o}
</svg>`;
  }

  /* ── Panel HTML ── */
  function renderPanel(d) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 4px;border-bottom:1px solid #1a2030;flex-shrink:0">
  <h2 style="margin:0;font-size:1rem;font-weight:700;color:var(--text)">Dashboard</h2>
  <span style="font-size:0.65rem;color:#374151;font-family:monospace">M1.0 · CIRCUIT</span>
</div>
${kpiHTML(d)}
<div class="cw">${svgCircuit(d)}</div>`;
  }

  /* ── Load ── */
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
    const [txR, liR, bR, haR, asR] = await Promise.allSettled([
      api('/api/transactions?start=' + startD.toISOString().split('T')[0]),
      api('/api/liabilities'),
      api('/api/budgets'),
      api('/api/hard-assets'),
      api('/api/assets'),
    ]);

    _data = {
      tx:         (txR.status==='fulfilled'?txR.value.records||[]:  []).map(flat),
      liab:       (liR.status==='fulfilled'?liR.value.records||[]:  []).map(flat),
      budgets:    (bR.status ==='fulfilled'?bR.value.records ||[]:  []).map(flat),
      hardAssets: (haR.status==='fulfilled'?haR.value.records||[]:  []).map(flat),
      assets:     (asR.status==='fulfilled'?asR.value.records||[]:  []).map(flat),
    };

    p.innerHTML = renderPanel(_data);
  }

  /* ── Init ── */
  function init() {
    ensureStyles();
    window._dNav  = route => { window.location.hash = route; };
    window._dTog  = key => {
      _bizActive[key] = !_bizActive[key];
      const p = document.getElementById('panel-dashboard');
      if (p && _data) p.innerHTML = renderPanel(_data);
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
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => {
    if (e.detail !== 'dashboard') return;
    if (!initialized) { initialized = true; init(); return; }
    loadAndRender().catch(console.error);
  });

  if (document.getElementById('panel-dashboard')?.classList.contains('active')) {
    initialized = true; init();
  }
})();
