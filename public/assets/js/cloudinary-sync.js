// public/assets/js/cloudinary-sync.js
// Two modes: 
// 1. Browse mode: Group → Items → Import (existing flow)
// 2. Collection mode: Import all images tagged with 'index_col' in Cloudinary

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

  const COLLECTION_NAME = 'index_col';

  let state = {
    step: 1,
    groups: [],
    selectedGroup: null,
    items: [],
    selectedItems: new Set(),
    existingNames: new Set(),
    logs: []
  };

  function log(level, msg) {
    state.logs.push({ level, msg, time: new Date().toLocaleTimeString() });
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('csync-log');
    if (!el) return;
    el.innerHTML = state.logs.map(function(l) {
      const c = l.level === 'error' ? '#f09595' : l.level === 'success' ? '#5dcaa5' : l.level === 'warn' ? '#fac775' : '#888';
      return '<div style="color:' + c + ';font-size:10px;line-height:1.7;font-family:monospace">[' + l.time + '] ' + l.msg + '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

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
      return new Set((data.records || []).map(function(r) { return (r.fields.name || '').toLowerCase().trim(); }));
    } catch(e) { return new Set(); }
  }

  async function importSingleAsset(name, category, imageUrl) {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          category: category,
          status: 'Holding',
          cloudinary_image_url: imageUrl,
          cloudinary_gallery_urls: '[]'
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
      log('success', '✓ ' + name + ' (' + category + ')');
      return true;
    } catch(err) {
      log('error', '✗ ' + name + ' — ' + err.message);
      return false;
    }
  }

  async function importFromFolder(itemPath, itemName, category) {
    try {
      const data = await apiGet({ item: itemPath });
      const images = (data.images || []).filter(function(r) {
        return ['jpg','jpeg','png','webp','heic','gif'].includes((r.format||'').toLowerCase());
      });
      if (images.length === 0) { log('warn', 'Skip (no valid images): ' + itemName); return false; }
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

  // ── MODAL ──────────────────────────────────────────────────────
  function showModal() {
    const existing = document.getElementById('csync-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'csync-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans,sans-serif)';
    modal.innerHTML =
      '<div style="background:#0f0f22;border-radius:12px;padding:20px;width:540px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;border:1px solid #2a2a4e">'
      + '<div id="csync-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"></div>'
      + '<div id="csync-body" style="flex:1;overflow-y:auto;margin-bottom:10px;border:.5px solid #1e1e3a;border-radius:8px;min-height:80px;max-height:300px"></div>'
      + '<div id="csync-log" style="height:80px;overflow-y:auto;background:#06060f;border-radius:6px;padding:8px;margin-bottom:10px;border:.5px solid #1e1e3a"></div>'
      + '<div id="csync-footer" style="display:flex;gap:8px;align-items:center"></div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    renderModeSelect();
  }

  function closeModal() {
    const m = document.getElementById('csync-modal');
    if (m) m.remove();
    state = { step:1, groups:[], selectedGroup:null, items:[], selectedItems:new Set(), existingNames:new Set(), logs:[] };
  }

  function setHeader(title, sub) {
    document.getElementById('csync-header').innerHTML =
      '<div><div style="font-size:13px;font-weight:500;color:#f0f0f0">' + title + '</div>'
      + (sub ? '<div style="font-size:10px;color:#555;margin-top:2px">' + sub + '</div>' : '') + '</div>'
      + '<button onclick="(function(){var m=document.getElementById(\'csync-modal\');if(m)m.remove();})()" style="background:transparent;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1">✕</button>';
  }
  function setFooter(html) { document.getElementById('csync-footer').innerHTML = html; }
  function setBody(html) { document.getElementById('csync-body').innerHTML = html; }
  function wire(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }
  function pbtn(id, label) { return '<button id="' + id + '" style="background:#185fa5;border:none;border-radius:6px;padding:6px 16px;font-size:11px;color:#fff;cursor:pointer;font-weight:500">' + label + '</button>'; }
  function sbtn(id, label) { return '<button id="' + id + '" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 10px;font-size:10px;color:#888;cursor:pointer">' + label + '</button>'; }

  // ── MODE SELECT ────────────────────────────────────────────────
  function renderModeSelect() {
    setHeader('Sync from Cloudinary', 'Choose import method');
    setBody(
      '<div id="mode-collection" style="display:flex;align-items:flex-start;gap:12px;padding:14px;border-bottom:.5px solid #1a1a3e;cursor:pointer" onmouseover="this.style.background=\'#1a1a3e\'" onmouseout="this.style.background=\'\'">'
      + '<div style="font-size:20px;margin-top:2px">⭐</div>'
      + '<div><div style="font-size:12px;font-weight:500;color:#f0c040;margin-bottom:3px">Quick import via Collection tag</div>'
      + '<div style="font-size:10px;color:#888">In Cloudinary: pick one image per item → 3-dot menu → Add to Collection → "index_col"<br>'
      + 'Then click here to import all tagged images at once. Fastest method.</div></div></div>'

      + '<div id="mode-browse" style="display:flex;align-items:flex-start;gap:12px;padding:14px;cursor:pointer" onmouseover="this.style.background=\'#1a1a3e\'" onmouseout="this.style.background=\'\'">'
      + '<div style="font-size:20px;margin-top:2px">📁</div>'
      + '<div><div style="font-size:12px;font-weight:500;color:#d0d0d0;margin-bottom:3px">Browse folders</div>'
      + '<div style="font-size:10px;color:#888">Navigate Group → Items → select and import.<br>'
      + 'Imports all images per item as main + gallery.</div></div></div>'
    );
    setFooter(sbtn('csync-cancel', 'Cancel') + '<div style="flex:1"></div>');
    wire('csync-cancel', closeModal);
    wire('mode-collection', runCollectionImport);
    wire('mode-browse', renderStep1);
  }

  // ── COLLECTION IMPORT MODE ─────────────────────────────────────
  async function runCollectionImport() {
    setHeader('Quick import · index_col', 'Loading tagged images from Cloudinary...');
    setBody('<div style="padding:16px;text-align:center;color:#555;font-size:11px">Searching for images tagged "index_col"...</div>');
    setFooter('<div style="flex:1"></div>');

    try {
      log('info', 'Searching collection: ' + COLLECTION_NAME);
      const [data, existingNames] = await Promise.all([
        apiGet({ collection: COLLECTION_NAME }),
        getExistingNames()
      ]);

      const items = data.items || [];
      log('success', 'Found ' + items.length + ' items in collection');

      if (items.length === 0) {
        setBody('<div style="padding:20px;text-align:center;color:#fac775;font-size:11px">'
          + 'No images found tagged "index_col".<br><br>'
          + '<span style="color:#555">In Cloudinary: open an image → 3-dot menu → Add to Collection → create/select "index_col"</span>'
          + '</div>');
        setFooter(sbtn('csync-back', '‹ Back') + '<div style="flex:1"></div>');
        wire('csync-back', renderModeSelect);
        return;
      }

      // Show preview list
      const newItems = items.filter(function(i) { return !existingNames.has(i.name.toLowerCase().trim()); });
      const existsItems = items.filter(function(i) { return existingNames.has(i.name.toLowerCase().trim()); });

      setBody(
        '<div style="padding:8px 12px;font-size:10px;color:#555;border-bottom:.5px solid #1a1a3e">'
        + newItems.length + ' new · ' + existsItems.length + ' already imported</div>'
        + items.map(function(item) {
          const isNew = !existingNames.has(item.name.toLowerCase().trim());
          const cat = CATEGORY_MAP[item.category] || 'Other';
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:.5px solid #1a1a3e">'
            + '<img src="' + item.image + '" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display=\'none\'">'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:11px;color:#d0d0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.name + '</div>'
            + '<div style="font-size:9px;color:#555">' + cat + ' · ' + item.category + '</div>'
            + '</div>'
            + '<span style="font-size:9px;padding:2px 6px;border-radius:3px;white-space:nowrap;'
            + (isNew ? 'background:#1d9e7522;color:#1d9e75' : 'background:#33333322;color:#555') + '">'
            + (isNew ? 'NEW' : 'exists') + '</span>'
            + '</div>';
        }).join('')
      );

      setFooter(
        sbtn('csync-back', '‹ Back') + '<div style="flex:1"></div>'
        + (newItems.length > 0 ? pbtn('csync-import-col', 'Import ' + newItems.length + ' new items') : '<span style="font-size:11px;color:#555">All already imported</span>')
      );
      wire('csync-back', renderModeSelect);
      wire('csync-import-col', function() { runCollectionImportBatch(newItems, existingNames); });

    } catch(err) {
      log('error', err.message);
      setBody('<div style="padding:16px;text-align:center;color:#f09595;font-size:11px">Failed: ' + err.message + '</div>');
      setFooter(sbtn('csync-back', '‹ Back'));
      wire('csync-back', renderModeSelect);
    }
  }

  async function runCollectionImportBatch(items, existingNames) {
    setHeader('Importing · index_col', items.length + ' items');
    setFooter('<div style="flex:1"></div><div id="csync-progress" style="font-size:11px;color:#888">Starting...</div>');

    let success = 0, fail = 0, skip = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const prog = document.getElementById('csync-progress');
      if (prog) prog.textContent = (i+1) + ' / ' + items.length + ' · ' + item.name;

      if (existingNames.has(item.name.toLowerCase().trim())) {
        log('warn', 'Skip (exists): ' + item.name); skip++; continue;
      }

      const category = CATEGORY_MAP[item.category] || 'Other';
      const ok = await importSingleAsset(item.name, category, item.image);
      if (ok) success++; else fail++;
      await new Promise(function(r) { setTimeout(r, 300); });
    }

    log('info', '── Done: ' + success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');
    if (success > 0 && window._collectionRefresh) { window._collectionRefresh(); log('success', 'Collection refreshed ✓'); }

    setHeader('Done · index_col', success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');
    setFooter(sbtn('csync-more', '‹ Import more') + '<div style="flex:1"></div>' + pbtn('csync-done', 'Done'));
    wire('csync-more', renderModeSelect);
    wire('csync-done', closeModal);
  }

  // ── BROWSE MODE (existing flow) ────────────────────────────────
  async function renderStep1() {
    state.step = 1;
    state.selectedGroup = null;
    state.selectedItems.clear();
    setHeader('Browse · Choose group', 'Step 1 of 3');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading groups...</div>');
    setFooter(sbtn('csync-back', '‹ Back') + '<div style="flex:1"></div>');
    wire('csync-back', renderModeSelect);

    try {
      log('info', 'Loading groups...');
      const data = await apiGet({});
      state.groups = data.groups || [];
      log('success', 'Found ' + state.groups.length + ' groups');

      setBody(state.groups.map(function(g) {
        const cat = CATEGORY_MAP[g.name] || 'Other';
        return '<div class="csync-group-row" data-group="' + g.name + '" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer" onmouseover="this.style.background=\'#1a1a3e\'" onmouseout="this.style.background=\'\'">'
          + '<div style="flex:1"><div style="font-size:12px;font-weight:500;color:#d0d0d0">' + g.name + '</div>'
          + '<div style="font-size:9px;color:#555;margin-top:2px">' + g.itemCount + ' items · → ' + cat + '</div></div>'
          + '<div style="color:#555;font-size:14px">›</div></div>';
      }).join(''));

      document.querySelectorAll('.csync-group-row').forEach(function(row) {
        row.onclick = function() { state.selectedGroup = row.dataset.group; renderStep2(); };
      });
    } catch(err) { log('error', err.message); }
  }

  async function renderStep2() {
    state.step = 2;
    const group = state.selectedGroup;
    setHeader('Browse · ' + group, 'Step 2 · Select items');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading items...</div>');
    setFooter(sbtn('csync-back', '‹ Back') + '<div style="flex:1"></div>' + sbtn('csync-selall', 'All') + sbtn('csync-none', 'None') + pbtn('csync-import', 'Import 0 items'));
    wire('csync-back', renderStep1);

    try {
      log('info', 'Loading items in ' + group + '...');
      const [itemData, existing] = await Promise.all([apiGet({ group }), getExistingNames()]);
      state.items = itemData.items || [];
      state.existingNames = existing;
      state.selectedItems = new Set(state.items.filter(function(i) { return !existing.has(i.name.toLowerCase().trim()); }).map(function(i) { return i.name; }));
      log('success', 'Found ' + state.items.length + ' items');
      renderItemList();
      wire('csync-selall', function() { state.items.forEach(function(i) { state.selectedItems.add(i.name); }); renderItemList(); });
      wire('csync-none', function() { state.selectedItems.clear(); renderItemList(); });
      wire('csync-import', runBrowseImport);
    } catch(err) { log('error', err.message); }
  }

  function renderItemList() {
    const body = document.getElementById('csync-body');
    if (!body) return;
    body.innerHTML = state.items.map(function(item) {
      const isNew = !state.existingNames.has(item.name.toLowerCase().trim());
      const checked = state.selectedItems.has(item.name);
      return '<label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer">'
        + '<input type="checkbox" class="csync-cb" value="' + item.name + '" ' + (checked ? 'checked' : '') + ' style="accent-color:#f0c040;width:14px;height:14px;flex-shrink:0">'
        + '<div style="flex:1;min-width:0"><div style="font-size:11px;color:#d0d0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.name + '</div>'
        + '<div style="font-size:9px;color:#555">' + item.path + '</div></div>'
        + '<span style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:3px;white-space:nowrap;'
        + (isNew ? 'background:#1d9e7522;color:#1d9e75' : 'background:#33333322;color:#555') + '">' + (isNew ? 'NEW' : 'exists') + '</span>'
        + '</label>';
    }).join('');

    body.querySelectorAll('.csync-cb').forEach(function(cb) {
      cb.onchange = function() {
        if (cb.checked) state.selectedItems.add(cb.value);
        else state.selectedItems.delete(cb.value);
        const btn = document.getElementById('csync-import');
        if (btn) { const n = state.selectedItems.size; btn.textContent = 'Import ' + n + ' item' + (n !== 1 ? 's' : ''); }
      };
    });

    const btn = document.getElementById('csync-import');
    if (btn) { const n = state.selectedItems.size; btn.textContent = 'Import ' + n + ' item' + (n !== 1 ? 's' : ''); }
  }

  async function runBrowseImport() {
    const group = state.selectedGroup;
    const category = CATEGORY_MAP[group] || 'Other';
    const toImport = state.items.filter(function(i) { return state.selectedItems.has(i.name); });
    if (toImport.length === 0) { log('warn', 'Nothing selected'); return; }

    setFooter('<div style="flex:1"></div><div id="csync-progress" style="font-size:11px;color:#888">Starting...</div>');
    setHeader('Importing · ' + group, toImport.length + ' items · please wait');

    let success = 0, fail = 0, skip = 0;
    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      const prog = document.getElementById('csync-progress');
      if (prog) prog.textContent = (i+1) + ' / ' + toImport.length + ' · ' + item.name;
      if (state.existingNames.has(item.name.toLowerCase().trim())) { log('warn', 'Skip: ' + item.name); skip++; continue; }
      const ok = await importFromFolder(item.path, item.name, category);
      if (ok) { success++; state.existingNames.add(item.name.toLowerCase().trim()); } else { fail++; }
      await new Promise(function(r) { setTimeout(r, 300); });
    }

    log('info', '── Done: ' + success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');
    if (success > 0 && window._collectionRefresh) { window._collectionRefresh(); log('success', 'Collection refreshed ✓'); }
    setHeader('Done · ' + group, success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');
    setFooter(sbtn('csync-more', '‹ Import more') + '<div style="flex:1"></div>' + pbtn('csync-done', 'Done'));
    wire('csync-more', renderModeSelect);
    wire('csync-done', closeModal);
  }

  window.openCloudinarySync = function() { showModal(); };
})();
