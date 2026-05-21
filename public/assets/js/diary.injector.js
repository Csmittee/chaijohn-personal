/**
 * diary.injector.js — Diary and blog editor page logic.
 * Handles entry list, editor, AI assist, search, and type filters.
 */

/* ─── Utility helpers ─── */
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
let activeTypeFilter = null;
let isPreviewMode = false;

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
    // Sort by date desc
    allEntries.sort(function (a, b) {
      return (b.fields.date || '') > (a.fields.date || '') ? 1 : -1;
    });
    renderEntryList(allEntries);
  } catch (e) {
    container.innerHTML = '<p style="color:#ef4444;padding:1rem">Error: ' + e.message + '</p>';
  }
}

function renderEntryList(entries) {
  const container = document.getElementById('diary-entry-list');
  if (!container) return;

  const search = (document.getElementById('diary-search')?.value || '').toLowerCase().trim();

  let filtered = entries;

  // Apply type filter
  if (activeTypeFilter) {
    filtered = filtered.filter(function (e) {
      return (e.fields.entry_type || '').toLowerCase() === activeTypeFilter.toLowerCase();
    });
  }

  // Apply search
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
    'Note': '#3b82f6',
    'Blog': '#22c55e',
    'Reflection': '#8b5cf6',
    'Idea': '#f59e0b'
  };

  container.innerHTML = filtered.map(function (entry) {
    const f = entry.fields;
    const color = typeColors[f.entry_type] || '#94a3b8';
    const isActive = entry.id === currentEntryId;
    const preview = (f.content || '').replace(/<[^>]*>/g, '').substring(0, 80);

    return `<div class="diary-entry-item${isActive ? ' active' : ''}" data-id="${entry.id}" style="padding:0.7rem 0.85rem;border-radius:8px;cursor:pointer;margin-bottom:0.35rem;border:1px solid ${isActive ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.04)'};background:${isActive ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)'}">
      <div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.25rem">
        <span style="background:${color}22;color:${color};padding:0.1rem 0.45rem;border-radius:4px;font-size:0.68rem;font-weight:600">${escHtml(f.entry_type || 'Note')}</span>
        <span style="font-size:0.72rem;color:rgba(255,255,255,0.4)">${f.date || ''}</span>
        ${f.publish_to_web ? '<span style="font-size:0.65rem;background:rgba(34,197,94,0.15);color:#22c55e;padding:0.1rem 0.3rem;border-radius:3px">Web</span>' : ''}
      </div>
      <div style="font-weight:500;font-size:0.86rem;margin-bottom:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(f.title || 'Untitled')}</div>
      ${preview ? '<div style="font-size:0.76rem;opacity:0.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(preview) + '</div>' : ''}
    </div>`;
  }).join('');

  // Wire click events
  container.querySelectorAll('.diary-entry-item').forEach(function (item) {
    item.addEventListener('click', function () {
      const id = item.dataset.id;
      const entry = allEntries.find(function (e) { return e.id === id; });
      if (entry) loadEntryInEditor(entry);
    });
  });
}

/* ─── Load entry in editor ─── */
function loadEntryInEditor(entry) {
  currentEntryId = entry.id;
  const f = entry.fields;

  // Populate fields
  const fields = {
    'entry-date': f.date || '',
    'entry-title': f.title || '',
    'entry-content': f.content || '',
    'entry-tags': f.tags || '',
    'entry-concept': f.connected_concept || ''
  };
  Object.keys(fields).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = fields[id];
  });

  // Entry type select
  const typeSelect = document.getElementById('entry-type');
  if (typeSelect) {
    typeSelect.value = f.entry_type || 'Note';
    toggleBlogSection(f.entry_type === 'Blog');
  }

  // Blog publish checkbox
  const publishCheck = document.getElementById('entry-publish');
  if (publishCheck) publishCheck.checked = !!f.publish_to_web;

  // Image
  const imageEl = document.getElementById('entry-image-preview');
  if (imageEl) {
    if (f.cloudinary_image_url) {
      imageEl.src = f.cloudinary_image_url;
      imageEl.style.display = 'block';
    } else {
      imageEl.style.display = 'none';
    }
  }

  // Show delete button
  const deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) deleteBtn.style.display = 'inline-block';

  // Close preview mode
  if (isPreviewMode) togglePreview(false);

  // Mark active in list
  renderEntryList(allEntries);
}

/* ─── Clear editor for new entry ─── */
function clearEditor() {
  currentEntryId = null;

  const fields = ['entry-date', 'entry-title', 'entry-content', 'entry-tags', 'entry-concept'];
  fields.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = id === 'entry-date' ? todayIso() : '';
  });

  const typeSelect = document.getElementById('entry-type');
  if (typeSelect) typeSelect.value = 'Note';
  toggleBlogSection(false);

  const publishCheck = document.getElementById('entry-publish');
  if (publishCheck) publishCheck.checked = false;

  const imageEl = document.getElementById('entry-image-preview');
  if (imageEl) imageEl.style.display = 'none';

  const deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  if (isPreviewMode) togglePreview(false);

  renderEntryList(allEntries);

  // Focus title
  setTimeout(function () {
    const titleEl = document.getElementById('entry-title');
    if (titleEl) titleEl.focus();
  }, 50);
}

/* ─── Blog section visibility ─── */
function toggleBlogSection(show) {
  const section = document.getElementById('blog-publish-section');
  if (section) section.style.display = show ? 'block' : 'none';
}

/* ─── Preview toggle ─── */
function togglePreview(force) {
  isPreviewMode = force !== undefined ? force : !isPreviewMode;
  const contentEl = document.getElementById('entry-content');
  const previewEl = document.getElementById('entry-preview');
  const toggleBtn = document.getElementById('preview-toggle');

  if (!contentEl || !previewEl) return;

  if (isPreviewMode) {
    const rawContent = contentEl.value;
    previewEl.innerHTML = rawContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    contentEl.style.display = 'none';
    previewEl.style.display = 'block';
    if (toggleBtn) toggleBtn.textContent = '✏️ Edit';
  } else {
    contentEl.style.display = 'block';
    previewEl.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = '👁 Preview';
  }
}

/* ─── Save entry ─── */
async function saveEntry() {
  const saveBtn = document.getElementById('save-entry-btn');
  const date = document.getElementById('entry-date')?.value;
  const title = document.getElementById('entry-title')?.value;
  const content = document.getElementById('entry-content')?.value;
  const entryType = document.getElementById('entry-type')?.value || 'Note';
  const tags = document.getElementById('entry-tags')?.value || '';
  const concept = document.getElementById('entry-concept')?.value || '';
  const publishToWeb = document.getElementById('entry-publish')?.checked || false;

  if (!title) { showFlash('Title is required', 'error'); return; }
  if (!date) { showFlash('Date is required', 'error'); return; }

  if (saveBtn) saveBtn.disabled = true;

  const body = {
    date,
    title,
    content: content || '',
    entry_type: entryType,
    tags: tags || undefined,
    connected_concept: concept || undefined,
    publish_to_web: entryType === 'Blog' ? publishToWeb : undefined
  };

  // Remove undefined keys
  Object.keys(body).forEach(function (k) { if (body[k] === undefined) delete body[k]; });

  try {
    let res;
    if (currentEntryId) {
      res = await api('/api/diary/' + currentEntryId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      res = await api('/api/diary', { method: 'POST', body: JSON.stringify(body) });
    }

    if (res.ok) {
      const data = await res.json();
      showFlash(currentEntryId ? 'Updated!' : 'Saved!');
      if (!currentEntryId && data.record) {
        currentEntryId = data.record.id || data.id;
      }
      await loadEntryList();
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

/* ─── Delete entry ─── */
async function deleteEntry() {
  if (!currentEntryId) return;
  if (!confirm('Delete this entry? This cannot be undone.')) return;

  try {
    const res = await api('/api/diary/' + currentEntryId, { method: 'DELETE' });
    if (res.ok) {
      showFlash('Deleted');
      clearEditor();
      await loadEntryList();
    } else {
      const d = await res.json().catch(function () { return {}; });
      showFlash(d.error || 'Delete failed', 'error');
    }
  } catch (e) {
    showFlash('Error: ' + e.message, 'error');
  }
}

/* ─── AI Assist: SSE streaming ─── */
async function streamAiAssist(prompt) {
  const output = document.getElementById('ai-assist-output');
  if (!output) return '';

  output.textContent = '';
  output.style.opacity = '1';

  let fullText = '';

  try {
    const res = await fetch('/api/ai-chat', {
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
      output.textContent = 'AI error: ' + res.status;
      return '';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      chunk.split('\n').forEach(function (line) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              fullText += parsed.delta.text;
              output.textContent = fullText;
            }
          } catch (e) { /* skip malformed SSE line */ }
        }
      });
    }

    return fullText;
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
    return '';
  }
}

function getAssistPrompt(assistType, content) {
  const prompts = {
    refine: 'Please refine and improve this writing while keeping my voice and tone. Do not add bullet points or headers unless they already exist:\n\n' + content,
    expand: 'Please expand and develop this idea further with more depth and detail. Keep the same voice:\n\n' + content,
    summarize: 'Please summarize this in 2-3 concise sentences:\n\n' + content,
    tags: 'Suggest 5-8 relevant tags for this content. Return only a comma-separated list with no # symbols, no explanation:\n\n' + content
  };
  return prompts[assistType] || prompts.refine;
}

/* ─── Image upload for diary entry ─── */
async function uploadEntryImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'diary/' + new Date().getFullYear());

  const res = await fetch('/api/upload-image', {
    method: 'POST',
    credentials: 'same-origin',
    body: formData
  });

  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.url || data.secure_url || '';
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  // Load entries
  loadEntryList();

  // New entry button
  const newEntryBtn = document.getElementById('new-entry-btn');
  if (newEntryBtn) newEntryBtn.addEventListener('click', clearEditor);

  // Save button
  const saveBtn = document.getElementById('save-entry-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveEntry);

  // Delete button
  const deleteBtn = document.getElementById('delete-entry-btn');
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
    deleteBtn.addEventListener('click', deleteEntry);
  }

  // Preview toggle
  const previewToggle = document.getElementById('preview-toggle');
  if (previewToggle) previewToggle.addEventListener('click', function () { togglePreview(); });

  // Search input
  const searchInput = document.getElementById('diary-search');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderEntryList(allEntries);
    });
  }

  // Type filter buttons
  const typeFilterBtns = document.querySelectorAll('[data-type-filter]');
  typeFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const filter = btn.dataset.typeFilter;
      if (activeTypeFilter === filter) {
        // Toggle off
        activeTypeFilter = null;
        typeFilterBtns.forEach(function (b) { b.classList.remove('active'); });
      } else {
        activeTypeFilter = filter === 'all' ? null : filter;
        typeFilterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      }
      renderEntryList(allEntries);
    });
  });

  // Entry type change → show/hide blog section
  const typeSelect = document.getElementById('entry-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      toggleBlogSection(typeSelect.value === 'Blog');
    });
  }

  // Image upload
  const imageInput = document.getElementById('entry-image-file');
  if (imageInput) {
    imageInput.addEventListener('change', async function () {
      const file = this.files[0];
      if (!file) return;
      try {
        const url = await uploadEntryImage(file);
        const imgEl = document.getElementById('entry-image-preview');
        if (imgEl) { imgEl.src = url; imgEl.style.display = 'block'; }
        // Store URL in hidden field if present
        const urlField = document.getElementById('entry-image-url');
        if (urlField) urlField.value = url;
        showFlash('Image uploaded!');
      } catch (e) {
        showFlash('Image upload failed: ' + e.message, 'error');
      }
      this.value = '';
    });
  }

  /* ─── AI Assist Modal ─── */
  const aiAssistBtn = document.getElementById('ai-assist-btn');
  const aiModal = document.getElementById('ai-assist-modal');
  const aiModalClose = document.getElementById('ai-modal-close');
  const aiModalBackdrop = document.getElementById('ai-modal-backdrop');
  const useThisBtn = document.getElementById('ai-use-this-btn');

  if (aiAssistBtn && aiModal) {
    aiAssistBtn.addEventListener('click', function () {
      aiModal.style.display = 'flex';
      const output = document.getElementById('ai-assist-output');
      if (output) output.textContent = 'Choose a mode above to get AI suggestions…';
    });
  }

  function closeAiModal() {
    if (aiModal) aiModal.style.display = 'none';
  }

  if (aiModalClose) aiModalClose.addEventListener('click', closeAiModal);
  if (aiModalBackdrop) aiModalBackdrop.addEventListener('click', closeAiModal);

  // AI assist type buttons
  const assistTypeBtns = document.querySelectorAll('.ai-assist-type');
  assistTypeBtns.forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const assistType = btn.dataset.assistType;
      const content = document.getElementById('entry-content')?.value || '';
      if (!content.trim()) { showFlash('Write some content first', 'error'); return; }

      assistTypeBtns.forEach(function (b) { b.disabled = true; });
      btn.textContent = '⏳ Working…';

      const prompt = getAssistPrompt(assistType, content);
      await streamAiAssist(prompt);

      btn.textContent = btn.dataset.originalText || 'Assist';
      assistTypeBtns.forEach(function (b) { b.disabled = false; });
    });
  });

  // Store original button text
  assistTypeBtns.forEach(function (btn) {
    btn.dataset.originalText = btn.textContent;
  });

  // "Use this" button: copy AI output to content field
  if (useThisBtn) {
    useThisBtn.addEventListener('click', function () {
      const output = document.getElementById('ai-assist-output');
      const contentEl = document.getElementById('entry-content');
      if (output && contentEl && output.textContent && output.textContent !== 'Choose a mode above to get AI suggestions…') {
        contentEl.value = output.textContent;
        closeAiModal();
        showFlash('Applied to editor!');
      } else {
        showFlash('No AI output to use yet', 'error');
      }
    });
  }

  // Set up entry preview div if not already in HTML
  if (!document.getElementById('entry-preview')) {
    const contentEl = document.getElementById('entry-content');
    if (contentEl) {
      const previewEl = document.createElement('div');
      previewEl.id = 'entry-preview';
      previewEl.style.cssText = 'display:none;min-height:200px;padding:0.75rem;background:rgba(255,255,255,0.02);border-radius:8px;font-size:0.9rem;line-height:1.7;border:1px solid rgba(255,255,255,0.08)';
      contentEl.parentNode.insertBefore(previewEl, contentEl.nextSibling);
    }
  }

  // Initialize with blank state
  clearEditor();
});
