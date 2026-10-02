# Tests the real mode: each game runs as a package in a sandboxed iframe and talks
# to the page only through state_change / make_move messages.
import json, subprocess, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "output"
src = (ROOT / "tests" / "browser_fallback_test.py").read_text()
MOCK = src.split('MOCK = """', 1)[1].split('"""', 1)[0]
replies = json.loads(subprocess.check_output(["node", "-e",
    "const {TTT}=require('./tests/fake-replies.js');console.log(JSON.stringify([TTT(4,4,false),TTT(5,4,false)]))"], cwd=ROOT))
MOCK = MOCK % json.dumps(replies)
MOCK = MOCK.replace("const sample = async", """const sampleFn = async""").replace("window.claude = { use: async (n) => { await new Promise(r => setTimeout(r, 30)); return n === 'sample' ? sample",
  "const sample = Object.assign(sampleFn, { json: async (input) => { window.__prompts.push(input); return { es: { title: 'Tres en raya', description: 'Cuatro en línea.', rules: 'Por turnos.', tutorial: ['Toca una casilla.'] }, he: { title: 'איקס עיגול', description: 'ארבעה ברצף.', rules: 'בתורות.', tutorial: ['גע במשבצת.'] } }; } });\nwindow.claude = { use: async (n) => { await new Promise(r => setTimeout(r, 30)); return n === 'sample' ? sample")
url = (ROOT / "tests" / "output" / "page.html").as_uri()
errors = []
def check(c, m):
    if not c: print("FAIL:", m); sys.exit(1)
    print("ok:", m)
def frame(pg):
    return [f for f in pg.frames if f != pg.main_frame][0]

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route("**/fonts.g*/**", lambda r: r.abort())
    ctx.add_init_script(MOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url)
    pg.wait_for_selector("text=Marcelle de Matos Ribeiro")

    pg.click("#exCards >> text=Tic-Tac-Toe")
    pg.wait_for_selector("#frameHost iframe")
    check(pg.get_attribute("#frameHost iframe", "sandbox") == "allow-scripts", "game runs in a sandboxed iframe (scripts only, no same-origin)")
    check(pg.evaluate("document.querySelector('#stage').hidden"), "inline fallback not used")
    f = frame(pg)
    f.wait_for_selector(".ttt")
    check(pg.evaluate("(() => { try { return document.querySelector('#frameHost iframe').contentDocument === null } catch (e) { return true } })()"), "page cannot reach into the game frame (separate origin)")
    pg.wait_for_function("document.querySelector('#status').textContent.includes('Your turn')")
    f.click(".sq >> nth=4")
    pg.wait_for_timeout(1400)
    marks = f.evaluate("[...document.querySelectorAll('.sq')].map(b=>b.textContent).join('')")
    check(marks.count("X") == 1 and marks.count("O") == 1, "move made inside the iframe, computer answered")
    log = pg.evaluate("document.querySelector('#apiLog').textContent")
    check("next_state" in log and "turn_of_player_index" in log and "my_user" in log, "real state_change / make_move messages crossed the frame boundary")
    h = pg.evaluate("document.querySelector('#frameHost iframe').getBoundingClientRect().height")
    check(h > 250, f"iframe resized to its content ({h:.0f}px)")
    check("X goes first" in pg.evaluate("document.querySelector('#gTutorial').textContent"), "tutorial shown")
    pg.screenshot(path=str(OUT / "8_iframe_ttt.png"), full_page=True)

    # Build and change: still runs in the iframe
    pg.click("#newBtn")
    pg.fill("#newPrompt", "Tic-Tac-Toe on a 4x4 board")
    pg.click("#buildBtn")
    pg.wait_for_selector("#viewGame:not([hidden])", timeout=20000)
    pg.wait_for_selector("#frameHost iframe")
    check("Version 1" in pg.inner_text("#gTags"), "new game starts at Version 1")
    frame(pg).wait_for_selector(".sq")
    pg.fill("#chatInput", "make it 5x5")
    pg.click("#sendBtn")
    pg.wait_for_function("document.querySelector('#gTitle').textContent.includes('5×5')", timeout=20000)
    check("Version 2" in pg.inner_text("#gTags"), "change creates Version 2")
    pg.wait_for_selector("#frameHost iframe")
    frame(pg).wait_for_function("document.querySelectorAll('.sq').length === 25")
    check(True, "Version 2 (5x5) runs in the iframe")
    removed = pg.evaluate("['viewAs','langTabs','translateBtn','pkg','pubBtn'].filter(id => document.getElementById(id))")
    check(removed == [], "trimmed features are gone (View as, languages, backend package, publish)")
    pg.screenshot(path=str(OUT / "10_changed.png"), full_page=True)
    b.close()
print("errors:", errors)
check(not errors, "no script errors")
print("ALL IFRAME TESTS PASSED")
