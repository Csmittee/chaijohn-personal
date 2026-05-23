const COOKIE_NAME = 'chaijohn_session';

async function hashPin(pin) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return salt + ':' + hashHex;
}

async function verifyPin(pin, stored) {
  const [salt, storedHash] = stored.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHash;
}

async function createSession(env) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const session = { user_id: 'chaijohn', expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  await env.CHAIJOHN_KV.put('session_' + token, JSON.stringify(session), {
    expirationTtl: 7 * 24 * 60 * 60
  });
  return token;
}

function cookieString(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // POST /api/auth/verify
  if (url.pathname === '/api/auth/verify') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }

    const { pin } = body;
    if (!pin) return json({ error: 'PIN is required' }, 400);

    const stored = await env.CHAIJOHN_KV.get('auth_pin');
    if (!stored) return json({ error: 'No PIN set — visit /setup.html' }, 404);

    const valid = await verifyPin(String(pin), stored);
    if (!valid) return json({ error: 'Incorrect PIN' }, 401);

    const token = await createSession(env);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieString(token) });
  }

  // POST /api/auth/setup
  if (url.pathname === '/api/auth/setup') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }

    const { pin } = body;
    if (!pin) return json({ error: 'PIN is required' }, 400);

    const existing = await env.CHAIJOHN_KV.get('auth_pin');
    if (existing) return json({ error: 'PIN already set' }, 409);

    const hashed = await hashPin(String(pin));
    await env.CHAIJOHN_KV.put('auth_pin', hashed);

    const token = await createSession(env);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieString(token) });
  }

  // POST /api/auth/logout
  if (url.pathname === '/api/auth/logout') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/chaijohn_session=([a-f0-9]+)/);
    if (match) {
      await env.CHAIJOHN_KV.delete('session_' + match[1]);
    }
    const clearCookie = `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
  }

  return new Response('Not found', { status: 404 });
}
