// public/assets/js/cloudinary-sync.js
// 3-step: Group → Items → Import (no selection limit, progress per item)

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

  // ── API ────────────────────────────────────────────────────────
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
  function showModal() {
    const existing = document.getElementById('csync-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'csync-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans,sans-serif)';
    modal.innerHTML =
      '<div style="background:#0f0f22;border-radius:12px;padding:20px;width:540px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;border:1px solid #2a2a4e">'
      + '<div id="csync-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"></div>'
      + '<div id="csync-body" style="flex:1;overflow-y:auto;margin-bottom:10px;border:.5px solid #1e1e3a;border-radius:8px;min-height:120px;max-height:300px"></div>'
      + '<div id="csync-log" style="height:80px;overflow-y:auto;background:#06060f;border-radius:6px;padding:8px;margin-bottom:10px;border:.5px solid #1e1e3a"></div>'
      + '<div id="csync-footer" style="display:flex;gap:8px;align-items:center"></div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    renderStep1();
  }

  function closeModal() {
    const m = document.getElementById('csync-modal');
    if (m) m.remove();
    state = { step:1, groups:[], selectedGroup:null, items:[], selectedItems:new Set(), existingNames:new Set(), logs:[] };
  }

  function setHeader(title, sub) {
    document.getElementById('csync-header').innerHTML =
      '<div><div style="font-size:13px;font-weight:500;color:#f0f0f0">' + title + '</div>'
      + (sub ? '<div style="font-size:10px;color:#555;margin-top:2px">' + sub + '</div>' : '')
      + '</div>'
      + '<button onclick="(function(){var m=document.getElementById(\'csync-modal\');if(m)m.remove();})()" style="background:transparent;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1">✕</button>';
  }

  function setFooter(html) { document.getElementById('csync-footer').innerHTML = html; }
  function setBody(html) { document.getElementById('csync-body').innerHTML = html; }

  function wire(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }

  function pbtn(id, label) {
    return '<button id="' + id + '" style="background:#185fa5;border:none;border-radius:6px;padding:6px 16px;font-size:11px;color:#fff;cursor:pointer;font-weight:500">' + label + '</button>';
  }
  function sbtn(id, label) {
    return '<button id="' + id + '" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 10px;font-size:10px;color:#888;cursor:pointer">' + label + '</button>';
  }

  // ── STEP 1: GROUPS ─────────────────────────────────────────────
  async function renderStep1() {
    state.step = 1;
    state.selectedGroup = null;
    state.selectedItems.clear();
    setHeader('Sync from Cloudinary', 'Step 1 · Choose a collection group');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading groups...</div>');
    setFooter(sbtn('csync-cancel', 'Cancel') + '<div style="flex:1"></div>');
    wire('csync-cancel', closeModal);

    try {
      log('info', 'Loading groups...');
      const data = await apiGet({});
      state.groups = data.groups || [];
      log('success', 'Found ' + state.groups.length + ' groups');

      setBody(
        state.groups.map(function(g) {
          const cat = CATEGORY_MAP[g.name] || 'Other';
          return '<div class="csync-group-row" data-group="' + g.name + '" '
            + 'style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer" '
            + 'onmouseover="this.style.background=\'#1a1a3e\'" onmouseout="this.style.background=\'\'">'
            + '<div style="flex:1">'
            + '<div style="font-size:12px;font-weight:500;color:#d0d0d0">' + g.name + '</div>'
            + '<div style="font-size:9px;color:#555;margin-top:2px">' + g.itemCount + ' items · → ' + cat + '</div>'
            + '</div><div style="color:#555;font-size:14px">›</div></div>';
        }).join('')
      );

      document.querySelectorAll('.csync-group-row').forEach(function(row) {
        row.onclick = function() {
          state.selectedGroup = row.dataset.group;
          renderStep2();
        };
      });

    } catch(err) {
      log('error', err.message);
      setBody('<div style="padding:20px;text-align:center;color:#f09595;font-size:11px">Failed to load groups.</div>');
    }
  }

  // ── STEP 2: ITEMS ──────────────────────────────────────────────
  async function renderStep2() {
    state.step = 2;
    const group = state.selectedGroup;
    setHeader('Sync · ' + group, 'Step 2 · Select items to import');
    setBody('<div style="padding:20px;text-align:center;color:#555;font-size:11px">Loading items...</div>');
    setFooter(sbtn('csync-back', '‹ Back') + '<div style="flex:1"></div>' + sbtn('csync-selall', 'All') + sbtn('csync-deselall', 'None') + pbtn('csync-import', 'Import 0 items'));
    wire('csync-back', renderStep1);

    try {
      log('info', 'Loading items in ' + group + '...');
      const [itemData, existing] = await Promise.all([
        apiGet({ group }),
        getExistingNames()
      ]);
      state.items = itemData.items || [];
      state.existingNames = existing;
      // Pre-select new items
      state.selectedItems = new Set(
        state.items.filter(function(i) {
          return !existing.has(i.name.toLowerCase().trim());
        }).map(function(i) { return i.name; })
      );
      log('success', 'Found ' + state.items.length + ' items');
      renderItemList();

      wire('csync-selall', function() {
        state.items.forEach(function(i) { state.selectedItems.add(i.name); });
        renderItemList();
      });
      wire('csync-deselall', function() {
        state.selectedItems.clear();
        renderItemList();
      });
      wire('csync-import', runImport);

    } catch(err) {
      log('error', err.message);
    }
  }

  function updateImportBtn() {
    const btn = document.getElementById('csync-import');
    if (btn) {
      const n = state.selectedItems.size;
      btn.textContent = n === 0 ? 'Select items first' : 'Import ' + n + ' item' + (n !== 1 ? 's' : '');
      btn.style.opacity = n === 0 ? '0.5' : '1';
    }
  }

  function renderItemList() {
    const body = document.getElementById('csync-body');
    if (!body) return;

    body.innerHTML = state.items.map(function(item) {
      const isNew = !state.existingNames.has(item.name.toLowerCase().trim());
      const checked = state.selectedItems.has(item.name);
      const tagColor = isNew ? '#1d9e75' : '#555';
      const tagBg = isNew ? '#1d9e7522' : '#33333322';
      return '<label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:.5px solid #1a1a3e;cursor:pointer">'
        + '<input type="checkbox" class="csync-cb" value="' + item.name + '" ' + (checked ? 'checked' : '') + ' '
        + 'style="accent-color:#f0c040;width:14px;height:14px;flex-shrink:0">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:11px;color:#d0d0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.name + '</div>'
        + '<div style="font-size:9px;color:#555">' + item.path + '</div>'
        + '</div>'
        + '<span style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:3px;white-space:nowrap;'
        + 'background:' + tagBg + ';color:' + tagColor + '">' + (isNew ? 'NEW' : 'exists') + '</span>'
        + '</label>';
    }).join('');

    body.querySelectorAll('.csync-cb').forEach(function(cb) {
      cb.onchange = function() {
        if (cb.checked) state.selectedItems.add(cb.value);
        else state.selectedItems.delete(cb.value);
        updateImportBtn();
      };
    });

    updateImportBtn();
  }

  // ── IMPORT ─────────────────────────────────────────────────────
  async function runImport() {
    const group = state.selectedGroup;
    const category = CATEGORY_MAP[group] || 'Other';
    const toImport = state.items.filter(function(i) { return state.selectedItems.has(i.name); });

    if (toImport.length === 0) { log('warn', 'Nothing selected'); return; }

    // Disable footer during import
    setFooter('<div style="flex:1"></div><div id="csync-progress" style="font-size:11px;color:#888">Starting...</div>');
    setHeader('Importing · ' + group, toImport.length + ' items · please wait');

    let success = 0, fail = 0, skip = 0;

    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      const prog = document.getElementById('csync-progress');
      if (prog) prog.textContent = (i + 1) + ' / ' + toImport.length + ' · ' + item.name;

      // Highlight current item in list
      document.querySelectorAll('.csync-cb').forEach(function(cb) {
        const label = cb.parentElement;
        if (cb.value === item.name) label.style.background = '#1a1a3e';
        else label.style.background = '';
      });

      if (state.existingNames.has(item.name.toLowerCase().trim())) {
        log('warn', 'Skip (exists): ' + item.name);
        skip++;
        continue;
      }

      const ok = await importItem(item.path, item.name, category);
      if (ok) {
        success++;
        // Mark as exists in state so it shows correctly if user imports more
        state.existingNames.add(item.name.toLowerCase().trim());
      } else {
        fail++;
      }

      await new Promise(function(r) { setTimeout(r, 300); });
    }

    log('info', '── Done: ' + success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');

    if (success > 0 && window._collectionRefresh) {
      window._collectionRefresh();
      log('success', 'Collection refreshed ✓');
    }

    setHeader('Done · ' + group, success + ' imported · ' + skip + ' skipped · ' + fail + ' failed');
    setFooter(
      sbtn('csync-more', '‹ Import more') + '<div style="flex:1"></div>' + pbtn('csync-done', 'Done')
    );
    wire('csync-more', renderStep1);
    wire('csync-done', closeModal);
  }

  // ── ENTRY ──────────────────────────────────────────────────────
  window.openCloudinarySync = function() { showModal(); };

})();
