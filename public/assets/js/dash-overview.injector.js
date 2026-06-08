/* dash-overview.injector.js — M1.0 Dashboard Circuit Board v3
 * Architecture: redrawCircuit() rebuilds SVG innerHTML on every drag frame.
 * All line endpoints reference nodePos — zero hardcoded coords in lines.
 * viewBox: 0 0 900 700. Blocks fixed + centered. overflow:visible everywhere.
 * L172–L179.
 */
(function () {
  'use strict';

  let initialized        = false;
  let _data              = null;
  let _dragState         = null;
  let _svgListenersWired = false;

  const KV_POS_KEY = 'dashboard:node-positions';

  /* Default positions — never mutated. Deltas applied from KV on load. */
  const DEFAULT_NODE_POS = {
    iFlex:    { x: 200, y: 58 },
    daje:     { x: 340, y: 46 },
    satu:     { x: 480, y: 46 },
    ploikong: { x: 620, y: 46 },
    house:    { x: 310, y: 560 },
    car:      { x: 450, y: 560 },
    ff:       { x: 310, y: 625 },
    newSlot:  { x: 450, y: 625 },
    m33:      { x: 855, y: 215 },
    m32:      { x: 855, y: 295 },
    m34:      { x: 855, y: 375 },
    mindmap:  { x: 855, y: 445 },
  };

  let nodePos = {};
  function resetNodePos() { nodePos = JSON.parse(JSON.stringify(DEFAULT_NODE_POS)); }
  resetNodePos();

  const bizActive = { iFlex: true, daje: true, satu: false, ploikong: false };

  const fmt = n => '฿' + Math.round(Number(n || 0)).toLocaleString('en');

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw Object.assign(new Error('API ' + r.status), { status: r.status });
    return r.json();
  }

  const flat = r => (r && r.fields) ? { id: r.id, ...r.fields } : r;

  /* ── KV helpers ── */
  async function loadNodePositions() {
    try {
      const r = await fetch('/api/kv?key=' + KV_POS_KEY, { credentials: 'same-origin' });
      if (r.ok) { const d = await r.json(); return d.value ? JSON.parse(d.value) : null; }
    } catch {}
    return null;
  }

  async function saveNodePositions(deltas) {
    try {
      await fetch('/api/kv', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: KV_POS_KEY, value: JSON.stringify(deltas) })
      });
    } catch {}
  }

  /* ── Styles ── */
  function ensureStyles() {
    if (document.getElementById('dc-css')) return;
    const s = document.createElement('style');
    s.id = 'dc-css';
    s.textContent = `
      #panel-dashboard.active{display:flex;flex-direction:column;overflow-y:auto;min-height:0}
      #dash-svg-wrap{flex:1;overflow:visible;position:relative;min-height:500px;padding:4px 8px 8px}
      @keyframes flow-fwd {to{stroke-dashoffset:-18}}
      @keyframes flow-rev {to{stroke-dashoffset:18}}
      @keyframes dc-blink {0%,100%{opacity:1}50%{opacity:0.1}}
      @keyframes hb-s     {0%,100%{opacity:1}10%,30%{opacity:0.1}20%{opacity:1}}
      @keyframes hb-n     {0%,100%{opacity:1}15%{opacity:0.2}}
      .dc-ff {stroke-dasharray:6 3;animation:flow-fwd var(--dur,1.4s) linear infinite}
      .dc-fr {stroke-dasharray:6 3;animation:flow-rev var(--dur,1.4s) linear infinite}
      .dc-rp {stroke-dasharray:4 4;animation:flow-fwd 3.0s linear infinite;opacity:.65}
      .dc-bl {animation:dc-blink 1.4s ease-in-out infinite}
      .hb-s  {animation:hb-s 2.2s ease-in-out infinite}
      .hb-n  {animation:hb-n 3.2s ease-in-out infinite}
      .kpi-strip{display:flex;gap:5px;padding:8px 12px 6px;background:#0a0a10;flex-shrink:0;border-bottom:1px solid #1a2030}
      .kpi-c{flex:1;background:#0f1623;border-radius:5px;padding:6px 7px;border-top:3px solid var(--cc,#374151)}
      .kpi-lbl{font:500 7px/1 monospace;text-transform:uppercase;color:#4b5563;letter-spacing:.05em}
      .kpi-val{font:700 13px/1.4 monospace;color:#f3f4f6;margin:2px 0 1px}
      .kpi-sub{font:400 6.5px/1 monospace;color:#374151}
      .kpi-bar{height:3px;border-radius:2px;background:#1f2937;margin-top:4px;overflow:hidden}
      .kpi-fill{height:100%;border-radius:2px;background:var(--cc,#374151)}
      .dc-node{cursor:grab}
      .dc-node:active{cursor:grabbing}
    `;
    document.head.appendChild(s);
  }

  /* ── KPI strip — logic unchanged ── */
  function kpiHTML(d) {
    const ym  = new Date().toISOString().slice(0, 7);
    const earn = (d.tx||[]).filter(t=>t.type==='Income'&&t.source!=='LiabilityCreation'&&(t.date||'').startsWith(ym))
      .reduce((s,t)=>s+Number(t.amount||0),0);
    const exp  = (d.tx||[]).filter(t=>t.type==='Expense'&&t.source!=='LiabilityPayment'&&(t.date||'').startsWith(ym))
      .reduce((s,t)=>s+Number(t.amount||0),0);
    const budEnv = (d.budgets||[]).filter(b=>b.active!==false).reduce((s,b)=>{
      const a=Number(b.amount||0),p=b.period||'Monthly';
      return s+(p==='Annual'?a/12:p==='3x-year'?a*3/12:p==='6x-year'?a*6/12:a);
    },0);
    const expPct  = budEnv>0?Math.min(200,Math.round(exp/budEnv*100)):0;
    const liabBal = (d.liab||[]).filter(l=>l.active!==false).reduce((s,l)=>s+Number(l.current_balance||0),0);
    const liabPay = (d.liab||[]).filter(l=>l.active!==false).reduce((s,l)=>s+Number(l.monthly_payment||0),0);
    const liabPct = liabBal>0?Math.min(100,Math.round(liabPay/liabBal*100)):0;
    const haMV  = (d.hardAssets||[]).reduce((s,a)=>s+Number(a.current_value||0),0);
    const haCost= (d.hardAssets||[]).reduce((s,a)=>s+Number(a.purchase_price||0),0);
    const lev   = haCost>0?haMV/haCost:0;
    const cells = [
      {label:'Income Sufficiency',c:'#22c55e',v:earn>0?fmt(earn):'—',sub:'current month earn',bar:earn>0?Math.min(100,Math.round(earn/50000*100)):0},
      {label:'Expense Discipline',c:'#ef4444',v:budEnv>0?expPct+'%':'—',sub:exp>0?fmt(exp)+' used':'of budget',bar:expPct},
      {label:'Liability Load',    c:'#f59e0b',v:liabBal>0?liabPct+'%':'—',sub:'monthly pmts ÷ balance',bar:liabPct},
      {label:'Asset Leverage',   c:'#3b82f6',v:haCost>0?lev.toFixed(2)+'×':'—',sub:haMV>0?fmt(haMV)+' mkt':'—',bar:Math.min(100,lev>1?Math.round((lev-1)*50):0)},
      {label:'Project Conversion',c:'#06b6d4',v:'0/2',sub:'Satu · Ploikong · Aug 2026',bar:0},
    ];
    return `<div class="kpi-strip">${cells.map(c=>`<div class="kpi-c" style="--cc:${c.c}"><div class="kpi-lbl">${c.label}</div><div class="kpi-val">${c.v}</div><div class="kpi-sub">${c.sub}</div><div class="kpi-bar"><div class="kpi-fill" style="width:${c.bar}%"></div></div></div>`).join('')}</div>`;
  }

  /* ── Meter cards — stat-chip CSS from shell ── */
  function meterCards(d) {
    const haMV    = (d.hardAssets||[]).reduce((s,a)=>s+Number(a.current_value||0),0);
    const collVal = (d.assets||[]).filter(a=>a.status!=='Sold').reduce((s,a)=>s+Number(a.estimated_value||0),0);
    const liabBal = (d.liab||[]).filter(l=>l.active!==false).reduce((s,l)=>s+Number(l.current_balance||0),0);
    const nw      = haMV+collVal-liabBal;
    const nwStr   = nw>=0?fmt(nw):'−'+fmt(-nw);
    const d2z     = d.syncPoint?.daysToZero ?? (d.syncPoint?.days_to_zero ?? '—');
    return `<div style="display:flex;gap:8px;padding:10px 14px 8px;flex-shrink:0;border-bottom:1px solid var(--border,#1a2030)">
  <div class="stat-chip"><span class="chip-label">net worth</span><span class="chip-value" style="color:#a78bfa">${nwStr}</span></div>
  <div class="stat-chip"><span class="chip-label">days to ฿0</span><span class="chip-value" style="color:#ef4444">${d2z}</span></div>
  <div class="stat-chip"><span class="chip-label">total debt</span><span class="chip-value" style="color:#f59e0b">${liabBal>0?fmt(liabBal):'—'}</span></div>
  <div class="stat-chip"><span class="chip-label">project value</span><span class="chip-value" style="color:#22c55e">0 / 2 · Satu+Ploi</span></div>
</div>`;
  }

  /* ── Fixed block geometry (L172) ── */
  const BLK = {
    earn:  {x:40,  y:190, w:175, h:155},
    exp:   {x:40,  y:355, w:175, h:155},
    asset: {x:685, y:190, w:175, h:155},
    liab:  {x:685, y:355, w:175, h:155},
  };
  /* Midpoints — computed once */
  const M = {
    earnR:  {x:215, y:267},   // Earn right edge mid (L173)
    expR:   {x:215, y:432},   // Expense right edge mid
    assetL: {x:685, y:267},   // Asset left edge mid
    liabL:  {x:685, y:432},   // Liability left edge mid
    earnT:  {x:128, y:190},   // Earn top center
    expB:   {x:128, y:510},   // Expense bottom center
    assetT: {x:773, y:190},   // Asset top center
    assetR: {x:860, y:267},   // Asset right edge mid
    liabB:  {x:773, y:510},   // Liability bottom center
  };

  /* ── Build SVG inner content — pure, uses nodePos ── */
  function buildSVGContent(d) {
    const ym  = new Date().toISOString().slice(0, 7);
    const earn = (d.tx||[]).filter(t=>t.type==='Income'&&t.source!=='LiabilityCreation'&&(t.date||'').startsWith(ym))
      .reduce((s,t)=>s+Number(t.amount||0),0);
    const exp  = (d.tx||[]).filter(t=>t.type==='Expense'&&t.source!=='LiabilityPayment'&&(t.date||'').startsWith(ym))
      .reduce((s,t)=>s+Number(t.amount||0),0);
    const surplus   = earn - exp;
    const surplusC  = surplus>=0?'#22c55e':'#ef4444';
    const surplusS  = (earn>0||exp>0)?(surplus>=0?fmt(surplus):'−'+fmt(-surplus)):'—';

    const haMV    = (d.hardAssets||[]).reduce((s,a)=>s+Number(a.current_value||0),0);
    const haCost  = (d.hardAssets||[]).reduce((s,a)=>s+Number(a.purchase_price||0),0);
    const collVal = (d.assets||[]).filter(a=>a.status!=='Sold').reduce((s,a)=>s+Number(a.estimated_value||0),0);
    const liabBal = (d.liab||[]).filter(l=>l.active!==false).reduce((s,l)=>s+Number(l.current_balance||0),0);
    const totalAssets = haMV+collVal;
    const assetLev  = haCost>0?haMV/haCost:0;
    const haLev     = haCost>0?assetLev.toFixed(2)+'×':'—';
    const nw        = totalAssets-liabBal;
    const nwStr     = nw>=0?fmt(nw):'−'+fmt(-nw);
    const bankDebt  = (d.liab||[]).filter(l=>l.active!==false&&l.creditor_type==='Bank').reduce((s,l)=>s+Number(l.current_balance||0),0);
    const ffDebt    = (d.liab||[]).filter(l=>l.active!==false&&(l.creditor_type==='Friend'||l.creditor_type==='Family')).reduce((s,l)=>s+Number(l.current_balance||0),0);

    let o = '';

    /* grid background */
    o += `<rect width="900" height="700" fill="url(#pcbg3)"/>`;

    /* compass labels */
    o += `<text x="450" y="14" text-anchor="middle" fill="#1a4028" font-size="7" letter-spacing="2" font-family="monospace">NORTH · INCOME GENERATORS</text>`;
    o += `<text x="450" y="696" text-anchor="middle" fill="#2d1f4a" font-size="7" letter-spacing="2" font-family="monospace">SOUTH · LIABILITY CREATORS</text>`;

    /* boundary rects */
    o += `<rect x="30"  y="175" width="195" height="345" rx="5" fill="none" stroke="#1a4028" stroke-width="1" stroke-dasharray="5 4"/>`;
    o += `<text x="128" y="172" text-anchor="middle" fill="#22c55e" font-size="7" font-weight="700" font-family="monospace">WEST · M2.1 CASHFLOW</text>`;
    o += `<rect x="675" y="175" width="195" height="345" rx="5" fill="none" stroke="#1a3a5c" stroke-width="1" stroke-dasharray="5 4"/>`;
    o += `<text x="773" y="172" text-anchor="middle" fill="#3b82f6" font-size="7" font-weight="700" font-family="monospace">EAST · M3 BOUNDARY</text>`;

    /* ── FLOW LINES — all endpoints use nodePos or fixed M constants ── */

    /* 1 & 2: Active biz flows */
    const northKeys = [{key:'iFlex'},{key:'daje'},{key:'satu'},{key:'ploikong'}];
    northKeys.forEach(b => {
      const n = nodePos[b.key];
      if (bizActive[b.key]) {
        /* 1. Active biz → Earn top */
        o += `<path d="M${n.x} ${n.y+34} C${n.x} ${n.y+65} ${M.earnT.x} ${M.earnT.y-20} ${M.earnT.x} ${M.earnT.y}" fill="none" stroke="#22c55e" stroke-width="1.8" class="dc-ff" style="--dur:1.2s"/>`;
        /* 2. Asset top → active biz bottom (static thick) */
        o += `<path d="M${M.assetT.x} ${M.assetT.y} C${M.assetT.x} ${n.y+60} ${n.x} ${n.y+60} ${n.x} ${n.y-34}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" opacity="0.45"/>`;
      }
    });

    /* 3. Earn right → YOU left */
    o += `<path d="M${M.earnR.x} ${M.earnR.y} C295 ${M.earnR.y} 365 330 406 330" fill="none" stroke="#22c55e" stroke-width="1.5" class="dc-ff" style="--dur:1.8s"/>`;

    /* 4. Expense ① life drain exits bottom-left */
    o += `<path d="M${M.expB.x} ${M.expB.y} C${M.expB.x} 550 28 570 28 590" fill="none" stroke="#ef4444" stroke-width="1.5" class="dc-fr" style="--dur:1.0s"/>`;
    o += `<text x="26" y="560" fill="#4b1c1c" font-size="7" font-family="monospace">① life drain</text>`;

    /* 5. Expense ② Interest → House (L176 — NOT to F/F) */
    const hn = nodePos.house;
    o += `<path d="M${M.expB.x} ${M.expB.y} C${M.expB.x} 545 ${hn.x} ${hn.y-65} ${hn.x} ${hn.y-32}" fill="none" stroke="#ef4444" stroke-width="1.3" class="dc-ff" style="--dur:1.3s"/>`;

    /* 6. Expense ② Interest → Car (L176) */
    const cn = nodePos.car;
    o += `<path d="M${M.expB.x} ${M.expB.y} C165 545 ${cn.x} ${cn.y-65} ${cn.x} ${cn.y-32}" fill="none" stroke="#ef4444" stroke-width="1.2" class="dc-ff" style="--dur:1.5s"/>`;

    /* 7. Expense ③ Owner invest → Liability left-mid (orange, L176) */
    o += `<path d="M${M.expR.x} ${M.expR.y} C400 ${M.expR.y} 540 ${M.liabL.y} ${M.liabL.x} ${M.liabL.y}" fill="none" stroke="#f97316" stroke-width="1.3" class="dc-ff" style="--dur:2.0s"/>`;
    o += `<text x="390" y="${M.expR.y-9}" text-anchor="middle" fill="#7c2d12" font-size="7" font-family="monospace">③ owner invest</text>`;

    /* 8–10. South → Liability (L177) */
    const fn = nodePos.ff;
    o += `<path d="M${hn.x} ${hn.y-32} Q${M.liabB.x} ${M.liabB.y}    ${M.liabL.x} ${M.liabL.y}"     fill="none" stroke="#8b5cf6" stroke-width="1.5" class="dc-ff" style="--dur:2.0s"/>`;
    o += `<path d="M${cn.x} ${cn.y-32} Q${M.liabB.x} ${M.liabB.y+10} ${M.liabL.x} ${M.liabL.y+10}"  fill="none" stroke="#8b5cf6" stroke-width="1.3" class="dc-ff" style="--dur:2.2s"/>`;
    o += `<path d="M${fn.x} ${fn.y-32} Q${M.liabB.x} ${M.liabB.y+20} ${M.liabL.x} ${M.liabL.y+20}"  fill="none" stroke="#f59e0b" stroke-width="1.2" class="dc-ff" style="--dur:2.4s"/>`;

    /* 11. YOU bottom → House repay (dashed purple) */
    o += `<path d="M450 394 C450 485 ${hn.x} 485 ${hn.x} ${hn.y-32}" fill="none" stroke="#a78bfa" stroke-width="1.2" class="dc-rp"/>`;

    /* 12. Sub-assets → Asset right edge */
    const mn33 = nodePos.m33, mn32 = nodePos.m32, mn34 = nodePos.m34, mnMM = nodePos.mindmap;
    o += `<path d="M${mn33.x-28} ${mn33.y} Q${M.assetR.x-15} ${mn33.y}    ${M.assetR.x} ${M.assetR.y}"     fill="none" stroke="#3b82f6" stroke-width="1.3" class="dc-ff" style="--dur:2.0s"/>`;
    o += `<path d="M${mn32.x-28} ${mn32.y} Q${M.assetR.x-15} ${mn32.y}    ${M.assetR.x} ${M.assetR.y+15}"  fill="none" stroke="#8b5cf6" stroke-width="1.3" class="dc-ff" style="--dur:2.3s"/>`;
    o += `<path d="M${mn34.x-28} ${mn34.y} Q${M.assetR.x-15} ${mn34.y}    ${M.assetR.x} ${M.assetR.y+30}"  fill="none" stroke="#06b6d4" stroke-width="1.2" class="dc-ff" style="--dur:2.5s"/>`;
    /* MindMap → M3.4 static dashed only (L178) */
    o += `<line x1="${mnMM.x}" y1="${mnMM.y-28}" x2="${mn34.x}" y2="${mn34.y+28}" stroke="#374151" stroke-width="1" stroke-dasharray="3 3"/>`;

    /* ── FIXED BLOCKS ── */

    const ey = BLK.earn.y, xy = BLK.exp.y, ay = BLK.asset.y, ly = BLK.liab.y;

    /* Earn */
    o += `<g data-action="nav" data-route="sales" style="cursor:pointer">
  <rect x="${BLK.earn.x}" y="${ey}" width="${BLK.earn.w}" height="${BLK.earn.h}" rx="5" fill="#040d06" stroke="#22c55e" stroke-width="1.5"/>
  <text x="128" y="${ey+18}"  text-anchor="middle" fill="#22c55e" font-size="10" font-weight="700" font-family="monospace">M2.2 EARN IN</text>
  <text x="128" y="${ey+58}"  text-anchor="middle" fill="#4ade80" font-size="26" font-weight="700">${earn>0?fmt(earn):'—'}</text>
  <text x="128" y="${ey+76}"  text-anchor="middle" fill="#4ade80" font-size="9">income this month</text>
  <text x="128" y="${ey+92}"  text-anchor="middle" fill="#166534" font-size="8">click → Sales</text>
  <text x="128" y="${ey+108}" text-anchor="middle" fill="#166534" font-size="8">● ● ●</text>
  <text x="128" y="${ey+130}" text-anchor="middle" fill="${surplusC}" font-size="8" font-weight="700" class="hb-s">SURPLUS ${surplusS}</text>
</g>`;

    /* Expense */
    o += `<g data-action="nav" data-route="expenses" style="cursor:pointer">
  <rect x="${BLK.exp.x}" y="${xy}" width="${BLK.exp.w}" height="${BLK.exp.h}" rx="5" fill="#0d0404" stroke="#ef4444" stroke-width="1.5"/>
  <text x="128" y="${xy+18}"  text-anchor="middle" fill="#ef4444" font-size="10" font-weight="700" font-family="monospace">M2.3 EXPENSE OUT</text>
  <text x="128" y="${xy+58}"  text-anchor="middle" fill="#f87171" font-size="26" font-weight="700">${exp>0?fmt(exp):'—'}</text>
  <text x="128" y="${xy+76}"  text-anchor="middle" fill="#f87171" font-size="9">spent this month</text>
  <text x="58"  y="${xy+96}"  fill="#9ca3af" font-size="8">① Life drain →</text>
  <text x="58"  y="${xy+110}" fill="#9ca3af" font-size="8">② Interest → debt →</text>
  <text x="58"  y="${xy+124}" fill="#9ca3af" font-size="8">③ Owner invest → Liab →</text>
  <text x="128" y="${xy+142}" text-anchor="middle" fill="#7f1d1d" font-size="8">● ● ●</text>
</g>`;

    /* Asset */
    o += `<g data-action="nav" data-route="hard-assets" style="cursor:pointer">
  <rect x="${BLK.asset.x}" y="${ay}" width="${BLK.asset.w}" height="${BLK.asset.h}" rx="5" fill="#04060d" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="773" y="${ay+18}"  text-anchor="middle" fill="#3b82f6" font-size="10" font-weight="700" font-family="monospace">TOTAL ASSETS</text>
  <text x="773" y="${ay+58}"  text-anchor="middle" fill="#60a5fa" font-size="26" font-weight="700">${totalAssets>0?fmt(totalAssets):'—'}</text>
  <text x="773" y="${ay+76}"  text-anchor="middle" fill="#3b82f6" font-size="9">market value · ${haLev} leverage</text>
  <text x="773" y="${ay+92}"  text-anchor="middle" fill="#1e3a5f" font-size="8">← inject from right</text>
  <text x="773" y="${ay+108}" text-anchor="middle" fill="#1e3a5f" font-size="8">● ● ●</text>
  <text x="773" y="${ay+130}" text-anchor="middle" fill="#a78bfa" font-size="8" font-weight="700" class="hb-n">NET WORTH ${nwStr}</text>
</g>`;

    /* Liability */
    o += `<g data-action="nav" data-route="liabilities" style="cursor:pointer">
  <rect x="${BLK.liab.x}" y="${ly}" width="${BLK.liab.w}" height="${BLK.liab.h}" rx="5" fill="#0d0404" stroke="#ef4444" stroke-width="2"/>
  <text x="773" y="${ly+18}"  text-anchor="middle" fill="#ef4444" font-size="10" font-weight="700" font-family="monospace">TOTAL LIABILITIES</text>
  <text x="773" y="${ly+58}"  text-anchor="middle" fill="#f87171" font-size="26" font-weight="700">${liabBal>0?fmt(liabBal):'—'}</text>
  <text x="773" y="${ly+76}"  text-anchor="middle" fill="#ef4444" font-size="9">all active debt</text>
  <text x="700" y="${ly+96}"  fill="#9ca3af" font-size="8">① Bank: ${bankDebt>0?fmt(bankDebt):'฿0'}</text>
  <text x="700" y="${ly+110}" fill="#9ca3af" font-size="8">② F/F: ${ffDebt>0?fmt(ffDebt):'฿0'}</text>
  <text x="700" y="${ly+124}" fill="#9ca3af" font-size="8">③ Owner (proj): ฿0</text>
  <text x="773" y="${ly+142}" text-anchor="middle" fill="#7f1d1d" font-size="8">● ● ●</text>
</g>`;

    /* ── YOU hands — 4 thick static lines (L173) ── */
    [[406,330, 215,267,'#22c55e'],
     [406,370, 215,432,'#ef4444'],
     [494,330, 685,267,'#3b82f6'],
     [494,370, 685,432,'#ef4444']].forEach(([x1,y1,x2,y2,c]) => {
      o += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
      o += `<circle cx="${x2}" cy="${y2}" r="5" fill="${c}"/>`;
    });

    /* ── YOU node ── */
    o += `<circle cx="450" cy="350" r="54" fill="none" stroke="#4c1d95" stroke-width="1" stroke-dasharray="3 3" class="dc-bl"/>`;
    o += `<circle cx="450" cy="350" r="44" fill="#08050f" stroke="#7c3aed" stroke-width="2"/>`;
    o += `<text x="450" y="346" text-anchor="middle" fill="#a78bfa" font-size="16" font-weight="700">YOU</text>`;
    o += `<text x="450" y="360" text-anchor="middle" fill="#4c1d95" font-size="7">command center</text>`;

    /* ── North circles — draggable ── */
    const northDefs = [
      {key:'iFlex',    name:'i-Flex Pilates'},
      {key:'daje',     name:'Daje Claw'},
      {key:'satu',     name:'Satu'},
      {key:'ploikong', name:'Ploikong'},
    ];
    northDefs.forEach(b => {
      const act = bizActive[b.key];
      const n   = nodePos[b.key];
      const stk = act?'#22c55e':'#1a4028';
      const da  = act?'':'stroke-dasharray="4 3"';
      o += `<g class="dc-node" data-node="${b.key}">
  <circle cx="${n.x}" cy="${n.y}" r="34" fill="${act?'#050f08':'#080d14'}" stroke="${stk}" stroke-width="${act?1.8:1}" ${da}/>
  <text x="${n.x}" y="${n.y-10}" text-anchor="middle" fill="${act?'#4ade80':'#374151'}" font-size="9" font-weight="700">${b.name}</text>
  <text x="${n.x}" y="${n.y+4}"  text-anchor="middle" fill="${act?'#2d6a4f':'#2d3748'}" font-size="8">฿0 value</text>
  <text x="${n.x}" y="${n.y+17}" text-anchor="middle" fill="${act?'#22c55e':'#1a4028'}" font-size="7" font-weight="700">${act?'● ACTIVE':'○ INACTIVE'}</text>
</g>`;
    });

    /* ── South circles — draggable ── */
    const southDefs = [
      {key:'house',   label:'HOUSE',          detail:'10yr loan · ฿2.9M→7M+', sub:'↑ debt out',    stroke:'#8b5cf6', da:'',                    fill:'#08050f', subC:'#ef4444'},
      {key:'car',     label:'CAR',            detail:'loan → biz cash',        sub:'↑ debt out',    stroke:'#8b5cf6', da:'',                    fill:'#08050f', subC:'#ef4444'},
      {key:'ff',      label:'FAMILY/FRIENDS', detail:'no interest · obligation',sub:'↑ obligation', stroke:'#f59e0b', da:'stroke-dasharray="5 3"',fill:'#09070a', subC:'#f59e0b'},
      {key:'newSlot', label:'+ NEW',          detail:'future slot',             sub:'',              stroke:'#1f2937', da:'stroke-dasharray="3 4"',fill:'#06060a', subC:'#374151'},
    ];
    southDefs.forEach(s => {
      const n = nodePos[s.key];
      o += `<g class="dc-node" data-node="${s.key}">
  <circle cx="${n.x}" cy="${n.y}" r="32" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5" ${s.da}/>
  <text x="${n.x}" y="${n.y-12}" text-anchor="middle" fill="${s.stroke}" font-size="10" font-weight="700">${s.label}</text>
  <text x="${n.x}" y="${n.y+2}"  text-anchor="middle" fill="#6b7280" font-size="8">${s.detail}</text>
  <text x="${n.x}" y="${n.y+15}" text-anchor="middle" fill="${s.subC}" font-size="7">${s.sub}</text>
</g>`;
    });

    /* ── Sub-asset circles — RIGHT of East boundary, draggable (L178) ── */
    const subDefs = [
      {key:'m33',    label:'M3.3', sub:'Hard Assets', val:haMV>0?fmt(haMV):'—',     stroke:'#3b82f6', da:'',                    fill:'#04060d', tc:'#3b82f6', vc:'#60a5fa', route:'hard-assets'},
      {key:'m32',    label:'M3.2', sub:'Collection',  val:collVal>0?fmt(collVal):'—',stroke:'#8b5cf6', da:'',                    fill:'#08050d', tc:'#8b5cf6', vc:'#a78bfa', route:'collection'},
      {key:'m34',    label:'M3.4', sub:'Projects',    val:'launch→North',            stroke:'#06b6d4', da:'stroke-dasharray="4 3"',fill:'#040a0d', tc:'#06b6d4', vc:'#22d3ee', route:'proj-assets'},
      {key:'mindmap',label:'Map',  sub:'MindMap',     val:'idea→M3.4',              stroke:'#374151', da:'stroke-dasharray="3 3"',fill:'#080808', tc:'#4b5563', vc:'#374151', route:'mindmap'},
    ];
    subDefs.forEach(s => {
      const n = nodePos[s.key];
      o += `<g class="dc-node" data-node="${s.key}" data-route="${s.route}">
  <circle cx="${n.x}" cy="${n.y}" r="28" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5" ${s.da}/>
  <text x="${n.x}" y="${n.y-8}"  text-anchor="middle" fill="${s.tc}" font-size="7" font-weight="700">${s.label}</text>
  <text x="${n.x}" y="${n.y+4}"  text-anchor="middle" fill="${s.vc}" font-size="7">${s.sub}</text>
  <text x="${n.x}" y="${n.y+15}" text-anchor="middle" fill="${s.tc}" font-size="6">${s.val}</text>
</g>`;
    });

    /* ── Focus blink labels (L175) ── */
    const focusItems = [];
    if (earn < exp)                   focusItems.push({x:200,y:170,text:'⚡ EARN TOO SMALL',fill:'#ef4444'});
    if (assetLev < 2.0)               focusItems.push({x:690,y:170,text:'⚡ BUILD ASSETS',  fill:'#f59e0b'});
    if (liabBal > totalAssets*0.5)    focusItems.push({x:690,y:530,text:'⚡ DEBT HIGH',     fill:'#ef4444'});
    if (earn>=exp && surplus>0)       focusItems.push({x:390,y:310,text:'✓ SURPLUS',        fill:'#22c55e'});
    focusItems.forEach(fi => {
      o += `<text x="${fi.x}" y="${fi.y}" text-anchor="middle" fill="${fi.fill}" font-size="8" font-family="monospace" class="dc-bl">${fi.text}</text>`;
    });

    return o;
  }

  /* ── Redraw SVG content (called on drag + on data load) ── */
  function redrawCircuit(d) {
    const svg = document.getElementById('dashboard-svg');
    if (!svg) return;
    svg.innerHTML = buildSVGContent(d);
  }

  /* ── Wire pointer events on SVG element — survives innerHTML changes ── */
  function wireDrag(svgEl) {
    if (_svgListenersWired) return;
    _svgListenersWired = true;

    svgEl.addEventListener('pointerdown', e => {
      const g = e.target.closest('[data-node]');
      if (!g) return;
      const key = g.dataset.node;
      if (!nodePos[key]) return;
      _dragState = {
        key,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: nodePos[key].x,
        origY: nodePos[key].y,
        moved: false,
      };
      svgEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    svgEl.addEventListener('pointermove', e => {
      if (!_dragState) return;
      const rect   = svgEl.getBoundingClientRect();
      const scaleX = 900 / (rect.width  || 900);
      const scaleY = 700 / (rect.height || 700);
      const dx = (e.clientX - _dragState.startClientX) * scaleX;
      const dy = (e.clientY - _dragState.startClientY) * scaleY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _dragState.moved = true;
      nodePos[_dragState.key].x = _dragState.origX + dx;
      nodePos[_dragState.key].y = _dragState.origY + dy;
      if (_data) redrawCircuit(_data);
    });

    svgEl.addEventListener('pointerup', async () => {
      if (!_dragState) return;
      const { key, moved } = _dragState;
      _dragState = null;

      if (moved) {
        const deltas = {};
        Object.keys(nodePos).forEach(k => {
          const def = DEFAULT_NODE_POS[k];
          if (def) deltas[k] = { dx: Math.round(nodePos[k].x - def.x), dy: Math.round(nodePos[k].y - def.y) };
        });
        await saveNodePositions(deltas);
        return;
      }

      /* Click actions */
      const northKeys = ['iFlex','daje','satu','ploikong'];
      const subRoutes  = {m33:'hard-assets', m32:'collection', m34:'proj-assets', mindmap:'mindmap'};
      const liabMsgs   = {
        house:  'My house is a 10-year loan asset. Market value ~7M THB, outstanding balance ~2.9M THB. What is the true economic position and net equity of this asset in my personal balance sheet?',
        car:    'My car loan funds business cash flow operations. What is the true cost of this liability versus its operational value to the business?',
        ff:     'I have family and friend loans with no interest. These are real obligations requiring visibility and respect. How should I track and communicate about these?',
      };

      if (northKeys.includes(key)) {
        bizActive[key] = !bizActive[key];
        if (_data) redrawCircuit(_data);
        return;
      }
      if (subRoutes[key]) {
        window.location.hash = subRoutes[key];
        return;
      }
      if (liabMsgs[key]) {
        window.location.hash = 'ai';
        setTimeout(() => {
          const inp = document.getElementById('ai-chat-input') || document.querySelector('[data-ai-input]');
          if (inp) { inp.value = liabMsgs[key]; inp.dispatchEvent(new Event('input')); }
        }, 400);
      }
    });

    /* Click on fixed blocks (no data-node, has data-action=nav) */
    svgEl.addEventListener('click', e => {
      if (e.target.closest('[data-node]')) return; // handled by pointerup
      const g = e.target.closest('[data-action="nav"]');
      if (g) window.location.hash = g.dataset.route || '';
    });
  }

  /* ── Panel HTML ── */
  function renderPanel(d) {
    return `<div class="panel-header" style="padding:10px 14px 4px;flex-shrink:0;border-bottom:1px solid var(--border,#1a2030)">
  <div class="panel-title">Dashboard</div>
  <div class="panel-subtitle">M1.0 · CIRCUIT</div>
</div>
${meterCards(d)}
${kpiHTML(d)}
<div id="dash-svg-wrap">
  <svg id="dashboard-svg" viewBox="0 0 900 700" width="100%" height="auto"
       style="overflow:visible;display:block;background:#060a10;border-radius:8px">
    <defs>
      <pattern id="pcbg3" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0L0 0 0 20" fill="none" stroke="#0c1018" stroke-width="0.5"/>
      </pattern>
    </defs>
    ${buildSVGContent(d)}
  </svg>
</div>`;
  }

  /* ── Load and render ── */
  async function loadAndRender() {
    const p = document.getElementById('panel-dashboard');
    if (!p) return;
    p.innerHTML = `<div class="panel-header" style="padding:10px 14px 4px;flex-shrink:0;border-bottom:1px solid var(--border,#1a2030)">
  <div class="panel-title">Dashboard</div>
  <div class="panel-subtitle">M1.0 · CIRCUIT</div>
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
      tx:         (txR.status==='fulfilled'  ? txR.value.records  || [] : []).map(flat),
      liab:       (liR.status==='fulfilled'  ? liR.value.records  || [] : []).map(flat),
      budgets:    (bR.status==='fulfilled'   ? bR.value.records   || [] : []).map(flat),
      hardAssets: (haR.status==='fulfilled'  ? haR.value.records  || [] : []).map(flat),
      assets:     (asR.status==='fulfilled'  ? asR.value.records  || [] : []).map(flat),
      syncPoint:  syncR.status==='fulfilled' ? syncR.value : null,
    };

    p.innerHTML = renderPanel(_data);

    _svgListenersWired = false; // new SVG element — re-wire
    const svg = document.getElementById('dashboard-svg');
    if (svg) wireDrag(svg);
  }

  /* ── Init ── */
  async function init() {
    ensureStyles();
    resetNodePos();

    const saved = await loadNodePositions();
    if (saved) {
      Object.keys(saved).forEach(k => {
        if (nodePos[k] && saved[k]) {
          nodePos[k].x = DEFAULT_NODE_POS[k].x + (saved[k].dx || 0);
          nodePos[k].y = DEFAULT_NODE_POS[k].y + (saved[k].dy || 0);
        }
      });
    }

    await loadAndRender();
  }

  window.addEventListener('panelactivated', e => {
    if (e.detail !== 'dashboard') return;
    if (!initialized) {
      initialized = true;
      _svgListenersWired = false;
      init().catch(console.error);
      return;
    }
    _svgListenersWired = false;
    loadAndRender().catch(console.error);
  });

  if (document.getElementById('panel-dashboard')?.classList.contains('active')) {
    initialized = true;
    _svgListenersWired = false;
    init().catch(console.error);
  }
})();
