// This demo is deployed owner-private. Sites authenticates every request before
// it reaches this Worker. The library belongs to that private Site's owner.
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
async function body(request, limit) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(new Error('Expected JSON.'), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Missing request body.'), { status: 400 });
  let size = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) { await reader.cancel(); throw Object.assign(new Error('This game is too large to save.'), { status: 413 }); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}
function database(env) {
  if (!env.DB) throw Object.assign(new Error('Cloud storage is unavailable. Please retry.'), { status: 503 });
  return env.DB;
}
export function createWorker(page) {
  return { async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Cross-site request rejected.' }, 403);
      }
      if (url.pathname === '/') return new Response(request.method === 'HEAD' ? null : page, { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
      } });
      if (url.pathname === '/api/session' && request.method === 'GET') return json({
        id: 'owner', name: request.headers.get('oai-authenticated-user-email') || 'Private cloud library'
      });
      if (url.pathname === '/api/health' && request.method === 'GET') {
        await database(env).prepare('SELECT id FROM games LIMIT 1').all(); return json({ storage: 'cloud', ready: true });
      }
      if (url.pathname === '/api/games' && request.method === 'GET') {
        const rows = await database(env).prepare('SELECT id, document FROM games ORDER BY updated_at DESC').all();
        return json({ games: rows.results.map(row => ({ ...JSON.parse(row.document), id: row.id })) });
      }
      const match = url.pathname.match(/^\/api\/games\/([a-zA-Z0-9_-]{1,80})$/);
      if (match && request.method === 'PUT') {
        const doc = await body(request, 900000);
        if (!doc || typeof doc.title !== 'string' || !doc.title.trim() || typeof doc.code !== 'string' || !doc.code.trim()) return json({ error: 'A game needs a title and code.' }, 400);
        // Explicit fields prevent API keys or arbitrary account data entering storage.
        const clean = { title: doc.title.slice(0, 200), description: String(doc.description || ''), rules: String(doc.rules || ''),
          tutorial: Array.isArray(doc.tutorial) ? doc.tutorial.map(String).slice(0, 8) : [],
          allowedPlayers: doc.allowedPlayers, hiddenInformation: !!doc.hiddenInformation, code: doc.code,
          chat: Array.isArray(doc.chat) ? doc.chat.slice(-24).map(x => ({ role: x.role, text: x.text, v: x.v })) : [],
          versions: Array.isArray(doc.versions) ? doc.versions.slice(-5).map(x => ({ n: x.n, note: x.note, code: x.code, at: x.at })) : [],
          createdAt: Number(doc.createdAt) || Date.now(), updatedAt: Date.now() };
        await database(env).prepare('INSERT INTO games (id, document, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at')
          .bind(match[1], JSON.stringify(clean), clean.updatedAt).run();
        return json({ saved: true, updatedAt: clean.updatedAt });
      }
      if (match && request.method === 'DELETE') {
        await database(env).prepare('DELETE FROM games WHERE id = ?').bind(match[1]).run(); return json({ deleted: true });
      }
      if (url.pathname === '/api/generate' && request.method === 'POST') {
        const data = await body(request, 180000);
        if (!['openai', 'anthropic'].includes(data.provider) || typeof data.key !== 'string' || data.key.length < 10 || data.key.length > 1000 || typeof data.prompt !== 'string') return json({ error: 'Choose a provider and enter a valid API key.' }, 400);
        const model = String(data.model || '').trim();
        if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(model)) return json({ error: 'Enter a valid model ID.' }, 400);
        const openai = data.provider === 'openai';
        const upstream = await fetch(openai ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: openai ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.key } : {
            'Content-Type': 'application/json', 'x-api-key': data.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(openai ? { model, input: data.prompt, max_output_tokens: 14000, store: false } : {
            model, messages: [{ role: 'user', content: data.prompt }], max_tokens: 14000 }),
          signal: AbortSignal.timeout(180000)
        });
        if (!upstream.ok) {
          // Don't log or return provider bodies: they can contain sensitive data.
          const error = upstream.status === 401 || upstream.status === 403 ? 'The provider rejected this key. Check the key and API access.' :
            upstream.status === 429 ? 'The provider rate limit or billing quota was reached. Check API billing, then retry.' :
            upstream.status === 400 || upstream.status === 404 ? 'The provider rejected the model or request. Check the model ID and account access.' : 'The AI provider is unavailable. Please retry.';
          return json({ error }, 502);
        }
        const reply = await upstream.json();
        const text = openai ? (reply.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n') :
          (reply.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
        if (!text) return json({ error: 'The provider returned no game code. Try again.' }, 502);
        return json({ text, truncated: openai ? reply.status === 'incomplete' : reply.stop_reason === 'max_tokens' });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return json({ error: error.status ? error.message : 'The cloud request failed. Please retry.' }, error.status || 503);
    }
  } };
}
