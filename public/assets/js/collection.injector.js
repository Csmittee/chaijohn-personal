/**
 * collection.injector.js — Collection/Assets page logic.
 * Handles asset grid, filters, add/edit/sell/share modals.
 */

/* ─── Utility helpers ─── */
function formatThb(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '฿—';
  const n = Math.round(Number(amount));
  if (Math.abs(n) >= 100) return '฿' + n.toLocaleString('en-US');
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

async function api(path, options) {
  options = options || {};
  const res = await fetch(path, Object.assign({}, options, {
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    credentials: 'same-origin'
  }));
  if (res.status === 401) { window.location.href = '/index.html'; throw new Error('Unauthorized'); }
  return res;
}

function showFlash(msg, type) {
  type = type || 'success';
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;' +
    'background:' + (type === 'success' ? '#22c55e' : '#ef4444') + ';color:white;font-weight:500;z-index:9999;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── State ─── */
let allAssets = [];
let activeStatusFilter = '';
let activeCategoryFilter = '';
let editingAssetId = null;

/* ─── Badge helpers ─── */
function statusBadgeClass(status) {
  return {
    'Holding': 'badge-primary',
    'For Sale': 'badge-warning',
    'Sold': 'badge-gray',
    'Invested': 'badge-income'
  }[status] || 'badge-gray';
}

function statusBadgeStyle(status) {
  const styles = {
    'Holding': 'background:rgba(59,130,246,0.2);color:#60a5fa',
    'For Sale': 'background:rgba(245,158,11,0.2);color:#fbbf24',
    'Sold': 'background:rgba(148,163,184,0.2);color:#94a3b8',
    'Invested': 'background:rgba(34,197,94,0.2);color:#4ade80'
  };
  return styles[status] || 'background:rgba(148,163,184,0.15);color:#94a3b8';
}

function gainLossHtml(cost, value) {
  if (!cost || !value || isNaN(cost) || isNaN(value)) return '';
  const pct = Math.round(((value - cost) / cost) * 100);
  const cls = pct >= 0 ? 'color:#22c55e' : 'color:#ef4444';
  return '<div style="font-size:0.78rem;' + cls + ';font-weight:600">' + (pct >= 0 ? '+' : '') + pct + '% vs cost</div>';
}

/* ─── Load assets ─── */
async function loadAssets() {
  const grid = document.getElementById('asset-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="text-align:center;padding:3rem;opacity:0.45;grid-column:1/-1">Loading…</div>';

  try {
    let url = '/api/assets?';
    if (activeStatusFilter) url += 'status=' + encodeURIComponent(activeStatusFilter) + '&';
    if (activeCategoryFilter) url += 'category=' + encodeURIComponent(activeCategoryFilter) + '&';

    const res = await api(url.replace(/[?&]$/, ''));
    if (!res.ok) throw new Error('Failed to load assets');
    const data = await res.json();
    allAssets = data.records || [];

    if (allAssets.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:3rem;opacity:0.45;grid-column:1/-1">No assets found. Add your first item!</div>';
      updateSummaryStrip([]);
      return;
    }

    renderAssetGrid(allAssets);
    updateSummaryStrip(allAssets);
  } catch (e) {
    grid.innerHTML = '<div style="color:#ef4444;padding:1rem;grid-column:1/-1">Error: ' + e.message + '</div>';
  }
}

/* ─── Render asset grid ─── */
function renderAssetGrid(assets) {
  const grid = document.getElementById('asset-grid');
  if (!grid) return;

  grid.innerHTML = assets.map(function (asset) {
    const f = asset.fields || {};
    const hasImage = !!f.cloudinary_image_url;

    return `<div class="card asset-card" style="border-radius:12px;overflow:hidden;display:flex;flex-direction:column">
      ${hasImage
        ? `<div style="height:160px;overflow:hidden;background:rgba(255,255,255,0.03);flex-shrink:0">
             <img src="${escHtml(f.cloudinary_image_url)}" alt="${escHtml(f.name)}" loading="lazy"
               style="width:100%;height:100%;object-fit:cover"
               onerror="this.parentElement.style.display='none'">
           </div>`
        : `<div style="height:100px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.02);font-size:2.5rem;flex-shrink:0">🗃️</div>`}
      <div style="padding:0.85rem;flex:1;display:flex;flex-direction:column">
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.4rem;line-height:1.3">${escHtml(f.name || 'Unnamed Asset')}</div>
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.55rem">
          <span style="${statusBadgeStyle(f.status)};padding:0.12rem 0.4rem;border-radius:4px;font-size:0.68rem;font-weight:600">${escHtml(f.status || 'Holding')}</span>
          ${f.category ? `<span style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6);padding:0.12rem 0.4rem;border-radius:4px;font-size:0.68rem">${escHtml(f.category)}</span>` : ''}
          ${f.velocity ? `<span style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.45);padding:0.12rem 0.4rem;border-radius:4px;font-size:0.65rem">${escHtml(f.velocity)}</span>` : ''}
        </div>
        <div style="font-size:0.8rem;margin-bottom:0.2rem;opacity:0.65">Cost: ${formatThb(f.cost_price)}</div>
        <div style="font-size:0.85rem;margin-bottom:0.25rem">Value: <strong>${formatThb(f.estimated_value)}</strong></div>
        ${gainLossHtml(f.cost_price, f.estimated_value)}
        ${f.notes ? `<div style="font-size:0.73rem;opacity:0.45;margin-top:0.35rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(f.notes)}">${escHtml(f.notes.substring(0, 50))}${f.notes.length > 50 ? '…' : ''}</div>` : ''}
      </div>
      <div style="padding:0.6rem 0.85rem;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:0.4rem;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline edit-asset-btn" data-id="${asset.id}" style="flex:1;min-width:50px">Edit</button>
        ${f.status !== 'Sold' ? `<button class="btn btn-sm btn-success sell-asset-btn" data-id="${asset.id}" style="flex:0 0 auto">Sell</button>` : ''}
        <button class="btn btn-sm btn-outline share-asset-btn"
          data-id="${asset.id}"
          data-name="${escHtml(f.name || '')}"
          data-value="${f.estimated_value || 0}"
          data-notes="${escHtml(f.notes || '')}"
          data-image="${escHtml(f.cloudinary_image_url || '')}"
          style="flex:0 0 auto">Share</button>
      </div>
    </div>`;
  }).join('');

  // Wire buttons
  grid.querySelectorAll('.edit-asset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { openEditAssetModal(btn.dataset.id); });
  });
  grid.querySelectorAll('.sell-asset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { openSellModal(btn.dataset.id); });
  });
  grid.querySelectorAll('.share-asset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openShareModal(btn.dataset.id, btn.dataset.name, btn.dataset.value, btn.dataset.notes, btn.dataset.image);
    });
  });
}

/* ─── Summary strip ─── */
function updateSummaryStrip(assets) {
  const holdingTotal = assets.filter(function (a) { return a.fields.status === 'Holding'; })
    .reduce(function (s, a) { return s + (a.fields.estimated_value || 0); }, 0);

  const forSaleCount = assets.filter(function (a) { return a.fields.status === 'For Sale'; }).length;
  const currentYear = new Date().getFullYear();
  const soldYtd = assets.filter(function (a) {
    const f = a.fields;
    return f.status === 'Sold' && (f.sold_date || '').startsWith(String(currentYear));
  }).reduce(function (s, a) { return s + (a.fields.sold_price || 0); }, 0);

  const totalValue = assets.filter(function (a) { return a.fields.status !== 'Sold'; })
    .reduce(function (s, a) { return s + (a.fields.estimated_value || a.fields.cost_price || 0); }, 0);

  // Update DOM elements if present
  const els = {
    'summary-holding': formatThb(holdingTotal),
    'summary-for-sale': forSaleCount + ' items',
    'summary-sold-ytd': formatThb(soldYtd),
    'summary-total': formatThb(totalValue),
    'summary-count': assets.length + ' assets'
  };
  Object.keys(els).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.textContent = els[id];
  });
}

/* ─── Asset modal (add/edit) ─── */
const ASSET_CATEGORIES = [
  'Collection-Knife', 'Collection-Vice', 'Collection-Plant', 'Collection-Doll', 'Other'
];
const ASSET_STATUSES = ['Holding', 'For Sale', 'Sold', 'Invested'];
const ASSET_VELOCITIES = ['Fast', 'Medium', 'Slow', 'No Movement'];

function openAddAssetModal() {
  editingAssetId = null;
  const titleEl = document.getElementById('asset-modal-title');
  if (titleEl) titleEl.textContent = 'Add Asset';

  const fields = ['asset-name', 'asset-cost', 'asset-value', 'asset-notes', 'asset-date'];
  fields.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = id === 'asset-date' ? todayIso() : '';
  });

  const catSel = document.getElementById('asset-category');
  if (catSel) catSel.value = 'Collection-Knife';
  const statusSel = document.getElementById('asset-status');
  if (statusSel) statusSel.value = 'Holding';
  const velSel = document.getElementById('asset-velocity');
  if (velSel) velSel.value = '';

  const hiddenId = document.getElementById('asset-edit-id');
  if (hiddenId) hiddenId.value = '';

  const modal = document.getElementById('asset-modal');
  if (modal) modal.style.display = 'flex';
}

function openEditAssetModal(assetId) {
  const asset = allAssets.find(function (a) { return a.id === assetId; });
  if (!asset) return;

  editingAssetId = assetId;
  const f = asset.fields || {};

  const titleEl = document.getElementById('asset-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Asset';

  const fieldMap = {
    'asset-name': f.name || '',
    'asset-cost': f.cost_price || '',
    'asset-value': f.estimated_value || '',
    'asset-notes': f.notes || '',
    'asset-date': f.date_acquired || ''
  };
  Object.keys(fieldMap).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = fieldMap[id];
  });

  const catSel = document.getElementById('asset-category');
  if (catSel) catSel.value = f.category || 'Other';
  const statusSel = document.getElementById('asset-status');
  if (statusSel) statusSel.value = f.status || 'Holding';
  const velSel = document.getElementById('asset-velocity');
  if (velSel) velSel.value = f.velocity || '';

  const hiddenId = document.getElementById('asset-edit-id');
  if (hiddenId) hiddenId.value = assetId;

  const modal = document.getElementById('asset-modal');
  if (modal) modal.style.display = 'flex';
}

async function saveAsset() {
  const saveBtn = document.getElementById('asset-save-btn');
  const name = document.getElementById('asset-name')?.value;
  const category = document.getElementById('asset-category')?.value;
  const costPrice = parseFloat(document.getElementById('asset-cost')?.value) || null;
  const estimatedValue = parseFloat(document.getElementById('asset-value')?.value) || null;
  const status = document.getElementById('asset-status')?.value || 'Holding';
  const velocity = document.getElementById('asset-velocity')?.value || null;
  const notes = document.getElementById('asset-notes')?.value || null;
  const dateAcquired = document.getElementById('asset-date')?.value || null;
  const imageFileInput = document.getElementById('asset-image-file');

  if (!name) { showFlash('Name is required', 'error'); return; }

  if (saveBtn) saveBtn.disabled = true;

  try {
    let cloudinaryUrl = null;
    // Upload image if selected
    if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
      const formData = new FormData();
      formData.append('file', imageFileInput.files[0]);
      formData.append('folder', 'assets');
      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        cloudinaryUrl = uploadData.url || uploadData.secure_url || null;
      }
    }

    const body = {
      name,
      category: category || 'Other',
      cost_price: costPrice,
      estimated_value: estimatedValue,
      status,
      velocity: velocity || undefined,
      notes: notes || undefined,
      date_acquired: dateAcquired || undefined,
      cloudinary_image_url: cloudinaryUrl || undefined
    };
    // Remove undefined
    Object.keys(body).forEach(function (k) { if (body[k] === undefined) delete body[k]; });

    let res;
    if (editingAssetId) {
      res = await api('/api/assets/' + editingAssetId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      res = await api('/api/assets', { method: 'POST', body: JSON.stringify(body) });
    }

    if (res.ok) {
      showFlash(editingAssetId ? 'Asset updated!' : 'Asset added!');
      closeModal('asset-modal');
      if (imageFileInput) imageFileInput.value = '';
      await loadAssets();
    } else {
      const d = await res.json().catch(function () { return {}; });
      showFlash(d.error || 'Save failed', 'error');
    }
  } catch (e) {
    showFlash('Error: ' + e.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/* ─── Sell modal ─── */
function openSellModal(assetId) {
  const asset = allAssets.find(function (a) { return a.id === assetId; });
  if (!asset) return;

  const hiddenId = document.getElementById('sell-asset-id');
  if (hiddenId) hiddenId.value = assetId;

  const dateInput = document.getElementById('sell-date');
  if (dateInput) dateInput.value = todayIso();

  const sellNameEl = document.getElementById('sell-asset-name');
  if (sellNameEl) sellNameEl.textContent = asset.fields.name || 'Asset';

  const valueSuggest = document.getElementById('sell-price');
  if (valueSuggest) valueSuggest.value = asset.fields.estimated_value || '';

  const modal = document.getElementById('sell-modal');
  if (modal) modal.style.display = 'flex';
}

async function confirmSell() {
  const assetId = document.getElementById('sell-asset-id')?.value;
  const soldPrice = parseFloat(document.getElementById('sell-price')?.value);
  const soldDate = document.getElementById('sell-date')?.value;
  const soldVia = document.getElementById('sell-via')?.value || null;

  if (!assetId) { showFlash('No asset selected', 'error'); return; }
  if (!soldPrice || isNaN(soldPrice)) { showFlash('Enter sale price', 'error'); return; }
  if (!soldDate) { showFlash('Enter sale date', 'error'); return; }

  const confirmBtn = document.getElementById('sell-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    const res = await api('/api/assets/' + assetId, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'Sold',
        sold_price: soldPrice,
        sold_date: soldDate,
        sold_via: soldVia || undefined
      })
    });

    if (res.ok) {
      showFlash('Sold! 🎉');
      closeModal('sell-modal');
      await loadAssets();
    } else {
      const d = await res.json().catch(function () { return {}; });
      showFlash(d.error || 'Failed to mark as sold', 'error');
    }
  } catch (e) {
    showFlash('Error: ' + e.message, 'error');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

/* ─── Share modal ─── */
function openShareModal(assetId, name, value, notes, imageUrl) {
  const nameEl = document.getElementById('share-asset-name');
  if (nameEl) nameEl.textContent = name || 'Asset';
  const valueEl = document.getElementById('share-asset-value');
  if (valueEl) valueEl.textContent = formatThb(Number(value));
  const thumbEl = document.getElementById('share-thumb');
  if (thumbEl) {
    if (imageUrl) { thumbEl.src = imageUrl; thumbEl.style.display = 'block'; }
    else thumbEl.style.display = 'none';
  }

  // Store asset ID for share buttons
  const fbBtn = document.getElementById('share-facebook-btn');
  if (fbBtn) fbBtn.dataset.assetId = assetId;
  const igBtn = document.getElementById('share-instagram-btn');
  if (igBtn) igBtn.dataset.assetId = assetId;
  const ploikongBtn = document.getElementById('share-ploikong-btn');
  if (ploikongBtn) ploikongBtn.dataset.assetId = assetId;

  // Show share status messages cleared
  const statusEl = document.getElementById('share-status');
  if (statusEl) statusEl.textContent = '';

  const modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'flex';
}

async function shareFacebook(assetId) {
  const statusEl = document.getElementById('share-status');
  const btn = document.getElementById('share-facebook-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await api('/api/export-social', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId })
    });

    if (!res.ok) throw new Error('Export failed');
    const data = await res.json();

    // Copy caption to clipboard
    if (data.ig_caption || data.fb_url) {
      const caption = data.ig_caption || data.asset_name;
      try {
        await navigator.clipboard.writeText(caption);
      } catch (e) { /* clipboard may be blocked */ }
    }

    // Open Facebook share
    if (data.fb_url) {
      window.open(data.fb_url, '_blank', 'width=600,height=400');
    }

    if (statusEl) statusEl.textContent = 'Caption copied! Facebook opened.';
    if (statusEl) statusEl.style.color = '#22c55e';
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.style.color = '#ef4444'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function shareInstagram(assetId) {
  const statusEl = document.getElementById('share-status');
  const btn = document.getElementById('share-instagram-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await api('/api/export-social', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId })
    });

    if (!res.ok) throw new Error('Export failed');
    const data = await res.json();

    const caption = data.ig_caption || (data.asset_name + '\n\nPrice: ' + formatThb(data.estimated_value || 0));

    try {
      await navigator.clipboard.writeText(caption);
    } catch (e) { /* clipboard may be blocked */ }

    window.open('https://www.instagram.com', '_blank');

    if (statusEl) statusEl.textContent = 'Caption copied! Open Instagram and paste.';
    if (statusEl) statusEl.style.color = '#22c55e';
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.style.color = '#ef4444'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function syncPloikong(assetId) {
  const statusEl = document.getElementById('share-status');
  const btn = document.getElementById('share-ploikong-btn');
  if (btn) btn.disabled = true;

  try {
    await api('/api/assets/' + assetId + '/ploikong-sync', { method: 'POST' });
    if (statusEl) statusEl.textContent = 'Logged for Ploikong sync — available in v2';
    if (statusEl) statusEl.style.color = '#60a5fa';
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.style.color = '#ef4444'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ─── Modal helpers ─── */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'flex';
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  // Load initial assets
  loadAssets();

  // Filter: status buttons
  const statusBtns = document.querySelectorAll('[data-status-filter]');
  statusBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      statusBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeStatusFilter = btn.dataset.statusFilter === 'all' ? '' : btn.dataset.statusFilter;
      loadAssets();
    });
  });

  // Filter: category dropdown
  const catFilter = document.getElementById('category-filter');
  if (catFilter) {
    catFilter.addEventListener('change', function () {
      activeCategoryFilter = catFilter.value;
      loadAssets();
    });
  }

  // FAB / Add Asset button
  const addBtn = document.getElementById('add-asset-btn');
  if (addBtn) addBtn.addEventListener('click', openAddAssetModal);

  // Asset modal save
  const assetSaveBtn = document.getElementById('asset-save-btn');
  if (assetSaveBtn) assetSaveBtn.addEventListener('click', saveAsset);

  // Asset modal close
  const assetModalClose = document.getElementById('asset-modal-close');
  if (assetModalClose) assetModalClose.addEventListener('click', function () { closeModal('asset-modal'); });
  const assetBackdrop = document.getElementById('asset-modal-backdrop');
  if (assetBackdrop) assetBackdrop.addEventListener('click', function () { closeModal('asset-modal'); });

  // Sell modal confirm
  const sellConfirmBtn = document.getElementById('sell-confirm-btn');
  if (sellConfirmBtn) sellConfirmBtn.addEventListener('click', confirmSell);

  // Sell modal close
  const sellModalClose = document.getElementById('sell-modal-close');
  if (sellModalClose) sellModalClose.addEventListener('click', function () { closeModal('sell-modal'); });
  const sellBackdrop = document.getElementById('sell-modal-backdrop');
  if (sellBackdrop) sellBackdrop.addEventListener('click', function () { closeModal('sell-modal'); });

  // Share modal buttons
  const fbBtn = document.getElementById('share-facebook-btn');
  if (fbBtn) fbBtn.addEventListener('click', function () { shareFacebook(fbBtn.dataset.assetId); });
  const igBtn = document.getElementById('share-instagram-btn');
  if (igBtn) igBtn.addEventListener('click', function () { shareInstagram(igBtn.dataset.assetId); });
  const ploikongBtn = document.getElementById('share-ploikong-btn');
  if (ploikongBtn) ploikongBtn.addEventListener('click', function () { syncPloikong(ploikongBtn.dataset.assetId); });

  // Share modal close
  const shareModalClose = document.getElementById('share-modal-close');
  if (shareModalClose) shareModalClose.addEventListener('click', function () { closeModal('share-modal'); });
  const shareBackdrop = document.getElementById('share-modal-backdrop');
  if (shareBackdrop) shareBackdrop.addEventListener('click', function () { closeModal('share-modal'); });

  // Delete asset
  const deleteAssetBtn = document.getElementById('delete-asset-btn');
  if (deleteAssetBtn) {
    deleteAssetBtn.addEventListener('click', async function () {
      const id = document.getElementById('asset-edit-id')?.value;
      if (!id) return;
      if (!confirm('Delete this asset? This cannot be undone.')) return;
      try {
        const res = await api('/api/assets/' + id, { method: 'DELETE' });
        if (res.ok) { showFlash('Deleted'); closeModal('asset-modal'); await loadAssets(); }
        else showFlash('Delete failed', 'error');
      } catch (e) { showFlash('Error: ' + e.message, 'error'); }
    });
  }

  // Close modals on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      ['asset-modal', 'sell-modal', 'share-modal'].forEach(closeModal);
    }
  });
});
