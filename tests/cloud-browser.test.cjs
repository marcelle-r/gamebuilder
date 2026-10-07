// Run on Node >=22 with Playwright available. Exercises real SQLite persistence
// across independent browser contexts. Only the paid AI reply is substituted.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { TTT } = require('./fake-replies.js');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../dist/server/index.js'), 'utf8');
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../drizzle/0000_polite_blur.sql'), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const DB = { prepare(sql) { const stmt = db.prepare(sql); let values = []; return {
    bind(...args) { values = args; return this; }, async run() { return stmt.run(...values); }, async all() { return { results: stmt.all(...values) }; }
  }; } };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request('http://127.0.0.1:' + server.address().port + req.url, { method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const reply = await worker.fetch(request, { DB });
    res.writeHead(reply.status, Object.fromEntries(reply.headers)); res.end(Buffer.from(await reply.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const a = await browser.newContext(); const b = await browser.newContext();
    const p = await a.newPage(); const q = await b.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message)); q.on('pageerror', e => errors.push(e.message));
    const url = 'http://127.0.0.1:' + server.address().port;
    await p.goto(url); await q.goto(url);
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Cloud connected'));
    await p.selectOption('#aiProvider', 'anthropic');
    await p.fill('#aiKey', 'test-private-key-12345');
    await p.click('#aiSettings button[type=submit]');
    assert.equal(await p.inputValue('#aiKey'), '');
    assert.equal(await p.evaluate(() => localStorage.length), 0);
    let generations = 0;
    let failSave = true;
    await p.route('**/api/games/*', route => {
      if (route.request().method() === 'PUT' && failSave) { failSave = false; return route.fulfill({ status: 503, json: { error: 'Storage unavailable' } }); }
      return route.continue();
    });
    await p.route('**/api/generate', route => { const data = route.request().postDataJSON();
      assert.equal(data.provider, 'anthropic'); assert.equal(data.key, 'test-private-key-12345'); generations++;
      return route.fulfill({ json: { text: TTT(generations === 1 ? 4 : 5, 4, false), truncated: false } }); });
    await p.fill('#newPrompt', 'Tic-Tac-Toe on a 4x4 board'); await p.click('#buildBtn');
    await p.waitForSelector('#retryCloud:not([hidden])');
    assert.equal(db.prepare('SELECT count(*) AS n FROM games').get().n, 0);
    await p.click('#refreshCloud');
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Unsaved changes'));
    assert.equal(await p.locator('#myList button').count(), 1);
    await p.click('#retryCloud');
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Saved to cloud'), { timeout: 20000 });
    await p.waitForSelector('#viewGame:not([hidden])');
    await q.click('#refreshCloud'); await q.waitForSelector('#myList button');
    await q.locator('#myList button').first().click();
    await q.waitForSelector('#frameHost iframe');
    const frame = q.frames().find(f => f !== q.mainFrame()); await frame.waitForSelector('.sq');
    assert.equal(await frame.locator('.sq').count(), 16);
    await q.waitForFunction(() => document.querySelector('#status').textContent.includes('Your turn'));
    await frame.evaluate(() => parent.postMessage({ message_kind: 'make_move', move: { i: 0 },
      turn_of_player_index: null, next_state: { n: 2, cells: Array(16).fill(0), filled: 16, winner: 0, turn: 0 } }, '*'));
    await q.waitForTimeout(1000);
    const marks = await frame.locator('.sq').allTextContents();
    assert.equal(marks.filter(x => x === '✕').length, 1);
    assert.equal(marks.filter(x => x === '◯').length, 1);
    assert.equal(await q.locator('#resultBar').isVisible(), false);
    console.log('PASS: forged iframe state ignored; validated move used');
    console.log('PASS: new game saved through API and loaded on independent browser');
    await p.fill('#chatInput', 'make it 5x5'); await p.click('#sendBtn');
    await p.waitForFunction(() => document.querySelector('#gTags').textContent.includes('Version 2'), { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Saved to cloud'));
    await q.reload(); await q.waitForSelector('#myList button'); await q.locator('#myList button').first().click();
    await q.waitForFunction(() => document.querySelector('#gTags').textContent.includes('Version 2'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM games').get().n, 1);
    assert.ok(!db.prepare('SELECT document FROM games').get().document.includes('test-private-key'));
    console.log('PASS: refined version persisted across reload, key excluded from database');
    await p.click('#clearAiKey'); assert.equal(await p.locator('#noAi').evaluate(el => el.hidden), false);
    assert.deepEqual(errors, []);
    console.log('ALL CLOUD BROWSER TESTS PASSED');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
