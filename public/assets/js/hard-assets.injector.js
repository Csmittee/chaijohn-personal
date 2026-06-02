/* hard-assets.injector.js — M3.3 Hard Assets panel */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const todayIso = () => new Date().toISOString().split('T')[0];

  const CATEGORIES = ['Property','Vehicle','Equipment','Other'];
  const PHASE_COLORS = { Property:'#3b82f6', Vehicle:'#8b5cf6', Equipment:'#f59e0b', Other:'#6b7280' };

  let allAssets = [];
  let activeFilter = '';
  let hardAssetSaleCategoryId = null;
  let initialized = false;

  function panelEl() { return document.getElementById('panel-hard-assets'); }

  function ensureStyles() {
    if (document.getElementById('hard-assets-style')) return;
    const s = document.createElement('style');
    s.id = 'hard-assets-style';
    s.textContent = `
      #panel-hard-assets.active { display:flex;flex-direction:column;height:100%;overflow:hidden }
      .ha-card { border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);padding:0.85rem;margin-bottom:0.65rem }
      .ha-modal { position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:1000 }
      .ha-modal.open { display:flex }
      .ha-modal-inner { background:var(--bg-card);border-radius:var(--radius);padding:1.25rem;width:min(440px,94vw);max-height:90vh;overflow-y:auto }
    `;
    document.head.appendChild(s);
  }

  async function api(path, opts) {
    opts = opts || {};
    const r = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts));
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'API ' + r.status); }
    return r.json();
  }

  function showFlash(msg, type) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.7rem 1.1rem;border-radius:8px;background:' +
      (type === 'error' ? '#ef4444' : '#22c55e') + ';color:white;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.25)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  async function loadHardAssetSaleCategory() {
    if (hardAssetSaleCategoryId !== null) return;
    try {
      const data = await api('/api/categories');
      const cats = data.records || [];
      let cat = cats.find(c => (c.fields ? c.fields.name : c.name) === 'Hard asset sale');
      if (cat) {
        hardAssetSaleCategoryId = cat.id;
        return;
      }
      // Create if missing
      const res = await api('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hard asset sale', group: 'Per-earn', type: 'Earn', active: true })
      });
      hardAssetSaleCategoryId = (res.record || {}).id || null;
    } catch (e) {
      console.warn('Could not load hard asset sale category:', e.message);
    }
  }

  async function loadAssets() {
    const panel = panelEl();
    if (!panel) return;
    try {
      const data = await api('/api/hard-assets');
      allAssets = data.records || [];
    } catch (e) {
      allAssets = [];
    }
    renderPanel();
  }

  function filtered() {
    if (!activeFilter) return allAssets;
    return allAssets.filter(a => (a.category || '') === activeFilter);
  }

  function renderPanel() {
    const panel = panelEl();
    if (!panel) return;

    const assets  = allAssets;
    const totalVal = assets.filter(a => a.status !== 'Sold' && a.status !== 'Disposed').reduce((s,a) => s + Number(a.current_value || 0), 0);
    const soldVal  = assets.filter(a => a.status === 'Sold').reduce((s,a) => s + Number(a.sold_price || 0), 0);
    const activeCount = assets.filter(a => a.status !== 'Sold' && a.status !== 'Disposed').length;

    panel.innerHTML = `
      <div style="flex-shrink:0;padding:0.75rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:0.65rem;flex-wrap:wrap;align-items:center">
        ${strip('Assets', activeCount, '')}
        ${strip('Total Value', fmt(totalVal), '')}
        ${strip('Sold (All Time)', fmt(soldVal), '')}
        <button id="ha-add-btn" style="margin-left:auto;padding:0.35rem 0.85rem;background:var(--yellow);color:#0a0a10;border:none;border-radius:var(--radius);font-weight:600;cursor:pointer;font-size:0.82rem">+ Add Asset</button>
      </div>
      <div style="flex-shrink:0;padding:0.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:0.4rem;flex-wrap:wrap">
        ${[''].concat(CATEGORIES).map(c => {
          const label = c === '' ? 'All' : c;
          const active = activeFilter === c;
          return `<button class="ha-filter-btn" data-cat="${c}" style="padding:0.2rem 0.6rem;border-radius:20px;font-size:0.75rem;border:1px solid var(--border);cursor:pointer;background:${active?'var(--yellow)':'transparent'};color:${active?'#0a0a10':'var(--text)'};font-weight:${active?'700':'400'}">${label}</button>`;
        }).join('')}
      </div>
      <div id="ha-body" style="flex:1;overflow-y:auto;padding:0.75rem 1rem">
        ${renderCards()}
      </div>
    `;

    // Wire filter buttons
    panel.querySelectorAll('.ha-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.cat;
        renderPanel();
      });
    });

    document.getElementById('ha-add-btn')?.addEventListener('click', () => openAddModal());

    panel.querySelectorAll('.ha-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    panel.querySelectorAll('.ha-sell-btn').forEach(btn => {
      btn.addEventListener('click', () => openSellModal(btn.dataset.id));
    });
    panel.querySelectorAll('.ha-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteAsset(btn.dataset.id, btn.dataset.name));
    });
  }

  function strip(label, value, unit) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:0.4rem 0.7rem;min-width:100px">
      <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">${label}</div>
      <div style="font-size:0.95rem;font-weight:700">${value}${unit?'<span style="font-size:0.72rem;font-weight:400;color:var(--text-secondary);margin-left:0.2rem">'+unit+'</span>':''}</div>
    </div>`;
  }

  function renderCards() {
    const list = filtered();
    if (list.length === 0) {
      if (!activeFilter && allAssets.length === 0) {
        return '<div style="text-align:center;padding:3rem;opacity:0.45;font-size:0.85rem">No hard assets yet.<br>Click + Add Asset to register your first property, vehicle, or equipment.</div>';
      }
      return '<div style="text-align:center;padding:2rem;opacity:0.45;font-size:0.82rem">No assets in this category.</div>';
    }
    return list.map(a => cardHtml(a)).join('');
  }

  function catColor(cat) {
    return PHASE_COLORS[cat] || '#6b7280';
  }

  function cardHtml(a) {
    const isSold  = a.status === 'Sold';
    const isGhost = !a.name || !String(a.name).trim();
    const gain    = (a.purchase_price && a.current_value)
      ? Math.round(((a.current_value - a.purchase_price) / a.purchase_price) * 100) : null;
    const gainHtml = gain !== null
      ? `<span style="font-size:0.75rem;font-weight:600;color:${gain>=0?'#22c55e':'#ef4444'}">${gain>=0?'+':''}${gain}% vs cost</span>` : '';
    const safeDisplayName = isGhost ? '(unnamed record)' : esc(a.name);
    return `
      <div class="ha-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem">
          <div style="flex:1;min-width:0">
            ${!isGhost ? `<div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.35rem">
              ${a.category?`<span style="font-size:0.68rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:4px;background:${catColor(a.category)}22;color:${catColor(a.category)}">${esc(a.category)}</span>`:''}
              <span style="font-size:0.68rem;padding:0.1rem 0.4rem;border-radius:4px;background:${isSold?'rgba(148,163,184,0.2)':'rgba(34,197,94,0.15)'};color:${isSold?'#94a3b8':'#22c55e'}">${esc(a.status||'Active')}</span>
            </div>` : ''}
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.25rem;${isGhost?'color:#94a3b8;font-style:italic':''}">${safeDisplayName}</div>
            ${!isGhost ? `<div style="font-size:0.78rem;color:var(--text-secondary)">Purchase: ${fmt(a.purchase_price)} · Value: <strong>${fmt(a.current_value)}</strong></div>
            ${gainHtml ? `<div style="margin-top:0.15rem">${gainHtml}</div>` : ''}
            ${a.location?`<div style="font-size:0.73rem;color:var(--text-secondary);margin-top:0.15rem">📍 ${esc(a.location)}</div>`:''}` : ''}
          </div>
          ${!isGhost && a.image_url?`<img src="${esc(a.image_url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">`:''}
        </div>
        <div style="display:flex;gap:0.4rem;margin-top:0.65rem">
          ${!isGhost ? `<button class="ha-edit-btn" data-id="${a.id}" style="flex:1;padding:0.25rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer;font-size:0.75rem">Edit</button>` : ''}
          ${!isGhost && !isSold?`<button class="ha-sell-btn" data-id="${a.id}" style="padding:0.25rem 0.75rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;cursor:pointer;font-size:0.75rem;font-weight:600">Mark Sold</button>`:''}
          <button class="ha-delete-btn" data-id="${a.id}" data-name="${esc(a.name||'this record')}" style="padding:0.25rem 0.6rem;border:1px solid #ef4444;border-radius:var(--radius);background:transparent;color:#ef4444;cursor:pointer;font-size:0.75rem">Delete</button>
        </div>
      </div>`;
  }

  async function deleteAsset(assetId, assetName) {
    if (!confirm(`Delete "${assetName}"? This cannot be undone.`)) return;
    try {
      await api('/api/hard-assets/' + assetId, { method: 'DELETE' });
      allAssets = allAssets.filter(a => a.id !== assetId);
      renderPanel();
      showFlash('Deleted');
    } catch (e) {
      showFlash('Delete failed: ' + e.message, 'error');
    }
  }

  // ── Add / Edit modal ──────────────────────────────────────────────────────
  let editingId = null;

  function ensureAssetModal() {
    if (document.getElementById('ha-asset-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'ha-asset-modal';
    modal.className = 'ha-modal';
    modal.innerHTML = `
      <div class="ha-modal-inner">
        <div style="font-weight:700;font-size:1rem;margin-bottom:1rem" id="ha-modal-title">Add Asset</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem">
          <div style="grid-column:1/-1">
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Name</label>
            <input id="ha-name" type="text" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Category</label>
            <select id="ha-category" style="width:100%;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
              ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Purchase Date</label>
            <input id="ha-purchase-date" type="date" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Purchase Price (฿)</label>
            <input id="ha-purchase-price" type="number" placeholder="0" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Current Value (฿)</label>
            <input id="ha-current-value" type="number" placeholder="0" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Location</label>
            <input id="ha-location" type="text" placeholder="e.g. Rayong" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Image URL (optional)</label>
            <input id="ha-image-url" type="text" placeholder="https://..." style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Notes</label>
            <textarea id="ha-notes" rows="2" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem;resize:vertical"></textarea>
          </div>
        </div>
        <div id="ha-modal-msg" style="display:none;font-size:0.78rem;margin-top:0.5rem"></div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
          <button id="ha-modal-cancel" style="padding:0.4rem 0.9rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">Cancel</button>
          <button id="ha-modal-save" style="padding:0.4rem 0.9rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;font-weight:600;cursor:pointer">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('ha-modal-cancel').addEventListener('click', closeAssetModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeAssetModal(); });
    document.getElementById('ha-modal-save').addEventListener('click', saveAsset);
  }

  function openAddModal() {
    ensureAssetModal();
    editingId = null;
    document.getElementById('ha-modal-title').textContent = 'Add Asset';
    ['ha-name','ha-purchase-price','ha-current-value','ha-location','ha-image-url','ha-notes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ha-purchase-date').value = todayIso();
    document.getElementById('ha-category').value = 'Property';
    document.getElementById('ha-modal-msg').style.display = 'none';
    document.getElementById('ha-asset-modal').classList.add('open');
  }

  function openEditModal(assetId) {
    const a = allAssets.find(x => x.id === assetId);
    if (!a) return;
    ensureAssetModal();
    editingId = assetId;
    document.getElementById('ha-modal-title').textContent = 'Edit Asset';
    document.getElementById('ha-name').value = a.name || '';
    document.getElementById('ha-category').value = a.category || 'Property';
    document.getElementById('ha-purchase-date').value = a.purchase_date || '';
    document.getElementById('ha-purchase-price').value = a.purchase_price || '';
    document.getElementById('ha-current-value').value = a.current_value || '';
    document.getElementById('ha-location').value = a.location || '';
    document.getElementById('ha-image-url').value = a.image_url || '';
    document.getElementById('ha-notes').value = a.notes || '';
    document.getElementById('ha-modal-msg').style.display = 'none';
    document.getElementById('ha-asset-modal').classList.add('open');
  }

  function closeAssetModal() {
    const modal = document.getElementById('ha-asset-modal');
    if (modal) modal.classList.remove('open');
  }

  async function saveAsset() {
    const saveBtn = document.getElementById('ha-modal-save');
    const msgEl   = document.getElementById('ha-modal-msg');
    const name    = document.getElementById('ha-name').value.trim();
    if (!name) { msgEl.textContent = 'Name is required'; msgEl.style.color='#ef4444'; msgEl.style.display='block'; return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const body = {
      name,
      category:       document.getElementById('ha-category').value,
      purchase_date:  document.getElementById('ha-purchase-date').value || undefined,
      purchase_price: parseFloat(document.getElementById('ha-purchase-price').value) || undefined,
      current_value:  parseFloat(document.getElementById('ha-current-value').value) || undefined,
      location:       document.getElementById('ha-location').value.trim() || undefined,
      notes:          document.getElementById('ha-notes').value.trim() || undefined,
      image_url:      document.getElementById('ha-image-url').value.trim() || undefined,
      status:         'Active'
    };
    Object.keys(body).forEach(k => { if (body[k] === undefined) delete body[k]; });

    try {
      let res;
      if (editingId) {
        res = await api('/api/hard-assets/' + editingId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const idx = allAssets.findIndex(a => a.id === editingId);
        if (idx !== -1) allAssets[idx] = res.record;
      } else {
        res = await api('/api/hard-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        allAssets.unshift(res.record);
      }
      closeAssetModal();
      renderPanel();
      showFlash(editingId ? 'Updated!' : 'Asset added!');
    } catch (e) {
      msgEl.textContent = e.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block';
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save';
    }
  }

  // ── Sell modal ─────────────────────────────────────────────────────────────
  let sellingId = null;
  let sellingName = '';

  function ensureSellModal() {
    if (document.getElementById('ha-sell-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'ha-sell-modal';
    modal.className = 'ha-modal';
    modal.innerHTML = `
      <div class="ha-modal-inner">
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.25rem">Mark as Sold</div>
        <div id="ha-sell-name" style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem">
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Sold Price (฿)</label>
            <input id="ha-sold-price" type="number" placeholder="0" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div>
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Sold Date</label>
            <input id="ha-sold-date" type="date" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:0.78rem;display:block;margin-bottom:0.2rem">Sold To / Via (optional)</label>
            <input id="ha-sold-to" type="text" placeholder="Buyer or platform" style="width:100%;box-sizing:border-box;padding:0.45rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-page);color:var(--text);font-size:0.85rem">
          </div>
        </div>
        <div id="ha-sell-msg" style="display:none;font-size:0.78rem;margin-top:0.5rem"></div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
          <button id="ha-sell-cancel" style="padding:0.4rem 0.9rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text);cursor:pointer">Cancel</button>
          <button id="ha-sell-confirm" style="padding:0.4rem 0.9rem;border:none;border-radius:var(--radius);background:var(--yellow);color:#0a0a10;font-weight:600;cursor:pointer">Confirm Sale</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('ha-sell-cancel').addEventListener('click', closeSellModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeSellModal(); });
    document.getElementById('ha-sell-confirm').addEventListener('click', confirmSell);
  }

  function openSellModal(assetId) {
    const a = allAssets.find(x => x.id === assetId);
    if (!a) return;
    sellingId = assetId;
    sellingName = a.name || 'Asset';
    ensureSellModal();
    document.getElementById('ha-sell-name').textContent = sellingName;
    document.getElementById('ha-sold-price').value = a.current_value || '';
    document.getElementById('ha-sold-date').value = todayIso();
    document.getElementById('ha-sold-to').value = '';
    document.getElementById('ha-sell-msg').style.display = 'none';
    document.getElementById('ha-sell-modal').classList.add('open');
  }

  function closeSellModal() {
    const modal = document.getElementById('ha-sell-modal');
    if (modal) modal.classList.remove('open');
  }

  async function confirmSell() {
    const btn    = document.getElementById('ha-sell-confirm');
    const msgEl  = document.getElementById('ha-sell-msg');
    const price  = parseFloat(document.getElementById('ha-sold-price').value);
    const date   = document.getElementById('ha-sold-date').value;
    const soldTo = document.getElementById('ha-sold-to').value.trim() || undefined;

    if (!price || isNaN(price)) { msgEl.textContent='Enter sale price'; msgEl.style.color='#ef4444'; msgEl.style.display='block'; return; }
    if (!date) { msgEl.textContent='Enter sale date'; msgEl.style.color='#ef4444'; msgEl.style.display='block'; return; }

    btn.disabled = true; btn.textContent = '…';

    try {
      // 1. PATCH hard asset status
      const patchRes = await api('/api/hard-assets/' + sellingId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Sold', sold_price: price, sold_date: date })
      });
      const idx = allAssets.findIndex(a => a.id === sellingId);
      if (idx !== -1) allAssets[idx] = patchRes.record;

      // 2. Create income transaction
      const txBody = {
        type: 'Income', source: 'hard_asset_sale',
        amount: price, date, entity: soldTo,
        description: 'Hard asset sale — ' + sellingName
      };
      if (hardAssetSaleCategoryId) txBody.category_id = [hardAssetSaleCategoryId];
      await api('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(txBody) }).catch(e => console.warn('TX not saved:', e.message));

      closeSellModal();
      renderPanel();
      showFlash('Sold! 🎉');
    } catch (e) {
      msgEl.textContent = e.message; msgEl.style.color = '#ef4444'; msgEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Confirm Sale';
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    if (initialized) return;
    initialized = true;
    ensureStyles();
    const panel = panelEl();
    if (!panel) return;
    panel.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);font-size:0.85rem">Loading…</div>';
    await loadHardAssetSaleCategory();
    await loadAssets();
  }

  window.addEventListener('panelactivated', e => {
    if (e.detail !== 'hard-assets') return;
    init();
  });

  if (document.getElementById('panel-hard-assets')?.classList.contains('active')) init();
})();
