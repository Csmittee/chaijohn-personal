export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Only protect /api/* routes via middleware (HTML pages protected client-side)
  if (!path.startsWith('/api/')) return next();

  // Allow auth routes
  const authPaths = ['/api/auth/verify', '/api/auth/setup', '/api/auth/logout'];
  if (authPaths.some(p => path.startsWith(p))) return next();

  // Validate session
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/chaijohn_session=([a-f0-9]+)/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const session = await env.CHAIJOHN_KV.get('session_' + match[1]);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = JSON.parse(session);
  if (Date.now() > data.expires_at) {
    await env.CHAIJOHN_KV.delete('session_' + match[1]);
    return new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return next();
}
