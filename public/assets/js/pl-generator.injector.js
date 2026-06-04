/* pl-generator.injector.js — P&L Generator (M4.4) */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const pct = n => (isNaN(n) || !isFinite(n) ? '—' : Number(n).toFixed(1) + '%');
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let initialized = false;
  let plChart = null;
  let _activeTab = 'revenue';
  let _activeOutput = 'pl';
  let _activePeriod = '12mo';
  let _computed = null;
  let _archiveView = false;
  let _archiveList = [];
  let _archiveSearch = '';
  let _archiveFilter = 'all';
  let _varItems = [];
  let _semiItems = [{ desc: 'Office staff', amt: '', freq: 'Monthly' }, { desc: 'Packaging', amt: '', freq: 'Monthly' }, { desc: 'Accountant', amt: '', freq: 'Monthly' }];
  let _fixedItems = [
    { cat: 'Office labor', amt: '', freq: 'Monthly' }, { cat: 'Utility', amt: '', freq: 'Monthly' },
    { cat: 'Rental', amt: '', freq: 'Monthly' }, { cat: 'IT/Software', amt: '', freq: 'Monthly' },
    { cat: 'Maintenance', amt: '', freq: 'Monthly' }, { cat: 'Insurance', amt: '', freq: 'Monthly' },
    { cat: 'Marketing', amt: '', freq: 'Monthly' }, { cat: 'Services', amt: '', freq: 'Monthly' }
  ];
  let _assetItems = [];
  let _fundItems = [{ src: 'Owner equity', amt: '', type: 'Equity' }, { src: 'Bank loan', amt: '', type: 'Loan' }];
  let _capCollapsed = true;
  let _wcCollapsed = true;
  let _loanCollapsed = true;
  let _currentVersions = [];
  let _savedVersion = 0;
  let _projects = [];
  let _sidebarW = 280;
  let _selectedProjectId = '';
  let _selectedProjectName = '';
  let _revInputs = { start_period: '', input_mode: 'Units × price', units_mo: '', sale_price: '', revenue_mo: '', probability: '70', growth_mode: 'Conservative' };

  function panel() { return document.getElementById('panel-pl-generator'); }
  function $ (id) { return document.getElementById(id); }

  // ── Computation engine ──────────────────────────────────────
  function computePL(inputs, periods) {
    const startupCost = Number(inputs.startup_cost) || 0;
    const depYears = Number(inputs.dep_years) || 3;
    const startMonth = 1;

    const unitMode = inputs.input_mode !== 'direct';
    const units = Number(inputs.units_mo) || 0;
    const price = Number(inputs.sale_price) || 0;
    const baseRevDirect = Number(inputs.revenue_mo) || 0;
    const baseRev = unitMode ? units * price : baseRevDirect;
    const prob = Number(inputs.probability) / 100 || 0.7;
    const aggressive = inputs.growth_mode === 'Aggressive';
    const plateauMonth = 9;

    const loanAmt = _fundItems.filter(f => f.type === 'Loan').reduce((s, f) => s + (Number(f.amt) || 0), 0);
    const interestRate = Number(inputs.loan_rate) || 0;
    const loanTermMo = Number(inputs.loan_term_mo) || 12;
    const repayStart = inputs.repay_start || 'Month 1';
    const repayStartMo = repayStart === 'Month 4 grace' ? 4 : repayStart === 'After break-even' ? 999 : 1;

    const receivableDays = Number(inputs.rec_days) || 30;
    const payableDays = Number(inputs.pay_days) || 45;
    const inventoryDays = Number(inputs.inv_days) || 15;
    const cashBuffer = Number(inputs.cash_buf) || 0;

    const equity = _fundItems.filter(f => f.type !== 'Loan').reduce((s, f) => s + (Number(f.amt) || 0), 0);
    const totalFunding = equity + loanAmt;

    // Fixed asset total dep
    const allAssets = _assetItems.map(a => ({ val: Number(a.val) || 0, years: Number(a.years) || 3 }));
    allAssets.push({ val: startupCost, years: depYears });
    const totalAssetCost = allAssets.reduce((s, a) => s + a.val, 0);

    // Monthly depreciation
    const depPerMo = allAssets.reduce((s, a) => s + (a.years > 0 ? a.val / (a.years * 12) : 0), 0);

    // Fixed costs monthly
    const fixedMo = _fixedItems.reduce((s, f) => {
      const a = Number(f.amt) || 0;
      return s + (f.freq === 'Annual' ? a / 12 : a);
    }, 0);

    // SG&A
    const loyaltyPct = Number(inputs.loyalty_pct) / 100 || 0;
    const ownerFund = Number(inputs.owner_fund) || 0;
    const licenseYr = Number(inputs.license_yr) || 0;
    const otherSga = Number(inputs.other_sga) || 0;
    const fixedSga = ownerFund + licenseYr / 12 + otherSga;

    // Semi-fixed monthly
    function semiFixedMo(rev, unitsN) {
      return _semiItems.reduce((s, item) => {
        const a = Number(item.amt) || 0;
        if (item.freq === 'Annual') return s + a / 12;
        if (item.freq === 'Per unit') return s + a * unitsN;
        if (item.freq === 'Per billing') return s + a;
        return s + a;
      }, 0);
    }

    // Variable costs per unit
    const matCost = Number(inputs.direct_mat) || 0;
    const laborCost = Number(inputs.labor_cost) || 0;

    function parseFreightAmt(str, revenue, cogsUnit) {
      if (!str) return 0;
      str = String(str).trim();
      if (str.endsWith('%')) {
        const p = parseFloat(str) / 100;
        return revenue * p;
      }
      return parseFloat(str) || 0;
    }

    const freightIn = inputs.freight_in || '';
    const freightOut = inputs.freight_out || '';

    const otherVarItems = _varItems.map(v => ({
      val: Number(v.val) || 0,
      type: v.type || 'per unit',
      pct: parseFloat(String(v.val || '').replace('%', '')) / 100
    }));

    const pl = [];
    let cumulativeNet = 0;
    let bepMonth = null;
    let totalPrincipalRepaid = 0;
    let loanBalance = loanAmt;

    for (let m = 1; m <= periods; m++) {
      let growth;
      if (aggressive) {
        growth = m <= plateauMonth ? Math.pow(1.08, m - 1) : Math.pow(1.08, plateauMonth - 1);
      } else {
        growth = Math.pow(1.03, m - 1);
      }
      if (periods === 60 && m > 12) {
        const yr = Math.floor((m - 1) / 12);
        growth = aggressive ? Math.pow(1.08 * 12, yr) : Math.pow(1.36, yr); // annual compound after year 1
      }

      const rev = baseRev * prob * growth;
      const unitsN = unitMode ? units * growth : rev / (price || 1);

      // Variable costs (broken out for table display, summed as cogs for BS/CF)
      const varMat = matCost * unitsN;
      const varLabor = laborCost * unitsN;
      const varFreight = parseFreightAmt(freightIn, rev, matCost + laborCost)
                       + parseFreightAmt(freightOut, rev, matCost + laborCost);
      const varOther = otherVarItems.reduce((s, v) => {
        if (v.type === '% sale') return s + rev * (parseFloat(String(v.val || '').replace('%', '')) / 100 || 0);
        if (v.type === '% COGS') return s + ((matCost + laborCost) * unitsN) * (parseFloat(String(v.val || '').replace('%', '')) / 100 || 0);
        return s + v.val * unitsN;
      }, 0);
      const cogs = varMat + varLabor + varFreight + varOther; // total variable cost (used for BS/CF)

      const variableCostMargin = rev - cogs;
      const semiF = semiFixedMo(rev, unitsN);
      const dep = depPerMo;
      const sgaTotal = rev * loyaltyPct + fixedSga;
      const grossProfit = variableCostMargin - semiF - fixedMo;
      const ebitda = grossProfit - sgaTotal - dep;

      // Loan repayment
      let interest = 0;
      let principal = 0;
      let repayMo = repayStartMo === 999 ? (bepMonth || 999) : repayStartMo;
      if (m >= repayMo && loanBalance > 0 && loanAmt > 0) {
        interest = (loanBalance * (interestRate / 100)) / 12;
        principal = loanAmt / loanTermMo;
        if (principal > loanBalance) principal = loanBalance;
        loanBalance = Math.max(0, loanBalance - principal);
        totalPrincipalRepaid += principal;
      } else if (loanBalance > 0 && interestRate > 0) {
        interest = (loanBalance * (interestRate / 100)) / 12;
      }

      const tax = ebitda - interest > 0 ? (ebitda - interest) * 0.2 : 0;
      const netProfit = ebitda - interest - tax;
      cumulativeNet += netProfit;
      if (bepMonth === null && cumulativeNet >= 0) bepMonth = m;

      const ar = rev * (receivableDays / 30);
      const ap = cogs * (payableDays / 30);
      const inv = cogs * (inventoryDays / 30);
      const accDep = dep * m;
      const netFixedAssets = totalAssetCost - accDep;
      const cash = totalFunding + cumulativeNet - ar + ap - inv;
      const accrued = fixedMo;

      pl.push({
        m,
        rev, varMat, varLabor, varFreight, varOther, cogs,
        variableCostMargin, semiF, fixedMo, grossProfit,
        sgaTotal, dep,
        ebitda, interest, tax, netProfit,
        cumulativeNet,
        ar, ap, inv, cash, netFixedAssets, accDep, accrued,
        loanBalance
      });
    }

    // KPIs
    const profMonths = pl.filter(p => p.rev > 0);
    const varCostMarginPct = profMonths.length
      ? profMonths.reduce((s, p) => s + p.variableCostMargin / p.rev, 0) / profMonths.length * 100 : 0;
    const grossMarginPct = profMonths.length
      ? profMonths.reduce((s, p) => s + p.grossProfit / p.rev, 0) / profMonths.length * 100 : 0;
    const ebitdaPct = profMonths.length
      ? profMonths.reduce((s, p) => s + p.ebitda / p.rev, 0) / profMonths.length * 100 : 0;
    const afterBep = bepMonth ? pl.filter(p => p.m > bepMonth) : [];
    const avgNetAfterBep = afterBep.length ? afterBep.reduce((s, p) => s + p.netProfit, 0) / afterBep.length : 0;
    const paybackMonths = avgNetAfterBep > 0 ? startupCost / avgNetAfterBep : null;
    const preBepMonths = bepMonth ? pl.slice(0, bepMonth - 1) : pl;
    const burnRate = preBepMonths.length
      ? preBepMonths.reduce((s, p) => s + p.cogs + p.semiF + p.fixedMo + p.sgaTotal, 0) / preBepMonths.length : 0;

    // Balance sheet snapshots
    const bsPeriods = periods === 12 ? [6, 12] : [12, 24, 36, 60];
    const bs = bsPeriods.map(idx => {
      const p = pl[Math.min(idx, pl.length) - 1];
      return {
        period: idx,
        cash: p.cash,
        ar: p.ar,
        inv: p.inv,
        netFixed: p.netFixedAssets,
        totalAssets: p.cash + p.ar + p.inv + p.netFixedAssets,
        ap: p.ap,
        accrued: p.accrued,
        loanBalance: p.loanBalance,
        totalLiab: p.ap + p.accrued + p.loanBalance,
        equity,
        retained: p.cumulativeNet,
        totalEquity: equity + p.cumulativeNet,
        accDep: p.accDep
      };
    });

    return {
      pl,
      bs,
      cf: pl.map(p => ({ m: p.m, inflow: p.rev + (p.m === 1 ? totalFunding : 0), outflow: p.cogs + p.semiF + p.fixedMo + p.sgaTotal + p.interest + p.tax, net: p.netProfit })),
      kpis: { var_cost_margin_pct: varCostMarginPct, gross_margin_pct: grossMarginPct, ebitda_pct: ebitdaPct, breakeven_month: bepMonth, payback_months: paybackMonths, burn_rate: burnRate }
    };
  }

  // ── Input collection ─────────────────────────────────────────
  function getInputs() {
    function v(id, def) { const el = $(id); return el ? el.value : (def !== undefined ? def : ''); }
    function rv(id, key, def) { const el = $(id); return el ? el.value : (_revInputs[key] || def || ''); }
    return {
      project_id: v('plg-project-sel', ''),
      start_period: rv('plg-start-period', 'start_period', ''),
      input_mode: rv('plg-input-mode', 'input_mode', 'units'),
      units_mo: rv('plg-units-mo', 'units_mo', '0'),
      sale_price: rv('plg-sale-price', 'sale_price', '0'),
      revenue_mo: rv('plg-revenue-mo', 'revenue_mo', '0'),
      probability: rv('plg-probability', 'probability', '70'),
      growth_mode: rv('plg-growth-mode', 'growth_mode', 'Conservative'),
      direct_mat: v('plg-direct-mat', '0'),
      labor_cost: v('plg-labor-cost', '0'),
      freight_in: v('plg-freight-in', ''),
      freight_out: v('plg-freight-out', ''),
      loyalty_pct: v('plg-loyalty-pct', '0'),
      owner_fund: v('plg-owner-fund', '0'),
      license_yr: v('plg-license-yr', '0'),
      other_sga: v('plg-other-sga', '0'),
      startup_cost: v('plg-startup-cost', '0'),
      dep_years: v('plg-dep-years', '3'),
      rec_days: v('plg-rec-days', '30'),
      pay_days: v('plg-pay-days', '45'),
      inv_days: v('plg-inv-days', '15'),
      cash_buf: v('plg-cash-buf', '0'),
      fund_total: v('plg-fund-total', '0'),
      runway: v('plg-runway', '6'),
      fund_buf: v('plg-fund-buf', '20'),
      loan_rate: v('plg-loan-rate', '0'),
      loan_term_mo: v('plg-loan-term', '12'),
      repay_start: v('plg-repay-start', 'Month 1'),
      review_note: v('plg-review-note', '')
    };
  }

  // ── Render helpers ───────────────────────────────────────────
  function tabBtn(id, label, active) {
    return `<button data-plg-tab="${id}" style="font-size:0.68rem;padding:0.25rem 0.6rem;border:none;border-radius:0;background:transparent;color:${active ? 'var(--text)' : 'var(--text-dim)'};cursor:pointer;border-bottom:2px solid ${active ? 'var(--yellow)' : 'transparent'};font-family:inherit">${label}</button>`;
  }

  function outTabBtn(id, label, active) {
    return `<button data-plg-out="${id}" style="font-size:0.68rem;padding:0.25rem 0.6rem;border:none;border-radius:0;background:transparent;color:${active ? 'var(--text)' : 'var(--text-dim)'};cursor:pointer;border-bottom:2px solid ${active ? 'var(--yellow)' : 'transparent'};font-family:inherit">${label}</button>`;
  }

  function inp(id, placeholder, val, type, extra) {
    const isNum = !type || type === 'number';
    const t = isNum ? 'text' : type;
    const numAttrs = isNum ? ' inputmode="numeric" pattern="[0-9.]*"' : '';
    return `<input id="${id}" type="${t}"${numAttrs} placeholder="${placeholder || ''}" value="${esc(val || '')}" ${extra || ''} style="font-size:0.78rem;padding:0.25rem 0.45rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);width:100%;box-sizing:border-box">`;
  }

  function sel(id, opts, val) {
    const options = opts.map(o => `<option value="${o}"${val === o ? ' selected' : ''}>${o}</option>`).join('');
    return `<select id="${id}" style="font-size:0.78rem;padding:0.25rem 0.45rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);width:100%;box-sizing:border-box">${options}</select>`;
  }

  function lbl(text, extra) {
    return `<div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:2px${extra ? ';' + extra : ''}">${text}</div>`;
  }

  function secHdr(text) {
    return `<div style="font-size:0.65rem;font-weight:700;color:var(--text-dim);letter-spacing:0.05em;text-transform:uppercase;padding:0.4rem 0 0.2rem;border-top:1px solid var(--border);margin-top:0.4rem">${text}</div>`;
  }

  function row2(...fields) {
    return `<div style="display:grid;grid-template-columns:${Array(fields.length).fill('1fr').join(' ')};gap:0.4rem">${fields.join('')}</div>`;
  }

  function field(labelText, inputHtml) {
    return `<div>${lbl(labelText)}${inputHtml}</div>`;
  }

  // ── Tab: Revenue ─────────────────────────────────────────────
  function renderRevTab(inp0) {
    const unitMode = (inp0 || getInputs()).input_mode !== 'direct';
    const storedInputs = inp0 || getInputs();
    const capStyle = _capCollapsed ? 'display:none' : '';

    return `
      ${secHdr('Forecast setup')}
      ${row2(
        field('Start period', inp('plg-start-period', '', storedInputs.start_period, 'month')),
        field('Input mode', sel('plg-input-mode', ['Units × price', 'Revenue direct'], unitMode ? 'Units × price' : 'Revenue direct'))
      )}
      ${unitMode ? `
        ${row2(
          field('Units / mo', inp('plg-units-mo', '0', storedInputs.units_mo)),
          field('Sale price (฿)', inp('plg-sale-price', '0', storedInputs.sale_price))
        )}
      ` : ''}
      <div>${lbl(`Revenue / mo <span style="font-size:0.58rem;background:rgba(245,197,24,0.15);color:var(--yellow);padding:0.05rem 0.25rem;border-radius:3px">${unitMode ? "auto" : "manual"}</span>`)}
        <input id="plg-revenue-mo" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="0" value="${esc(storedInputs.revenue_mo || '')}" ${unitMode ? 'readonly style="opacity:0.6;"' : ''} style="font-size:0.78rem;padding:0.25rem 0.45rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:${unitMode ? '#22c55e' : 'var(--text)'};width:100%;box-sizing:border-box">
      </div>
      ${row2(
        field('Probability %', inp('plg-probability', '70', storedInputs.probability)),
        field('Growth mode', sel('plg-growth-mode', ['Conservative', 'Aggressive'], storedInputs.growth_mode))
      )}
      <div>
        <div data-plg-sec="cap" style="font-size:0.65rem;font-weight:700;color:var(--text-dim);letter-spacing:0.05em;text-transform:uppercase;padding:0.4rem 0 0.2rem;border-top:1px solid var(--border);margin-top:0.4rem;cursor:pointer;display:flex;justify-content:space-between">
          <span>Capacity (optional)</span><span>${_capCollapsed ? '▸' : '▾'}</span>
        </div>
        <div data-plg-body="cap" style="${capStyle}">
          ${row2(
            field('Shifts/day', inp('plg-shifts', '', '')),
            field('Days/week', inp('plg-days-wk', '', '')),
            field('Weeks/mo', inp('plg-wks-mo', '', ''))
          )}
        </div>
      </div>
    `;
  }

  // ── Tab: Costs ────────────────────────────────────────────────
  function renderCostsTab(storedInputs) {
    const si = storedInputs || getInputs();
    return `
      ${secHdr('Variable costs (per unit or % of sale)')}
      ${row2(
        field('Direct material (฿/unit)', inp('plg-direct-mat', '0', si.direct_mat)),
        field('Labor (฿/unit)', inp('plg-labor-cost', '0', si.labor_cost))
      )}
      ${row2(
        field('Freight inbound', inp('plg-freight-in', '฿ or % COGS', si.freight_in, 'text')),
        field('Freight outbound', inp('plg-freight-out', '฿ or % sale', si.freight_out, 'text'))
      )}
      ${_varItems.map((item, i) => `
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(70px,2fr) minmax(0,90px) 24px;gap:0.3rem;align-items:end;margin-top:0.3rem">
          <input data-var-name="${i}" type="text" placeholder="Item name" value="${esc(item.name || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <input data-var-val="${i}" type="text" placeholder="Value" value="${esc(item.val || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <select data-var-type="${i}" style="font-size:0.68rem;padding:0.25rem 0.3rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            ${['per unit', '% sale', '% COGS'].map(t => `<option${item.type === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button data-var-del="${i}" style="background:#ef444422;border:1px solid #ef444444;border-radius:var(--radius);color:#ef4444;cursor:pointer;font-size:0.68rem;padding:0.2rem 0.4rem">✕</button>
        </div>
      `).join('')}
      <button data-plg-add="var" style="font-size:0.68rem;color:var(--yellow);background:transparent;border:none;cursor:pointer;padding:0.25rem 0;margin-top:0.25rem">+ Add variable item</button>

      ${secHdr('Semi-fixed costs')}
      ${_semiItems.map((item, i) => `
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(70px,2fr) minmax(0,90px) 24px;gap:0.3rem;align-items:end;margin-top:0.3rem">
          <input data-semi-desc="${i}" type="text" placeholder="Description" value="${esc(item.desc || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <input data-semi-amt="${i}" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="Amount" value="${esc(item.amt || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <select data-semi-freq="${i}" style="font-size:0.68rem;padding:0.25rem 0.3rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            ${['Monthly', 'Annual', 'Per unit', 'Per billing'].map(t => `<option${item.freq === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button data-semi-del="${i}" style="background:#ef444422;border:1px solid #ef444444;border-radius:var(--radius);color:#ef4444;cursor:pointer;font-size:0.68rem;padding:0.2rem 0.4rem">✕</button>
        </div>
      `).join('')}
      <button data-plg-add="semi" style="font-size:0.68rem;color:var(--yellow);background:transparent;border:none;cursor:pointer;padding:0.25rem 0;margin-top:0.25rem">+ Add item</button>

      ${secHdr('Fixed costs (monthly amount)')}
      ${_fixedItems.map((item, i) => `
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(70px,2fr) minmax(0,90px) 24px;gap:0.3rem;align-items:center;margin-top:0.3rem">
          <div style="font-size:0.72rem;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.cat)}">${esc(item.cat)}</div>
          <input data-fix-amt="${i}" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="0" value="${esc(item.amt || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <select data-fix-freq="${i}" style="font-size:0.68rem;padding:0.25rem 0.3rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            ${['Monthly', 'Annual'].map(t => `<option${item.freq === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <span></span>
        </div>
      `).join('')}
      <button data-plg-add="fixed" style="font-size:0.68rem;color:var(--yellow);background:transparent;border:none;cursor:pointer;padding:0.25rem 0;margin-top:0.25rem">+ Add custom category</button>

      ${secHdr('SG&A')}
      ${row2(
        field('Loyalty (% sale)', inp('plg-loyalty-pct', '0', si.loyalty_pct)),
        field('Owner fund (฿/mo)', inp('plg-owner-fund', '0', si.owner_fund))
      )}
      ${row2(
        field('License (฿/yr)', inp('plg-license-yr', '0', si.license_yr)),
        field('Other SG&A (฿/mo)', inp('plg-other-sga', '0', si.other_sga))
      )}
    `;
  }

  // ── Tab: Assets ───────────────────────────────────────────────
  function renderAssetsTab(si) {
    si = si || getInputs();
    const wcStyle = _wcCollapsed ? 'display:none' : '';
    return `
      ${secHdr('Startup cost')}
      ${field('Startup cost (฿)', inp('plg-startup-cost', '0', si.startup_cost))}
      <div style="font-size:0.62rem;color:var(--text-dim);margin-top:2px">Enter total from your project resources</div>
      ${row2(
        field('Depreciation years', inp('plg-dep-years', '3', si.dep_years)),
        field('Dep start', `<div style="font-size:0.78rem;padding:0.25rem 0.45rem;color:var(--text-dim)">= sale start (auto)</div>`)
      )}

      ${secHdr('Fixed assets')}
      ${_assetItems.map((item, i) => `
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(70px,2fr) 60px 24px;gap:0.3rem;align-items:end;margin-top:0.3rem">
          <input data-asset-name="${i}" type="text" placeholder="Asset name" value="${esc(item.name || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <input data-asset-val="${i}" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="฿ value" value="${esc(item.val || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <input data-asset-years="${i}" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="yrs" value="${esc(item.years || '3')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <button data-asset-del="${i}" style="background:#ef444422;border:1px solid #ef444444;border-radius:var(--radius);color:#ef4444;cursor:pointer;font-size:0.68rem;padding:0.2rem 0.4rem">✕</button>
        </div>
      `).join('')}
      <button data-plg-add="asset" style="font-size:0.68rem;color:var(--yellow);background:transparent;border:none;cursor:pointer;padding:0.25rem 0;margin-top:0.25rem">+ Add asset</button>

      <div>
        <div data-plg-sec="wc" style="font-size:0.65rem;font-weight:700;color:var(--text-dim);letter-spacing:0.05em;text-transform:uppercase;padding:0.4rem 0 0.2rem;border-top:1px solid var(--border);margin-top:0.4rem;cursor:pointer;display:flex;justify-content:space-between">
          <span>Working capital</span><span>${_wcCollapsed ? '▸' : '▾'}</span>
        </div>
        <div data-plg-body="wc" style="${wcStyle}">
          ${row2(
            field('Receivable days', inp('plg-rec-days', '30', si.rec_days)),
            field('Payable days', inp('plg-pay-days', '45', si.pay_days))
          )}
          ${row2(
            field('Inventory days', inp('plg-inv-days', '15', si.inv_days)),
            field('Cash buffer (฿)', inp('plg-cash-buf', '0', si.cash_buf))
          )}
        </div>
      </div>
    `;
  }

  // ── Tab: Funding ──────────────────────────────────────────────
  function renderFundingTab(si) {
    si = si || getInputs();
    const hasLoan = _fundItems.some(f => f.type === 'Loan');
    const loanStyle = (!hasLoan || _loanCollapsed) ? 'display:none' : '';
    return `
      ${secHdr('Fund need')}
      ${field('Total fund required (฿) <span style="font-size:0.58rem;background:rgba(245,197,24,0.15);color:var(--yellow);padding:0.05rem 0.25rem;border-radius:3px">auto</span>', inp('plg-fund-total', '0', si.fund_total))}
      ${row2(
        field('Runway target (mo)', inp('plg-runway', '6', si.runway)),
        field('Buffer %', inp('plg-fund-buf', '20', si.fund_buf))
      )}

      ${secHdr('Funding sources')}
      ${_fundItems.map((item, i) => `
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(70px,2fr) minmax(0,90px) 24px;gap:0.3rem;align-items:end;margin-top:0.3rem">
          <input data-fund-src="${i}" type="text" placeholder="Source name" value="${esc(item.src || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <input data-fund-amt="${i}" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="Amount" value="${esc(item.amt || '')}" style="font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <select data-fund-type="${i}" style="font-size:0.68rem;padding:0.25rem 0.3rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            ${['Equity', 'Loan', 'Grant', 'Presale'].map(t => `<option${item.type === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button data-fund-del="${i}" style="background:#ef444422;border:1px solid #ef444444;border-radius:var(--radius);color:#ef4444;cursor:pointer;font-size:0.68rem;padding:0.2rem 0.4rem">✕</button>
        </div>
      `).join('')}
      <button data-plg-add="fund" style="font-size:0.68rem;color:var(--yellow);background:transparent;border:none;cursor:pointer;padding:0.25rem 0;margin-top:0.25rem">+ Add source</button>

      <div>
        <div data-plg-sec="loan" style="font-size:0.65rem;font-weight:700;color:var(--text-dim);letter-spacing:0.05em;text-transform:uppercase;padding:0.4rem 0 0.2rem;border-top:1px solid var(--border);margin-top:0.4rem;cursor:pointer;display:flex;justify-content:space-between">
          <span>Loan terms</span><span>${_loanCollapsed ? '▸' : '▾'}</span>
        </div>
        <div data-plg-body="loan" style="${loanStyle}">
          ${row2(
            field('Interest rate %', inp('plg-loan-rate', '0', si.loan_rate)),
            field('Term (months)', inp('plg-loan-term', '12', si.loan_term_mo))
          )}
          ${field('Repayment start', sel('plg-repay-start', ['Month 1', 'Month 4 grace', 'After break-even'], si.repay_start))}
        </div>
      </div>

      <div style="margin-top:0.75rem;padding:0.5rem;background:var(--bg-raised);border-radius:var(--radius)">
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.25rem">NOTE FOR REVIEWER (optional)</div>
        <textarea id="plg-review-note" rows="2" placeholder="Add context, assumptions, or instructions for anyone reviewing this model…" style="width:100%;font-size:0.72rem;padding:0.25rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;box-sizing:border-box">${esc(si.review_note || '')}</textarea>
        <div style="font-size:0.62rem;color:var(--text-dim);margin-top:0.2rem">Appears as header in PDF export</div>
      </div>

    `;
  }

  // ── PL table ──────────────────────────────────────────────────
  function renderPLTable(result, period) {
    if (!result) return `<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.78rem">Click "Generate" to compute</div>`;
    const pl = result.pl;
    const is12 = period !== '5yr';
    const cols = is12 ? [1, 2, 3, 6, 9, 12] : [12, 24, 36, 60];
    const colLabels = is12 ? cols.map(c => 'M' + c) : ['Y1', 'Y2', 'Y3', 'Y5'];
    const data = cols.map(c => pl[c - 1]).filter(Boolean);
    const nc = 1 + data.length;

    function numRow(label, keyOrFn, opts) {
      const dim = opts && opts.dim;
      const bold = opts && opts.bold;
      const color = opts && opts.color;
      const tdStyle = `font-size:0.72rem;padding:0.2rem 0.4rem`;
      const trStyle = `${dim ? 'color:var(--text-dim);' : ''}${bold ? 'font-weight:700;background:var(--bg-card);' : ''}`;
      return `<tr style="${trStyle}">
        <td style="${tdStyle}${dim ? ';padding-left:1.2rem' : ''}">${label}</td>
        ${data.map(d => {
          const v = typeof keyOrFn === 'function' ? keyOrFn(d) : (d[keyOrFn] || 0);
          const c = color ? `color:${v >= 0 ? '#22c55e' : '#ef4444'};` : '';
          return `<td style="${tdStyle};text-align:right;font-variant-numeric:tabular-nums;${c}">${fmt(v)}</td>`;
        }).join('')}
      </tr>`;
    }

    function pctRow(label, fn) {
      return `<tr><td style="font-size:0.72rem;padding:0.2rem 0.4rem;color:var(--text-dim);padding-left:0.4rem">${label}</td>
        ${data.map(d => `<td style="font-size:0.72rem;padding:0.2rem 0.4rem;text-align:right;color:var(--text-dim)">${pct(fn(d))}</td>`).join('')}</tr>`;
    }

    function divRow() {
      return `<tr><td colspan="${nc}" style="border-top:1px solid var(--border);padding:0"></td></tr>`;
    }

    return `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="font-size:0.65rem;padding:0.25rem 0.4rem;text-align:left;color:var(--text-dim);border-bottom:1px solid var(--border);width:38%">Item</th>
          ${colLabels.map(l => `<th style="font-size:0.65rem;padding:0.25rem 0.4rem;text-align:right;color:var(--text-dim);border-bottom:1px solid var(--border)">${l}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${numRow('Revenue', 'rev')}
          ${numRow('Direct material', 'varMat', { dim: true })}
          ${numRow('Labor', 'varLabor', { dim: true })}
          ${numRow('Freight', 'varFreight', { dim: true })}
          ${numRow('Other variable', 'varOther', { dim: true })}
          ${numRow('Variable cost margin', 'variableCostMargin', { bold: true })}
          ${divRow()}
          ${numRow('Semi-fixed', 'semiF', { dim: true })}
          ${numRow('Fixed costs', 'fixedMo', { dim: true })}
          ${numRow('Gross profit', 'grossProfit', { bold: true })}
          ${divRow()}
          ${numRow('SG&A', 'sgaTotal', { dim: true })}
          ${numRow('Depreciation', 'dep', { dim: true })}
          ${numRow('EBITDA', 'ebitda', { bold: true })}
          ${divRow()}
          ${numRow('Interest', 'interest', { dim: true })}
          ${numRow('Tax (est.)', 'tax', { dim: true })}
          ${numRow('Net profit', 'netProfit', { bold: true, color: true })}
          ${divRow()}
          ${pctRow('Variable cost margin %', d => d.rev ? d.variableCostMargin / d.rev * 100 : 0)}
          ${pctRow('Gross margin %', d => d.rev ? d.grossProfit / d.rev * 100 : 0)}
          ${pctRow('EBITDA %', d => d.rev ? d.ebitda / d.rev * 100 : 0)}
          ${pctRow('Net margin %', d => d.rev ? d.netProfit / d.rev * 100 : 0)}
        </tbody>
      </table>
    </div>`;
  }

  // ── BS table ──────────────────────────────────────────────────
  function renderBSTable(result) {
    if (!result || !result.bs) return `<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.78rem">Click "Generate" to compute</div>`;
    return result.bs.map(snap => {
      const balanced = Math.abs(snap.totalAssets - (snap.totalLiab + snap.totalEquity)) < 1;
      return `
      <div style="margin-bottom:1rem;padding:0.5rem;background:var(--bg-card);border-radius:var(--radius)">
        <div style="font-size:0.65rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em;margin-bottom:0.4rem">PERIOD ${snap.period}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
          <div>
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em;margin-bottom:0.25rem">ASSETS</div>
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);margin:0.25rem 0">Current</div>
            ${bsRow('Cash', snap.cash)}${bsRow('AR', snap.ar)}${bsRow('Inventory', snap.inv)}
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);margin:0.25rem 0">Non-current</div>
            ${bsRow('Net fixed assets', snap.netFixed)}
            <div style="border-top:1px solid var(--border);margin-top:0.25rem;padding-top:0.25rem">
              ${bsRow('Total assets', snap.totalAssets, true)}
            </div>
          </div>
          <div>
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);letter-spacing:0.04em;margin-bottom:0.25rem">LIAB + EQUITY</div>
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);margin:0.25rem 0">Liabilities</div>
            ${bsRow('AP', snap.ap)}${bsRow('Accrued', snap.accrued)}${bsRow('Loan balance', snap.loanBalance)}
            <div style="font-size:0.62rem;font-weight:700;color:var(--text-dim);margin:0.25rem 0">Equity</div>
            ${bsRow('Owner capital', snap.equity)}${bsRow('Retained earnings', snap.retained)}
            <div style="border-top:1px solid var(--border);margin-top:0.25rem;padding-top:0.25rem">
              ${bsRow('Total liab+equity', snap.totalLiab + snap.totalEquity, true)}
            </div>
          </div>
        </div>
        <div style="font-size:0.68rem;color:${balanced ? 'var(--text-dim)' : '#ef4444'};margin-top:0.4rem">
          ${balanced ? 'Assets = Liabilities + Equity · ✓ balanced' : '⚠ imbalance ' + fmt(Math.abs(snap.totalAssets - snap.totalLiab - snap.totalEquity))}
        </div>
      </div>`;
    }).join('');
  }

  function bsRow(label, val, bold) {
    return `<div style="display:flex;justify-content:space-between;font-size:0.72rem;padding:0.1rem 0;${bold ? 'font-weight:700' : 'color:var(--text-dim)'}">
      <span>${label}</span><span>${fmt(val)}</span>
    </div>`;
  }

  // ── CF view ───────────────────────────────────────────────────
  function renderCFView(result, cumMode) {
    if (!result || !result.cf) return `<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.78rem">Click "Generate" to compute</div>`;
    const cf = result.cf;
    const bepM = result.kpis.breakeven_month;
    const maxVal = Math.max(...cf.map(p => Math.max(p.inflow, p.outflow)), 1);

    let cumNet = 0;
    const rows = cf.map(p => {
      cumNet += p.net;
      const isBep = p.m === bepM;
      const barIn = Math.round(p.inflow / maxVal * 100);
      const barOut = Math.round(p.outflow / maxVal * 100);
      const displayNet = cumMode ? cumNet : p.net;
      return `
      <div style="display:flex;align-items:center;gap:0.4rem;padding:0.2rem 0.4rem;${isBep ? 'background:rgba(34,197,94,0.08);border-radius:var(--radius)' : ''}">
        <div style="font-size:0.65rem;width:28px;flex-shrink:0;color:var(--text-dim)">M${p.m}</div>
        <div style="flex:1;min-width:0">
          <div style="height:6px;background:#3b82f655;border-radius:2px;width:${barIn}%;margin-bottom:2px"></div>
          <div style="height:6px;background:#ef444455;border-radius:2px;width:${barOut}%"></div>
        </div>
        <div style="font-size:0.65rem;width:70px;text-align:right;color:${displayNet >= 0 ? '#22c55e' : '#ef4444'}">${fmt(displayNet)}</div>
        ${isBep ? `<div style="font-size:0.58rem;color:#22c55e;width:40px">BEP ✓</div>` : '<div style="width:40px"></div>'}
      </div>`;
    });

    const totalIn = cf.reduce((s, p) => s + p.inflow, 0);
    const totalOut = cf.reduce((s, p) => s + p.outflow, 0);
    const netPos = totalIn - totalOut;

    return `
      <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem">
        <button data-plg-cf="monthly" style="font-size:0.68rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${!cumMode ? 'var(--bg-card)' : 'transparent'};color:var(--text);cursor:pointer">Monthly</button>
        <button data-plg-cf="cumulative" style="font-size:0.68rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${cumMode ? 'var(--bg-card)' : 'transparent'};color:var(--text);cursor:pointer">Cumulative</button>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;font-size:0.62rem;color:var(--text-dim)">
        <span style="display:inline-block;width:12px;height:8px;background:#3b82f655;border-radius:2px;vertical-align:middle"></span> Inflow
        <span style="display:inline-block;width:12px;height:8px;background:#ef444455;border-radius:2px;vertical-align:middle;margin-left:0.5rem"></span> Outflow
      </div>
      ${rows.join('')}
      <div style="display:flex;gap:1rem;padding:0.5rem 0.4rem;border-top:1px solid var(--border);margin-top:0.4rem;font-size:0.65rem">
        <span>Total inflow: <strong style="color:#22c55e">${fmt(totalIn)}</strong></span>
        <span>Total outflow: <strong style="color:#ef4444">${fmt(totalOut)}</strong></span>
        <span>Net: <strong style="color:${netPos >= 0 ? '#22c55e' : '#ef4444'}">${fmt(netPos)}</strong></span>
      </div>`;
  }

  // ── KPI strip ─────────────────────────────────────────────────
  function renderKPIs(kpis) {
    const items = [
      { label: 'Gross margin %', val: kpis ? pct(kpis.gross_margin_pct) : '—' },
      { label: 'EBITDA %', val: kpis ? pct(kpis.ebitda_pct) : '—' },
      { label: 'Break-even mo', val: kpis ? (kpis.breakeven_month ? 'M' + kpis.breakeven_month : '—') : '—' },
      { label: 'Payback', val: kpis ? (kpis.payback_months ? (kpis.payback_months < 12 ? Math.round(kpis.payback_months) + ' mo' : (kpis.payback_months / 12).toFixed(1) + ' yr') : '—') : '—' },
      { label: 'Burn rate ฿/mo', val: kpis ? fmt(kpis.burn_rate) : '—' }
    ];
    return items.map(item => `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:0.3rem 0.75rem;white-space:nowrap">
        <div style="font-size:0.62rem;color:var(--text-dim);letter-spacing:0.04em">${item.label}</div>
        <div style="font-size:0.95rem;font-weight:700">${item.val}</div>
      </div>
    `).join('');
  }

  // ── Archive view ──────────────────────────────────────────────
  function renderArchive() {
    let list = _archiveList;
    if (_archiveSearch) list = list.filter(v => (v.name + ' ' + v.review_note).toLowerCase().includes(_archiveSearch.toLowerCase()));
    if (_archiveFilter !== 'all') list = list.filter(v => v.period === _archiveFilter);

    return `
      <div id="plg-archive" style="padding:0.75rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
          <button id="plg-archive-back" style="font-size:0.72rem;padding:0.25rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">← Back</button>
          <input id="plg-archive-search" type="text" placeholder="Search by name or note…" value="${esc(_archiveSearch)}" style="font-size:0.78rem;padding:0.25rem 0.45rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);flex:1">
          <div style="display:flex;gap:0.3rem">
            ${['all', '12mo', '5yr'].map(f => `<button data-arc-filter="${f}" style="font-size:0.65rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:${_archiveFilter === f ? 'var(--bg-card)' : 'transparent'};color:var(--text);cursor:pointer">${f}</button>`).join('')}
          </div>
        </div>
        ${list.length === 0 ? `<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:0.78rem">No saved models found</div>` :
          list.map(v => `
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border);font-size:0.78rem">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:0.4rem">
                  <span style="font-weight:700">${esc(v.name)}</span>
                  <span style="font-size:0.62rem;background:var(--bg-card);border:1px solid var(--border);padding:0.1rem 0.35rem;border-radius:3px">${esc(v.version)}</span>
                  <span style="font-size:0.62rem;color:var(--text-dim)">${esc(v.period)} · ${v.created_at ? v.created_at.split('T')[0] : ''}</span>
                </div>
                ${v.review_note ? `<div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px">${esc(v.review_note)}</div>` : ''}
              </div>
              <button data-arc-load="${v.id}" style="font-size:0.68rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">Load</button>
              <button data-arc-del="${v.id}" style="font-size:0.68rem;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:#ef4444;cursor:pointer">Delete</button>
            </div>
          `).join('')}
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────
  function renderPanel(si) {
    si = si || getInputs();
    const cfMode = (window._plgCfMode || 'monthly') === 'cumulative';

    const sidebar = `
      <div id="plg-sidebar" style="width:${_sidebarW}px;min-width:${_sidebarW}px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;border-bottom:1px solid var(--border)">
          ${['revenue', 'costs', 'assets', 'funding'].map(t => tabBtn(t, t.charAt(0).toUpperCase() + t.slice(1), _activeTab === t)).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;padding:0.4rem 0.75rem;border-bottom:1px solid var(--border);flex-shrink:0">
          <button id="plg-gen-12" style="font-size:0.75rem;padding:0.3rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer;font-family:inherit">12 months</button>
          <button id="plg-gen-5y" style="font-size:0.75rem;padding:0.3rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;cursor:pointer;font-weight:700;font-family:inherit">5 years</button>
        </div>
        <div id="plg-sidebar-body" style="flex:1;overflow-y:auto;padding:0.4rem 0.75rem 1rem">
          ${_activeTab === 'revenue' ? renderRevTab(si)
            : _activeTab === 'costs' ? renderCostsTab(si)
            : _activeTab === 'assets' ? renderAssetsTab(si)
            : renderFundingTab(si)}
        </div>
      </div>`;

    const output = `
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0">
        <div id="plg-output-header" style="display:flex;border-bottom:1px solid var(--border)">
          ${['pl', 'bs', 'cf'].map(t => outTabBtn(t, t === 'pl' ? 'P&L' : t === 'bs' ? 'Balance Sheet' : 'Cashflow', _activeOutput === t)).join('')}
          <div style="margin-left:auto;padding:0.2rem 0.5rem;display:flex;gap:0.3rem;align-items:center">
            ${['12mo', '5yr'].map(p => `<button data-plg-period="${p}" style="font-size:0.68rem;padding:0.2rem 0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:${_activePeriod === p ? 'var(--bg-card)' : 'transparent'};color:var(--text);cursor:pointer">${p}</button>`).join('')}
          </div>
        </div>
        <div id="plg-output-body" style="flex:1;overflow-y:auto;padding:0.5rem">
          ${_activeOutput === 'pl' ? renderPLTable(_computed, _activePeriod)
            : _activeOutput === 'bs' ? renderBSTable(_computed)
            : renderCFView(_computed, cfMode)}
        </div>
      </div>`;

    const projectOpts = `<option value="">No project</option>` + _projects.map(p => `<option value="${p.id}">${esc(p.name || p.id)}</option>`).join('');

    return `
      <style>
        input[type=text] { -webkit-appearance:none; appearance:none; }
        #panel-pl-generator.active { display:flex; flex-direction:column; overflow:hidden; height:calc(100vh - 3rem); }
        @media print {
          @page { size: A4 landscape; margin: 1cm; }
          body > *:not(#main) { display:none !important; }
          #main > *:not(#panel-pl-generator) { display:none !important; }
          #panel-pl-generator { all:unset !important; display:block !important; position:static !important; }
          #plg-sidebar, #plg-save-bar, #plg-header, .main-nav, aside { display:none !important; }
          #plg-print-header { display:block !important; }
          #plg-output-body { font-size:0.85rem; }
          #plg-chart-area { text-align:center; }
          #plg-chart { max-width:80%; margin:0 auto; display:block; }
        }
      </style>
      <div id="plg-print-header" style="display:none;padding:0.75rem;border-bottom:2px solid #ccc;margin-bottom:0.75rem">
        <div id="plg-print-title" style="font-weight:700;font-size:1rem"></div>
        <div id="plg-print-meta" style="font-size:0.78rem;color:#555;margin-top:0.2rem"></div>
        <div id="plg-print-note" style="font-size:0.82rem;font-style:italic;color:#555;border-left:3px solid #ccc;padding-left:8px;margin-top:0.4rem"></div>
      </div>

      <div id="plg-header" style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:0.95rem;font-weight:700">P&amp;L Generator</div>
          <div id="plg-subtitle" style="font-size:0.72rem;color:${_selectedProjectId ? 'var(--yellow)' : 'var(--text-dim)'}">${_selectedProjectId ? `// ${_selectedProjectName}` : '// financial modelling · 12-month · 5-year'}</div>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <select id="plg-project-sel" style="font-size:0.72rem;padding:0.2rem 0.4rem;background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">${projectOpts}</select>
        </div>
      </div>

      <div id="plg-kpi-strip" style="display:flex;gap:0.4rem;padding:0.5rem 1rem;border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0">
        ${renderKPIs(_computed ? _computed.kpis : null)}
      </div>

      <div id="plg-chart-area" style="padding:0.5rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0">
        ${_computed ? `<canvas id="plg-chart" height="120"></canvas>` : `<div style="height:80px;border:1px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:var(--text-dim)">Generate to see chart</div>`}
      </div>

      <div style="display:flex;flex:1;overflow:hidden;min-height:0" id="plg-body">
        ${sidebar}
        <div id="plg-resizer" style="width:4px;flex-shrink:0;background:transparent;cursor:col-resize;transition:background 0.1s"></div>
        ${output}
      </div>

      <div id="plg-save-bar" style="padding:0.3rem 1rem;border-top:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;flex-shrink:0;background:var(--bg-raised)">
        <button id="plg-save-btn" ${_selectedProjectId ? '' : 'disabled'} style="font-size:0.72rem;padding:0.25rem 0.75rem;border:none;border-radius:var(--radius);background:${_selectedProjectId ? 'var(--yellow)' : 'var(--bg-card)'};color:${_selectedProjectId ? '#0a0a10' : 'var(--text-dim)'};cursor:${_selectedProjectId ? 'pointer' : 'default'};font-weight:700;white-space:nowrap">Save</button>
        <button id="plg-ods-btn" style="font-size:0.72rem;padding:0.25rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">ODS</button>
        <button id="plg-pdf-btn" style="font-size:0.72rem;padding:0.25rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">PDF</button>
        <div id="plg-save-status" style="font-size:0.68rem;color:#22c55e;display:none;white-space:nowrap"></div>
      </div>`;
  }

  // ── Chart rendering ───────────────────────────────────────────
  function renderChart(result, period) {
    const canvas = document.getElementById('plg-chart');
    if (!canvas || !result) return;
    if (plChart) { plChart.destroy(); plChart = null; }

    const pl = result.pl;
    const bepM = result.kpis.breakeven_month;
    const is12 = period !== '5yr';

    let data, labels, bgRev, bgCost;
    if (is12) {
      data = pl.slice(0, 12);
      labels = data.map(p => 'M' + p.m);
      bgRev = data.map(p => p.m < (bepM || 999) ? '#3b82f6' : '#22c55e');
      bgCost = data.map(() => '#ef444488');
    } else {
      // Aggregate 60 months into 5 yearly totals
      data = [1, 2, 3, 4, 5].map(yr => {
        const months = pl.slice((yr - 1) * 12, yr * 12);
        return {
          yr,
          rev: months.reduce((s, p) => s + p.rev, 0),
          cost: months.reduce((s, p) => s + p.cogs + p.semiF + p.fixedMo + p.sgaTotal, 0),
          bepPassed: bepM ? bepM <= yr * 12 : false
        };
      });
      labels = data.map(d => 'Y' + d.yr);
      bgRev = data.map(d => d.bepPassed ? '#22c55e' : '#3b82f6');
      bgCost = data.map(() => '#ef444488');
    }

    try {
      plChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Revenue', data: is12 ? data.map(p => p.rev) : data.map(d => d.rev), backgroundColor: bgRev, barPercentage: 0.7 },
            { label: 'Total cost', data: is12 ? data.map(p => p.cogs + p.semiF + p.fixedMo + p.sgaTotal) : data.map(d => d.cost), backgroundColor: bgCost, barPercentage: 0.7 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { font: { size: 10 }, color: '#888' } } },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#888', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { font: { size: 9 }, color: '#888' }, grid: { color: 'rgba(255,255,255,0.04)' } }
          }
        }
      });
    } catch (err) { console.error('[pl-gen] chart:', err); }
  }

  // ── Save ──────────────────────────────────────────────────────
  async function save() {
    if (!_selectedProjectId) return;
    const si = getInputs();
    const record = {
      id: `proj_${_selectedProjectId}`,
      version: 'v' + (_savedVersion + 1),
      name: _selectedProjectName || _selectedProjectId,
      created_at: new Date().toISOString(),
      review_note: si.review_note || '',
      period: _activePeriod,
      inputs: { ...si, var_items: _varItems, semi_items: _semiItems, fixed_items: _fixedItems, asset_items: _assetItems, fund_items: _fundItems },
      outputs: _computed || {}
    };
    try {
      const r = await fetch('/api/pl-generator', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
      if (!r.ok) throw new Error(r.status);
      _savedVersion++;
      const status = $('plg-save-status');
      if (status) { status.style.display = ''; status.style.color = '#22c55e'; status.textContent = `✓ Saved`; setTimeout(() => { if (status) status.style.display = 'none'; }, 3000); }
    } catch (err) {
      const status = $('plg-save-status');
      if (status) { status.style.display = ''; status.style.color = '#ef4444'; status.textContent = 'Save failed'; setTimeout(() => { if (status) status.style.display = 'none'; }, 3000); }
    }
  }

  // ── ODS export ────────────────────────────────────────────────
  function exportODS() {
    if (!_computed) { alert('Generate first'); return; }
    if (typeof XLSX === 'undefined') { alert('SheetJS not loaded'); return; }

    const si = getInputs();
    const { pl, bs, cf } = _computed;
    const note = si.review_note;

    // P&L sheet
    const plRows = [['Period', 'Revenue', 'COGS', 'Gross profit', 'Semi-fixed', 'Fixed', 'Depreciation', 'SG&A', 'EBITDA', 'Interest', 'Tax', 'Net profit']];
    if (note) plRows[0][12] = 'Note: ' + note;
    pl.forEach(p => plRows.push([`M${p.m}`, p.rev, p.cogs, p.grossProfit, p.semiF, p.fixedMo, p.dep, p.sgaTotal, p.ebitda, p.interest, p.tax, p.netProfit]));

    // Balance sheet
    const bsRows = [['Period', 'Cash', 'AR', 'Inventory', 'Net Fixed', 'Total Assets', 'AP', 'Accrued', 'Loan', 'Total Liab', 'Equity', 'Retained', 'Total Equity']];
    bs.forEach(s => bsRows.push([`P${s.period}`, s.cash, s.ar, s.inv, s.netFixed, s.totalAssets, s.ap, s.accrued, s.loanBalance, s.totalLiab, s.equity, s.retained, s.totalEquity]));

    // Cashflow
    const cfRows = [['Month', 'Inflow', 'Outflow', 'Net']];
    cf.forEach(p => cfRows.push([`M${p.m}`, p.inflow, p.outflow, p.net]));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plRows), 'P&L');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bsRows), 'Balance Sheet');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), 'Cashflow');

    const name = (_selectedProjectName || 'pl-model').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    XLSX.writeFile(wb, `${name}-v${_savedVersion || 1}.ods`, { bookType: 'ods' });
  }

  // ── PDF export ────────────────────────────────────────────────
  function exportPDF() {
    const si = getInputs();
    const hdr = $('plg-print-header');
    const title = $('plg-print-title');
    const meta = $('plg-print-meta');
    const noteEl = $('plg-print-note');
    if (title) title.textContent = (_selectedProjectName || 'P&L Model') + ' — v' + (_savedVersion || 1);
    if (meta) meta.textContent = `Generated ${new Date().toLocaleDateString()} · ${_activePeriod}`;
    if (noteEl) { noteEl.textContent = si.review_note || ''; noteEl.style.display = si.review_note ? '' : 'none'; }
    if (hdr) hdr.style.display = 'block';
    window.print();
    if (hdr) setTimeout(() => { hdr.style.display = 'none'; }, 500);
  }

  // ── Load projects ─────────────────────────────────────────────
  async function loadProjects() {
    try {
      const r = await fetch('/api/projects', { credentials: 'same-origin' });
      if (r.ok) {
        const data = await r.json();
        _projects = Array.isArray(data) ? data : (data.records || []);
        const sel = $('plg-project-sel');
        if (sel) {
          sel.innerHTML = `<option value="">No project</option>` + _projects.map(p => `<option value="${p.id}">${esc(p.name || p.id)}</option>`).join('');
        }
      }
    } catch { /* no-op */ }
  }

  // ── Load archive ──────────────────────────────────────────────
  async function loadArchive() {
    try {
      const r = await fetch('/api/pl-generator', { credentials: 'same-origin' });
      if (r.ok) {
        const data = await r.json();
        _archiveList = data.versions || [];
      }
    } catch { /* no-op */ }
  }

  // ── Rebuild sidebar/output without full re-render ─────────────
  function rebuildSidebar(si) {
    const body = $('plg-sidebar-body');
    if (!body) return;
    body.innerHTML = _activeTab === 'revenue' ? renderRevTab(si)
      : _activeTab === 'costs' ? renderCostsTab(si)
      : _activeTab === 'assets' ? renderAssetsTab(si)
      : renderFundingTab(si);
    const p = panel();
    if (p) {
      p.querySelectorAll('[data-plg-tab]').forEach(btn => {
        const active = btn.dataset.plgTab === _activeTab;
        btn.style.color = active ? 'var(--text)' : 'var(--text-dim)';
        btn.style.borderBottom = active ? '2px solid var(--yellow)' : '2px solid transparent';
      });
    }
  }

  function rebuildOutputHeader() {
    const hdr = $('plg-output-header');
    if (!hdr) return;
    hdr.innerHTML = ['pl', 'bs', 'cf'].map(t => outTabBtn(t, t === 'pl' ? 'P&L' : t === 'bs' ? 'Balance Sheet' : 'Cashflow', _activeOutput === t)).join('')
      + `<div style="margin-left:auto;padding:0.2rem 0.5rem;display:flex;gap:0.3rem;align-items:center">`
      + ['12mo', '5yr'].map(p => `<button data-plg-period="${p}" style="font-size:0.68rem;padding:0.2rem 0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:${_activePeriod === p ? 'var(--bg-card)' : 'transparent'};color:var(--text);cursor:pointer">${p}</button>`).join('')
      + `</div>`;
  }

  function rebuildOutput() {
    const body = $('plg-output-body');
    if (!body) return;
    const cfMode = (window._plgCfMode || 'monthly') === 'cumulative';
    body.innerHTML = _activeOutput === 'pl' ? renderPLTable(_computed, _activePeriod)
      : _activeOutput === 'bs' ? renderBSTable(_computed)
      : renderCFView(_computed, cfMode);
  }

  function rebuildKPIs() {
    const strip = $('plg-kpi-strip');
    if (strip) strip.innerHTML = renderKPIs(_computed ? _computed.kpis : null);
  }

  function resetForm() {
    clearFormData();
    _selectedProjectId = ''; _selectedProjectName = '';
    const p = panel(); if (!p) return;
    p.innerHTML = renderPanel();
  }

  function clearFormData() {
    _computed = null; _activePeriod = '12mo'; _savedVersion = 0; _varItems = [];
    _revInputs = { start_period: '', input_mode: 'Units × price', units_mo: '', sale_price: '', revenue_mo: '', probability: '70', growth_mode: 'Conservative' };
    _semiItems = [
      { desc: 'Office staff', amt: '', freq: 'Monthly' },
      { desc: 'Packaging', amt: '', freq: 'Monthly' },
      { desc: 'Accountant', amt: '', freq: 'Monthly' }
    ];
    _fixedItems = [
      { cat: 'Office labor', amt: '', freq: 'Monthly' }, { cat: 'Utility', amt: '', freq: 'Monthly' },
      { cat: 'Rental', amt: '', freq: 'Monthly' }, { cat: 'IT/Software', amt: '', freq: 'Monthly' },
      { cat: 'Maintenance', amt: '', freq: 'Monthly' }, { cat: 'Insurance', amt: '', freq: 'Monthly' },
      { cat: 'Marketing', amt: '', freq: 'Monthly' }, { cat: 'Services', amt: '', freq: 'Monthly' }
    ];
    _assetItems = [];
    _fundItems = [{ src: 'Owner equity', amt: '', type: 'Equity' }, { src: 'Bank loan', amt: '', type: 'Loan' }];
  }

  async function loadProjectModel(projectId) {
    const p = panel(); if (!p) return;
    try {
      const r = await fetch(`/api/pl-generator/proj_${projectId}`, { credentials: 'same-origin' });
      if (!r.ok) {
        // No saved model for this project — blank slate but keep project identity
        clearFormData();
        p.innerHTML = renderPanel();
        const newSel = $('plg-project-sel');
        if (newSel) newSel.value = projectId;
        return;
      }
      const saved = await r.json();
      _computed = saved.outputs || null;
      _activePeriod = saved.period || '12mo';
      _savedVersion = parseInt((saved.version || 'v1').replace('v', ''), 10) || 1;
      if (saved.inputs) {
        if (saved.inputs.var_items)   _varItems   = saved.inputs.var_items;
        if (saved.inputs.semi_items)  _semiItems  = saved.inputs.semi_items;
        if (saved.inputs.fixed_items) _fixedItems = saved.inputs.fixed_items;
        if (saved.inputs.asset_items) _assetItems = saved.inputs.asset_items;
        if (saved.inputs.fund_items)  _fundItems  = saved.inputs.fund_items;
        // Restore revenue inputs into module var so they survive tab switches
        _revInputs = {
          start_period: saved.inputs.start_period || '',
          input_mode: saved.inputs.input_mode || 'Units × price',
          units_mo: saved.inputs.units_mo || '',
          sale_price: saved.inputs.sale_price || '',
          revenue_mo: saved.inputs.revenue_mo || '',
          probability: saved.inputs.probability || '70',
          growth_mode: saved.inputs.growth_mode || 'Conservative'
        };
      }
      p.innerHTML = renderPanel(saved.inputs);
      const newSel = $('plg-project-sel');
      if (newSel) newSel.value = projectId;
      if (_computed && _computed.pl) renderChart(_computed, _activePeriod);
    } catch {
      clearFormData();
      p.innerHTML = renderPanel();
      const newSel = $('plg-project-sel');
      if (newSel) newSel.value = projectId;
    }
  }

  function generate(periods) {
    const si = getInputs();
    _computed = computePL(si, periods);
    _activePeriod = periods === 12 ? '12mo' : '5yr';
    rebuildKPIs();

    // Update chart area
    const chartArea = $('plg-chart-area');
    if (chartArea) {
      chartArea.innerHTML = `<canvas id="plg-chart" height="120"></canvas>`;
      renderChart(_computed, _activePeriod);
    }

    rebuildOutput();
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    const p = panel();
    if (!p) return;
    initialized = true;

    p.innerHTML = renderPanel();

    loadProjects();

    // Load SheetJS if not present
    if (typeof XLSX === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      document.head.appendChild(s);
    }

    // Sidebar resizer drag
    const rsz = p.querySelector('#plg-resizer');
    if (rsz) {
      let dragging = false;
      const onDrag = ev => {
        if (!dragging) return;
        const sidebar = p.querySelector('#plg-sidebar');
        if (!sidebar) return;
        const panelRect = p.getBoundingClientRect();
        const newW = Math.min(480, Math.max(220, ev.clientX - panelRect.left));
        _sidebarW = newW;
        sidebar.style.width = newW + 'px';
        sidebar.style.minWidth = newW + 'px';
        sidebar.style.flexShrink = '0';
      };
      rsz.addEventListener('mousedown', ev => {
        dragging = true;
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', () => {
          dragging = false;
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', onDrag);
        }, { once: true });
        ev.preventDefault();
      });
      rsz.addEventListener('mouseover', () => { rsz.style.background = 'var(--yellow)'; });
      rsz.addEventListener('mouseout', () => { if (!dragging) rsz.style.background = 'transparent'; });
    }

    // Delegated events
    p.addEventListener('click', async (e) => {
      // Generate buttons — delegated so they always work regardless of wireGenButtons timing
      if (e.target.closest('#plg-gen-12')) { generate(12); return; }
      if (e.target.closest('#plg-gen-5y')) { generate(60); return; }

      // Tab switching
      const tabBtn = e.target.closest('[data-plg-tab]');
      if (tabBtn) {
        const si = getInputs();
        _activeTab = tabBtn.dataset.plgTab;
        rebuildSidebar(si);
        return;
      }
      const outBtn = e.target.closest('[data-plg-out]');
      if (outBtn) {
        _activeOutput = outBtn.dataset.plgOut;
        rebuildOutputHeader();
        rebuildOutput();
        return;
      }

      // Period toggle
      const periodBtn = e.target.closest('[data-plg-period]');
      if (periodBtn) {
        _activePeriod = periodBtn.dataset.plgPeriod;
        if (_computed) {
          const periods = _activePeriod === '5yr' ? 60 : 12;
          const si = getInputs();
          _computed = computePL(si, periods);
          rebuildKPIs();
          renderChart(_computed, _activePeriod);
        }
        rebuildOutputHeader();
        rebuildOutput();
        return;
      }

      // CF mode toggle
      const cfBtn = e.target.closest('[data-plg-cf]');
      if (cfBtn) { window._plgCfMode = cfBtn.dataset.plgCf; rebuildOutput(); return; }

      // Collapsible sections
      const secBtn = e.target.closest('[data-plg-sec]');
      if (secBtn) {
        const key = secBtn.dataset.plgSec;
        if (key === 'cap') _capCollapsed = !_capCollapsed;
        if (key === 'wc') _wcCollapsed = !_wcCollapsed;
        if (key === 'loan') _loanCollapsed = !_loanCollapsed;
        const si = getInputs();
        rebuildSidebar(si);
        return;
      }

      // Add row buttons
      const addBtn = e.target.closest('[data-plg-add]');
      if (addBtn) {
        const type = addBtn.dataset.plgAdd;
        const si = getInputs();
        if (type === 'var') _varItems.push({ name: '', val: '', type: 'per unit' });
        if (type === 'semi') _semiItems.push({ desc: '', amt: '', freq: 'Monthly' });
        if (type === 'fixed') _fixedItems.push({ cat: 'Custom', amt: '', freq: 'Monthly' });
        if (type === 'asset') _assetItems.push({ name: '', val: '', years: '3' });
        if (type === 'fund') _fundItems.push({ src: '', amt: '', type: 'Equity' });
        rebuildSidebar(si);
        return;
      }

      // Delete row buttons
      const varDel = e.target.closest('[data-var-del]');
      if (varDel) { const si = getInputs(); _varItems.splice(+varDel.dataset.varDel, 1); rebuildSidebar(si); return; }
      const semiDel = e.target.closest('[data-semi-del]');
      if (semiDel) { const si = getInputs(); _semiItems.splice(+semiDel.dataset.semiDel, 1); rebuildSidebar(si); return; }
      const assetDel = e.target.closest('[data-asset-del]');
      if (assetDel) { const si = getInputs(); _assetItems.splice(+assetDel.dataset.assetDel, 1); rebuildSidebar(si); return; }
      const fundDel = e.target.closest('[data-fund-del]');
      if (fundDel) { const si = getInputs(); _fundItems.splice(+fundDel.dataset.fundDel, 1); rebuildSidebar(si); return; }


      // Archive filter
      const arcFilter = e.target.closest('[data-arc-filter]');
      if (arcFilter) {
        _archiveFilter = arcFilter.dataset.arcFilter;
        const arcEl = $('plg-archive');
        if (arcEl) arcEl.outerHTML = renderArchive();
        return;
      }

      // Archive load
      const arcLoad = e.target.closest('[data-arc-load]');
      if (arcLoad) {
        try {
          const r = await fetch('/api/pl-generator/' + arcLoad.dataset.arcLoad, { credentials: 'same-origin' });
          if (!r.ok) throw new Error();
          const saved = await r.json();
          _computed = saved.outputs || null;
          _activePeriod = saved.period || '12mo';
          _savedVersion = parseInt((saved.version || 'v1').replace('v', ''), 10) || 1;
          if (saved.inputs) {
            if (saved.inputs.var_items) _varItems = saved.inputs.var_items;
            if (saved.inputs.semi_items) _semiItems = saved.inputs.semi_items;
            if (saved.inputs.fixed_items) _fixedItems = saved.inputs.fixed_items;
            if (saved.inputs.asset_items) _assetItems = saved.inputs.asset_items;
            if (saved.inputs.fund_items) _fundItems = saved.inputs.fund_items;
          }
          p.innerHTML = renderPanel(saved.inputs);
          loadProjects();
          if (_computed && _computed.pl) renderChart(_computed, _activePeriod);
        } catch { alert('Failed to load model'); }
        return;
      }

      // Archive delete
      const arcDel = e.target.closest('[data-arc-del]');
      if (arcDel) {
        if (!confirm('Delete this model?')) return;
        try {
          await fetch('/api/pl-generator/' + arcDel.dataset.arcDel, { method: 'DELETE', credentials: 'same-origin' });
          await loadArchive();
          const arcEl = $('plg-archive');
          if (arcEl) arcEl.outerHTML = renderArchive();
        } catch { alert('Delete failed'); }
        return;
      }

      // Save/export
      const saveBtn = e.target.closest('#plg-save-btn');
      if (saveBtn) { await save(); return; }
      const odsBtn = e.target.closest('#plg-ods-btn');
      if (odsBtn) { exportODS(); return; }
      const pdfBtn = e.target.closest('#plg-pdf-btn');
      if (pdfBtn) { exportPDF(); return; }
    });

    p.addEventListener('change', (e) => {
      // Project selector — update subtitle + auto-load KV model
      if (e.target.id === 'plg-project-sel') {
        const projectId = e.target.value;
        const projectName = e.target.options[e.target.selectedIndex].text;
        _selectedProjectId = projectId;
        _selectedProjectName = projectId ? projectName : '';
        if (projectId) { loadProjectModel(projectId); } else { resetForm(); loadProjects(); }
        return;
      }
      // Sync revenue inputs to module var on every change
      const revFieldMap = { 'plg-start-period':'start_period','plg-input-mode':'input_mode','plg-units-mo':'units_mo','plg-sale-price':'sale_price','plg-revenue-mo':'revenue_mo','plg-probability':'probability','plg-growth-mode':'growth_mode' };
      if (revFieldMap[e.target.id]) { _revInputs[revFieldMap[e.target.id]] = e.target.value; }

      // Input mode change — rebuild revenue tab
      if (e.target.id === 'plg-input-mode') {
        const si = getInputs();
        rebuildSidebar(si);
        return;
      }
      // Inline list updates — read from inputs into module vars
      const varName = e.target.dataset.varName;
      if (varName !== undefined) { _varItems[+varName].name = e.target.value; return; }
      const varVal = e.target.dataset.varVal;
      if (varVal !== undefined) { _varItems[+varVal].val = e.target.value; return; }
      const varType = e.target.dataset.varType;
      if (varType !== undefined) { _varItems[+varType].type = e.target.value; return; }
      const semiDesc = e.target.dataset.semiDesc;
      if (semiDesc !== undefined) { _semiItems[+semiDesc].desc = e.target.value; return; }
      const semiAmt = e.target.dataset.semiAmt;
      if (semiAmt !== undefined) { _semiItems[+semiAmt].amt = e.target.value; return; }
      const semiFreq = e.target.dataset.semiFreq;
      if (semiFreq !== undefined) { _semiItems[+semiFreq].freq = e.target.value; return; }
      const fixAmt = e.target.dataset.fixAmt;
      if (fixAmt !== undefined) { _fixedItems[+fixAmt].amt = e.target.value; return; }
      const fixFreq = e.target.dataset.fixFreq;
      if (fixFreq !== undefined) { _fixedItems[+fixFreq].freq = e.target.value; return; }
      const assetName = e.target.dataset.assetName;
      if (assetName !== undefined) { _assetItems[+assetName].name = e.target.value; return; }
      const assetVal = e.target.dataset.assetVal;
      if (assetVal !== undefined) { _assetItems[+assetVal].val = e.target.value; return; }
      const assetYears = e.target.dataset.assetYears;
      if (assetYears !== undefined) { _assetItems[+assetYears].years = e.target.value; return; }
      const fundSrc = e.target.dataset.fundSrc;
      if (fundSrc !== undefined) { _fundItems[+fundSrc].src = e.target.value; return; }
      const fundAmt = e.target.dataset.fundAmt;
      if (fundAmt !== undefined) { _fundItems[+fundAmt].amt = e.target.value; return; }
      const fundType = e.target.dataset.fundType;
      if (fundType !== undefined) { _fundItems[+fundType].type = e.target.value; return; }

      // Archive search
      if (e.target.id === 'plg-archive-search') {
        _archiveSearch = e.target.value;
        const arcEl = $('plg-archive');
        if (arcEl) arcEl.outerHTML = renderArchive();
      }
    });

    // Sync revenue fields to _revInputs on every keystroke
    p.addEventListener('input', (e) => {
      const revFieldMap = { 'plg-start-period':'start_period','plg-units-mo':'units_mo','plg-sale-price':'sale_price','plg-revenue-mo':'revenue_mo','plg-probability':'probability' };
      if (revFieldMap[e.target.id]) { _revInputs[revFieldMap[e.target.id]] = e.target.value; }
      // Auto-compute revenue from units × price
      if (e.target.id === 'plg-units-mo' || e.target.id === 'plg-sale-price') {
        const u = Number(($('plg-units-mo') || {}).value) || 0;
        const pr = Number(($('plg-sale-price') || {}).value) || 0;
        const revEl = $('plg-revenue-mo');
        if (revEl && revEl.readOnly) { revEl.value = u * pr; _revInputs.revenue_mo = String(u * pr); }
      }
    });
  }

  // ── Panel activation ──────────────────────────────────────────
  window.addEventListener('panelactivated', (e) => {
    if (e.detail === 'pl-generator') init();
  });
  if (document.getElementById('panel-pl-generator') && document.getElementById('panel-pl-generator').classList.contains('active')) {
    init();
  }

})();
