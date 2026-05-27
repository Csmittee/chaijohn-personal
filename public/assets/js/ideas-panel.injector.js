/* ideas-panel.injector.js — M3.2 Ideas panel: full redesign */

(function () {
  'use strict';

  /* ─── State ─── */
  var allEntries       = [];
  var currentEntryId   = null;
  var activeTypeFilter = '';
  var isPreviewMode    = false;
  var originalState    = null;
  var currentImageUrl  = '';
  var aiPreviousContent = null;
  var initialized      = false;
  var paneLastType     = null;
  var pinnedIds        = [];   // entry IDs pinned to top of list

  var TYPE_COLORS = {
    Story:   '#8b5cf6',
    Blog:    '#22c55e',
    Idea:    '#f59e0b',
    Project: '#3b82f6',
    Skill:   '#06b6d4',
    Memo:    '#94a3b8'
  };

  var SHOW_DIST_TYPES = ['Blog', 'Idea', 'Story', 'Project'];

  /* ─── Lazy init via panelactivated ─── */
  window.addEventListener('panelactivated', function (e) {
    if (e.detail === 'ideas') init();
  });

  /* ────────────────────────────────────────────
     UTILITY
  ──────────────────────────────────────────── */

  function api(path, options) {
    options = options || {};
    return fetch(path, Object.assign({}, options, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
      credentials: 'same-origin'
    })).then(function (res) {
      if (res.status === 401) { window.location.href = '/index.html'; throw new Error('Unauthorized'); }
      return res;
    });
  }

  function showFlash(msg, type) {
    type = type || 'success';
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;' +
      'background:' + (type === 'success' ? '#22c55e' : '#ef4444') + ';color:white;font-weight:500;z-index:9999;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayIso() {
    return new Date().toISOString().split('T')[0];
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* ────────────────────────────────────────────
     CONCEPT DATALIST
  ──────────────────────────────────────────── */

  var CONCEPT_PRESETS = [
    'obsidian', 'project-memory', 'skill-library',
    'business-idea', 'personal-growth', 'finance-concept'
  ];

  function buildConceptDatalist() {
    var datalist = el('ideas-concept-datalist');
    if (!datalist) return;
    var concepts = new Set(CONCEPT_PRESETS);
    allEntries.forEach(function (e) {
      if (e.fields.connected_concept) concepts.add(e.fields.connected_concept.trim());
    });
    datalist.innerHTML = Array.from(concepts).map(function (c) {
      return '<option value="' + escHtml(c) + '">';
    }).join('');
  }

  /* ────────────────────────────────────────────
     TYPE COUNTS
  ──────────────────────────────────────────── */

  function updateTypeCounts() {
    var counts = {};
    allEntries.forEach(function (e) {
      var t = e.fields.entry_type || 'Story';
      counts[t] = (counts[t] || 0) + 1;
    });
    var total = allEntries.length;
    document.querySelectorAll('#ideas-type-filters [data-type]').forEach(function (btn) {
      var type = btn.dataset.type;
      if (type === '') {
        btn.textContent = 'All (' + total + ')';
      } else {
        var n = counts[type] || 0;
        btn.textContent = type + (n > 0 ? ' (' + n + ')' : '');
      }
    });

    var kpiTotal = el('ideas-kpi-total');
    if (kpiTotal) kpiTotal.textContent = total;

    var now = new Date();
    var mo1Start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    var mo6Start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    var dist1 = allEntries.filter(function (e) {
      return e.fields.publish_to_web && (e.fields.date || '') >= mo1Start;
    }).length;
    var dist6 = allEntries.filter(function (e) {
      return e.fields.publish_to_web && (e.fields.date || '') >= mo6Start;
    }).length;
    var kpi1 = el('ideas-kpi-dist1'); if (kpi1) kpi1.textContent = dist1;
    var kpi6 = el('ideas-kpi-dist6'); if (kpi6) kpi6.textContent = dist6;
  }

  /* ────────────────────────────────────────────
     LOAD ENTRY LIST
  ──────────────────────────────────────────── */

  function loadEntryList() {
    var container = el('ideas-entry-list');
    if (!container) return Promise.resolve();
    container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.45">Loading…</div>';
    return api('/api/diary').then(function (res) {
      if (!res.ok) throw new Error('Failed to load entries');
      return res.json();
    }).then(function (data) {
      allEntries = data.records || [];
      allEntries.sort(function (a, b) {
        return (b.fields.date || '') > (a.fields.date || '') ? 1 : -1;
      });
      renderEntryList(allEntries);
      updateTypeCounts();
      buildConceptDatalist();
    }).catch(function (e) {
      if (container) {
        container.innerHTML = '<p style="color:#ef4444;padding:1rem">Error: ' + escHtml(e.message) + '</p>';
      }
    });
  }

  /* ────────────────────────────────────────────
     RENDER ENTRY LIST (with pinned + 3-dot menu)
  ──────────────────────────────────────────── */

  function renderEntryList(entries) {
    var container = el('ideas-entry-list');
    if (!container) return;
    var searchEl = el('ideas-search');
    var search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    var filtered = entries;

    if (activeTypeFilter) {
      filtered = filtered.filter(function (e) {
        return (e.fields.entry_type || '').toLowerCase() === activeTypeFilter.toLowerCase();
      });
    }
    if (search) {
      filtered = filtered.filter(function (e) {
        var f = e.fields;
        return (f.title || '').toLowerCase().includes(search) ||
          (f.content || '').toLowerCase().includes(search) ||
          (f.tags || '').toLowerCase().includes(search);
      });
    }

    /* Pinned entries first */
    filtered.sort(function (a, b) {
      var aPinned = pinnedIds.indexOf(a.id) !== -1;
      var bPinned = pinnedIds.indexOf(b.id) !== -1;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.45">' +
        (search || activeTypeFilter ? 'No matching entries.' : 'No entries yet. Create one!') + '</div>';
      return;
    }

    container.innerHTML = filtered.map(function (entry) {
      var f = entry.fields;
      var color    = TYPE_COLORS[f.entry_type] || '#94a3b8';
      var isActive = entry.id === currentEntryId;
      var isPinned = pinnedIds.indexOf(entry.id) !== -1;
      var preview  = (f.content || '').replace(/<[^>]*>/g, '').substring(0, 80);
      var thumb    = f.cloudinary_image_url
        ? '<img src="' + escHtml(f.cloudinary_image_url) + '" alt="" ' +
          'style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0">'
        : '';

      return '<div class="ideas-entry-item' + (isActive ? ' active' : '') + '" data-id="' + entry.id + '"' +
        ' style="position:relative;padding:0.6rem 0.75rem;border-radius:8px;cursor:pointer;margin-bottom:0.3rem;' +
        'border:1px solid ' + (isActive ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.04)') + ';' +
        'background:' + (isActive ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)') + ';' +
        'display:flex;align-items:flex-start;gap:0.45rem">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;margin-bottom:0.2rem">' +
        '<span style="background:' + color + '22;color:' + color + ';padding:0.08rem 0.4rem;border-radius:4px;font-size:0.67rem;font-weight:600">' +
          escHtml(f.entry_type || 'Story') + '</span>' +
        '<span style="font-size:0.7rem;color:rgba(255,255,255,0.4)">' + escHtml(f.date || '') + '</span>' +
        (isPinned ? '<span style="font-size:0.62rem;color:var(--text-dim)">📌</span>' : '') +
        (f.publish_to_web
          ? '<span style="font-size:0.62rem;background:rgba(34,197,94,0.15);color:#22c55e;padding:0.08rem 0.28rem;border-radius:3px">Web</span>'
          : '') +
        '</div>' +
        '<div style="font-weight:500;font-size:0.84rem;margin-bottom:0.12rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          escHtml(f.title || 'Untitled') + '</div>' +
        (preview ? '<div style="font-size:0.74rem;opacity:0.42;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          escHtml(preview) + '</div>' : '') +
        '</div>' +
        (thumb ? '<div style="flex-shrink:0">' + thumb + '</div>' : '') +
        /* 3-dot menu button */
        '<div class="ideas-entry-dot-menu">' +
          '<button class="ideas-dot-btn" data-entry-id="' + entry.id + '"' +
            ' style="background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0.1rem 0.25rem;font-size:0.9rem;line-height:1;border-radius:4px;" title="More">⋯</button>' +
          '<div class="ideas-entry-dot-dropdown" data-dropdown-id="' + entry.id + '">' +
            '<button class="ideas-entry-dot-option" data-pin-id="' + entry.id + '">' +
              (isPinned ? '📌 Unpin' : '📌 Pin to top') + '</button>' +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    /* Wire click: entry select */
    container.querySelectorAll('.ideas-entry-item').forEach(function (item) {
      item.addEventListener('click', function (evt) {
        /* Ignore clicks on dot menu */
        if (evt.target.closest('.ideas-entry-dot-menu')) return;
        var entry = allEntries.find(function (e) { return e.id === item.dataset.id; });
        if (entry) loadEntryInEditor(entry);
      });
    });

    /* Wire 3-dot menu open/close */
    container.querySelectorAll('.ideas-dot-btn').forEach(function (btn) {
      btn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        var id = btn.dataset.entryId;
        /* Close all others */
        container.querySelectorAll('.ideas-entry-dot-dropdown').forEach(function (d) {
          if (d.dataset.dropdownId !== id) d.classList.remove('open');
        });
        var dropdown = container.querySelector('.ideas-entry-dot-dropdown[data-dropdown-id="' + id + '"]');
        if (dropdown) dropdown.classList.toggle('open');
      });
    });

    /* Wire pin action */
    container.querySelectorAll('[data-pin-id]').forEach(function (btn) {
      btn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        var id = btn.dataset.pinId;
        var idx = pinnedIds.indexOf(id);
        if (idx === -1) {
          pinnedIds.push(id);
        } else {
          pinnedIds.splice(idx, 1);
        }
        renderEntryList(allEntries);
      });
    });

    /* Close dropdowns on outside click */
    document.addEventListener('click', function () {
      container.querySelectorAll('.ideas-entry-dot-dropdown.open').forEach(function (d) {
        d.classList.remove('open');
      });
    }, { once: false, capture: true });
  }

  /* ────────────────────────────────────────────
     LOAD ENTRY IN EDITOR
  ──────────────────────────────────────────── */

  function loadEntryInEditor(entry) {
    currentEntryId  = entry.id;
    var f           = entry.fields;
    currentImageUrl = f.cloudinary_image_url || '';

    var fieldMap = {
      'ideas-date':    f.date || '',
      'ideas-title':   f.title || '',
      'ideas-content': f.content || '',
      'ideas-tags':    f.tags || '',
      'ideas-concept': f.connected_concept || ''
    };
    Object.keys(fieldMap).forEach(function (id) {
      var node = el(id);
      if (node) node.value = fieldMap[id];
    });

    var typeSelect = el('ideas-type');
    if (typeSelect) typeSelect.value = f.entry_type || 'Story';

    var pub = el('ideas-publish-toggle');
    if (pub) pub.checked = !!f.publish_to_web;

    toggleBlogSection(f.entry_type === 'Blog');
    toggleDistSection(f.entry_type || 'Story');
    updateImageDisplay();
    originalState = captureState();
    setEditorButtons(true);
    if (isPreviewMode) setEditMode();
    /* Switch to Write tab to show the entry */
    showWritePane();
    renderEntryList(allEntries);
  }

  /* ────────────────────────────────────────────
     CLEAR EDITOR
  ──────────────────────────────────────────── */

  function clearEditor() {
    currentEntryId  = null;
    originalState   = null;
    currentImageUrl = '';
    clearAiUndo();
    hideAiComparison();

    ['ideas-date', 'ideas-title', 'ideas-content', 'ideas-tags', 'ideas-concept'].forEach(function (id) {
      var node = el(id);
      if (node) node.value = (id === 'ideas-date') ? todayIso() : '';
    });

    var typeSelect = el('ideas-type');
    if (typeSelect) typeSelect.value = 'Story';

    var pub = el('ideas-publish-toggle');
    if (pub) pub.checked = false;

    toggleBlogSection(false);
    toggleDistSection('Story');
    updateImageDisplay();
    setEditorButtons(false);
    if (isPreviewMode) setEditMode();
    showWritePane();
    renderEntryList(allEntries);

    setTimeout(function () {
      var titleEl = el('ideas-title');
      if (titleEl) titleEl.focus();
    }, 50);
  }

  /* ────────────────────────────────────────────
     WRITE / AI PANE SWITCHING
  ──────────────────────────────────────────── */

  function showWritePane() {
    var writePane = el('ideas-write-pane');
    var aiPane    = el('ideas-ai-pane');
    var writeTab  = el('ideas-write-tab');
    var aiTab     = el('ideas-ai-tab');
    var prevWrap  = el('ideas-preview-toggle-wrap');
    if (writePane) writePane.style.display = '';
    if (aiPane)    aiPane.style.display    = 'none';
    if (writeTab)  writeTab.classList.add('active');
    if (aiTab)     aiTab.classList.remove('active');
    if (prevWrap)  prevWrap.style.display  = '';
  }

  function showAiPane() {
    var writePane = el('ideas-write-pane');
    var aiPane    = el('ideas-ai-pane');
    var writeTab  = el('ideas-write-tab');
    var aiTab     = el('ideas-ai-tab');
    var prevWrap  = el('ideas-preview-toggle-wrap');
    if (writePane) writePane.style.display = 'none';
    if (aiPane)    aiPane.style.display    = '';
    if (writeTab)  writeTab.classList.remove('active');
    if (aiTab)     aiTab.classList.add('active');
    if (prevWrap)  prevWrap.style.display  = 'none';
  }

  /* ────────────────────────────────────────────
     CAPTURE / RESTORE STATE
  ──────────────────────────────────────────── */

  function captureState() {
    return {
      date:         el('ideas-date')            ? el('ideas-date').value            : '',
      title:        el('ideas-title')           ? el('ideas-title').value           : '',
      content:      el('ideas-content')         ? el('ideas-content').value         : '',
      type:         el('ideas-type')            ? el('ideas-type').value            : 'Story',
      tags:         el('ideas-tags')            ? el('ideas-tags').value            : '',
      concept:      el('ideas-concept')         ? el('ideas-concept').value         : '',
      publishToWeb: el('ideas-publish-toggle')  ? el('ideas-publish-toggle').checked : false,
      imageUrl:     currentImageUrl
    };
  }

  function restoreState(state) {
    if (!state) return;
    var fieldMap = {
      'ideas-date':    state.date,
      'ideas-title':   state.title,
      'ideas-content': state.content,
      'ideas-tags':    state.tags,
      'ideas-concept': state.concept
    };
    Object.keys(fieldMap).forEach(function (id) {
      var node = el(id);
      if (node) node.value = fieldMap[id];
    });

    var typeSelect = el('ideas-type');
    if (typeSelect) typeSelect.value = state.type;

    var pub = el('ideas-publish-toggle');
    if (pub) pub.checked = state.publishToWeb;

    toggleBlogSection(state.type === 'Blog');
    toggleDistSection(state.type);

    currentImageUrl = state.imageUrl || '';
    updateImageDisplay();

    if (isPreviewMode) setEditMode();
  }

  /* ────────────────────────────────────────────
     SECTION VISIBILITY TOGGLES
  ──────────────────────────────────────────── */

  function toggleBlogSection(show) {
    var sec = el('ideas-blog-section');
    if (sec) sec.style.display = show ? 'block' : 'none';
  }

  function toggleDistSection(type) {
    var distSec = el('ideas-dist-section');
    if (!distSec) return;
    var show = SHOW_DIST_TYPES.indexOf(type) !== -1;
    distSec.style.display = show ? 'block' : 'none';

    var webLink = el('ideas-dist-web');
    if (webLink) {
      var pub = el('ideas-publish-toggle');
      var isPublishedBlog = type === 'Blog' && pub && pub.checked;
      webLink.style.display = isPublishedBlog ? 'inline' : 'none';
    }
  }

  function updateImageDisplay() {
    var wrap = el('ideas-image-wrap');
    var img  = el('ideas-image');
    if (!wrap || !img) return;
    if (currentImageUrl) {
      img.src = currentImageUrl;
      wrap.style.display = 'block';
    } else {
      wrap.style.display = 'none';
    }
  }

  /* ────────────────────────────────────────────
     EDITOR BUTTON VISIBILITY
  ──────────────────────────────────────────── */

  function setEditorButtons(hasExisting) {
    ['ideas-cancel-btn', 'ideas-saveas-btn', 'ideas-delete-btn'].forEach(function (id) {
      var node = el(id);
      if (node) node.classList.toggle('hidden', !hasExisting);
    });
  }

  /* ────────────────────────────────────────────
     EDIT / PREVIEW TOGGLE
  ──────────────────────────────────────────── */

  function setEditMode() {
    isPreviewMode = false;
    var contentEl  = el('ideas-content');
    var previewEl  = el('ideas-preview');
    if (contentEl) contentEl.style.display = '';
    if (previewEl) previewEl.style.display = 'none';
    var editBtn    = el('ideas-edit-btn');
    var prevBtn    = el('ideas-preview-btn');
    if (editBtn) editBtn.classList.add('active');
    if (prevBtn) prevBtn.classList.remove('active');
  }

  function setPreviewMode() {
    isPreviewMode = true;
    var contentEl = el('ideas-content');
    var previewEl = el('ideas-preview');
    if (previewEl && contentEl) {
      previewEl.innerHTML = (contentEl.value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      previewEl.style.display = 'block';
    }
    if (contentEl) contentEl.style.display = 'none';
    var editBtn = el('ideas-edit-btn');
    var prevBtn = el('ideas-preview-btn');
    if (editBtn) editBtn.classList.remove('active');
    if (prevBtn) prevBtn.classList.add('active');
  }

  /* ────────────────────────────────────────────
     CANCEL CHANGES
  ──────────────────────────────────────────── */

  function cancelChanges() {
    if (originalState) {
      restoreState(originalState);
      showFlash('Changes reverted');
    } else {
      clearEditor();
    }
  }

  /* ────────────────────────────────────────────
     SAVE ENTRY
  ──────────────────────────────────────────── */

  function saveEntry() {
    var saveBtn   = el('ideas-save-btn');
    var date      = el('ideas-date')    ? el('ideas-date').value    : '';
    var title     = el('ideas-title')   ? el('ideas-title').value   : '';
    var content   = el('ideas-content') ? el('ideas-content').value : '';
    var entryType = el('ideas-type')    ? el('ideas-type').value    : 'Story';
    var tags      = el('ideas-tags')    ? el('ideas-tags').value    : '';
    var concept   = el('ideas-concept') ? el('ideas-concept').value : '';
    var pub       = el('ideas-publish-toggle');
    var pubWeb    = pub ? pub.checked : false;

    if (!title) { showFlash('Title is required', 'error'); return Promise.resolve(); }
    if (!date)  { showFlash('Date is required',  'error'); return Promise.resolve(); }
    if (saveBtn) saveBtn.disabled = true;

    var body = {
      date:                date,
      title:               title,
      content:             content || '',
      entry_type:          entryType,
      tags:                tags      || undefined,
      connected_concept:   concept   || undefined,
      publish_to_web:      entryType === 'Blog' ? pubWeb : undefined,
      cloudinary_image_url: currentImageUrl || undefined
    };
    Object.keys(body).forEach(function (k) { if (body[k] === undefined) delete body[k]; });

    var method = currentEntryId ? 'PATCH' : 'POST';
    var path   = currentEntryId ? '/api/diary/' + currentEntryId : '/api/diary';

    return api(path, { method: method, body: JSON.stringify(body) }).then(function (res) {
      if (res.ok) {
        return res.json().then(function (data) {
          showFlash(currentEntryId ? 'Updated!' : 'Saved!');
          if (!currentEntryId && data.record) {
            currentEntryId = data.record.id || data.id || null;
          }
          originalState = captureState();
          setEditorButtons(!!currentEntryId);
          clearAiUndo();
          hideAiComparison();
          return loadEntryList();
        });
      } else {
        return res.json().catch(function () { return {}; }).then(function (d) {
          showFlash(d.error || 'Save failed', 'error');
        });
      }
    }).catch(function (e) {
      showFlash('Error: ' + e.message, 'error');
    }).finally(function () {
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  /* ────────────────────────────────────────────
     SAVE AS (NEW COPY)
  ──────────────────────────────────────────── */

  function saveAs() {
    var savedId    = currentEntryId;
    currentEntryId = null;
    return saveEntry().then(function () {
      if (!currentEntryId) currentEntryId = savedId;
    });
  }

  /* ────────────────────────────────────────────
     DELETE ENTRY
  ──────────────────────────────────────────── */

  function deleteEntry() {
    if (!currentEntryId) return;
    var title = el('ideas-title') ? el('ideas-title').value : 'this entry';
    if (!confirm('Permanently delete "' + title + '"?\nThis cannot be undone.')) return;

    return api('/api/diary/' + currentEntryId, { method: 'DELETE' }).then(function (res) {
      if (res.ok) {
        showFlash('Deleted');
        clearEditor();
        return loadEntryList();
      } else {
        return res.json().catch(function () { return {}; }).then(function (d) {
          showFlash(d.error || 'Delete failed', 'error');
        });
      }
    }).catch(function (e) {
      showFlash('Error: ' + e.message, 'error');
    });
  }

  /* ────────────────────────────────────────────
     IMAGE UPLOAD
  ──────────────────────────────────────────── */

  function uploadEntryImage(file) {
    var status = el('ideas-img-status');
    if (status) status.textContent = 'Uploading...';

    var formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'ideas/' + new Date().getFullYear());

    return fetch('/api/upload-image', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    }).then(function (res) {
      if (!res.ok) throw new Error('Upload failed ' + res.status);
      return res.json();
    }).then(function (data) {
      if (status) status.textContent = '';
      return data.url || data.secure_url || '';
    }).catch(function (e) {
      if (status) status.textContent = '';
      throw e;
    });
  }

  /* ────────────────────────────────────────────
     AI ASSIST PROMPTS
  ──────────────────────────────────────────── */

  function getAssistPrompt(type, content) {
    var prompts = {
      refine:    'Refine and improve this writing, keeping my voice. No new headers/bullets unless already present:\n\n' + content,
      expand:    'Expand this idea with more depth and detail. Keep the same voice:\n\n' + content,
      summarize: 'Summarize in 2-3 concise sentences:\n\n' + content,
      tags:      'Suggest 5-8 relevant tags. Return only a comma-separated list, no # symbols, no explanation:\n\n' + content
    };
    return prompts[type] || prompts.refine;
  }

  /* ────────────────────────────────────────────
     AI PANE SSE STREAMING
  ──────────────────────────────────────────── */

  function streamAiPane(prompt) {
    var output  = el('ideas-ai-pane-output');
    var loading = el('ideas-ai-pane-loading');
    if (!output) return Promise.resolve('');
    output.textContent = '';
    if (loading) loading.style.display = 'block';

    var fullText = '';
    return fetch('/api/ai-chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:    [{ role: 'user', content: prompt }],
        session_id:  'ideas-pane-' + Date.now(),
        context_json: ''
      })
    }).then(function (res) {
      if (!res.ok || !res.body) {
        output.textContent = 'AI error ' + res.status + '. Check your Anthropic credit balance.';
        if (loading) loading.style.display = 'none';
        return '';
      }
      var reader  = res.body.getReader();
      var decoder = new TextDecoder();

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            if (loading) loading.style.display = 'none';
            return fullText;
          }
          decoder.decode(chunk.value, { stream: true }).split('\n').forEach(function (line) {
            if (!line.startsWith('data: ')) return;
            var raw = line.slice(6).trim();
            if (raw === '[DONE]') return;
            try {
              var p = JSON.parse(raw);
              if (p.type === 'content_block_delta' && p.delta && p.delta.text) {
                fullText += p.delta.text;
                output.textContent = fullText;
              }
            } catch (e) {}
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      if (output) output.textContent = 'Error: ' + e.message;
      if (loading) loading.style.display = 'none';
      return '';
    });
  }

  /* ────────────────────────────────────────────
     AI COMPARISON PANEL
  ──────────────────────────────────────────── */

  function showAiComparison(aiText) {
    var panel  = el('ideas-ai-comp-panel');
    var textEl = el('ideas-ai-comp-text');
    if (!panel || !textEl) return;
    textEl.textContent = aiText;
    panel.style.display = '';
    panel.classList.remove('hidden');
    /* Switch to write tab so comparison is visible */
    showWritePane();
  }

  function hideAiComparison() {
    var panel = el('ideas-ai-comp-panel');
    if (panel) { panel.classList.add('hidden'); panel.style.display = 'none'; }
  }

  function clearAiUndo() {
    aiPreviousContent = null;
    var undoBtn = el('ideas-undo-btn');
    if (undoBtn) undoBtn.classList.add('hidden');
  }

  /* ────────────────────────────────────────────
     RESIZE HANDLE
  ──────────────────────────────────────────── */

  function initResizeHandle() {
    var handle    = el('ideas-resize-handle');
    var listPanel = el('ideas-list-panel');
    if (!handle || !listPanel) return;

    var dragging = false;
    var startX   = 0;
    var startW   = 0;

    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      startX   = e.clientX;
      startW   = listPanel.offsetWidth;
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var newW = startW + (e.clientX - startX);
      newW = Math.max(160, Math.min(480, newW));
      listPanel.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (dragging) {
        dragging = false;
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
      }
    });
  }

  /* ────────────────────────────────────────────
     INIT — wires all event listeners
  ──────────────────────────────────────────── */

  function init() {
    if (initialized) return;
    initialized = true;

    loadEntryList();
    initResizeHandle();

    /* ── Write / AI tab toggle ── */
    var writeTab = el('ideas-write-tab');
    var aiTab    = el('ideas-ai-tab');
    if (writeTab) writeTab.addEventListener('click', showWritePane);
    if (aiTab)    aiTab.addEventListener('click', showAiPane);

    /* ── Toolbar / action buttons ── */
    var btnMap = {
      'ideas-new-btn':     clearEditor,
      'ideas-save-btn':    saveEntry,
      'ideas-saveas-btn':  saveAs,
      'ideas-cancel-btn':  cancelChanges,
      'ideas-delete-btn':  deleteEntry,
      'ideas-edit-btn':    setEditMode,
      'ideas-preview-btn': setPreviewMode
    };
    Object.keys(btnMap).forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener('click', btnMap[id]);
    });

    /* ── Search ── */
    var searchInput = el('ideas-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () { renderEntryList(allEntries); });
    }

    /* ── Type filter chips ── */
    var filterBtns = document.querySelectorAll('#ideas-type-filters [data-type]');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.dataset.type;
        activeTypeFilter = (activeTypeFilter === f && f !== '') ? '' : f;
        filterBtns.forEach(function (b) {
          if (b.dataset.type === activeTypeFilter) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
        renderEntryList(allEntries);
      });
    });

    /* ── Type select → show/hide blog + dist sections ── */
    var typeSelect = el('ideas-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        toggleBlogSection(typeSelect.value === 'Blog');
        toggleDistSection(typeSelect.value);
      });
    }

    /* ── Publish toggle → refresh dist section link visibility ── */
    var pubToggle = el('ideas-publish-toggle');
    if (pubToggle) {
      pubToggle.addEventListener('change', function () {
        var currentType = typeSelect ? typeSelect.value : 'Story';
        toggleDistSection(currentType);
      });
    }

    /* ── Image upload ── */
    var imageFile = el('ideas-image-file');
    if (imageFile) {
      imageFile.addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        uploadEntryImage(file).then(function (url) {
          currentImageUrl = url;
          updateImageDisplay();
          showFlash('Image uploaded!');
        }).catch(function (e) {
          showFlash('Upload failed: ' + e.message, 'error');
        });
        this.value = '';
      });
    }

    var removeImg = el('ideas-remove-img');
    if (removeImg) {
      removeImg.addEventListener('click', function () {
        currentImageUrl = '';
        updateImageDisplay();
      });
    }

    /* ── AI pane mode buttons (Refine / Expand / Summary / Tags) ── */
    var paneBtns = document.querySelectorAll('#ideas-ai-pane .ideas-ai-mode');
    paneBtns.forEach(function (btn) {
      btn.dataset.originalText = btn.textContent;
      btn.addEventListener('click', function () {
        var type    = btn.dataset.assist;
        var content = el('ideas-content') ? el('ideas-content').value : '';
        if (!content.trim()) { showFlash('Write some content first', 'error'); return; }

        paneBtns.forEach(function (b) { b.disabled = true; });
        btn.textContent = '...';
        paneLastType = type;

        var useTagsBtn = el('ideas-ai-pane-use-tags');
        if (useTagsBtn) useTagsBtn.style.display = type === 'tags' ? 'inline-block' : 'none';

        streamAiPane(getAssistPrompt(type, content)).then(function () {
          btn.textContent = btn.dataset.originalText;
          paneBtns.forEach(function (b) { b.disabled = false; });
        });
      });
    });

    /* ── AI pane — Use in Content ── */
    var useContentBtn = el('ideas-ai-pane-use-content');
    if (useContentBtn) {
      useContentBtn.addEventListener('click', function () {
        var output = el('ideas-ai-pane-output');
        if (!output || !output.textContent.trim()) {
          showFlash('No AI output yet', 'error');
          return;
        }
        showAiComparison(output.textContent.trim());
        if (isPreviewMode) setEditMode();
      });
    }

    /* ── AI pane — Append to content ── */
    var appendBtn = el('ideas-ai-pane-append');
    if (appendBtn) {
      appendBtn.addEventListener('click', function () {
        var output    = el('ideas-ai-pane-output');
        var contentEl = el('ideas-content');
        if (!output || !output.textContent.trim() || !contentEl) {
          showFlash('No AI output yet', 'error');
          return;
        }
        var sep = contentEl.value.trim() ? '\n\n---\n\n' : '';
        contentEl.value = contentEl.value + sep + output.textContent;
        showFlash('Appended!');
        showWritePane();
      });
    }

    /* ── AI pane — Use as Tags ── */
    var useTagsBtn = el('ideas-ai-pane-use-tags');
    if (useTagsBtn) {
      useTagsBtn.addEventListener('click', function () {
        var output = el('ideas-ai-pane-output');
        var tagsEl = el('ideas-tags');
        if (!output || !tagsEl) return;
        tagsEl.value = output.textContent.trim();
        showFlash('Tags applied!');
        showWritePane();
      });
    }

    /* ── AI comparison panel — Dismiss ── */
    var compDismiss = el('ideas-ai-comp-dismiss');
    if (compDismiss) {
      compDismiss.addEventListener('click', function () { hideAiComparison(); });
    }

    /* ── AI comparison panel — Keep original ── */
    var compKeep = el('ideas-ai-comp-keep');
    if (compKeep) {
      compKeep.addEventListener('click', function () {
        hideAiComparison();
        showFlash('Original kept');
      });
    }

    /* ── AI comparison panel — Apply & Replace ── */
    var compReplace = el('ideas-ai-comp-replace');
    if (compReplace) {
      compReplace.addEventListener('click', function () {
        var contentEl = el('ideas-content');
        var compText  = el('ideas-ai-comp-text');
        if (!contentEl || !compText) return;
        aiPreviousContent = contentEl.value;
        contentEl.value   = compText.textContent;
        hideAiComparison();
        var undoBtn = el('ideas-undo-btn');
        if (undoBtn) undoBtn.classList.remove('hidden');
        showFlash('Applied to content!');
      });
    }

    /* ── AI comparison panel — Append ── */
    var compAppend = el('ideas-ai-comp-append');
    if (compAppend) {
      compAppend.addEventListener('click', function () {
        var contentEl = el('ideas-content');
        var compText  = el('ideas-ai-comp-text');
        if (!contentEl || !compText) return;
        var sep = contentEl.value.trim() ? '\n\n---\n\n' : '';
        contentEl.value = contentEl.value + sep + compText.textContent;
        hideAiComparison();
        showFlash('Appended to content!');
      });
    }

    /* ── Undo AI replace ── */
    var undoBtn = el('ideas-undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        var contentEl = el('ideas-content');
        if (!contentEl || aiPreviousContent === null) return;
        contentEl.value = aiPreviousContent;
        clearAiUndo();
        showFlash('Content restored');
      });
    }

    /* ── Distribution placeholder buttons ── */
    var distSocial = el('ideas-dist-social');
    if (distSocial) {
      distSocial.addEventListener('click', function () { showFlash('Social distribution — coming soon', 'error'); });
    }
    var distProject = el('ideas-dist-project');
    if (distProject) {
      distProject.addEventListener('click', function () { showFlash('Project link — coming soon', 'error'); });
    }

    /* ── Initial editor state ── */
    setEditMode();
    clearEditor();
  }

})();
