/**
 * ai.injector.js — AI Advisor page logic.
 * Handles chat interface, streaming, session management, and financial context.
 */

/* ─── Utility helpers ─── */
function formatThb(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '฿—';
  const n = Math.round(Number(amount));
  if (Math.abs(n) >= 100) return '฿' + n.toLocaleString('en-US');
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─── Session state ─── */
const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
let currentMessages = []; // [{role, content}]
let financialContext = {};
let contextJson = '';
let inactivityTimer = null;
let sessionSaved = false;

/* ─── DOM helpers ─── */
function getMessagesContainer() {
  return document.getElementById('messages');
}

function scrollToBottom() {
  const container = getMessagesContainer();
  if (container) container.scrollTop = container.scrollHeight;
}

/* ─── Append a message bubble to chat ─── */
function appendMessage(role, content, isStreaming) {
  const container = getMessagesContainer();
  if (!container) return null;

  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.style.cssText = 'padding:0.75rem 1rem;border-radius:12px;margin-bottom:0.75rem;font-size:0.88rem;line-height:1.6;max-width:85%;word-break:break-word;';

  if (role === 'user') {
    div.style.cssText += 'background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.2);align-self:flex-end;margin-left:auto;';
  } else {
    div.style.cssText += 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);align-self:flex-start;';
  }

  if (isStreaming) {
    div.innerHTML = '<span class="typing-indicator" style="display:inline-flex;gap:3px;align-items:center">' +
      '<span style="width:6px;height:6px;background:rgba(255,255,255,0.5);border-radius:50%;animation:aiDot 1s infinite 0s"></span>' +
      '<span style="width:6px;height:6px;background:rgba(255,255,255,0.5);border-radius:50%;animation:aiDot 1s infinite 0.2s"></span>' +
      '<span style="width:6px;height:6px;background:rgba(255,255,255,0.5);border-radius:50%;animation:aiDot 1s infinite 0.4s"></span>' +
      '</span>';
  } else {
    div.textContent = content;
  }

  container.appendChild(div);
  scrollToBottom();
  return div;
}

/* ─── SSE streaming response ─── */
async function streamResponse(messages) {
  const assistantDiv = appendMessage('assistant', '', true);
  if (!assistantDiv) return '';

  let fullText = '';

  try {
    const res = await fetch('/api/ai-chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages,
        session_id: sessionId,
        context_json: contextJson
      })
    });

    if (!res.ok || !res.body) {
      assistantDiv.textContent = 'AI request failed (' + res.status + '). Please try again.';
      return '';
    }

    assistantDiv.textContent = '';
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
              assistantDiv.textContent = fullText;
              scrollToBottom();
            }
          } catch (e) { /* ignore parse errors in SSE stream */ }
        }
      });
    }

    return fullText;
  } catch (e) {
    assistantDiv.textContent = 'Error: ' + e.message;
    return '';
  }
}

/* ─── Send a chat message ─── */
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Display user message
  appendMessage('user', text);
  input.value = '';
  if (sendBtn) sendBtn.disabled = true;

  // Add to messages array
  currentMessages.push({ role: 'user', content: text });

  // Reset inactivity timer
  resetInactivityTimer();

  // Stream AI response
  const reply = await streamResponse(currentMessages);

  if (reply) {
    currentMessages.push({ role: 'assistant', content: reply });
    sessionSaved = false;
  }

  if (sendBtn) sendBtn.disabled = false;
  input.focus();
  resetInactivityTimer();
}

/* ─── Session auto-save ─── */
async function saveSession() {
  if (currentMessages.length < 2 || sessionSaved) return;

  const topic = currentMessages[0]?.content?.substring(0, 60) || 'Chat session';

  try {
    await fetch('/api/ai-chat/save', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        messages_json: JSON.stringify(currentMessages),
        topic: topic
      })
    });
    sessionSaved = true;
  } catch (e) {
    console.warn('Session save failed:', e.message);
  }
}

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  // Auto-save after 30 minutes of inactivity
  inactivityTimer = setTimeout(function () {
    saveSession();
  }, 30 * 60 * 1000);
}

/* ─── Load financial context ─── */
async function loadFinancialContext() {
  const statusEl = document.getElementById('context-status');

  try {
    const res = await api('/api/ai-chat/context');
    if (!res.ok) {
      if (statusEl) statusEl.textContent = 'Ready — no financial data loaded';
      return;
    }
    financialContext = await res.json();
    contextJson = JSON.stringify(financialContext);

    const netWorth = (financialContext.total_assets || 0) - (financialContext.total_debts || 0);
    const totalDebts = financialContext.total_debts || 0;

    if (statusEl) {
      statusEl.textContent = 'Ready — loaded financial snapshot (' +
        formatThb(netWorth) + ' net worth, ' +
        formatThb(totalDebts) + ' total debts)';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Ready — could not load financial data';
  }
}

/* ─── Welcome message ─── */
function showWelcomeMessage() {
  appendMessage('assistant', 'Hello! I\'ve loaded your financial snapshot. Ask me about cashflow, debt strategy, or asset sales.');
}

/* ─── Context panel: show details ─── */
function renderContextPanel() {
  const panel = document.getElementById('context-panel');
  if (!panel || !financialContext || Object.keys(financialContext).length === 0) return;

  const fields = [
    { label: 'Monthly Income', value: formatThb(financialContext.income_total) },
    { label: 'Monthly Expense', value: formatThb(financialContext.expense_total) },
    { label: 'Total Assets', value: formatThb(financialContext.total_assets) },
    { label: 'Total Debts', value: formatThb(financialContext.total_debts) },
    { label: 'Net Worth', value: formatThb((financialContext.total_assets || 0) - (financialContext.total_debts || 0)) },
    { label: 'Active Debts', value: financialContext.active_debt_count || '—' }
  ];

  panel.innerHTML = fields.map(function (f) {
    return '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.8rem">' +
      '<span style="opacity:0.6">' + f.label + '</span>' +
      '<span style="font-weight:500">' + f.value + '</span></div>';
  }).join('');
}

/* ─── Suggested prompts ─── */
const SUGGESTED_PROMPTS = [
  'What is my current financial health?',
  'Which debt should I pay off first?',
  'How can I increase my income this month?',
  'Which assets should I sell to improve cashflow?',
  'Give me a 3-month debt reduction plan.',
  'Am I spending too much on any category?'
];

function renderSuggestedPrompts() {
  const container = document.getElementById('suggested-prompts');
  if (!container) return;

  container.innerHTML = SUGGESTED_PROMPTS.map(function (prompt) {
    return '<button class="prompt-chip" style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.2);color:#93c5fd;padding:0.4rem 0.75rem;border-radius:20px;cursor:pointer;font-size:0.78rem;transition:background 0.15s;white-space:nowrap">' +
      escapeHtml(prompt) + '</button>';
  }).join('');

  container.querySelectorAll('.prompt-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = chip.textContent;
        sendMessage();
      }
    });
    chip.addEventListener('mouseenter', function () {
      chip.style.background = 'rgba(59,130,246,0.22)';
    });
    chip.addEventListener('mouseleave', function () {
      chip.style.background = 'rgba(59,130,246,0.12)';
    });
  });
}

/* ─── New chat session ─── */
function startNewChat() {
  if (currentMessages.length >= 2 && !sessionSaved) {
    saveSession();
  }
  currentMessages = [];
  sessionSaved = false;

  const container = getMessagesContainer();
  if (container) container.innerHTML = '';

  showWelcomeMessage();

  const input = document.getElementById('chat-input');
  if (input) { input.value = ''; input.focus(); }
}

/* ─── Sessions sidebar ─── */
function renderSessionsPlaceholder() {
  const sidebar = document.getElementById('sessions-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '<div style="font-size:0.78rem;opacity:0.45;text-align:center;padding:1rem">Previous sessions will appear here after conversations.</div>';
}

/* ─── Add keyframe CSS for typing animation ─── */
function addChatStyles() {
  if (document.getElementById('ai-chat-styles')) return;
  const style = document.createElement('style');
  style.id = 'ai-chat-styles';
  style.textContent = `
#messages {
  display: flex;
  flex-direction: column;
}
@keyframes aiDot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}
`;
  document.head.appendChild(style);
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  addChatStyles();

  // Load context first, then show welcome message
  loadFinancialContext().then(function () {
    renderContextPanel();
    showWelcomeMessage();
    renderSuggestedPrompts();
  });

  renderSessionsPlaceholder();

  // Send button
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  // Enter key in input
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea if applicable
    chatInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }

  // New chat button
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

  // Save session button (manual)
  const saveSessionBtn = document.getElementById('save-session-btn');
  if (saveSessionBtn) {
    saveSessionBtn.addEventListener('click', async function () {
      if (currentMessages.length < 2) { showFlash('No messages to save', 'error'); return; }
      await saveSession();
      showFlash('Session saved!');
    });
  }

  // Context refresh button
  const refreshContextBtn = document.getElementById('refresh-context-btn');
  if (refreshContextBtn) {
    refreshContextBtn.addEventListener('click', async function () {
      await loadFinancialContext();
      renderContextPanel();
      showFlash('Context refreshed');
    });
  }

  // Start inactivity timer
  resetInactivityTimer();

  // Save session before page unload
  window.addEventListener('beforeunload', function () {
    if (currentMessages.length >= 2 && !sessionSaved) {
      // Synchronous fallback — use sendBeacon if available
      if (navigator.sendBeacon) {
        const payload = JSON.stringify({
          session_id: sessionId,
          messages_json: JSON.stringify(currentMessages),
          topic: currentMessages[0]?.content?.substring(0, 60) || 'Chat session'
        });
        navigator.sendBeacon('/api/ai-chat/save', new Blob([payload], { type: 'application/json' }));
      }
    }
  });
});
