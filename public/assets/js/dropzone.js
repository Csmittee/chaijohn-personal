/**
 * dropzone.js — Floating Drop Zone panel injected on every protected page.
 * Drop N files → all upload → ONE picker for all → AI fills each in parallel → accept one by one.
 * Does NOT handle auth — auth.js handles that separately.
 */
(function () {
  /* ─── Utility helpers ─── */
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
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:dzFadeIn 0.2s ease';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
  }

  function isTextFile(file) {
    return file.type === 'text/plain' || file.type === 'text/markdown' ||
      file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md');
  }

  function isImageOrPdf(file) {
    return file.type.startsWith('image/') || file.type === 'application/pdf';
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error('Failed to read ' + file.name)); };
      reader.readAsText(file);
    });
  }

  /* ─── State ─── */
  let pendingCount = 0;
  let batchQueue   = [];
  let batchTimer   = null;

  function updateBadge() {
    const badge = document.getElementById('dropzone-badge');
    if (!badge) return;
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? 'flex' : 'none';
    const approveAll = document.getElementById('dz-approve-all');
    if (approveAll) approveAll.style.display = pendingCount >= 2 ? 'block' : 'none';
  }

  /* ─── Inject keyframe CSS ─── */
  function addKeyframes() {
    if (!document.getElementById('dz-keyframes')) {
      const style = document.createElement('style');
      style.id = 'dz-keyframes';
      style.textContent = `
@keyframes dzSpin { to { transform: rotate(360deg); } }
@keyframes dzFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;
      document.head.appendChild(style);
    }
  }

  /* ─── Inject panel styles ─── */
  function injectStyles() {
    if (document.getElementById('dz-styles')) return;
    const style = document.createElement('style');
    style.id = 'dz-styles';
    style.textContent = `
#dropzone-toggle-btn {
  position: fixed; bottom: 1.5rem; right: 1.5rem; width: 3.5rem; height: 3.5rem;
  border-radius: 50%; background: var(--color-primary, #3b82f6); color: white;
  border: none; cursor: pointer; font-size: 1.4rem; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
}
#dropzone-toggle-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
#dropzone-badge {
  position: absolute; top: -4px; right: -4px; width: 1.25rem; height: 1.25rem;
  background: #ef4444; border-radius: 50%; font-size: 0.65rem; font-weight: 700;
  align-items: center; justify-content: center; color: white; display: none; pointer-events: none;
}
#dropzone-panel {
  position: fixed; bottom: 5.5rem; right: 1.5rem; width: 370px; max-height: 80vh;
  background: var(--bg-card, #1e2433); border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.45); z-index: 999;
  display: none; flex-direction: column; overflow: hidden;
}
#dropzone-panel.open { display: flex; }
.dz-header {
  padding: 0.85rem 1rem 0.7rem; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  display: flex; justify-content: space-between; align-items: center;
  font-weight: 600; font-size: 0.9rem; background: var(--bg-surface, #252d3d); flex-shrink: 0;
}
.dz-date { font-size: 0.72rem; color: var(--text-secondary, #94a3b8); font-weight: 400; white-space: nowrap; }
.dz-body { padding: 0.75rem; overflow-y: auto; flex: 1; min-height: 0; }
.dz-drop-area {
  border: 2px dashed var(--border, rgba(255,255,255,0.18)); border-radius: 10px;
  padding: 1.5rem 1rem; text-align: center; color: var(--text-secondary, #94a3b8);
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
  font-size: 0.85rem; margin-bottom: 0.75rem; user-select: none;
}
.dz-drop-area:hover, .dz-drop-area.drag-over {
  border-color: var(--color-primary, #3b82f6);
  background: rgba(59,130,246,0.07); color: var(--text-primary, #f1f5f9);
}
.dz-review-card {
  background: var(--bg-surface, #252d3d); border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 10px; padding: 0.75rem; margin-bottom: 0.6rem;
  animation: dzFadeIn 0.2s ease; transition: border-color 0.3s, opacity 0.3s;
}
.dz-review-card.approved { border-color: #22c55e; opacity: 0.55; }
.dz-thumb {
  width: 64px; height: 64px; object-fit: cover; border-radius: 6px;
  flex-shrink: 0; background: var(--bg-card, #1e2433);
}
.dz-spinner-card {
  background: var(--bg-surface, #252d3d); border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 10px; padding: 1rem; margin-bottom: 0.6rem;
  text-align: center; color: var(--text-secondary, #94a3b8); font-size: 0.8rem;
}
.dz-field-row { margin-bottom: 0.4rem; }
.dz-field-row label { display: block; font-size: 0.71rem; color: var(--text-secondary, #94a3b8); font-weight: 500; margin-bottom: 0.2rem; }
.dz-field-row input, .dz-field-row select, .dz-field-row textarea {
  font-size: 0.8rem; padding: 0.3rem 0.5rem; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.12)); background: var(--bg-card, #1e2433);
  color: var(--text-primary, #f1f5f9); width: 100%; box-sizing: border-box; outline: none;
}
.dz-field-row input:focus, .dz-field-row select:focus, .dz-field-row textarea:focus { border-color: var(--color-primary, #3b82f6); }
.dz-btn { border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: opacity 0.15s; padding: 0.3rem 0.75rem; font-size: 0.78rem; }
.dz-btn:hover { opacity: 0.85; }
.dz-btn:disabled { opacity: 0.5; cursor: default; }
.dz-btn-success { background: #22c55e; color: white; }
.dz-btn-danger  { background: #ef4444; color: white; }
.dz-w-full { width: 100%; }
#dz-approve-all { display: none; }

/* ── Destination picker ── */
.dz-picker-card {
  background: var(--bg-surface, #252d3d); border: 1px solid var(--color-primary, #3b82f6);
  border-radius: 10px; padding: 0.75rem; margin-bottom: 0.6rem; animation: dzFadeIn 0.2s ease;
}
.dz-pick-filename { font-size: 0.75rem; color: var(--text-secondary, #94a3b8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.25rem; }
.dz-pick-label { font-size: 0.82rem; font-weight: 700; color: var(--text-primary, #f1f5f9); margin-bottom: 0.45rem; }
.dz-pick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
.dz-pick-btn {
  padding: 0.45rem 0.5rem; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.15)); background: var(--bg-card, #1e2433);
  color: var(--text-primary, #f1f5f9); cursor: pointer; font-size: 0.75rem; font-weight: 500;
  text-align: left; transition: background 0.12s, border-color 0.12s; line-height: 1.3;
}
.dz-pick-btn:hover { background: rgba(59,130,246,0.12); border-color: var(--color-primary, #3b82f6); }
.dz-pick-btn.dz-pick-active { background: rgba(59,130,246,0.2); border-color: var(--color-primary, #3b82f6); color: #60a5fa; }
.dz-pick-sub { margin-top: 0.45rem; padding-top: 0.45rem; border-top: 1px solid var(--border, rgba(255,255,255,0.08)); }
.dz-pick-sub-label { font-size: 0.68rem; color: var(--text-secondary, #94a3b8); font-weight: 600; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; }
`;
    document.head.appendChild(style);
  }

  /* ─── Inject panel HTML ─── */
  function injectHtml() {
    if (document.getElementById('dz-wrapper')) return;

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

    const wrapper = document.createElement('div');
    wrapper.id = 'dz-wrapper';
    wrapper.innerHTML = `
<button id="dropzone-toggle-btn" title="Drop Zone" aria-label="Open Drop Zone">
  📥<span id="dropzone-badge" style="display:none">0</span>
</button>
<div id="dropzone-panel" role="dialog" aria-label="Drop Zone Panel">
  <div class="dz-header">
    <span>📥 What's for today?</span>
    <span class="dz-date">${dateStr}</span>
  </div>
  <div class="dz-body" id="dz-body">
    <button id="dz-approve-all" class="dz-btn dz-btn-success dz-w-full" style="margin-bottom:0.5rem">✅ Approve All</button>
    <div id="dz-drop-area" class="dz-drop-area" role="button" tabindex="0">
      <div>📎 Drop receipts, photos, text — anything</div>
      <div style="font-size:0.75rem;margin-top:0.35rem;opacity:0.7">Images, PDF, .txt, .md · multiple files OK</div>
      <div style="font-size:0.75rem;margin-top:0.2rem;opacity:0.5">or click to select</div>
      <input type="file" id="dz-file-input" accept="image/*,application/pdf,text/plain,text/markdown,.txt,.md" multiple style="display:none">
    </div>
    <div id="dz-cards-container"></div>
  </div>
</div>`;
    document.body.appendChild(wrapper);
  }

  /* ─── Form fields per type ─── */
  function buildFieldsForType(suggestedType, prefilled) {
    prefilled = prefilled || {};
    const type = (suggestedType || '').toLowerCase();

    function field(label, inputHtml) {
      return `<div class="dz-field-row"><label>${label}</label>${inputHtml}</div>`;
    }

    if (type === 'transaction' || type === 'income' || type === 'expense') {
      const txType = prefilled.type || (type === 'income' ? 'Income' : 'Expense');
      return [
        field('Date', `<input type="date" name="date" value="${prefilled.date || todayIso()}">`),
        field('Type', `<select name="type">
          <option value="Expense"${txType === 'Expense' ? ' selected' : ''}>Expense</option>
          <option value="Income"${txType === 'Income'  ? ' selected' : ''}>Income</option>
        </select>`),
        field('Amount (฿)', `<input type="number" name="amount" value="${prefilled.amount || ''}" placeholder="0" step="0.01" min="0">`),
        field('Description', `<input type="text" name="description" value="${escHtml(prefilled.description || '')}" placeholder="What was this for?">`),
        field('Entity / Merchant', `<input type="text" name="entity" value="${escHtml(prefilled.entity || '')}" placeholder="Who paid / received">`)
      ].join('');
    }

    if (type === 'asset') {
      const cats = ['Collection-Knife', 'Collection-Vice', 'Collection-Plant', 'Collection-Doll', 'Other'];
      const catOpts = cats.map(c => `<option value="${c}"${prefilled.category === c ? ' selected' : ''}>${c.replace('-', ' — ')}</option>`).join('');
      return [
        field('Name',  `<input type="text" name="name" value="${escHtml(prefilled.name || '')}" placeholder="Asset name">`),
        field('Category', `<select name="category">${catOpts}</select>`),
        field('Estimated Value (฿)', `<input type="number" name="estimated_value" value="${prefilled.estimated_value || ''}" placeholder="0" min="0">`),
        field('Notes', `<input type="text" name="notes" value="${escHtml(prefilled.notes || '')}" placeholder="Any notes...">`)
      ].join('');
    }

    if (type === 'diary' || type === 'blog' || type === 'note' || type === 'idea' || type === 'project' || type === 'story' || type === 'skill') {
      const entryTypes = ['Story', 'Idea', 'Blog', 'Project', 'Skill'];
      const raw = prefilled.entry_type || (type === 'idea' ? 'Idea' : type === 'project' ? 'Project' : type === 'blog' ? 'Blog' : type === 'story' ? 'Story' : type === 'skill' ? 'Skill' : 'Story');
      const etOpts = entryTypes.map(et => `<option value="${et}"${raw === et ? ' selected' : ''}>${et}</option>`).join('');
      return [
        field('Title',   `<input type="text" name="title" value="${escHtml(prefilled.title || '')}" placeholder="Entry title">`),
        field('Type',    `<select name="entry_type">${etOpts}</select>`),
        field('Content', `<textarea name="content" rows="3" placeholder="Entry content...">${escHtml(prefilled.content || '')}</textarea>`),
        field('Tags',    `<input type="text" name="tags" value="${escHtml(prefilled.tags || '')}" placeholder="tag1, tag2, tag3">`)
      ].join('');
    }

    if (type === 'quote') {
      const moodTags = ['Motivational', 'Wisdom', 'Funny', 'Sad', 'Other'];
      const mood = prefilled.mood_tag || 'Motivational';
      const mtOpts = moodTags.map(mt => `<option value="${mt}"${mood === mt ? ' selected' : ''}>${mt}</option>`).join('');
      return [
        field('Quote Text', `<textarea name="text" rows="3" placeholder="The quote...">${escHtml(prefilled.content || prefilled.text || '')}</textarea>`),
        field('Author',  `<input type="text" name="author" value="${escHtml(prefilled.author || '')}" placeholder="Who said it?">`),
        field('Source',  `<input type="text" name="source" value="${escHtml(prefilled.source || '')}" placeholder="Book, speech, etc.">`),
        field('Mood Tag', `<select name="mood_tag">${mtOpts}</select>`)
      ].join('');
    }

    return field('Description', `<input type="text" name="description" value="${escHtml(prefilled.description || prefilled.content || '')}" placeholder="Describe this item...">`);
  }

  /* ─── Destination picker card ─── */
  function buildDestinationPicker(label, onPick) {
    const plural = /\d+ files/.test(label);
    const card = document.createElement('div');
    card.className = 'dz-picker-card';
    card.innerHTML = `
<div class="dz-pick-filename">📎 ${escHtml(label)}</div>
<div class="dz-pick-label">Where should ${plural ? 'these' : 'this'} go?</div>
<div class="dz-pick-grid">
  <button class="dz-pick-btn" data-pick="Transaction" data-sub="Expense">💸 Expense</button>
  <button class="dz-pick-btn" data-pick="Transaction" data-sub="Income">💚 Income</button>
  <button class="dz-pick-btn dz-pick-has-sub" data-expand="diary">📓 Diary ›</button>
  <button class="dz-pick-btn" data-pick="Quote">💬 Quote</button>
  <button class="dz-pick-btn" data-pick="Asset">🏷️ Asset</button>
  <button class="dz-pick-btn dz-pick-has-sub" data-expand="manual">✏️ Manual ›</button>
</div>
<div class="dz-pick-sub" id="dz-pick-diary-sub" style="display:none">
  <div class="dz-pick-sub-label">Diary type</div>
  <div class="dz-pick-grid">
    <button class="dz-pick-btn" data-pick="Diary" data-sub="Story">📖 Story</button>
    <button class="dz-pick-btn" data-pick="Diary" data-sub="Idea">💡 Idea</button>
    <button class="dz-pick-btn" data-pick="Diary" data-sub="Blog">🌐 Blog</button>
    <button class="dz-pick-btn" data-pick="Diary" data-sub="Project">🗂️ Project</button>
  </div>
</div>
<div class="dz-pick-sub" id="dz-pick-manual-sub" style="display:none">
  <div class="dz-pick-sub-label">Manual — no AI, blank form</div>
  <div class="dz-pick-grid">
    <button class="dz-pick-btn" data-pick="Manual" data-sub="Expense">💸 Expense</button>
    <button class="dz-pick-btn" data-pick="Manual" data-sub="Income">💚 Income</button>
    <button class="dz-pick-btn" data-pick="Manual" data-sub="Story">📖 Story</button>
    <button class="dz-pick-btn" data-pick="Manual" data-sub="Quote">💬 Quote</button>
    <button class="dz-pick-btn" data-pick="Manual" data-sub="Asset">🏷️ Asset</button>
  </div>
</div>`;

    card.addEventListener('click', function (e) {
      const btn = e.target.closest('.dz-pick-btn');
      if (!btn) return;
      const pick   = btn.dataset.pick;
      const sub    = btn.dataset.sub;
      const expand = btn.dataset.expand;

      if (expand) {
        const diarySub  = card.querySelector('#dz-pick-diary-sub');
        const manualSub = card.querySelector('#dz-pick-manual-sub');
        if (expand === 'diary') {
          const open = diarySub.style.display !== 'none';
          diarySub.style.display  = open ? 'none' : '';
          manualSub.style.display = 'none';
          card.querySelector('[data-expand="manual"]').classList.remove('dz-pick-active');
          btn.classList.toggle('dz-pick-active', !open);
        } else {
          const open = manualSub.style.display !== 'none';
          manualSub.style.display = open ? 'none' : '';
          diarySub.style.display  = 'none';
          card.querySelector('[data-expand="diary"]').classList.remove('dz-pick-active');
          btn.classList.toggle('dz-pick-active', !open);
        }
        return;
      }

      if (pick) onPick(pick, sub || null);
    });

    return card;
  }

  /* ─── Spinner card ─── */
  function buildSpinnerCard(msg) {
    const card = document.createElement('div');
    card.className = 'dz-spinner-card';
    card.innerHTML = `<div style="display:flex;align-items:center;gap:0.6rem;justify-content:center">
  <div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.15);border-top-color:#3b82f6;border-radius:50%;animation:dzSpin 0.7s linear infinite;flex-shrink:0"></div>
  <span>${escHtml(msg || 'Processing…')}</span>
</div>`;
    return card;
  }

  /* ─── Review card ─── */
  function buildReviewCard(queueId, cloudinaryUrl, aiResult, fileType) {
    aiResult = aiResult || {};
    const suggestedType = aiResult.suggested_type || 'Unknown';
    const prefilled     = aiResult.prefilled || {};
    const fieldsHtml    = buildFieldsForType(suggestedType, prefilled);

    const card = document.createElement('div');
    card.className = 'dz-review-card';
    card.dataset.queueId      = queueId;
    card.dataset.suggestedType = suggestedType;

    let thumbHtml;
    if (fileType === 'text') {
      thumbHtml = `<div class="dz-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:rgba(59,130,246,0.1);border-radius:6px;border:1px solid rgba(59,130,246,0.2)">📝</div>`;
    } else if (cloudinaryUrl) {
      thumbHtml = `<img src="${cloudinaryUrl}" class="dz-thumb" onerror="this.style.display='none'" alt="Preview" loading="lazy">`;
    } else {
      thumbHtml = `<div class="dz-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:rgba(255,255,255,0.05);border-radius:6px">📄</div>`;
    }

    const desc      = escHtml(aiResult.description || 'Fill in the details below');
    const typeBadge = `<span style="display:inline-block;background:rgba(59,130,246,0.2);color:#60a5fa;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.68rem;font-weight:600;margin-top:0.2rem">${escHtml(suggestedType)}</span>`;

    card.innerHTML = `
<div style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.6rem">
  ${thumbHtml}
  <div style="flex:1;min-width:0">
    <div style="font-size:0.72rem;color:var(--text-secondary,#94a3b8);line-height:1.4;word-break:break-word">${desc}</div>
    ${typeBadge}
  </div>
</div>
<div class="dz-fields-container">${fieldsHtml}</div>
<div style="display:flex;gap:0.4rem;margin-top:0.6rem">
  <button class="dz-btn dz-btn-success dz-approve" data-queue-id="${queueId}" style="flex:1">✅ Approve</button>
  <button class="dz-btn dz-btn-danger  dz-reject"  data-queue-id="${queueId}" style="padding:0.3rem 0.6rem">✗</button>
</div>`;
    return card;
  }

  /* ─── Blank card (Manual mode — no AI) ─── */
  function buildBlankCard(pf, hintSubtype, container) {
    const today = todayIso();
    let suggestedType, prefilled;

    switch (hintSubtype) {
      case 'Income':
        suggestedType = 'Transaction';
        prefilled = { date: today, type: 'Income', amount: '', description: '', entity: '' };
        break;
      case 'Story': case 'Idea': case 'Blog': case 'Project':
        suggestedType = 'Diary';
        prefilled = { title: '', content: '', entry_type: hintSubtype, tags: '' };
        break;
      case 'Quote':
        suggestedType = 'Quote';
        prefilled = { text: '', author: '', source: '', mood_tag: 'Motivational' };
        break;
      case 'Asset':
        suggestedType = 'Asset';
        prefilled = { name: '', category: 'Other', estimated_value: '', notes: '' };
        break;
      default: // Expense
        suggestedType = 'Transaction';
        prefilled = { date: today, type: 'Expense', amount: '', description: '', entity: '' };
    }

    const queueId  = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const aiResult = { suggested_type: suggestedType, description: pf.filename, prefilled };
    const card     = buildReviewCard(queueId, pf.cloudinaryUrl || null, aiResult, pf.type);
    container.insertBefore(card, container.firstChild);
    pendingCount++;
    updateBadge();
  }

  /* ─── Collect fields from a review card ─── */
  function collectCardFields(card) {
    const suggestedType = card.dataset.suggestedType || '';
    const fields = {};
    card.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.name) fields[el.name] = el.type === 'number' ? (parseFloat(el.value) || null) : el.value;
    });
    return { suggested_type: suggestedType, fields };
  }

  /* ─── Approve a card ─── */
  async function approveCard(card) {
    const queueId = card.dataset.queueId;
    const payload = collectCardFields(card);
    try {
      const res = await fetch('/api/dropzone/approve', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: queueId, suggested_type: payload.suggested_type, fields: payload.fields })
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
      showFlash('Connection error: ' + e.message, 'error');
      return false;
    }
  }

  /* ─── Reject a card ─── */
  async function rejectCard(card) {
    const queueId = card.dataset.queueId;
    try {
      await fetch('/api/dropzone/' + queueId, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Rejected' })
      });
    } catch (e) { /* ignore */ }
    pendingCount = Math.max(0, pendingCount - 1);
    updateBadge();
    if (card.parentNode) {
      card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
      card.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(function () { if (card.parentNode) card.remove(); }, 220);
    }
  }

  /* ─── Upload or read one file → prepared object ─── */
  async function prepareFile(file) {
    if (isTextFile(file)) {
      const textContent = await readFileAsText(file);
      return { type: 'text', textContent, filename: file.name, mimeType: file.type || 'text/plain' };
    }
    if (isImageOrPdf(file)) {
      const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'dropzone/' + yyyymm);
      const res = await fetch('/api/upload-image', { method: 'POST', credentials: 'same-origin', body: formData });
      if (!res.ok) throw new Error('Upload failed: ' + (await res.text().catch(function () { return res.status; })));
      const data = await res.json();
      return { type: 'image', cloudinaryUrl: data.url || data.secure_url || '', filename: file.name, mimeType: file.type };
    }
    throw new Error('Unsupported file type: ' + (file.type || file.name));
  }

  /* ─── Call /api/dropzone for one prepared file ─── */
  async function callDropzoneAPI(pf, hintType, hintSubtype) {
    const body = { filename: pf.filename, mime_type: pf.mimeType, hint_type: hintType };
    if (hintSubtype) body.hint_subtype = hintSubtype;
    if (pf.type === 'text') body.text_content = pf.textContent;
    else body.cloudinary_url = pf.cloudinaryUrl;

    const res = await fetch('/api/dropzone', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  /* ─── Main batch orchestrator ─── */
  async function executeBatch(files) {
    const container = document.getElementById('dz-cards-container');
    if (!container || files.length === 0) return;

    const uploadMsg = files.length === 1
      ? 'Uploading ' + files[0].name + '…'
      : 'Uploading ' + files.length + ' files…';
    const spinner = buildSpinnerCard(uploadMsg);
    container.insertBefore(spinner, container.firstChild);

    const settled = await Promise.allSettled(files.map(prepareFile));
    if (spinner.parentNode) spinner.remove();

    const ready = [];
    settled.forEach(function (r, i) {
      if (r.status === 'fulfilled') {
        ready.push(r.value);
      } else {
        showFlash('Failed: ' + files[i].name + ' — ' + r.reason.message, 'error');
      }
    });
    if (ready.length === 0) return;

    const pickerLabel = ready.length === 1 ? ready[0].filename : ready.length + ' files';
    const picker = buildDestinationPicker(pickerLabel, async function (hintType, hintSubtype) {
      if (picker.parentNode) picker.remove();

      // Manual: build blank cards instantly, no AI
      if (hintType === 'Manual') {
        ready.slice().reverse().forEach(function (pf) {
          buildBlankCard(pf, hintSubtype, container);
        });
        return;
      }

      // AI mode: analyze all in parallel
      const analyzeMsg = ready.length === 1
        ? 'AI reading ' + ready[0].filename + '…'
        : 'AI reading ' + ready.length + ' files…';
      const aiSpinner = buildSpinnerCard(analyzeMsg);
      container.insertBefore(aiSpinner, container.firstChild);

      const aiResults = await Promise.allSettled(ready.map(function (pf) {
        return callDropzoneAPI(pf, hintType, hintSubtype);
      }));
      if (aiSpinner.parentNode) aiSpinner.remove();

      // Build cards in order (reverse insert so file 1 ends up on top)
      const cards = aiResults.map(function (result, i) {
        const pf = ready[i];
        let queueId, aiResult;
        if (result.status === 'fulfilled') {
          queueId  = result.value.queue_id || ('local_' + Date.now() + '_' + Math.random().toString(36).slice(2));
          aiResult = result.value.ai_result || {};
        } else {
          queueId  = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2);
          aiResult = { suggested_type: hintType, description: 'Could not analyze — please fill manually', prefilled: {} };
        }
        return buildReviewCard(queueId, pf.cloudinaryUrl || null, aiResult, pf.type);
      });

      cards.slice().reverse().forEach(function (card) {
        container.insertBefore(card, container.firstChild);
        pendingCount++;
      });
      updateBadge();
    });
    container.insertBefore(picker, container.firstChild);
  }

  /* ─── Entry point per file — debounced into batch ─── */
  function processFile(file) {
    if (!isImageOrPdf(file) && !isTextFile(file)) {
      showFlash('Unsupported file type: ' + file.name, 'error');
      return;
    }
    batchQueue.push(file);
    clearTimeout(batchTimer);
    batchTimer = setTimeout(function () {
      const files = batchQueue.splice(0);
      executeBatch(files);
    }, 60);
  }

  /* ─── Wire events ─── */
  function wireEvents() {
    const toggleBtn     = document.getElementById('dropzone-toggle-btn');
    const panel         = document.getElementById('dropzone-panel');
    const dropArea      = document.getElementById('dz-drop-area');
    const fileInput     = document.getElementById('dz-file-input');
    const container     = document.getElementById('dz-cards-container');
    const approveAllBtn = document.getElementById('dz-approve-all');

    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', function () { panel.classList.toggle('open'); });

    if (dropArea) {
      dropArea.addEventListener('click', function (e) { if (e.target !== fileInput) fileInput.click(); });
      dropArea.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      dropArea.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); dropArea.classList.add('drag-over'); });
      dropArea.addEventListener('dragleave', function (e) { if (!dropArea.contains(e.relatedTarget)) dropArea.classList.remove('drag-over'); });
      dropArea.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation(); dropArea.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile);
      });
    }

    if (panel) {
      panel.addEventListener('dragover', function (e) { e.preventDefault(); });
      panel.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (!this.files || !this.files.length) return;
        Array.from(this.files).forEach(processFile);
        this.value = '';
      });
    }

    if (container) {
      container.addEventListener('click', async function (e) {
        const approveBtn = e.target.closest('.dz-approve');
        const rejectBtn  = e.target.closest('.dz-reject');
        if (approveBtn && !approveBtn.disabled) {
          const card = approveBtn.closest('.dz-review-card');
          if (!card) return;
          approveBtn.disabled = true;
          const ok = await approveCard(card);
          if (!ok) approveBtn.disabled = false;
          else showFlash('Approved!');
        }
        if (rejectBtn) {
          const card = rejectBtn.closest('.dz-review-card');
          if (card) await rejectCard(card);
        }
      });
    }

    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', async function () {
        approveAllBtn.disabled = true; approveAllBtn.textContent = 'Approving…';
        const cards = Array.from(container.querySelectorAll('.dz-review-card:not(.approved)'));
        let n = 0;
        for (const card of cards) {
          const ok = await approveCard(card);
          if (ok) n++;
          await new Promise(function (r) { setTimeout(r, 250); });
        }
        if (n > 0) showFlash('All ' + n + ' items approved!');
        approveAllBtn.textContent = '✅ Approve All'; approveAllBtn.disabled = false;
      });
    }
  }

  /* ─── Initialize ─── */
  document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    if (path === '/' || path.endsWith('/index.html') || path.endsWith('/setup.html')) return;
    addKeyframes();
    injectStyles();
    injectHtml();
    wireEvents();
  });
})();
