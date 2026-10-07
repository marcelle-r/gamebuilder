// End-to-end Firebase adapter tests with official Auth/Firestore emulators.
// Only OpenAI's paid reply is substituted; cloud writes exercise Firestore rules.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { TTT } = require('./fake-replies.js');
(async () => {
  const raw = fs.readFileSync(path.join(__dirname, '../dist/firebase/index.html'), 'utf8');
  const page = raw.replace('window.__gbCloud=true;', 'window.__gbCloud=true;window.__gbFirebaseEmulators={auth:"http://127.0.0.1:9099",firestorePort:8080};');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const email = 'browser-' + Date.now() + '@example.test', password = 'EmulatorTestOnly123!';
  const created = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  assert.equal(created.ok, true);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    const a = await browser.newContext(), b = await browser.newContext();
    const p = await a.newPage(), q = await b.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message)); q.on('pageerror', e => errors.push(e.message));
    const url = 'http://127.0.0.1:' + server.address().port;
    await p.goto(url); await q.goto(url);
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Sign in with Google'), { timeout: 30000 });
    const login = async tab => {
      await tab.evaluate(async ({ email, password }) => {
        const sdk = await import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js');
        await sdk.signInWithEmailAndPassword(sdk.getAuth(), email, password);
      }, { email, password });
      await tab.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Cloud connected'));
    };
    await login(p); await login(q);
    await p.fill('#aiKey', 'fake-key-only-for-test'); await p.click('#aiSettings button[type=submit]');
    let generations = 0;
    await p.route('https://api.openai.com/v1/responses', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': url, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST' } });
      assert.equal(route.request().headers().authorization, 'Bearer fake-key-only-for-test');
      const data = route.request().postDataJSON(); assert.equal(data.store, false); generations++;
      return route.fulfill({ headers: { 'Access-Control-Allow-Origin': url }, json: {
        status: 'completed', output: [{ content: [{ type: 'output_text', text: TTT(generations === 1 ? 4 : 5, 4, false) }] }]
      } });
    });
    await p.fill('#newPrompt', 'Tic-Tac-Toe 4x4, four in a row'); await p.click('#buildBtn');
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Saved to cloud'), { timeout: 20000 });
    await q.click('#refreshCloud'); await q.waitForSelector('#myList button'); await q.locator('#myList button').first().click();
    await q.waitForSelector('#frameHost iframe');
    const frame = q.frames().find(f => f !== q.mainFrame()); await frame.waitForSelector('.sq');
    assert.equal(await frame.locator('.sq').count(), 16);
    console.log('PASS: game saved to Firestore emulator and loaded by a second authenticated browser');
    await p.fill('#chatInput', 'make it 5x5'); await p.click('#sendBtn');
    await p.waitForFunction(() => document.querySelector('#gTags').textContent.includes('Version 2'), { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('Saved to cloud'));
    await q.reload(); await q.waitForSelector('#myList button'); await q.locator('#myList button').first().click();
    await q.waitForFunction(() => document.querySelector('#gTags').textContent.includes('Version 2'));
    assert.equal(await q.evaluate(() => GameBuilderCloud.configured()), false);
    assert.equal(await q.locator('#chatInput').isVisible(), true);
    assert.equal(await q.locator('#sendBtn').isDisabled(), true);
    assert.ok((await q.locator('#chatAiNote').textContent()).includes('API key'));
    await q.evaluate(() => { document.querySelector('#aiSettings').closest('details').open = false; });
    await q.click('#chatAiSettings');
    assert.equal(await q.locator('#aiKey').evaluate(el => el === document.activeElement), true);
    await q.fill('#chatInput', 'Change the winning line to five');
    await q.fill('#aiKey', 'second-fake-key-only-for-test'); await q.click('#aiSettings button[type=submit]');
    assert.equal(await q.locator('#sendBtn').isEnabled(), true);
    assert.equal(await q.locator('#chatAiSetup').isVisible(), false);
    assert.equal(await q.locator('#chatInput').inputValue(), 'Change the winning line to five');
    await q.click('#clearAiKey');
    assert.equal(await q.locator('#chatInput').isVisible(), true);
    assert.equal(await q.locator('#sendBtn').isDisabled(), true);
    console.log('PASS: reopening a saved game shows the update prompt and key setup; adding a key enables updates without losing the draft');
    const persisted = await p.evaluate(() => GameBuilderCloud.list());
    assert.ok(!JSON.stringify(persisted).includes('fake-key-only-for-test'));
    console.log('PASS: version and sign-in survive reload; OpenAI key is not in Firestore or another device');
    const isolated = await p.evaluate(() => new Promise(resolve => {
      const worker = new Worker('data:text/javascript,' + encodeURIComponent('try { indexedDB.open("firebaseLocalStorageDb"); self.postMessage(false); } catch(e) { self.postMessage(e.name === "SecurityError"); }'));
      worker.onmessage = e => { worker.terminate(); resolve(e.data); };
    }));
    assert.equal(isolated, true);
    await p.click('#googleSignOut'); await p.waitForFunction(() => document.querySelector('#whoName').textContent === 'Guest');
    assert.equal(await p.locator('#myList button').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: generated worker cannot access Firebase auth storage; signing out clears the private library');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
