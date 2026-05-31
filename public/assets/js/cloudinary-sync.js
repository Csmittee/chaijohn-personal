// public/assets/js/cloudinary-sync.js
// 3-step modal: Group → Items → Import

(function () {
  'use strict';

  const CATEGORY_MAP = {
    'Knives': 'Collection-Knife',
    'Vice': 'Collection-Vice',
    'Agave group': 'Collection-Plant',
    'Agave': 'Collection-Plant',
    'edc': 'Other',
    'Misc': 'Other',
    'Vintage tools': 'Other',
    'Dolls': 'Collection-Doll'
  };

  // ── STATE ──────────────────────────────────────────────────────
  let state = {
    step: 1,
    groups: [],
    selectedGroup: null,
    items: [],
    selectedItems: new Set(),
    existingNames: new Set(),
    logs: []
  };

  // ── LOG ────────────────────────────────────────────────────────
  function log(level, msg) {
    state.logs.push({ level, msg, time: new Date().toLocaleTimeString() });
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('csync-log');
    if (!el) return;
    el.innerHTML = state.logs.map(function(l) {
      const c = l.level === 'error' ? '#f09595'
        : l.level === 'success' ? '#5dcaa5'
        : l.level === 'warn' ? '#fac775' : '#888';
      return '<div style="color:' + c + ';font-size:10px;line-height:1.7;font-family:monospace">'
        + '[' + l.time + '] ' + l.msg + '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ── API HELPERS ────────────────────────────────────────────────
  async function apiGet(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch('/api/cloudinary-folders' + (qs ? '?' + qs : ''));
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  async function getExistingNames() {
    try {
      const res = await fetch('/api/assets');
      if (!res.ok) return new Set();
      const data = await res.json();
      return new Set((data.records || []).map(function(r) {
        return (r.fields.name || '').toLowerCase().trim();
      }));
    } catch(e) { return new Set(); }
  }

  // ── IMPORT ONE ITEM ────────────────────────────────────────────
  async function importItem(itemPath, itemName, category) {
    try {
      // Fetch all images for this item
      const data = await apiGet({ item: itemPath });
      const images = (data.images || []).filter(function(r) {
        return ['jpg','jpeg','png','webp','heic','gif'].includes((r.format||'').toLowerCase());
      });

      if (images.length === 0) {
        log('warn', 'Skip (no valid images): ' + itemName);
        return false;
      }

      images.sort(function(a,b) { return new Date(a.created_at) - new Date(b.created_at); });
      const mainUrl = images[0].secure_url;
      const galleryUrls = images.slice(1).map(function(r) { return r.secure_url; });

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
        name: itemName,
        category: category,
        status: 'Holding',
        cloudinary_image_url: mainUrl,
        cloudinary_gallery_urls: JSON.stringify(galleryUrls)
      })
      });

      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
      log('success', '✓ ' + itemName + ' · ' + images.length + ' image' + (images.length !== 1 ? 's' : ''));
      return true;
    } catch(err) {
      log('error', '✗ ' + itemName + ' — ' + err.message);
      return false;
    }
  }

  // ── MODAL SHELL ────────────────────────────────────────────────
  function getModal() { return document.getElementById('csync-modal'); }

  function showModal() {
    const existing = getModal();
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'csync-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans,sans-serif)';
    modal.innerHTML =
      '<div id="csync-inner" style="background:#0f0f22;border-radius:12px;padding:20px;width:540px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;border:1px solid #2a2a4e">'
      + '<div id="csync-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"></div>'
      + '<div id="csync-body" style="flex:1;overflow-y:auto;margin-bottom:10px;border:.5px solid #1e1e3a;border-radius:8px;min-height:120px;max-height:280px"></div>'
      + '<div id="csync-log" style="height:90px;overflow-y:auto;background:#06060f;border-radius:6px;padding:8px;margin-bottom:10px;border:.5px solid #1e1e3a"></div>'
      + '<div id="csync-footer" style="display:flex;gap:8px;align-items:center"></div>'
      + '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });

    renderStep();
  }

  function closeModal() {
    const m = getModal();
    if (m) m.remove();
    state = { step:1, groups:[], selectedGroup:null, items:[], selectedItems:new Set(), existingNames:new Set(), logs:[] };
  }

  function setHeader(title, sub) {
    document.getElementById('csync-header').innerHTML =
      '<div><div style="font-size:13px;font-weight:500;color:#f0f0f0">' + title + '</div>'
      + '<div style="font-size:10px;color:#555;margin-top:2px">' + sub + '</div></div>'
      + '<button onclick="document.getElementById(\'csync-modal\').remove()" style="background:transparent;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1">✕</button>';
  }

  function setFooter(html) {
    document.getElementById('csync-footer').innerHTML = html;
  }

  function setBody(html) {
    document.getElementById('csync-body').innerHTML = html;
  }

  function btn(id, label, style) {
    return '<button id="' + id + '" style="' + (style||'background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 12px;font-size:10px;color:#888;cursor:pointer') + '">' + label + '</button>';
  }

  function primaryBtn(id, label) {
    return btn(id, label, 'background:#185fa5;border:none;border-radius:6px;padding:6px 18px;font-size:11px;color:#fff;cursor:pointer;font-weight:500');
  }

  function wire(id, fn) {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  }

  // ── STEP 1: GROUPS ─────────────────────────────────────────────
  async function renderStep1() {
    state.step = 1;
    setHeader('Sync from Cloudinary', 'Step 1 of 3 — Choose a collection group');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading groups...</div>');
    setFooter(btn('csync-close', 'Cancel') + '<div style="flex:1"></div>');
    wire('csync-close', closeModal);

    try {
      log('info', 'Loading groups from Personal/Collections...');
      const data = await apiGet({});
      state.groups = data.groups || [];
      log('success', 'Found ' + state.groups.length + ' groups');

      if (state.groups.length === 0) {
        setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">No groups found</div>');
        return;
      }

      setBody(state.groups.map(function(g) {
        const cat = CATEGORY_MAP[g.name] || 'Other';
        return '<div class="csync-row" data-group="' + g.name + '" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'#1a1a3e\'" onmouseout="this.style.background=\'\'">'
          + '<div style="flex:1">'
          + '<div style="font-size:12px;font-weight:500;color:#d0d0d0">' + g.name + '</div>'
          + '<div style="font-size:9px;color:#555;margin-top:2px">' + g.itemCount + ' items · ' + g.imageCount + ' images · → ' + cat + '</div>'
          + '</div>'
          + '<div style="font-size:11px;color:#555">›</div>'
          + '</div>';
      }).join(''));

      // Wire group clicks
      document.querySelectorAll('.csync-row').forEach(function(row) {
        row.onclick = function() {
          state.selectedGroup = row.dataset.group;
          renderStep2();
        };
      });

    } catch(err) {
      log('error', 'Failed to load groups: ' + err.message);
      setBody('<div style="padding:20px;text-align:center;color:#f09595;font-size:11px">Failed to load. Check console.</div>');
    }
  }

  // ── STEP 2: ITEMS ──────────────────────────────────────────────
  async function renderStep2() {
    state.step = 2;
    const group = state.selectedGroup;
    setHeader('Sync — ' + group, 'Step 2 of 3 — Choose items to import');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading items...</div>');
    setFooter(btn('csync-back', '‹ Back') + btn('csync-selall', 'Select all') + btn('csync-deselall', 'Deselect all') + '<div style="flex:1"></div>' + primaryBtn('csync-next', 'Import selected →'));
    wire('csync-back', renderStep1);

    try {
      log('info', 'Loading items in ' + group + '...');
      const data = await apiGet({ group: group });
      state.items = data.items || [];
      state.existingNames = await getExistingNames();
      log('success', 'Found ' + state.items.length + ' items · ' + data.total + ' total images');

      if (state.items.length === 0) {
        setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">No items found in ' + group + '</div>');
        return;
      }

      // Pre-select new items
      state.selectedItems = new Set();
      state.items.forEach(function(item) {
        if (!state.existingNames.has(item.name.toLowerCase().trim())) {
          state.selectedItems.add(item.name);
        }
      });

      renderItemList();

      wire('csync-selall', function() {
        state.items.forEach(function(i) { state.selectedItems.add(i.name); });
        renderItemList();
      });

      wire('csync-deselall', function() {
        state.selectedItems.clear();
        renderItemList();
      });

      wire('csync-next', function() {
        if (state.selectedItems.size === 0) { log('warn', 'Nothing selected'); return; }
        runImport();
      });

    } catch(err) {
      log('error', 'Failed: ' + err.message);
    }
  }

  function renderItemList() {
    const body = document.getElementById('csync-body');
    if (!body) return;
    const group = state.selectedGroup;
    const category = CATEGORY_MAP[group] || 'Other';

    body.innerHTML = state.items.map(function(item) {
      const isNew = !state.existingNames.has(item.name.toLowerCase().trim());
      const checked = state.selectedItems.has(item.name);
      const tagColor = isNew ? '#1d9e75' : '#555';
      const tagBg = isNew ? '#1d9e7522' : '#33333322';
      return '<label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer">'
        + '<input type="checkbox" class="csync-item-cb" value="' + item.name + '" ' + (checked ? 'checked' : '') + ' style="accent-color:#f0c040;width:14px;height:14px;flex-shrink:0">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:11px;color:#d0d0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.name + '</div>'
        + '<div style="font-size:9px;color:#555">' + category + ' · ' + item.count + ' image' + (item.count !== 1 ? 's' : '') + '</div>'
        + '</div>'
        + '<span style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:3px;background:' + tagBg + ';color:' + tagColor + '">' + (isNew ? 'NEW' : 'exists') + '</span>'
        + '</label>';
    }).join('');

    // Wire checkboxes
    body.querySelectorAll('.csync-item-cb').forEach(function(cb) {
      cb.onchange = function() {
        if (cb.checked) state.selectedItems.add(cb.value);
        else state.selectedItems.delete(cb.value);
      };
    });

    // Update footer count
    const nextBtn = document.getElementById('csync-next');
    if (nextBtn) nextBtn.textContent = 'Import ' + state.selectedItems.size + ' items →';
  }

  // ── STEP 3: IMPORT ─────────────────────────────────────────────
  async function runImport() {
    state.step = 3;
    const group = state.selectedGroup;
    const category = CATEGORY_MAP[group] || 'Other';
    const toImport = state.items.filter(function(i) { return state.selectedItems.has(i.name); });

    setHeader('Importing — ' + group, 'Step 3 of 3 — ' + toImport.length + ' items');
    setBody('<div style="padding:14px;font-size:11px;color:#555">Import in progress — watch the log below...</div>');
    setFooter('<div style="flex:1"></div><div id="csync-progress" style="font-size:10px;color:#888">0 / ' + toImport.length + '</div>');

    let success = 0, fail = 0, skip = 0;

    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      const progressEl = document.getElementById('csync-progress');
      if (progressEl) progressEl.textContent = (i + 1) + ' / ' + toImport.length;

      if (state.existingNames.has(item.name.toLowerCase().trim())) {
        log('warn', 'Skip (exists): ' + item.name);
        skip++;
        continue;
      }

      const ok = await importItem(item.path, item.name, category);
      if (ok) success++; else fail++;

      await new Promise(function(r) { setTimeout(r, 400); });
    }

    log('info', '── Done: ' + success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');

    if (success > 0 && window._collectionRefresh) {
      window._collectionRefresh();
      log('success', 'Collection refreshed ✓');
    }

    setFooter(
      btn('csync-again', '← Import more', '') +
      '<div style="flex:1"></div>' +
      primaryBtn('csync-done', 'Done')
    );
    wire('csync-again', renderStep1);
    wire('csync-done', closeModal);
  }

  // ── RENDER STEP ROUTER ─────────────────────────────────────────
  function renderStep() {
    renderStep1();
  }

  // ── ENTRY POINT ────────────────────────────────────────────────
  window.openCloudinarySync = function() {
    showModal();
  };

})();
