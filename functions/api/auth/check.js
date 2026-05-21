export async function onRequestGet(context) {
  const { env, request } = context;

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/chaijohn_session=([a-f0-9]+)/);

  if (!match) {
    return new Response(JSON.stringify({ ok: false, error: 'No session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const session = await env.CHAIJOHN_KV.get('session_' + match[1]);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = JSON.parse(session);
  if (Date.now() > data.expires_at) {
    await env.CHAIJOHN_KV.delete('session_' + match[1]);
    return new Response(JSON.stringify({ ok: false, error: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: data.user_id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
