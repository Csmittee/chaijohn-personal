/**
 * collection.injector.js — Collection/Assets page logic.
 * Handles asset grid, filters, add/edit/sell/share modals.
 * fix/collection-gallery-sync: FAB centering, Sync button, gallery hover
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
  if (res.status === 401) { throw new Error('Unauthorized'); }
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

/* ─── CHANGE 1: FAB CSS injection for centered plus icon ─── */
function injectFabCss() {
  if (document.getElementById('collection-fab-style')) return;
  const style = document.createElement('style');
  style.id = 'collection-fab-style';
  style.textContent = [
    '.collection-fab{',
    'position:fixed;bottom:24px;right:24px;',
    'width:52px;height:52px;border-radius:50%;',
    'background:#f0c040;border:none;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    'font-size:24px;line-height:1;color:#0a0a18;',
    'box-shadow:0 4px 16px rgba(240,192,64,0.4);z-index:100;',
    '}',
    '.collection-fab::before{content:"+";display:block;line-height:1;margin:0;padding:0;}',
    '.collection-fab i,.collection-fab span,.collection-fab svg{display:none !important;}'
  ].join('');
  document.head.appendChild(style);

  // Ensure FAB button has the class and no leftover icon children
  const fab = document.getElementById('add-asset-btn') || document.getElementById('open-add-asset');
  if (fab) {
    fab.classList.add('collection-fab');
    // Remove child nodes so ::before provides the + icon unambiguously
    while (fab.firstChild) fab.removeChild(fab.firstChild);
  }
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

/* ─── CHANGE 3: Build asset card with gallery hover ─── */
function buildAssetCard(asset) {
  const f = asset.fields || {};
  const mainImage = f.cloudinary_image_url || '';

  // Parse gallery URLs from cloudinary_gallery_urls field
  let galleryUrls = [];
  if (f.cloudinary_gallery_urls) {
    try { galleryUrls = JSON.parse(f.cloudinary_gallery_urls); } catch (e) { galleryUrls = []; }
  }
  const allImages = mainImage ? [mainImage, ...galleryUrls] : galleryUrls;
  let currentImageIndex = 0;

  const card = document.createElement('div');
  card.className = 'card asset-card';
  card.style.cssText = 'border-radius:12px;overflow:hidden;display:flex;flex-direction:column';

  // ── Image section ──────────────────────────────────────────────────────────
  const imgWrap = document.createElement('div');
  imgWrap.style.cssText = 'position:relative;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.03)';

  if (allImages.length > 0) {
    imgWrap.style.height = '160px';

    const img = document.createElement('img');
    img.src = allImages[0];
    img.alt = f.name || '';
    img.loading = 'lazy';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;transition:opacity 0.2s';
    img.onerror = function () { this.style.display = 'none'; };
    imgWrap.appendChild(img);

    if (allImages.length > 1) {
      // Gallery counter badge
      const counter = document.createElement('div');
      counter.style.cssText = 'position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;pointer-events:none';
      counter.textContent = '1 / ' + allImages.length;
      imgWrap.appendChild(counter);

      // Left arrow
      const arrowLeft = document.createElement('button');
      arrowLeft.textContent = '‹';
      arrowLeft.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:14px;cursor:pointer;opacity:0;transition:opacity 0.2s;display:flex;align-items:center;justify-content:center;line-height:1';

      // Right arrow
      const arrowRight = document.createElement('button');
      arrowRight.textContent = '›';
      arrowRight.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:14px;cursor:pointer;opacity:0;transition:opacity 0.2s;display:flex;align-items:center;justify-content:center;line-height:1';

      imgWrap.appendChild(arrowLeft);
      imgWrap.appendChild(arrowRight);

      // Show/hide arrows on hover
      imgWrap.addEventListener('mouseenter', function () {
        arrowLeft.style.opacity = '1';
        arrowRight.style.opacity = '1';
      });
      imgWrap.addEventListener('mouseleave', function () {
        arrowLeft.style.opacity = '0';
        arrowRight.style.opacity = '0';
        currentImageIndex = 0;
        img.src = allImages[0];
        counter.textContent = '1 / ' + allImages.length;
      });

      function navigate(dir) {
        currentImageIndex = (currentImageIndex + dir + allImages.length) % allImages.length;
        img.style.opacity = '0';
        setTimeout(function () {
          img.src = allImages[currentImageIndex];
          img.style.opacity = '1';
          counter.textContent = (currentImageIndex + 1) + ' / ' + allImages.length;
        }, 150);
      }

      arrowLeft.addEventListener('click', function (e) { e.stopPropagation(); navigate(-1); });
      arrowRight.addEventListener('click', function (e) { e.stopPropagation(); navigate(1); });
    }
  } else {
    // No image placeholder
    imgWrap.style.height = '100px';
    imgWrap.style.display = 'flex';
    imgWrap.style.alignItems = 'center';
    imgWrap.style.justifyContent = 'center';
    imgWrap.style.fontSize = '2.5rem';
    imgWrap.style.background = 'rgba(255,255,255,0.02)';
    imgWrap.textContent = '🗃️';
  }

  card.appendChild(imgWrap);

  // ── Card body — matches existing structure ─────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'padding:0.85rem;flex:1;display:flex;flex-direction:column';
  body.innerHTML =
    '<div style="font-weight:600;font-size:0.9rem;margin-bottom:0.4rem;line-height:1.3">' + escHtml(f.name || 'Unnamed Asset') + '</div>' +
    '<div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.55rem">' +
      '<span style="' + statusBadgeStyle(f.status) + ';padding:0.12rem 0.4rem;border-radius:4px;font-size:0.68rem;font-weight:600">' + escHtml(f.status || 'Holding') + '</span>' +
      (f.category ? '<span style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6);padding:0.12rem 0.4rem;border-radius:4px;font-size:0.68rem">' + escHtml(f.category) + '</span>' : '') +
      (f.velocity ? '<span style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.45);padding:0.12rem 0.4rem;border-radius:4px;font-size:0.65rem">' + escHtml(f.velocity) + '</span>' : '') +
    '</div>' +
    '<div style="font-size:0.8rem;margin-bottom:0.2rem;opacity:0.65">Cost: ' + formatThb(f.cost_price) + '</div>' +
    '<div style="font-size:0.85rem;margin-bottom:0.25rem">Value: <strong>' + formatThb(f.estimated_value) + '</strong></div>' +
    gainLossHtml(f.cost_price, f.estimated_value) +
    (f.notes ? '<div style="font-size:0.73rem;opacity:0.45;margin-top:0.35rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(f.notes) + '">' + escHtml(f.notes.substring(0, 50)) + (f.notes.length > 50 ? '…' : '') + '</div>' : '');
  card.appendChild(body);

  // ── Action buttons ─────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.style.cssText = 'padding:0.6rem 0.85rem;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:0.4rem;flex-wrap:wrap';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-sm btn-outline';
  editBtn.style.cssText = 'flex:1;min-width:50px';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', function () { openEditAssetModal(asset.id); });
  actions.appendChild(editBtn);

  if (f.status !== 'Sold') {
    const sellBtn = document.createElement('button');
    sellBtn.className = 'btn btn-sm btn-success';
    sellBtn.style.cssText = 'flex:0 0 auto';
    sellBtn.textContent = 'Sell';
    sellBtn.addEventListener('click', function () { openSellModal(asset.id); });
    actions.appendChild(sellBtn);
  }

  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-sm btn-outline';
  shareBtn.style.cssText = 'flex:0 0 auto';
  shareBtn.textContent = 'Share';
  shareBtn.addEventListener('click', function () {
    openShareModal(asset.id, f.name || '', f.estimated_value || 0, f.notes || '', f.cloudinary_image_url || '');
  });
  actions.appendChild(shareBtn);

  card.appendChild(actions);
  return card;
}

/* ─── Render asset grid — uses buildAssetCard for gallery support ─── */
function renderAssetGrid(assets) {
  const grid = document.getElementById('asset-grid');
  if (!grid) return;
  grid.innerHTML = '';
  assets.forEach(function (asset) {
    grid.appendChild(buildAssetCard(asset));
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

  const fbBtn = document.getElementById('share-facebook-btn');
  if (fbBtn) fbBtn.dataset.assetId = assetId;
  const igBtn = document.getElementById('share-instagram-btn');
  if (igBtn) igBtn.dataset.assetId = assetId;
  const ploikongBtn = document.getElementById('share-ploikong-btn');
  if (ploikongBtn) ploikongBtn.dataset.assetId = assetId;

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

    if (data.ig_caption || data.fb_url) {
      const caption = data.ig_caption || data.asset_name;
      try { await navigator.clipboard.writeText(caption); } catch (e) { /* clipboard may be blocked */ }
    }

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
    try { await navigator.clipboard.writeText(caption); } catch (e) { /* clipboard may be blocked */ }

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
  // CHANGE 1: Fix FAB plus icon centering
  injectFabCss();

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

  // CHANGE 2: Add Sync button to filter bar far right
  const filterBar = statusBtns.length > 0 ? statusBtns[0].parentElement : null;
  if (filterBar) {
    filterBar.style.display = 'flex';
    filterBar.style.alignItems = 'center';
    filterBar.style.flexWrap = 'wrap';
    if (!filterBar.style.gap) filterBar.style.gap = '0.4rem';

    const syncBtn = document.createElement('button');
    syncBtn.id = 'cloudinary-sync-btn';
    syncBtn.textContent = '⬆ Sync from Cloudinary';
    syncBtn.style.cssText = [
      'margin-left:auto',
      'background:transparent',
      'border:.5px solid #2a2a4e',
      'border-radius:6px',
      'padding:4px 12px',
      'font-size:10px',
      'color:#85b7eb',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    syncBtn.addEventListener('click', function () {
      if (window.openCloudinarySync) {
        window.openCloudinarySync();
      } else {
        console.error('cloudinary-sync.js not loaded');
      }
    });
    filterBar.appendChild(syncBtn);
  }

  // FAB / Add Asset button
  const addBtn = document.getElementById('add-asset-btn');
  if (addBtn) addBtn.addEventListener('click', openAddAssetModal);

  // Expose refresh for cloudinary-sync.js to call after import
  window._collectionRefresh = function () { loadAssets(); };

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

// Reload assets when collection panel activates (handles case where DOMContentLoaded fired before auth)
var collectionLoaded = false;
window.addEventListener('panelactivated', function (e) {
  if (e.detail === 'collection') { loadAssets(); collectionLoaded = true; }
});
