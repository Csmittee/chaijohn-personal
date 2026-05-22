/* diary.injector.js — Diary and blog editor page logic */

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

/* ─── Fix 12: Ensure Airtable entry_type choices are current (non-blocking) ─── */
function ensureDiaryTypes() {
  fetch('/api/diary/fix-types', { method: 'POST', credentials: 'same-origin' })
    .catch(function () { /* ignore — background maintenance call */ });
}

/* ─── Fix 13: Concept datalist ─── */
const CONCEPT_PRESETS = [
  'obsidian', 'project-memory', 'skill-library',
  'business-idea', 'personal-growth', 'finance-concept'
];

function buildConceptDatalist() {
  const datalist = document.getElementById('concept-datalist');
  if (!datalist) return;
  const concepts = new Set(CONCEPT_PRESETS);
  allEntries.forEach(function (e) {
    if (e.fields.connected_concept) concepts.add(e.fields.connected_concept.trim());
  });
  datalist.innerHTML = Array.from(concepts).map(function (c) {
    return '<option value="' + escHtml(c) + '">';
  }).join('');
}

/* ─── Load entry list ─── */
async function loadEntryList() {
  const container = document.getElementById('diary-entry-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:2rem;opacity:0.45">Loading…</div>';
  try {
    const res = await api('/api/diary');
    if (!res.ok) throw new Error('Failed to load entries');
    const data = await res.json();
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
  const container = document.getElementById('diary-entry-list');
  if (!container) return;
  const search = (document.getElementById('diary-search')?.value || '').toLowerCase().trim();
  let filtered = entries;

  if (activeTypeFilter) {
    filtered = filtered.filter(function (e) {
      return (e.fields.entry_type || '').toLowerCase() === activeTypeFilter.toLowerCase();
    });
  }
  if (search) {
    filtered = filtered.filter(function (e) {
      const f = e.fields;
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

  const typeColors = {
    Story: '#8b5cf6',
    Blog: '#22c55e',
    Idea: '#f59e0b',
    Project: '#3b82f6',
    Skill: '#06b6d4'
  };

  container.innerHTML = filtered.map(function (entry) {
    const f = entry.fields;
    const color = typeColors[f.entry_type] || '#94a3b8';
    const isActive = entry.id === currentEntryId;
    const preview = (f.content || '').replace(/<[^>]*>/g, '').substring(0, 80);
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
      const entry = allEntries.find(function (e) { return e.id === item.dataset.id; });
      if (entry) loadEntryInEditor(entry);
    });
  });
}

/* ─── Load entry in editor ─── */
function loadEntryInEditor(entry) {
  currentEntryId = entry.id;
  const f = entry.fields;

  var fieldMap = {
    'entry-date': f.date || '',
    'entry-title': f.title || '',
    'entry-content': f.content || '',
    'entry-tags': f.tags || '',
    'entry-concept': f.connected_concept || ''
  };
  Object.keys(fieldMap).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = fieldMap[id];
  });

  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) {
    typeSelect.value = f.entry_type || 'Story';
    toggleBlogSection(f.entry_type === 'Blog');
  }

  var publishCheck = document.getElementById('publish-toggle');
  if (publishCheck) publishCheck.checked = !!f.publish_to_web;

  var imageWrap = document.getElementById('entry-image-wrap');
  var imageEl = document.getElementById('entry-image');
  if (imageWrap && imageEl) {
    if (f.cloudinary_image_url) {
      imageEl.src = f.cloudinary_image_url;
      imageWrap.style.display = 'block';
    } else {
      imageWrap.style.display = 'none';
    }
  }

  var deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) deleteBtn.classList.remove('hidden');

  if (isPreviewMode) setEditMode();

  renderEntryList(allEntries);
}

/* ─── Clear editor for new entry ─── */
function clearEditor() {
  currentEntryId = null;

  ['entry-date', 'entry-title', 'entry-content', 'entry-tags', 'entry-concept'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = id === 'entry-date' ? todayIso() : '';
  });

  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) typeSelect.value = 'Story';
  toggleBlogSection(false);

  var publishCheck = document.getElementById('publish-toggle');
  if (publishCheck) publishCheck.checked = false;

  var imageWrap = document.getElementById('entry-image-wrap');
  if (imageWrap) imageWrap.style.display = 'none';

  var deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) deleteBtn.classList.add('hidden');

  if (isPreviewMode) setEditMode();

  renderEntryList(allEntries);

  setTimeout(function () {
    var titleEl = document.getElementById('entry-title');
    if (titleEl) titleEl.focus();
  }, 50);
}

/* ─── Blog section visibility ─── */
function toggleBlogSection(show) {
  var section = document.getElementById('blog-publish-section');
  if (section) section.style.display = show ? 'block' : 'none';
}

/* ─── Fix 9: Edit / Preview two-button toggle ─── */
function setEditMode() {
  isPreviewMode = false;
  var contentEl = document.getElementById('entry-content');
  var previewEl = document.getElementById('entry-preview');
  var editBtn = document.getElementById('edit-mode-btn');
  var prevBtn = document.getElementById('preview-mode-btn');

  if (contentEl) contentEl.style.display = '';
  if (previewEl) previewEl.style.display = 'none';
  if (editBtn) { editBtn.classList.add('btn-primary'); editBtn.classList.remove('btn-outline'); }
  if (prevBtn) { prevBtn.classList.remove('btn-primary'); prevBtn.classList.add('btn-outline'); }
}

function setPreviewMode() {
  isPreviewMode = true;
  var contentEl = document.getElementById('entry-content');
  var previewEl = document.getElementById('entry-preview');
  var editBtn = document.getElementById('edit-mode-btn');
  var prevBtn = document.getElementById('preview-mode-btn');

  if (previewEl && contentEl) {
    var raw = contentEl.value;
    previewEl.innerHTML = raw
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    previewEl.style.display = 'block';
  }
  if (contentEl) contentEl.style.display = 'none';
  if (editBtn) { editBtn.classList.remove('btn-primary'); editBtn.classList.add('btn-outline'); }
  if (prevBtn) { prevBtn.classList.add('btn-primary'); prevBtn.classList.remove('btn-outline'); }
}

/* ─── Save entry ─── */
async function saveEntry() {
  var saveBtn = document.getElementById('save-entry-btn');
  var date = document.getElementById('entry-date')?.value;
  var title = document.getElementById('entry-title')?.value;
  var content = document.getElementById('entry-content')?.value;
  var entryType = document.getElementById('entry-type')?.value || 'Story';
  var tags = document.getElementById('entry-tags')?.value || '';
  var concept = document.getElementById('entry-concept')?.value || '';
  var publishToWeb = document.getElementById('publish-toggle')?.checked || false;

  if (!title) { showFlash('Title is required', 'error'); return; }
  if (!date) { showFlash('Date is required', 'error'); return; }

  if (saveBtn) saveBtn.disabled = true;

  var body = {
    date,
    title,
    content: content || '',
    entry_type: entryType,
    tags: tags || undefined,
    connected_concept: concept || undefined,
    publish_to_web: entryType === 'Blog' ? publishToWeb : undefined
  };
  Object.keys(body).forEach(function (k) { if (body[k] === undefined) delete body[k]; });

  try {
    var res;
    if (currentEntryId) {
      res = await api('/api/diary/' + currentEntryId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      res = await api('/api/diary', { method: 'POST', body: JSON.stringify(body) });
    }

    if (res.ok) {
      var data = await res.json();
      showFlash(currentEntryId ? 'Updated!' : 'Saved!');
      if (!currentEntryId && data.record) {
        currentEntryId = data.record.id || data.id;
      }
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

/* ─── Delete entry ─── */
async function deleteEntry() {
  if (!currentEntryId) return;
  if (!confirm('Delete this entry? This cannot be undone.')) return;

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

/* ─── Fix 10: AI Assist SSE streaming with spinner ─── */
async function streamAiAssist(prompt) {
  var output = document.getElementById('ai-assist-output');
  var loading = document.getElementById('ai-loading');
  if (!output) return '';

  output.textContent = '';
  if (loading) loading.style.display = 'block';

  var fullText = '';

  try {
    var res = await fetch('/api/ai-chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        session_id: 'diary-assist-' + Date.now(),
        context_json: ''
      })
    });

    if (!res.ok || !res.body) {
      output.textContent = 'AI error ' + res.status + '. Check your Anthropic credit balance at anthropic.com.';
      if (loading) loading.style.display = 'none';
      return '';
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      var text = decoder.decode(chunk.value, { stream: true });
      text.split('\n').forEach(function (line) {
        if (!line.startsWith('data: ')) return;
        var data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          var parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            output.textContent = fullText;
          }
        } catch (e) { /* skip malformed SSE line */ }
      });
    }
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
  }

  if (loading) loading.style.display = 'none';
  return fullText;
}

function getAssistPrompt(assistType, content) {
  var prompts = {
    refine: 'Please refine and improve this writing while keeping my voice and tone. Do not add bullet points or headers unless they already exist:\n\n' + content,
    expand: 'Please expand and develop this idea further with more depth and detail. Keep the same voice:\n\n' + content,
    summarize: 'Please summarize this in 2-3 concise sentences:\n\n' + content,
    tags: 'Suggest 5-8 relevant tags for this content. Return only a comma-separated list with no # symbols, no explanation:\n\n' + content
  };
  return prompts[assistType] || prompts.refine;
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  // Fix 12: keep Airtable choices in sync (non-blocking)
  ensureDiaryTypes();

  // Load entries on boot
  loadEntryList();

  // New entry button
  var newEntryBtn = document.getElementById('new-entry-btn');
  if (newEntryBtn) newEntryBtn.addEventListener('click', clearEditor);

  // Save / delete buttons
  var saveBtn = document.getElementById('save-entry-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveEntry);

  var deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', deleteEntry);

  // Fix 9: Edit / Preview two-button toggle
  var editModeBtn = document.getElementById('edit-mode-btn');
  var previewModeBtn = document.getElementById('preview-mode-btn');
  if (editModeBtn) editModeBtn.addEventListener('click', setEditMode);
  if (previewModeBtn) previewModeBtn.addEventListener('click', setPreviewMode);

  // Search
  var searchInput = document.getElementById('diary-search');
  if (searchInput) {
    searchInput.addEventListener('input', function () { renderEntryList(allEntries); });
  }

  // Fix 12: type filter buttons use data-type (not data-type-filter)
  var typeFilterBtns = document.querySelectorAll('#type-filters [data-type]');
  typeFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var filter = btn.dataset.type;
      // Clicking the already-active non-All filter toggles it off
      activeTypeFilter = (activeTypeFilter === filter && filter !== '') ? '' : filter;
      typeFilterBtns.forEach(function (b) {
        var isActive = b.dataset.type === activeTypeFilter;
        b.className = 'badge ' + (isActive ? 'badge-primary' : 'badge-gray');
      });
      renderEntryList(allEntries);
    });
  });

  // Entry type change → show/hide blog section
  var typeSelect = document.getElementById('entry-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      toggleBlogSection(typeSelect.value === 'Blog');
    });
  }

  /* ─── Fix 10: AI Assist Modal ─── */
  var aiAssistBtn = document.getElementById('ai-assist-btn');
  var aiModal = document.getElementById('ai-assist-modal');
  var aiModalClose = document.getElementById('ai-modal-close');
  var aiModalClose2 = document.getElementById('ai-modal-close2');
  var useResultBtn = document.getElementById('ai-use-result');

  function openAiModal() {
    if (!aiModal) return;
    aiModal.classList.add('open');
    var output = document.getElementById('ai-assist-output');
    if (output) output.textContent = 'Choose a mode above to get AI suggestions…';
    var loading = document.getElementById('ai-loading');
    if (loading) loading.style.display = 'none';
  }

  function closeAiModal() {
    if (aiModal) aiModal.classList.remove('open');
  }

  if (aiAssistBtn) aiAssistBtn.addEventListener('click', openAiModal);
  if (aiModalClose) aiModalClose.addEventListener('click', closeAiModal);
  if (aiModalClose2) aiModalClose2.addEventListener('click', closeAiModal);

  // Click outside modal box to close
  if (aiModal) {
    aiModal.addEventListener('click', function (e) {
      if (e.target === aiModal) closeAiModal();
    });
  }

  // Fix 10: AI assist type buttons — use data-assist (not data-assist-type)
  var assistTypeBtns = document.querySelectorAll('.ai-assist-type');
  assistTypeBtns.forEach(function (btn) {
    btn.dataset.originalText = btn.textContent;
    btn.addEventListener('click', async function () {
      var assistType = btn.dataset.assist;
      var content = document.getElementById('entry-content')?.value || '';
      if (!content.trim()) { showFlash('Write some content first', 'error'); return; }

      assistTypeBtns.forEach(function (b) { b.disabled = true; });
      btn.textContent = '⏳ Working…';

      var prompt = getAssistPrompt(assistType, content);
      await streamAiAssist(prompt);

      btn.textContent = btn.dataset.originalText;
      assistTypeBtns.forEach(function (b) { b.disabled = false; });
    });
  });

  // Fix 10: "Use this" button — correct ID is ai-use-result
  if (useResultBtn) {
    useResultBtn.addEventListener('click', function () {
      var output = document.getElementById('ai-assist-output');
      var contentEl = document.getElementById('entry-content');
      var placeholder = 'Choose a mode above to get AI suggestions…';
      if (output && contentEl && output.textContent && output.textContent !== placeholder) {
        contentEl.value = output.textContent;
        closeAiModal();
        if (isPreviewMode) setEditMode();
        showFlash('Applied to editor!');
      } else {
        showFlash('No AI output to use yet', 'error');
      }
    });
  }

  // Start in edit mode
  setEditMode();
  clearEditor();
});
