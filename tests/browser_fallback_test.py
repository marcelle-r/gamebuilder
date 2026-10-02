import json, subprocess, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "output"
OUT.mkdir(exist_ok=True)
replies = json.loads(subprocess.check_output(["node", "-e",
    "const {TTT}=require('./tests/fake-replies.js');console.log(JSON.stringify([TTT(4,4,true),TTT(4,4,false),TTT(5,4,false)]))"], cwd=ROOT))

MOCK = """
window.__gbInline = !!window.__forceInline; window.__replies = %s; window.__prompts = []; window.__store = {}; let __i = 0;
const listeners = {};
function notify(path) { const docs = Object.entries(window.__store).filter(([k]) => k.startsWith(path + '/')).map(([k, v]) => ({ id: k.slice(path.length + 1), data: () => v })); (listeners[path] || []).forEach(f => f({ docs })); }
const fakeDb = { collection: (path) => ({
  doc: (id) => ({ set: async (d) => { window.__store[path + '/' + id] = JSON.parse(JSON.stringify(d)); notify(path); }, delete: async () => { delete window.__store[path + '/' + id]; notify(path); } }),
  onSnapshot: (next) => { (listeners[path] = listeners[path] || []).push(next); setTimeout(() => notify(path), 10); return () => {}; } }) };
const sample = async (input, opts) => {
  window.__prompts.push(input);
  const t = window.__replies[Math.min(__i++, window.__replies.length - 1)];
  for (let k = 0; k < t.length; k += 500) { opts.onText && opts.onText({ text: t.slice(0, k + 500), delta: 'x' }); await new Promise(r => setTimeout(r, 4)); }
  return { text: t, truncated: false, modelTierApplied: 'default' };
};
window.claude = { use: async (n) => { await new Promise(r => setTimeout(r, 30)); return n === 'sample' ? sample : n === 'db' ? fakeDb : n === 'user' ? { id: async () => 'u1', name: async () => 'Marcelle de Matos Ribeiro' } : null; } };
""" % json.dumps(replies)

MOCK = "window.__forceInline = true;\n" + MOCK
html = (ROOT / "dist" / "gamebuilder.html").read_text()
page_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + "</body></html>"
OUT.joinpath("page.html").write_text(page_html)
url = (ROOT / "tests" / "output" / "page.html").as_uri()

errors = []
def check(cond, msg):
    if not cond:
        print("FAIL:", msg); sys.exit(1)
    print("ok:", msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 860})
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    ctx.add_init_script(MOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "fonts" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.goto(url)
    pg.wait_for_selector("text=Marcelle de Matos Ribeiro")
    pg.screenshot(path=str(OUT / "1_new.png"), full_page=True)

    # Tic-Tac-Toe example (shared test game, backend move format)
    check(pg.evaluate("document.querySelector('#exCards .excard strong').textContent") == "Tic-Tac-Toe", "tic-tac-toe example listed first")
    pg.click("#exCards >> text=Tic-Tac-Toe")
    pg.wait_for_function("document.querySelector('#stage').shadowRoot.querySelector('.ttt')")
    pg.wait_for_function("document.querySelector('#status').textContent.includes('Your turn')")
    pg.evaluate("document.querySelector('#stage').shadowRoot.querySelectorAll('.sq')[0].click()")
    pg.wait_for_timeout(1300)
    marks = pg.evaluate("[...document.querySelector('#stage').shadowRoot.querySelectorAll('.sq')].map(b=>b.textContent).join('')")
    check(marks.count("X") == 1 and marks.count("O") == 1, "tic-tac-toe example: you play X, computer answers O")
    logtxt = pg.evaluate("document.querySelector('#apiLog').textContent")
    check('"type":"place","cell":0' in logtxt and "turn_of_player_index" in logtxt, "moves use the backend's {type:place, cell} format; make_move uses the deck's fields")
    pg.screenshot(path=str(OUT / "0_ttt.png"), full_page=True)

    # Tic-Tac-Toe pass and play with the screen hidden between turns
    pg.click("#modePass")
    pg.wait_for_function("document.querySelector('#status').textContent.includes(\"Player 1's turn\")")
    pg.check("#hideBetween")
    pg.wait_for_function("document.querySelector('#stage').shadowRoot.querySelector('.ttt')")
    pg.evaluate("document.querySelector('#stage').shadowRoot.querySelectorAll('.sq')[4].click()")
    pg.wait_for_selector("#handoff:not([hidden])")
    check("Pass the device to Player 2" in pg.inner_text("#handoff"), "pass and play: after Player 1 moves, the screen hides and asks to pass the device")
    pg.click("#handoffBtn")
    pg.wait_for_function("document.querySelector('#status').textContent.includes(\"Player 2's turn\")")
    pg.wait_for_function("(document.querySelector('#stage').shadowRoot.querySelector('.you') || {}).textContent === 'You play O'", timeout=5000)
    check(True, "Player 2 sees their own view (You play O) after the handoff")
    log = pg.evaluate("document.querySelector('#apiLog').textContent")
    check("make_move" in log and "state_change" in log, "game API log shows state_change and make_move")
    pg.screenshot(path=str(OUT / "3_pass_and_play.png"), full_page=True)

    # Build a new game: first reply is buggy, so the auto-fix must kick in
    pg.click("#newBtn")
    pg.click("#counts [data-n='3']"); pg.click("#counts [data-n='6']")
    check(pg.evaluate("[...document.querySelectorAll('#counts [aria-pressed=true]')].map(b=>b.dataset.n).join(',')") == "2,3,6", "player picker selects a set (2, 3, 6)")
    check(pg.evaluate("document.querySelectorAll('#ideas .chip').length") == 2, "suggestions are the two Tic-Tac-Toe ideas")
    pg.click("#counts [data-n='3']"); pg.click("#counts [data-n='6']")
    pg.fill("#newPrompt", "Tic-Tac-Toe on a 4x4 board, 4 in a row wins")
    pg.click("#buildBtn")
    pg.wait_for_selector("#viewGame:not([hidden])", timeout=20000)
    check(pg.inner_text("#gTitle") == "Tic-Tac-Toe 4×4", "new game opened after build")
    check(len(pg.evaluate("window.__prompts")) == 2 and "failed automatic testing" in pg.evaluate("window.__prompts[1]"), "bug found in playtest and sent back for a fix")
    pg.wait_for_function("document.querySelector('#stage').shadowRoot.querySelector('.sq')")
    check(pg.evaluate("window.pwned === undefined"), "script in generated HTML did not run")
    check(pg.evaluate("!document.querySelector('#stage').shadowRoot.querySelector('[onclick]')"), "inline handlers stripped")
    check(pg.evaluate("!document.querySelector('#stage').shadowRoot.querySelector('style').textContent.includes('evil')"), "external CSS import stripped")
    pg.evaluate("document.querySelector('#stage').shadowRoot.querySelectorAll('.sq')[5].click()")
    pg.wait_for_timeout(1300)
    marks = pg.evaluate("[...document.querySelector('#stage').shadowRoot.querySelectorAll('.sq')].filter(b=>b.textContent).length")
    check(marks == 2, "played a move and the computer answered")
    saved = pg.evaluate("Object.keys(window.__store)")
    check(len(saved) == 1 and saved[0].startswith("data/users/u1/"), "game saved to the private store")
    check(pg.locator("#myList").inner_text().count("Tic-Tac-Toe") == 1, "game listed under My games")
    pg.screenshot(path=str(OUT / "4_built.png"), full_page=True)

    # Change it by chatting
    pg.fill("#chatInput", "make it 5x5")
    pg.click("#sendBtn")
    pg.wait_for_function("document.querySelector('#gTitle').textContent.includes('5×5')", timeout=20000)
    check("Version 2" in pg.inner_text("#gTags"), "change created version 2")
    check("allowedPlayers is now [2]" in pg.evaluate("window.__prompts[2]"), "change prompt carries the allowed-player set")
    pg.wait_for_function("document.querySelector('#stage').shadowRoot.querySelectorAll('.sq').length === 25")
    check(True, "5x5 board rendered")
    doc = list(pg.evaluate("window.__store").values())[0]
    check(len(doc["versions"]) == 2 and len(doc["chat"]) == 4, "versions and chat saved")
    pg.screenshot(path=str(OUT / "5_changed.png"), full_page=True)

    # Illegal move message
    pg.evaluate("""(() => { const r = document.querySelector('#stage').shadowRoot; const b = r.querySelector('.sq'); b.removeAttribute('disabled'); b.setAttribute('data-move', '{"i":999}'); b.click(); })()""")
    pg.wait_for_timeout(400)
    check(not pg.locator("#toast").is_hidden(), "illegal move shows a message instead of crashing")

    # Phone, dark mode
    m = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark")
    m.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    m.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    m.add_init_script(MOCK)
    mp = m.new_page()
    mp.goto(url)
    mp.wait_for_selector("text=Marcelle de Matos Ribeiro")
    mp.screenshot(path=str(OUT / "6_phone_dark.png"), full_page=True)
    mp.click("#exCards >> text=Tic-Tac-Toe")
    mp.wait_for_function("document.querySelector('#stage').shadowRoot.querySelector('.ttt')")
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check(sw <= 390, f"no sideways scroll on phone ({sw}px)")
    mp.screenshot(path=str(OUT / "7_phone.png"), full_page=True)
    b.close()

real = [e for e in errors if "net::" not in e]
print("console/page errors:", real)
check(not real, "no script errors")
print("ALL BROWSER TESTS PASSED")
