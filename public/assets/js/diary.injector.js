/* diary.injector.js — Diary and blog editor */

/* ─── Utility ─── */
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
let allEntries = [];
let currentEntryId = null;
let activeTypeFilter = '';
let isPreviewMode = false;
let originalState = null;    // snapshot when entry loaded — used by Cancel
let lastAssistType = null;   // last AI type clicked — routes "Use this" to correct field
let currentImageUrl = '';    // cloudinary URL for current entry
let aiPreviousContent = null; // stored for undo after Apply & Replace

/* ─── Show/hide context-sensitive buttons ─── */
function setEditorButtons(hasExisting) {
  ['cancel-changes-btn', 'save-as-btn', 'delete-entry-btn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !hasExisting);
  });
}

/* ─── Ensure Airtable entry_type choices are current (non-blocking) ─── */
function ensureDiaryTypes() {
  fetch('/api/diary/fix-types', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
}

/* ─── Concept datalist ─── */
const CONCEPT_PRESETS = [
  'obsidian', 'project-memory', 'skill-library',
  'business-idea', 'personal-growth', 'finance-concept'
];

function buildConceptDatalist() {
  var datalist = document.getElementById('concept-datalist');
  if (!datalist) return;
  var concepts = new Set(CONCEPT_PRESETS);
  allEntries.forEach(function (e) {
    if (e.fields.connected_concept) concepts.add(e.fields.connected_concept.trim());
  });
  datalist.innerHTML = Array.from(concepts).map(function (c) {
    return '<option value="' + escHtml(c) + '">';
  }).join('');
}

/* ─── Capture / restore editor state ─── */
function captureState() {
  return {
    date:         document.getElementById('entry-date')?.value || '',
    title:        document.getElementById('entry-title')?.value || '',
    content:      document.getElementById('entry-content')?.value || '',
    type:         document.getElementById('entry-type')?.value || 'Story',
    tags:         document.getElementById('entry-tags')?.value || '',
    concept:      document.getElementById('entry-concept')?.value || '',
    publishToWeb: document.getElementById('publish-toggle')?.checked || false,
    imageUrl:     currentImageUrl
  };
}

function restoreState(state) {
  if (!state) return;
  var map = {
    'entry-date': state.date, 'entry-title': state.title,
    'entry-content': state.content, 'entry-tags': state.tags,
    'entry-concept': state.concept
  };
  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = map[id];
  });
  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) { typeSelect.value = state.type; toggleBlogSection(state.type === 'Blog'); }
  var pub = document.getElementById('publish-toggle');
  if (pub) pub.checked = state.publishToWeb;
  currentImageUrl = state.imageUrl || '';
  updateImageDisplay();
  if (isPreviewMode) setEditMode();
}

function updateImageDisplay() {
  var wrap = document.getElementById('entry-image-wrap');
  var img  = document.getElementById('entry-image');
  if (!wrap || !img) return;
  if (currentImageUrl) {
    img.src = currentImageUrl;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

/* ─── AI comparison panel helpers ─── */
function showAiComparison(aiText) {
  const panel   = document.getElementById('ai-comparison-panel');
  const textEl  = document.getElementById('ai-comp-text');
  if (!panel || !textEl) return;
  textEl.textContent = aiText;
  panel.classList.remove('hidden');
}

function hideAiComparison() {
  const panel = document.getElementById('ai-comparison-panel');
  if (panel) panel.classList.add('hidden');
}

function clearAiUndo() {
  aiPreviousContent = null;
  const undoBtn = document.getElementById('ai-undo-btn');
  if (undoBtn) undoBtn.classList.add('hidden');
}

/* ─── Cancel: revert to last saved state ─── */
function cancelChanges() {
  if (originalState) {
    restoreState(originalState);
    showFlash('Changes reverted');
  } else {
    clearEditor();
  }
}

/* ─── Load entry list ─── */
async function loadEntryList() {
  var container = document.getElementById('diary-entry-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.45">Loading…</div>';
  try {
    var res = await api('/api/diary');
    if (!res.ok) throw new Error('Failed to load entries');
    var data = await res.json();
    allEntries = data.records || [];
    allEntries.sort(function (a, b) {
      return (b.fields.date || '') > (a.fields.date || '') ? 1 : -1;
    });
    renderEntryList(allEntries);
    buildConceptDatalist();
  } catch (e) {
    container.innerHTML = '<p style="color:#ef4444;padding:1rem">Error: ' + e.message + '</p>';
  }
}

function renderEntryList(entries) {
  var container = document.getElementById('diary-entry-list');
  if (!container) return;
  var search = (document.getElementById('diary-search')?.value || '').toLowerCase().trim();
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

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.45">' +
      (search || activeTypeFilter ? 'No matching entries' : 'No entries yet. Create one!') + '</div>';
    return;
  }

  var typeColors = { Story:'#8b5cf6', Blog:'#22c55e', Idea:'#f59e0b', Project:'#3b82f6', Skill:'#06b6d4' };

  container.innerHTML = filtered.map(function (entry) {
    var f = entry.fields;
    var color = typeColors[f.entry_type] || '#94a3b8';
    var isActive = entry.id === currentEntryId;
    var preview = (f.content || '').replace(/<[^>]*>/g, '').substring(0, 80);
    return '<div class="diary-entry-item' + (isActive ? ' active' : '') + '" data-id="' + entry.id + '"' +
      ' style="padding:0.7rem 0.85rem;border-radius:8px;cursor:pointer;margin-bottom:0.35rem;' +
      'border:1px solid ' + (isActive ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.04)') + ';' +
      'background:' + (isActive ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)') + '">' +
      '<div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.25rem">' +
      '<span style="background:' + color + '22;color:' + color + ';padding:0.1rem 0.45rem;border-radius:4px;font-size:0.68rem;font-weight:600">' + escHtml(f.entry_type || 'Story') + '</span>' +
      '<span style="font-size:0.72rem;color:rgba(255,255,255,0.4)">' + (f.date || '') + '</span>' +
      (f.publish_to_web ? '<span style="font-size:0.65rem;background:rgba(34,197,94,0.15);color:#22c55e;padding:0.1rem 0.3rem;border-radius:3px">Web</span>' : '') +
      '</div>' +
      '<div style="font-weight:500;font-size:0.86rem;margin-bottom:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(f.title || 'Untitled') + '</div>' +
      (preview ? '<div style="font-size:0.76rem;opacity:0.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(preview) + '</div>' : '') +
      '</div>';
  }).join('');

  container.querySelectorAll('.diary-entry-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var entry = allEntries.find(function (e) { return e.id === item.dataset.id; });
      if (entry) loadEntryInEditor(entry);
    });
  });
}

/* ─── Load entry in editor ─── */
function loadEntryInEditor(entry) {
  currentEntryId = entry.id;
  var f = entry.fields;
  currentImageUrl = f.cloudinary_image_url || '';

  var map = {
    'entry-date': f.date || '', 'entry-title': f.title || '',
    'entry-content': f.content || '', 'entry-tags': f.tags || '',
    'entry-concept': f.connected_concept || ''
  };
  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = map[id];
  });

  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) { typeSelect.value = f.entry_type || 'Story'; toggleBlogSection(f.entry_type === 'Blog'); }

  var pub = document.getElementById('publish-toggle');
  if (pub) pub.checked = !!f.publish_to_web;

  updateImageDisplay();
  originalState = captureState();   // snapshot for Cancel
  setEditorButtons(true);
  if (isPreviewMode) setEditMode();
  renderEntryList(allEntries);
}

/* ─── Clear editor (new entry) ─── */
function clearEditor() {
  currentEntryId = null;
  originalState = null;
  currentImageUrl = '';
  clearAiUndo();
  hideAiComparison();

  ['entry-date', 'entry-title', 'entry-content', 'entry-tags', 'entry-concept'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = id === 'entry-date' ? todayIso() : '';
  });

  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) typeSelect.value = 'Story';
  toggleBlogSection(false);

  var pub = document.getElementById('publish-toggle');
  if (pub) pub.checked = false;

  updateImageDisplay();
  setEditorButtons(false);
  if (isPreviewMode) setEditMode();
  renderEntryList(allEntries);

  setTimeout(function () {
    var t = document.getElementById('entry-title');
    if (t) t.focus();
  }, 50);
}

/* ─── Blog section toggle ─── */
function toggleBlogSection(show) {
  var s = document.getElementById('blog-publish-section');
  if (s) s.style.display = show ? 'block' : 'none';
}

/* ─── Edit / Preview segmented toggle ─── */
function setEditMode() {
  isPreviewMode = false;
  var contentEl = document.getElementById('entry-content');
  var previewEl = document.getElementById('entry-preview');
  if (contentEl) contentEl.style.display = '';
  if (previewEl) previewEl.style.display = 'none';
  var eb = document.getElementById('edit-mode-btn');
  var pb = document.getElementById('preview-mode-btn');
  if (eb) eb.classList.add('seg-active');
  if (pb) pb.classList.remove('seg-active');
}

function setPreviewMode() {
  isPreviewMode = true;
  var contentEl = document.getElementById('entry-content');
  var previewEl = document.getElementById('entry-preview');
  if (previewEl && contentEl) {
    previewEl.innerHTML = contentEl.value
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    previewEl.style.display = 'block';
  }
  if (contentEl) contentEl.style.display = 'none';
  var eb = document.getElementById('edit-mode-btn');
  var pb = document.getElementById('preview-mode-btn');
  if (eb) eb.classList.remove('seg-active');
  if (pb) pb.classList.add('seg-active');
}

/* ─── Save entry ─── */
async function saveEntry() {
  var saveBtn = document.getElementById('save-entry-btn');
  var date      = document.getElementById('entry-date')?.value;
  var title     = document.getElementById('entry-title')?.value;
  var content   = document.getElementById('entry-content')?.value;
  var entryType = document.getElementById('entry-type')?.value || 'Story';
  var tags      = document.getElementById('entry-tags')?.value || '';
  var concept   = document.getElementById('entry-concept')?.value || '';
  var pubWeb    = document.getElementById('publish-toggle')?.checked || false;

  if (!title) { showFlash('Title is required', 'error'); return; }
  if (!date)  { showFlash('Date is required', 'error'); return; }
  if (saveBtn) saveBtn.disabled = true;

  var body = {
    date, title, content: content || '', entry_type: entryType,
    tags: tags || undefined, connected_concept: concept || undefined,
    publish_to_web: entryType === 'Blog' ? pubWeb : undefined,
    cloudinary_image_url: currentImageUrl || undefined
  };
  Object.keys(body).forEach(function (k) { if (body[k] === undefined) delete body[k]; });

  try {
    var res = currentEntryId
      ? await api('/api/diary/' + currentEntryId, { method: 'PATCH', body: JSON.stringify(body) })
      : await api('/api/diary', { method: 'POST', body: JSON.stringify(body) });

    if (res.ok) {
      var data = await res.json();
      showFlash(currentEntryId ? 'Updated!' : 'Saved!');
      if (!currentEntryId && data.record) currentEntryId = data.record.id || data.id;
      originalState = captureState();     // refresh snapshot after successful save
      setEditorButtons(!!currentEntryId);
      clearAiUndo();
      hideAiComparison();
      await loadEntryList();
    } else {
      var d = await res.json().catch(function () { return {}; });
      showFlash(d.error || 'Save failed', 'error');
    }
  } catch (e) {
    showFlash('Error: ' + e.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/* ─── Save As: create new entry from current content ─── */
async function saveAs() {
  var savedId = currentEntryId;
  currentEntryId = null;           // force POST
  await saveEntry();
  if (!currentEntryId) currentEntryId = savedId;  // restore on failure
}

/* ─── Delete entry ─── */
async function deleteEntry() {
  if (!currentEntryId) return;
  var title = document.getElementById('entry-title')?.value || 'this entry';
  if (!confirm('Permanently delete "' + title + '"?\nThis cannot be undone.')) return;

  try {
    var res = await api('/api/diary/' + currentEntryId, { method: 'DELETE' });
    if (res.ok) {
      showFlash('Deleted');
      clearEditor();
      await loadEntryList();
    } else {
      var d = await res.json().catch(function () { return {}; });
      showFlash(d.error || 'Delete failed', 'error');
    }
  } catch (e) {
    showFlash('Error: ' + e.message, 'error');
  }
}

/* ─── Image upload via Cloudinary ─── */
async function uploadEntryImage(file) {
  var status = document.getElementById('upload-image-status');
  if (status) status.textContent = '⏳ Uploading…';

  var formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'diary/' + new Date().getFullYear());

  var res = await fetch('/api/upload-image', { method: 'POST', credentials: 'same-origin', body: formData });
  if (!res.ok) { if (status) status.textContent = ''; throw new Error('Upload failed ' + res.status); }
  var data = await res.json();
  if (status) status.textContent = '';
  return data.url || data.secure_url || '';
}

/* ─── AI Assist: SSE streaming ─── */
async function streamAiAssist(prompt) {
  var output  = document.getElementById('ai-assist-output');
  var loading = document.getElementById('ai-loading');
  if (!output) return '';
  output.textContent = '';
  if (loading) loading.style.display = 'block';

  var fullText = '';
  try {
    var res = await fetch('/api/ai-chat', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role:'user', content: prompt }], session_id: 'diary-' + Date.now(), context_json: '' })
    });

    if (!res.ok || !res.body) {
      output.textContent = 'AI error ' + res.status + '. Check your Anthropic credit balance.';
      if (loading) loading.style.display = 'none';
      return '';
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      decoder.decode(chunk.value, { stream: true }).split('\n').forEach(function (line) {
        if (!line.startsWith('data: ')) return;
        var raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try {
          var p = JSON.parse(raw);
          if (p.type === 'content_block_delta' && p.delta?.text) { fullText += p.delta.text; output.textContent = fullText; }
        } catch (e) {}
      });
    }
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
  }

  if (loading) loading.style.display = 'none';
  return fullText;
}

function getAssistPrompt(type, content) {
  var p = {
    refine:    'Refine and improve this writing, keeping my voice. No new headers/bullets unless already present:\n\n' + content,
    expand:    'Expand this idea with more depth and detail. Keep the same voice:\n\n' + content,
    summarize: 'Summarize in 2-3 concise sentences:\n\n' + content,
    tags:      'Suggest 5-8 relevant tags. Return only a comma-separated list, no # symbols, no explanation:\n\n' + content
  };
  return p[type] || p.refine;
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  ensureDiaryTypes();
  loadEntryList();

  /* toolbar buttons */
  var btnMap = {
    'new-entry-btn':      clearEditor,
    'save-entry-btn':     saveEntry,
    'save-as-btn':        saveAs,
    'cancel-changes-btn': cancelChanges,
    'delete-entry-btn':   deleteEntry,
    'edit-mode-btn':      setEditMode,
    'preview-mode-btn':   setPreviewMode
  };
  Object.keys(btnMap).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', btnMap[id]);
  });

  /* search */
  var searchInput = document.getElementById('diary-search');
  if (searchInput) searchInput.addEventListener('input', function () { renderEntryList(allEntries); });

  /* type filter chips */
  var filterBtns = document.querySelectorAll('#type-filters [data-type]');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.type;
      activeTypeFilter = (activeTypeFilter === f && f !== '') ? '' : f;
      filterBtns.forEach(function (b) {
        b.className = 'badge ' + (b.dataset.type === activeTypeFilter ? 'badge-primary' : 'badge-gray');
      });
      renderEntryList(allEntries);
    });
  });

  /* type select → blog section */
  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) typeSelect.addEventListener('change', function () { toggleBlogSection(typeSelect.value === 'Blog'); });

  /* image upload */
  var imageFile = document.getElementById('entry-image-file');
  if (imageFile) {
    imageFile.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      try {
        currentImageUrl = await uploadEntryImage(file);
        updateImageDisplay();
        showFlash('Image uploaded!');
      } catch (e) {
        showFlash('Upload failed: ' + e.message, 'error');
      }
      this.value = '';
    });
  }

  var removeImg = document.getElementById('remove-image-btn');
  if (removeImg) removeImg.addEventListener('click', function () { currentImageUrl = ''; updateImageDisplay(); });

  /* AI Assist modal */
  var aiModal     = document.getElementById('ai-assist-modal');
  var useResultBtn = document.getElementById('ai-use-result');

  function updateUseLabel() {
    if (useResultBtn) useResultBtn.textContent = lastAssistType === 'tags' ? 'Use as Tags ↑' : 'Use in Content ↑';
  }

  function openAiModal() {
    if (!aiModal) return;
    aiModal.classList.remove('hidden');
    lastAssistType = null;
    updateUseLabel();
    var out = document.getElementById('ai-assist-output');
    if (out) out.textContent = 'Choose a mode above to get AI suggestions…';
    var ld = document.getElementById('ai-loading');
    if (ld) ld.style.display = 'none';
  }

  function closeAiModal() { if (aiModal) aiModal.classList.add('hidden'); }

  var aiBtn = document.getElementById('ai-assist-btn');
  if (aiBtn) aiBtn.addEventListener('click', openAiModal);
  ['ai-modal-close', 'ai-modal-close2'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', closeAiModal);
  });
  if (aiModal) aiModal.addEventListener('click', function (e) { if (e.target === aiModal) closeAiModal(); });

  /* AI assist type buttons */
  var assistBtns = document.querySelectorAll('.ai-assist-type');
  assistBtns.forEach(function (btn) {
    btn.dataset.originalText = btn.textContent;
    btn.addEventListener('click', async function () {
      var type    = btn.dataset.assist;
      var content = document.getElementById('entry-content')?.value || '';
      if (!content.trim()) { showFlash('Write some content first', 'error'); return; }
      assistBtns.forEach(function (b) { b.disabled = true; });
      btn.textContent = '⏳ Working…';
      lastAssistType = type;
      updateUseLabel();
      await streamAiAssist(getAssistPrompt(type, content));
      btn.textContent = btn.dataset.originalText;
      assistBtns.forEach(function (b) { b.disabled = false; });
    });
  });

  /* "Use this" — tags: apply directly; content: show comparison panel */
  if (useResultBtn) {
    useResultBtn.addEventListener('click', function () {
      var out         = document.getElementById('ai-assist-output');
      var placeholder = 'Choose a mode above to get AI suggestions…';
      if (!out || !out.textContent || out.textContent === placeholder) {
        showFlash('No AI output to use yet', 'error');
        return;
      }
      if (lastAssistType === 'tags') {
        var tagsEl = document.getElementById('entry-tags');
        if (tagsEl) { tagsEl.value = out.textContent.trim(); closeAiModal(); showFlash('Tags applied!'); }
      } else {
        // Show comparison panel instead of replacing directly
        var aiText = out.textContent.trim();
        closeAiModal();
        showAiComparison(aiText);
        if (isPreviewMode) setEditMode();
      }
    });
  }

  /* AI comparison panel buttons */
  document.getElementById('ai-comp-dismiss')?.addEventListener('click', function () {
    hideAiComparison();
  });

  document.getElementById('ai-comp-keep')?.addEventListener('click', function () {
    hideAiComparison();
    showFlash('Original kept');
  });

  document.getElementById('ai-comp-replace')?.addEventListener('click', function () {
    var contentEl = document.getElementById('entry-content');
    var compText  = document.getElementById('ai-comp-text');
    if (!contentEl || !compText) return;
    aiPreviousContent = contentEl.value;
    contentEl.value = compText.textContent;
    hideAiComparison();
    // Show undo button
    var undoBtn = document.getElementById('ai-undo-btn');
    if (undoBtn) undoBtn.classList.remove('hidden');
    showFlash('Applied to content!');
  });

  document.getElementById('ai-comp-append')?.addEventListener('click', function () {
    var contentEl = document.getElementById('entry-content');
    var compText  = document.getElementById('ai-comp-text');
    if (!contentEl || !compText) return;
    var separator = contentEl.value.trim() ? '\n\n---\n\n' : '';
    contentEl.value = contentEl.value + separator + compText.textContent;
    hideAiComparison();
    showFlash('Appended to content!');
  });

  /* Undo button — shown only after Apply & Replace */
  document.getElementById('ai-undo-btn')?.addEventListener('click', function () {
    var contentEl = document.getElementById('entry-content');
    if (!contentEl || aiPreviousContent === null) return;
    contentEl.value = aiPreviousContent;
    clearAiUndo();
    showFlash('Content restored');
  });

  setEditMode();
  clearEditor();
});
