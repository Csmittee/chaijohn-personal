// cloudinary-sync.js
// Paste this into browser console on chaijohn-dashboard.pages.dev
// OR save to public/assets/js/cloudinary-sync.js and load via collection panel

(function () {
  'use strict';

  const CLOUD_NAME = 'dfiomi0lb';
  const AIRTABLE_BASE = 'apphBGWfSPL45oSFd';

  // Cloudinary folder → Airtable category mapping
  const FOLDER_CATEGORY_MAP = {
    'Knives': 'Collection-Knife',
    'Vice': 'Collection-Vice',
    'Agave group': 'Collection-Plant',
    'Dolls': 'Collection-Doll',
    'Misc': 'Other'
  };

  // ─── LOG SYSTEM ───────────────────────────────────────────────
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

  // ─── FETCH CLOUDINARY FOLDERS via signed API ──────────────────
  // Uses /api/cloudinary-folders endpoint (to be created)
  // Falls back to direct unsigned search if endpoint missing
  async function fetchCloudinaryFolders() {
    log('info', 'Fetching Cloudinary folder list...');
    try {
      const res = await fetch('/api/cloudinary-folders');
      if (!res.ok) throw new Error('API returned ' + res.status);
      const data = await res.json();
      log('success', 'Found ' + data.folders.length + ' folders');
      return data.folders;
    } catch (err) {
      log('error', 'Failed to fetch folders: ' + err.message);
      return [];
    }
  }

  // ─── FETCH ASSETS IN A FOLDER ─────────────────────────────────
  async function fetchFolderAssets(folderPath) {
    log('info', 'Fetching assets in: ' + folderPath);
    try {
      const res = await fetch('/api/cloudinary-folders?folder=' + encodeURIComponent(folderPath));
      if (!res.ok) throw new Error('API returned ' + res.status);
      const data = await res.json();
      return data.resources || [];
    } catch (err) {
      log('error', 'Failed to fetch assets for ' + folderPath + ': ' + err.message);
      return [];
    }
  }

  // ─── GET EXISTING AIRTABLE ASSET NAMES ────────────────────────
  async function getExistingAssetNames() {
    log('info', 'Checking existing Airtable assets...');
    try {
      const res = await fetch('/api/assets?fields[]=name');
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

  // ─── IMPORT ONE ASSET TO AIRTABLE ─────────────────────────────
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

      log('success', '✓ Imported: ' + assetName + ' (' + category + ')' +
        ' · ' + galleryUrls.length + ' gallery images');
      return true;
    } catch (err) {
      log('error', '✗ Failed: ' + assetName + ' — ' + err.message);
      return false;
    }
  }

  // ─── BATCH IMPORT (10 at a time per Airtable rule) ────────────
  async function runImport(selectedFolders, existingNames) {
    let totalSuccess = 0;
    let totalFail = 0;
    let totalSkip = 0;

    for (const folder of selectedFolders) {
      const folderName = folder.name;
      const folderPath = folder.path;
      const parentFolder = folder.parent;

      // Determine category
      let category = FOLDER_CATEGORY_MAP[folderName]
        || FOLDER_CATEGORY_MAP[parentFolder]
        || 'Other';

      log('info', '── Processing folder: ' + folderPath + ' → ' + category);

      // Get all assets in this folder
      const resources = await fetchFolderAssets(folderPath);

      if (resources.length === 0) {
        log('warn', 'No images found in: ' + folderPath);
        continue;
      }

      const assetName = folderName;

      // Skip if already exists
      if (existingNames.has(assetName.toLowerCase().trim())) {
        log('warn', 'Skip (exists): ' + assetName);
        totalSkip++;
        continue;
      }

      // Sort by created_at — first = main image
      resources.sort(function (a, b) {
        return new Date(a.created_at) - new Date(b.created_at);
      });

      // Validate image types
      const validTypes = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'];
      const validResources = resources.filter(function (r) {
        const fmt = (r.format || '').toLowerCase();
        const isValid = validTypes.includes(fmt);
        if (!isValid) {
          log('warn', 'Skip file (unsupported type: ' + fmt + '): ' + r.public_id);
        }
        return isValid;
      });

      if (validResources.length === 0) {
        log('warn', 'No valid images in: ' + folderPath);
        totalSkip++;
        continue;
      }

      const mainImage = validResources[0];
      const galleryImages = validResources.slice(1);

      const mainUrl = mainImage.secure_url;
      const galleryUrls = galleryImages.map(function (r) { return r.secure_url; });

      const ok = await importAsset(assetName, category, mainUrl, galleryUrls);
      if (ok) totalSuccess++;
      else totalFail++;

      // Small delay to avoid rate limiting
      await new Promise(function (r) { setTimeout(r, 300); });
    }

    log('info', '── Import complete: '
      + totalSuccess + ' imported · '
      + totalSkip + ' skipped · '
      + totalFail + ' failed');

    // Refresh collection panel
    if (totalSuccess > 0 && window._collectionRefresh) {
      window._collectionRefresh();
      log('success', 'Collection panel refreshed');
    }
  }

  // ─── MODAL UI ─────────────────────────────────────────────────
  function buildModal(folders, existingNames) {
    // Remove existing modal if any
    const existing = document.getElementById('cloudinary-sync-modal');
    if (existing) existing.remove();

    // Filter to show only subfolders of Personal/Collections
    const collectionFolders = folders.filter(function (f) {
      return f.path && f.path.includes('Personal/Collections');
    });

    // Mark which are new vs existing
    const annotated = collectionFolders.map(function (f) {
      const isNew = !existingNames.has(f.name.toLowerCase().trim());
      return Object.assign({}, f, { isNew });
    });

    const modal = document.createElement('div');
    modal.id = 'cloudinary-sync-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,0.8)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:var(--font-sans,sans-serif)'
    ].join(';');

    const newCount = annotated.filter(function (f) { return f.isNew; }).length;

    modal.innerHTML = [
      '<div style="background:#0f0f22;border-radius:12px;padding:20px;width:520px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;border:1px solid #2a2a4e">',

      // Header
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">',
      '<div>',
      '<div style="font-size:13px;font-weight:500;color:#f0f0f0">Cloudinary Sync</div>',
      '<div style="font-size:10px;color:#555;margin-top:2px">' + newCount + ' new folders detected · ' + annotated.length + ' total</div>',
      '</div>',
      '<button id="sync-modal-close" style="background:transparent;border:none;color:#555;font-size:18px;cursor:pointer">✕</button>',
      '</div>',

      // Folder list
      '<div style="flex:1;overflow-y:auto;margin-bottom:12px;border:.5px solid #1e1e3a;border-radius:8px">',
      annotated.map(function (f) {
        const tagColor = f.isNew ? '#1d9e75' : '#555';
        const tagText = f.isNew ? 'NEW' : 'exists';
        const tagBg = f.isNew ? '#1d9e7522' : '#33333322';
        return [
          '<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:.5px solid #1a1a3e;cursor:pointer">',
          '<input type="checkbox" value="' + f.path + '" ' + (f.isNew ? 'checked' : '') + ' style="accent-color:#f0c040">',
          '<div style="flex:1;min-width:0">',
          '<div style="font-size:11px;color:#d0d0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + f.name + '</div>',
          '<div style="font-size:9px;color:#555">' + f.path + '</div>',
          '</div>',
          '<span style="font-size:9px;font-weight:500;padding:1px 6px;border-radius:3px;background:' + tagBg + ';color:' + tagColor + '">' + tagText + '</span>',
          '</label>'
        ].join('');
      }).join(''),
      '</div>',

      // Log area
      '<div id="sync-log" style="height:100px;overflow-y:auto;background:#06060f;border-radius:6px;padding:8px;margin-bottom:10px;border:.5px solid #1e1e3a"></div>',

      // Buttons
      '<div style="display:flex;gap:8px">',
      '<button id="sync-select-all" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:6px 12px;font-size:11px;color:#888;cursor:pointer">Select all new</button>',
      '<button id="sync-reset-log" style="background:transparent;border:.5px solid #2a2a4e;border-radius:6px;padding:6px 12px;font-size:11px;color:#888;cursor:pointer">Clear log</button>',
      '<div style="flex:1"></div>',
      '<button id="sync-run" style="background:#185fa5;border:none;border-radius:6px;padding:6px 16px;font-size:11px;color:#fff;cursor:pointer;font-weight:500">Import selected</button>',
      '</div>',

      '</div>'
    ].join('');

    document.body.appendChild(modal);

    // Wire events
    document.getElementById('sync-modal-close').onclick = function () { modal.remove(); };

    document.getElementById('sync-select-all').onclick = function () {
      modal.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        const folder = annotated.find(function (f) { return f.path === cb.value; });
        if (folder && folder.isNew) cb.checked = true;
      });
    };

    document.getElementById('sync-reset-log').onclick = function () {
      logs.length = 0;
      renderLog();
    };

    document.getElementById('sync-run').onclick = async function () {
      const checked = Array.from(modal.querySelectorAll('input[type=checkbox]:checked'))
        .map(function (cb) { return cb.value; });

      if (checked.length === 0) {
        log('warn', 'No folders selected');
        return;
      }

      const btn = document.getElementById('sync-run');
      btn.disabled = true;
      btn.textContent = 'Importing...';

      const selectedFolders = annotated.filter(function (f) {
        return checked.includes(f.path);
      });

      await runImport(selectedFolders, existingNames);

      btn.disabled = false;
      btn.textContent = 'Import selected';
    };
  }

  // ─── MAIN ENTRY POINT ─────────────────────────────────────────
  window.openCloudinarySync = async function () {
    logs.length = 0;
    log('info', 'Starting Cloudinary sync...');

    // Build temporary modal with loading state
    const loading = document.createElement('div');
    loading.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:#f0c040;font-size:13px';
    loading.textContent = 'Loading Cloudinary folders...';
    document.body.appendChild(loading);

    const [folders, existingNames] = await Promise.all([
      fetchCloudinaryFolders(),
      getExistingAssetNames()
    ]);

    loading.remove();

    if (folders.length === 0) {
      alert('Could not load Cloudinary folders. Check console for errors.');
      return;
    }

    buildModal(folders, existingNames);
  };

})();
