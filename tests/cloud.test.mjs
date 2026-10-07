import assert from 'node:assert/strict';
import { createWorker } from '../server/worker.mjs';
const worker = createWorker('<html>GameBuilder</html>');
// Independent callers share a DB; verify the API boundary and persisted document.
const documents = new Map();
const DB = { prepare(sql) { let args; return { bind(...values) { args = values; return this; },
  async run() { if (sql.startsWith('INSERT')) documents.set(args[0], args[1]); else if (sql.startsWith('DELETE')) documents.delete(args[0]); },
  async all() { return { results: [...documents].map(([id, document]) => ({ id, document })) }; }
}; } };
const call = (path, method = 'GET', body, headers = {}) => worker.fetch(new Request('https://demo.test' + path, {
  method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {})
}), { DB });
const game = { title: 'Cloud game', code: 'const game = {};', apiKey: 'must-not-be-saved', versions: [{ n: 1, code: 'v1', key: 'secret' }] };
assert.equal((await call('/api/games/demo1', 'PUT', game)).status, 200);
const loaded = await (await call('/api/games')).json();
assert.equal(loaded.games[0].title, game.title);
assert.equal(loaded.games[0].versions[0].code, 'v1');
assert.ok(!documents.get('demo1').includes('must-not-be-saved'));
assert.ok(!documents.get('demo1').includes('secret'));
assert.equal((await call('/api/games/demo1', 'PUT', game, { Origin: 'https://evil.test' })).status, 403);
assert.equal((await call('/api/games/demo1', 'PUT', { title: 'Bad' })).status, 400);
assert.equal((await call('/api/games/demo1', 'PUT', { ...game, code: 'x'.repeat(900000) })).status, 413);
assert.equal((await worker.fetch(new Request('https://demo.test/api/games'), {})).status, 503);
assert.equal((await call('/api/games/demo1', 'DELETE')).status, 200);
assert.equal((await (await call('/api/games')).json()).games.length, 0);
const originalFetch = globalThis.fetch;
try {
  for (const provider of ['openai', 'anthropic']) {
    let upstream;
    globalThis.fetch = async (url, options) => {
      upstream = { url, headers: options.headers, body: JSON.parse(options.body) };
      return Response.json(provider === 'openai' ? { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'game reply' }] }] } :
        { stop_reason: 'end_turn', content: [{ type: 'text', text: 'game reply' }] });
    };
    const result = await call('/api/generate', 'POST', { provider, model: 'test-model', key: 'test-key-123456', prompt: 'build a game' });
    assert.equal((await result.json()).text, 'game reply');
    assert.equal(upstream.body.model, 'test-model');
    assert.equal(provider === 'openai' ? upstream.body.input : upstream.body.messages[0].content, 'build a game');
    assert.equal(provider === 'openai' ? upstream.headers.Authorization : upstream.headers['x-api-key'], provider === 'openai' ? 'Bearer test-key-123456' : 'test-key-123456');
  }
  globalThis.fetch = async () => Response.json({ error: 'secret test-key-123456' }, { status: 401 });
  const rejected = await call('/api/generate', 'POST', { provider: 'openai', model: 'test', key: 'test-key-123456', prompt: 'test' });
  assert.equal(rejected.status, 502); assert.ok(!(await rejected.text()).includes('test-key'));
} finally { globalThis.fetch = originalFetch; }
console.log('CLOUD API TESTS PASSED: persistence, deletion, validation, key exclusion, both providers, safe errors');
