// cloudinary-sync.js
// Syncs Cloudinary assets to Airtable Assets table
// Uses asset search API (not folder listing API) for reliability

(function () {
  'use strict';

  const FOLDER_CATEGORY_MAP = {
    'Knives': 'Collection-Knife',
    'Vice': 'Collection-Vice',
    'Agave group': 'Collection-Plant',
    'Agave': 'Collection-Plant',
    'Dolls': 'Collection-Doll',
    'Misc': 'Other'
  };

  const logs = [];

  function log(level, message) {
    const entry = { level, message, time: new Date().toLocaleTimeString() };
    logs.push(entry);
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('sync-log');
    if (!el) return;
    el.innerHTML = logs.map(function (l) {
      const color = l.level === 'error' ? '#f09595'
        : l.level === 'warn' ? '#fac775'
        : l.level === 'success' ? '#5dcaa5'
        : '#aaa';
      return '<div style="color:' + color + ';font-size:10px;line-height:1.6;font-family:monospace">'
        + '[' + l.time + '] ' + l.message + '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  async function fetchCloudinaryFolders() {
    log('info', 'Searching assets in Personal/Collections...');
    try {
      const res = await fetch('/api/cloudinary-folders?folder=Personal/Collections');
      if (!res.ok) throw new Error('API returned ' + res.status);
      const data = await res.json();
      const resources = data.resources || [];

      if (resources.length === 0) {
        log('warn', 'No assets found in Personal/Collections');
        return { folders: [], resourcesByFolder: {} };
      }

      const folderMap = {};
      resources.forEach(function (r) {
        const parts = r.public_id.split('/');
        if (parts.length < 3) return;
        const folderName = parts[2];
        const folderPath = parts.slice(0, 3).join('/');
        if (!folderMap[folderName]) {
          folderMap[folderName] = {
            name: folderName,
            path: folderPath,
            parent: 'Collections',
            resources: []
          };
        }
        folderMap[folderName].resources.push(r);
      });

      const folders = Object.values(folderMap);
      log('success', 'Found ' + folders.length + ' folders · ' + resources.length + ' total assets');
      return { folders, resourcesByFolder: folderMap };
    } catch (err) {
      log('error', 'Failed: ' + err.message);
      return { folders: [], resourcesByFolder: {} };
    }
  }

  async function getExistingAssetNames() {
    log('info', 'Checking existing Airtable assets...');
    try {
      const res = await fetch('/api/assets');
      if (!res.ok) throw new Error('API returned ' + res.status);
      const data = await res.json();
      const names = (data.records || []).map(function (r) {
        return (r.fields.name || '').toLowerCase().trim();
      });
      log('info', 'Found ' + names.length + ' existing assets in Airtable');
      return new Set(names);
    } catch (err) {
      log('error', 'Failed to fetch existing assets: ' + err.message);
      return new Set();
    }
  }

  async function importAsset(assetName, category, mainImageUrl, galleryUrls) {
    try {
      const fields = {
        name: assetName,
        category: category,
        status: 'Holding',
        cloudinary_image_url: mainImageUrl,
        cloudinary_gallery_urls: JSON.stringify(galleryUrls)
      };
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + errText);
      }
      log('success', '✓ Imported: ' + assetName + ' (' + category + ') · ' + galleryUrls.length + ' gallery images');
      return true;
    } catch (err) {
      log('error', '✗ Failed: ' + assetName + ' — ' + err.message);
      return false;
    }
  }

  async function runImport(selectedFolderNames, resourcesByFolder, existingNames) {
    let totalSuccess = 0, totalFail = 0, totalSkip = 0;
    const validTypes = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'];

    for (const folderName of selectedFolderNames) {
      const folder = resourcesByFolder[folderName];
      if (!folder) continue;

      const category = FOLDER_CATEGORY_MAP[folderName] || 'Other';
      log('info', '── ' + folderName + ' → ' + category);

      if (existingNames.has(folderName.toLowerCase().trim())) {
        log('warn', 'Skip (exists): ' + folderName);
        totalSkip++;
        continue;
      }

      const validResources = folder.resources.filter(function (r) {
        const fmt = (r.format || '').toLowerCase();
        const ok = validTypes.includes(fmt);
        if (!ok) log('warn', 'Skip unsupported (' + fmt + '): ' + r.public_id);
        return ok;
      });

      if (validResources.length === 0) {
        log('warn', 'No valid images: ' + folderName);
        totalSkip++;
        continue;
      }

      validResources.sort(function (a, b) {
        return new Date(a.created_at) - new Date(b.created_at);
      });

      const mainUrl = validResources[0].secure_url;
      const galleryUrls = validResources.slice(1).map(function (r) { return r.secure_url; });

      const ok = await importAsset(folderName, category, mainUrl, galleryUrls);
      if (ok) totalSuccess++; else totalFail++;

      await new Promise(function (r) { setTimeout(r, 300); });
    }

    log('info', '── Done: ' + totalSuccess + ' imported · ' + totalSkip + ' skipped · ' + totalFail + ' failed');
    if (totalSuccess > 0 && window._collectionRefresh) {
      window._collectionRefresh();
      log('success', 'Collection panel refreshed');
    }
  }

  function buildModal(folders, resourcesByFolder, existingNames) {
    const existing = document.getElementById('cloudinary-sync-modal');
    if (existing) existing.remove();

    const annotated = folders.map(function (f) {
      return Object.assign({}, f, {
        isNew: !existingNames.has(f.name.toLowerCase().trim()),
        count: (f.resources || []).length
      });
    });

    const newCount = annotated.filter(function (f) { return f.isNew; }).length;

    const modal = document.createElement('div');
    modal.id = 'cloudinary-sync-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans,sans-serif)';

    modal.innerHTML = '<div style="background:#0f0f22;border-radius:12px;padding:20px;width:520px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;border:1px solid #2a2a4e">'

      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
      + '<div><div style="font-size:13px;font-weight:500;color:#f0f0f0">Sync from Cloudinary</div>'
      + '<div style="font-size:10px;color:#555;margin-top:2px">' + newCount + ' new · ' + annotated.length + ' folders in Personal/Collections</div></div>'
      + '<button id="sync-modal-close" style="background:transparent;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1">✕</button>'
      + '</div>'

      + '<div style="flex:1;overflow-y:auto;margin-bottom:12px;border:.5px solid #1e1e3a;border-radius:8px;max-height:240px">'
      + (annotated.length === 0
        ? '<div style="padding:20px;text-align:center;font-size:11px;color:#555">No folders found</div>'
        : annotated.map(function (f) {
            const tagColor = f.isNew ? '#1d9e75' : '#555';
            const tagBg = f.isNew ? '#1d9e7522' : '#33333322';
            return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:.5px solid #1a1a3e;cursor:pointer">'
              + '<input type="checkbox" value="' + f.name + '" ' + (f.isNew ? 'checked' : '') + ' style="accent-color:#f0c040;width:14px;height:14px;flex-shrink:0">'
              + '<div style="flex:1;min-width:0"><div style="font-size:11px;color:#d0d0d0">' + f.name + '</div>'
              + '<div style="font-size:9px;color:#555">' + f.path + ' · ' + f.count + ' image' + (f.count !== 1 ? 's' : '') + '</div></div>'
              + '<span style="font-size:9px;font-weight:500;padding:2px 7px;border-radius:3px;background:' + tagBg + ';color:' + tagColor + '">' + (f.isNew ? 'NEW' : 'exists') + '</span>'
              + '</label>';
          }).join(''))
      + '</div>'

      + '<div id="sync-log" style="height:110px;overflow-y:auto;background:#06060f;border-radius:6px;padding:8px;margin-bottom:10px;border:.5px solid #1e1e3a"></div>'

      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<button id="sync-select-new" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 10px;font-size:10px;color:#888;cursor:pointer">New only</button>'
      + '<button id="sync-select-all" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 10px;font-size:10px;color:#888;cursor:pointer">Select all</button>'
      + '<button id="sync-clear-log" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:5px 10px;font-size:10px;color:#888;cursor:pointer">Clear log</button>'
      + '<div style="flex:1"></div>'
      + '<button id="sync-run" style="background:#185fa5;border:none;border-radius:6px;padding:6px 18px;font-size:11px;color:#fff;cursor:pointer;font-weight:500">Import selected</button>'
      + '</div>'

      + '</div>';

    document.body.appendChild(modal);

    document.getElementById('sync-modal-close').onclick = function () { modal.remove(); };

    document.getElementById('sync-select-new').onclick = function () {
      modal.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        const f = annotated.find(function (a) { return a.name === cb.value; });
        cb.checked = !!(f && f.isNew);
      });
    };

    document.getElementById('sync-select-all').onclick = function () {
      modal.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = true; });
    };

    document.getElementById('sync-clear-log').onclick = function () {
      logs.length = 0;
      renderLog();
    };

    document.getElementById('sync-run').onclick = async function () {
      const checked = Array.from(modal.querySelectorAll('input[type=checkbox]:checked'))
        .map(function (cb) { return cb.value; });
      if (checked.length === 0) { log('warn', 'No folders selected'); return; }
      const btn = document.getElementById('sync-run');
      btn.disabled = true;
      btn.textContent = 'Importing...';
      btn.style.opacity = '0.7';
      await runImport(checked, resourcesByFolder, existingNames);
      btn.disabled = false;
      btn.textContent = 'Import selected';
      btn.style.opacity = '1';
    };

    renderLog();
  }

  window.openCloudinarySync = async function () {
    logs.length = 0;
    const loading = document.createElement('div');
    loading.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px';
    loading.innerHTML = '<div style="color:#f0c040;font-size:13px">Loading folders...</div>'
      + '<div style="color:#555;font-size:10px">Searching Personal/Collections</div>';
    document.body.appendChild(loading);

    const [{ folders, resourcesByFolder }, existingNames] = await Promise.all([
      fetchCloudinaryFolders(),
      getExistingAssetNames()
    ]);

    loading.remove();
    buildModal(folders, resourcesByFolder, existingNames);
  };

})();
