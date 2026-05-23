/**
 * functions/api/auth/[[action]].js
 * Catch-all for POST /api/auth/verify, /api/auth/setup, /api/auth/logout
 * The more-specific auth/check.js still handles GET /api/auth/check.
 * No _airtable.js import needed — only KV + Web Crypto.
 */

const COOKIE = 'chaijohn_session';

async function hashPin(pin) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + salt));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return salt + ':' + hash;
}

async function verifyPin(pin, stored) {
  const [salt, storedHash] = stored.split(':');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + salt));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === storedHash;
}

async function createSession(env) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  await env.CHAIJOHN_KV.put(
    'session_' + token,
    JSON.stringify({ user_id: 'chaijohn', expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );
  return token;
}

function setCookie(token) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export async function onRequestPost(context) {
  const { env, request, params } = context;
  // params.action is an array for [[catchall]], e.g. ["verify"]
  const action = Array.isArray(params.action) ? params.action[0] : (params.action || '');

  /* ── POST /api/auth/verify ── */
  if (action === 'verify') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { pin } = body || {};
    if (!pin) return json({ error: 'PIN is required' }, 400);

    const stored = await env.CHAIJOHN_KV.get('auth_pin');
    if (!stored) return json({ error: 'No PIN set — visit /setup.html first' }, 404);

    const ok = await verifyPin(String(pin), stored);
    if (!ok) return json({ error: 'Incorrect PIN' }, 401);

    const token = await createSession(env);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(token) });
  }

  /* ── POST /api/auth/setup ── */
  if (action === 'setup') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { pin } = body || {};
    if (!pin) return json({ error: 'PIN is required' }, 400);

    const existing = await env.CHAIJOHN_KV.get('auth_pin');
    if (existing) return json({ error: 'PIN already set. Use verify to log in.' }, 409);

    const hashed = await hashPin(String(pin));
    await env.CHAIJOHN_KV.put('auth_pin', hashed);

    const token = await createSession(env);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(token) });
  }

  /* ── POST /api/auth/change-pin ── */
  if (action === 'change-pin') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { old_pin, new_pin } = body || {};
    if (!old_pin || !new_pin) return json({ error: 'old_pin and new_pin are required' }, 400);
    if (!/^\d{4,6}$/.test(String(new_pin))) return json({ error: 'New PIN must be 4-6 digits' }, 400);

    const stored = await env.CHAIJOHN_KV.get('auth_pin');
    if (!stored) return json({ error: 'No PIN set — use /setup to create one' }, 404);

    const ok = await verifyPin(String(old_pin), stored);
    if (!ok) return json({ error: 'Current PIN is incorrect' }, 401);

    const hashed = await hashPin(String(new_pin));
    await env.CHAIJOHN_KV.put('auth_pin', hashed);

    const token = await createSession(env);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(token) });
  }

  /* ── POST /api/auth/logout ── */
  if (action === 'logout') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/chaijohn_session=([a-f0-9]+)/);
    if (match) await env.CHAIJOHN_KV.delete('session_' + match[1]);
    const clear = `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
    return json({ ok: true }, 200, { 'Set-Cookie': clear });
  }

  return json({ error: 'Not found' }, 404);
}
