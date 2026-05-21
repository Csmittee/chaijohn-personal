/**
 * auth.js — Authentication handler for all Chaijohn Dashboard pages.
 * Loaded on every page via a <script> tag before other scripts.
 */
(function () {
  const path = window.location.pathname;
  const isLoginPage =
    path === '/' ||
    path === '/index.html' ||
    path.endsWith('/index.html');
  const isSetupPage =
    path === '/setup.html' || path.endsWith('/setup.html');

  /* ─── Protected pages: check auth, wire logout ─── */
  if (!isLoginPage && !isSetupPage) {
    fetch('/api/auth/check', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) {
          window.location.href = '/index.html';
        }
      })
      .catch(function () {
        window.location.href = '/index.html';
      });

    document.addEventListener('DOMContentLoaded', function () {
      const btn = document.getElementById('logout-btn');
      if (btn) {
        btn.addEventListener('click', async function () {
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'same-origin'
            });
          } catch (e) { /* ignore network errors, redirect anyway */ }
          window.location.href = '/index.html';
        });
      }
    });
  }

  /* ─── Login page: handle PIN form ─── */
  if (isLoginPage) {
    document.addEventListener('DOMContentLoaded', function () {
      const pinInput = document.getElementById('pin-input');
      const submitBtn =
        document.querySelector('[type=submit]') ||
        document.querySelector('button');
      const errEl = document.getElementById('auth-error');
      const setupMsg = document.getElementById('setup-msg');

      function showError(msg) {
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        if (setupMsg) setupMsg.style.display = 'none';
      }

      function showSetup() {
        if (setupMsg) setupMsg.style.display = 'block';
        if (errEl) errEl.style.display = 'none';
      }

      function hideMessages() {
        if (errEl) errEl.style.display = 'none';
        if (setupMsg) setupMsg.style.display = 'none';
      }

      async function doLogin() {
        if (!pinInput) return;
        const pin = pinInput.value.trim();
        if (!pin) {
          showError('Please enter your PIN.');
          return;
        }
        hideMessages();
        if (submitBtn) submitBtn.disabled = true;
        try {
          const r = await fetch('/api/auth/verify', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
          });
          if (r.ok) {
            window.location.href = '/dashboard.html';
          } else if (r.status === 404) {
            showSetup();
          } else {
            let msg = 'Incorrect PIN';
            try {
              const d = await r.json();
              if (d && d.error) msg = d.error;
            } catch (e) { /* ignore parse error */ }
            showError(msg);
          }
        } catch (e) {
          showError('Connection error. Please try again.');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      }

      if (pinInput) {
        pinInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') doLogin();
        });
        pinInput.focus();
      }
      if (submitBtn) {
        submitBtn.addEventListener('click', function (e) {
          e.preventDefault();
          doLogin();
        });
      }
    });
  }
})();
