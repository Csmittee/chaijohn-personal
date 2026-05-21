/**
 * dropzone.js — Floating Drop Zone panel injected on every protected page.
 * Handles drag-and-drop of receipts/photos → Cloudinary upload → AI extraction → review cards.
 */
(function () {
  /* ─── Utility helpers (self-contained) ─── */
  function formatThb(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '฿—';
    const n = Math.round(Number(amount));
    if (Math.abs(n) >= 100) return '฿' + n.toLocaleString('en-US');
    return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayIso() {
    return new Date().toISOString().split('T')[0];
  }

  function showFlash(msg, type) {
    type = type || 'success';
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText =
      'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;' +
      'background:' + (type === 'success' ? '#22c55e' : '#ef4444') + ';color:white;font-weight:500;z-index:99999;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeIn 0.2s ease';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
  }

  /* ─── State ─── */
  let pendingCount = 0;

  function updateBadge() {
    const badge = document.getElementById('dropzone-badge');
    if (!badge) return;
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? 'flex' : 'none';
    const approveAll = document.getElementById('dz-approve-all');
    if (approveAll) {
      approveAll.style.display = pendingCount >= 2 ? 'block' : 'none';
    }
  }

  /* ─── HTML injection ─── */
  function injectHtml() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
    });

    const wrapper = document.createElement('div');
    wrapper.id = 'dz-wrapper';
    wrapper.innerHTML = `
<style>
  #dropzone-toggle-btn {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    cursor: pointer;
    font-size: 1.4rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s;
  }
  #dropzone-toggle-btn:hover { transform: scale(1.08); }
  #dropzone-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 1.2rem;
    height: 1.2rem;
    background: #ef4444;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
    align-items: center;
    justify-content: center;
    color: white;
    display: none;
  }
  #dropzone-panel {
    position: fixed;
    bottom: 5.5rem;
    right: 1.5rem;
    width: 360px;
    max-height: 80vh;
    background: var(--bg-card, #1e2433);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 999;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  #dropzone-panel.open { display: flex; }
  .dz-header {
    padding: 0.85rem 1rem 0.7rem;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 0.9rem;
    background: var(--bg-surface, #252d3d);
    flex-shrink: 0;
  }
  .dz-date {
    font-size: 0.72rem;
    color: var(--text-secondary, #94a3b8);
    font-weight: 400;
  }
  .dz-body {
    padding: 0.75rem;
    overflow-y: auto;
    flex: 1;
  }
  .dz-drop-area {
    border: 2px dashed var(--border, rgba(255,255,255,0.15));
    border-radius: 10px;
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }
  .dz-drop-area:hover, .dz-drop-area.drag-over {
    border-color: var(--color-primary, #3b82f6);
    background: rgba(59,130,246,0.06);
    color: var(--text-primary, #f1f5f9);
  }
  .dz-review-card {
    background: var(--bg-surface, #252d3d);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 10px;
    padding: 0.75rem;
    margin-bottom: 0.6rem;
    animation: fadeIn 0.2s ease;
  }
  .dz-review-card.approved {
    border-color: #22c55e;
    opacity: 0.6;
  }
  .dz-thumb {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
    background: var(--bg-card, #1e2433);
  }
  .dz-spinner-card {
    background: var(--bg-surface, #252d3d);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 0.6rem;
    text-align: center;
    color: var(--text-secondary, #94a3b8);
    font-size: 0.8rem;
  }
  .dz-field-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }
  .dz-field-group label {
    font-size: 0.72rem;
    color: var(--text-secondary, #94a3b8);
    font-weight: 500;
  }
  .dz-field-group input,
  .dz-field-group select,
  .dz-field-group textarea {
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border, rgba(255,255,255,0.12));
    background: var(--bg-card, #1e2433);
    color: var(--text-primary, #f1f5f9);
    width: 100%;
    box-sizing: border-box;
  }
  .btn-sm { padding: 0.3rem 0.75rem; font-size: 0.78rem; }
  .btn { border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-success { background: #22c55e; color: white; }
  .btn-outline { background: transparent; border: 1px solid var(--border, rgba(255,255,255,0.2)); color: var(--text-primary, #f1f5f9); }
  .btn-danger { background: #ef4444; color: white; }
  .w-full { width: 100%; }
  #dz-approve-all { display: none; }
</style>

<button id="dropzone-toggle-btn" title="Drop Zone" aria-label="Open Drop Zone">
  📥
  <span id="dropzone-badge" style="display:none">0</span>
</button>

<div id="dropzone-panel">
  <div class="dz-header">
    <span>📥 What's for today?</span>
    <span class="dz-date" id="dz-date">${dateStr}</span>
  </div>
  <div class="dz-body" id="dz-body">
    <button id="dz-approve-all" class="btn btn-success w-full" style="margin-bottom:0.5rem">✅ Approve All</button>
    <div id="dz-drop-area" class="dz-drop-area" role="button" tabindex="0" aria-label="Drop files here">
      <div>📎 Drag slips, photos, notes, quotes — anything</div>
      <div style="font-size:0.75rem;margin-top:0.5rem">or click to select files</div>
      <input type="file" id="dz-file-input" accept="image/*,application/pdf" multiple style="display:none">
    </div>
    <div id="dz-cards-container"></div>
  </div>
</div>
`;
    document.body.appendChild(wrapper);
  }

  /* ─── Build form fields per suggested type ─── */
  function buildFieldsForType(suggestedType, prefilled) {
    prefilled = prefilled || {};
    switch ((suggestedType || '').toLowerCase()) {
      case 'transaction':
      case 'income':
      case 'expense':
        return `
<div class="dz-field-group">
  <label>Date</label>
  <input type="date" name="date" value="${prefilled.date || todayIso()}">
</div>
<div class="dz-field-group">
  <label>Type</label>
  <select name="type">
    <option value="Expense" ${prefilled.type === 'Expense' ? 'selected' : ''}>Expense</option>
    <option value="Income" ${prefilled.type === 'Income' ? 'selected' : ''}>Income</option>
  </select>
</div>
<div class="dz-field-group">
  <label>Amount (฿)</label>
  <input type="number" name="amount" value="${prefilled.amount || ''}" placeholder="0" step="0.01" min="0">
</div>
<div class="dz-field-group">
  <label>Description</label>
  <input type="text" name="description" value="${prefilled.description || ''}" placeholder="What was this for?">
</div>
<div class="dz-field-group">
  <label>Entity / Merchant</label>
  <input type="text" name="entity" value="${prefilled.entity || ''}" placeholder="Who paid / who received">
</div>`;

      case 'asset':
        return `
<div class="dz-field-group">
  <label>Name</label>
  <input type="text" name="name" value="${prefilled.name || ''}" placeholder="Asset name">
</div>
<div class="dz-field-group">
  <label>Category</label>
  <select name="category">
    <option value="Collection-Knife" ${prefilled.category === 'Collection-Knife' ? 'selected' : ''}>Collection - Knife</option>
    <option value="Collection-Vice" ${prefilled.category === 'Collection-Vice' ? 'selected' : ''}>Collection - Vice</option>
    <option value="Collection-Plant" ${prefilled.category === 'Collection-Plant' ? 'selected' : ''}>Collection - Plant</option>
    <option value="Collection-Doll" ${prefilled.category === 'Collection-Doll' ? 'selected' : ''}>Collection - Doll</option>
    <option value="Other">Other</option>
  </select>
</div>
<div class="dz-field-group">
  <label>Estimated Value (฿)</label>
  <input type="number" name="estimated_value" value="${prefilled.estimated_value || ''}" placeholder="0" min="0">
</div>
<div class="dz-field-group">
  <label>Notes</label>
  <input type="text" name="notes" value="${prefilled.notes || ''}" placeholder="Any notes...">
</div>`;

      case 'diary':
      case 'blog':
        return `
<div class="dz-field-group">
  <label>Title</label>
  <input type="text" name="title" value="${prefilled.title || ''}" placeholder="Entry title">
</div>
<div class="dz-field-group">
  <label>Type</label>
  <select name="entry_type">
    <option value="Note" ${prefilled.entry_type === 'Note' ? 'selected' : ''}>Note</option>
    <option value="Blog" ${prefilled.entry_type === 'Blog' ? 'selected' : ''}>Blog</option>
    <option value="Reflection" ${prefilled.entry_type === 'Reflection' ? 'selected' : ''}>Reflection</option>
    <option value="Idea" ${prefilled.entry_type === 'Idea' ? 'selected' : ''}>Idea</option>
  </select>
</div>
<div class="dz-field-group">
  <label>Content</label>
  <textarea name="content" rows="3" placeholder="Entry content...">${prefilled.content || ''}</textarea>
</div>
<div class="dz-field-group">
  <label>Tags</label>
  <input type="text" name="tags" value="${prefilled.tags || ''}" placeholder="tag1, tag2, tag3">
</div>`;

      case 'quote':
        return `
<div class="dz-field-group">
  <label>Quote Text</label>
  <textarea name="text" rows="3" placeholder="The quote...">${prefilled.text || ''}</textarea>
</div>
<div class="dz-field-group">
  <label>Author</label>
  <input type="text" name="author" value="${prefilled.author || ''}" placeholder="Who said it?">
</div>
<div class="dz-field-group">
  <label>Source</label>
  <input type="text" name="source" value="${prefilled.source || ''}" placeholder="Book, speech, etc.">
</div>
<div class="dz-field-group">
  <label>Mood Tag</label>
  <select name="mood_tag">
    <option value="Motivational" ${prefilled.mood_tag === 'Motivational' ? 'selected' : ''}>Motivational</option>
    <option value="Wisdom" ${prefilled.mood_tag === 'Wisdom' ? 'selected' : ''}>Wisdom</option>
    <option value="Funny" ${prefilled.mood_tag === 'Funny' ? 'selected' : ''}>Funny</option>
    <option value="Sad" ${prefilled.mood_tag === 'Sad' ? 'selected' : ''}>Sad</option>
    <option value="Other" ${prefilled.mood_tag === 'Other' ? 'selected' : ''}>Other</option>
  </select>
</div>`;

      default:
        return `
<div class="dz-field-group">
  <label>Description</label>
  <input type="text" name="description" value="${prefilled.description || ''}" placeholder="Describe this item...">
</div>`;
    }
  }

  /* ─── Build a review card ─── */
  function buildReviewCard(queueId, cloudinaryUrl, aiResult) {
    aiResult = aiResult || {};
    const suggestedType = aiResult.suggested_type || 'Unknown';
    const prefilled = aiResult.prefilled || {};
    const fields = buildFieldsForType(suggestedType, prefilled);

    const card = document.createElement('div');
    card.className = 'dz-review-card';
    card.dataset.queueId = queueId;
    card.dataset.suggestedType = suggestedType;

    const thumbHtml = cloudinaryUrl
      ? `<img src="${cloudinaryUrl}" class="dz-thumb" onerror="this.style.display='none'" alt="Uploaded file">`
      : '<div class="dz-thumb" style="background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:1.5rem">📄</div>';

    card.innerHTML = `
<div style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.5rem">
  ${thumbHtml}
  <div style="flex:1;min-width:0">
    <div style="font-size:0.73rem;color:var(--text-secondary,#94a3b8);margin-bottom:0.25rem;word-break:break-word">${aiResult.description || 'AI analysis complete'}</div>
    <span style="background:rgba(59,130,246,0.2);color:#60a5fa;padding:0.15rem 0.45rem;border-radius:4px;font-size:0.68rem;font-weight:600">${suggestedType}</span>
  </div>
</div>
<div class="dz-fields-container">
  ${fields}
</div>
<div style="display:flex;gap:0.5rem;margin-top:0.6rem">
  <button class="btn btn-success btn-sm dz-approve" data-queue-id="${queueId}" style="flex:1">✅ Approve</button>
  <button class="btn btn-danger btn-sm dz-reject" data-queue-id="${queueId}" style="flex:0 0 auto">✗</button>
</div>
`;
    return card;
  }

  /* ─── Build spinner placeholder card ─── */
  function buildSpinnerCard(filename) {
    const card = document.createElement('div');
    card.className = 'dz-spinner-card';
    card.innerHTML = `
<div style="display:flex;align-items:center;gap:0.5rem;justify-content:center">
  <div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.2);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite"></div>
  <span>Analyzing ${filename || 'file'}…</span>
</div>
`;
    return card;
  }

  /* ─── Collect form fields from a review card ─── */
  function collectCardFields(card) {
    const suggestedType = card.dataset.suggestedType || '';
    const fields = {};
    card.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.name) fields[el.name] = el.value;
    });
    return { suggested_type: suggestedType, fields };
  }

  /* ─── Approve a single card ─── */
  async function approveCard(card) {
    const queueId = card.dataset.queueId;
    const { suggested_type, fields } = collectCardFields(card);

    try {
      const res = await fetch('/api/dropzone/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: queueId, suggested_type, fields })
      });
      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        showFlash(err.error || 'Approve failed', 'error');
        return false;
      }
      card.classList.add('approved');
      pendingCount = Math.max(0, pendingCount - 1);
      updateBadge();
      setTimeout(function () { if (card.parentNode) card.remove(); }, 1500);
      return true;
    } catch (e) {
      showFlash('Connection error', 'error');
      return false;
    }
  }

  /* ─── Reject a card ─── */
  async function rejectCard(card) {
    const queueId = card.dataset.queueId;
    try {
      await fetch('/api/dropzone/' + queueId, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Rejected' })
      });
    } catch (e) { /* ignore, still remove */ }
    pendingCount = Math.max(0, pendingCount - 1);
    updateBadge();
    if (card.parentNode) card.remove();
  }

  /* ─── Process a single file ─── */
  async function processFile(file) {
    const container = document.getElementById('dz-cards-container');
    const spinner = buildSpinnerCard(file.name);
    container.insertBefore(spinner, container.firstChild);

    let cloudinaryUrl = '';
    let queueId = null;
    let aiResult = {};

    try {
      // 1. Upload to Cloudinary
      const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'dropzone/' + yyyymm);

      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();
      cloudinaryUrl = uploadData.url || '';

      // 2. Send to dropzone queue for AI analysis
      const dzRes = await fetch('/api/dropzone', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloudinary_url: cloudinaryUrl,
          filename: file.name,
          mime_type: file.type
        })
      });
      if (dzRes.ok) {
        const dzData = await dzRes.json();
        queueId = dzData.queue_id || dzData.id || ('local_' + Date.now() + '_' + Math.random().toString(36).slice(2));
        aiResult = dzData.ai_result || {};
      } else {
        queueId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      }
    } catch (e) {
      if (spinner.parentNode) spinner.remove();
      showFlash('Failed to process ' + file.name + ': ' + e.message, 'error');
      return;
    }

    // Replace spinner with review card
    if (spinner.parentNode) spinner.remove();
    const card = buildReviewCard(queueId, cloudinaryUrl, aiResult);
    container.insertBefore(card, container.firstChild);
    pendingCount++;
    updateBadge();
  }

  /* ─── Wire up events ─── */
  function wireEvents() {
    const toggleBtn = document.getElementById('dropzone-toggle-btn');
    const panel = document.getElementById('dropzone-panel');
    const dropArea = document.getElementById('dz-drop-area');
    const fileInput = document.getElementById('dz-file-input');
    const container = document.getElementById('dz-cards-container');
    const approveAllBtn = document.getElementById('dz-approve-all');

    if (!toggleBtn || !panel) return;

    // Toggle open/close
    toggleBtn.addEventListener('click', function () {
      panel.classList.toggle('open');
    });

    // Drop area click → file input
    dropArea.addEventListener('click', function () {
      fileInput.click();
    });
    dropArea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', function () {
      if (!this.files || !this.files.length) return;
      Array.from(this.files).forEach(processFile);
      this.value = '';
    });

    // Drag events
    dropArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', function () {
      dropArea.classList.remove('drag-over');
    });
    dropArea.addEventListener('drop', function (e) {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      if (!e.dataTransfer || !e.dataTransfer.files) return;
      Array.from(e.dataTransfer.files).forEach(processFile);
    });

    // Drag on panel body
    panel.addEventListener('dragover', function (e) { e.preventDefault(); });
    panel.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!e.dataTransfer || !e.dataTransfer.files) return;
      Array.from(e.dataTransfer.files).forEach(processFile);
    });

    // Event delegation for approve/reject buttons
    container.addEventListener('click', async function (e) {
      const approveBtn = e.target.closest('.dz-approve');
      const rejectBtn = e.target.closest('.dz-reject');

      if (approveBtn) {
        const card = approveBtn.closest('.dz-review-card');
        if (card) {
          approveBtn.disabled = true;
          const ok = await approveCard(card);
          if (!ok) approveBtn.disabled = false;
          else showFlash('Approved!');
        }
      }

      if (rejectBtn) {
        const card = rejectBtn.closest('.dz-review-card');
        if (card) {
          await rejectCard(card);
        }
      }
    });

    // Approve All
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', async function () {
        approveAllBtn.disabled = true;
        const cards = Array.from(container.querySelectorAll('.dz-review-card:not(.approved)'));
        for (const card of cards) {
          await approveCard(card);
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        showFlash('All approved!');
        approveAllBtn.disabled = false;
      });
    }
  }

  /* ─── Add spin keyframe if not already present ─── */
  function addKeyframes() {
    if (!document.getElementById('dz-keyframes')) {
      const style = document.createElement('style');
      style.id = 'dz-keyframes';
      style.textContent = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;
      document.head.appendChild(style);
    }
  }

  /* ─── Init ─── */
  document.addEventListener('DOMContentLoaded', function () {
    // Skip on login/setup pages
    const path = window.location.pathname;
    const isLoginPage = path === '/' || path === '/index.html' || path.endsWith('/index.html');
    const isSetupPage = path === '/setup.html' || path.endsWith('/setup.html');
    if (isLoginPage || isSetupPage) return;

    addKeyframes();
    injectHtml();
    wireEvents();
  });
})();
