// Runs each example game through the sandbox harness the way the Web Worker would, in a Node vm.
const vm = require("vm");
const { HARNESS } = require("../src/harness.js");
const { EXAMPLES } = require("../src/examples.js");

function load(code) {
  const inbox = [];
  const ctx = { self: {}, Math, JSON, Array, Object, Number, String, Error, console };
  ctx.self.postMessage = (m) => inbox.push(m);
  vm.createContext(ctx);
  vm.runInContext(code + "\n" + HARNESS, ctx, { timeout: 5000 });
  let id = 1;
  return (kind, args) => {
    const my = id++;
    ctx.self.onmessage({ data: { id: my, kind, args } });
    const r = inbox.find((m) => m.id === my);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
}

for (const ex of EXAMPLES) {
  const call = load(ex.code);
  const meta = call("meta");
  const smoke = call("smoke");
  console.log(ex.title, JSON.stringify(meta), JSON.stringify(smoke));
  if (smoke.finished !== smoke.games) throw new Error(ex.title + ": not every playtest finished");
  // Full games for every player count, computer vs computer, checking render for each viewer.
  for (const n of meta.allowedPlayers) {
    for (let g = 0; g < 50; g++) {
      let st = call("init", { numPlayers: n });
      let steps = 0;
      while (!st.result) {
        const v = call("view", { state: st.state, viewer: st.current, ui: {} });
        if (!v.html.includes("data-move") && !v.html.includes("data-ui")) throw new Error(ex.title + ": no clickable move for current player");
        const m = call("computer", { state: st.state });
        st = call("apply", { state: st.state, move: m });
        if (++steps > 2000) throw new Error("too long");
      }
      call("view", { state: st.state, viewer: -1, ui: {} });
    }
  }
  // An illegal move must be rejected with a readable reason.
  const st = call("init", { numPlayers: meta.allowedPlayers[0] });
  const bad = { type: "place", cell: 9 };
  let rejected = false;
  try { call("apply", { state: st.state, move: bad }); }
  catch (e) { rejected = true; console.log("  illegal move rejected:", e.message); }
  if (!rejected) throw new Error("illegal move accepted");
}

// Broken code is reported, not crashed.
const broken = load("const game = { title: 'x' };");
try { broken("smoke"); } catch (e) { console.log("broken game reported:", e.message); }
// Tic-Tac-Toe uses the backend's move shape and the computer never misses a win or a block.
const ttt = load(EXAMPLES[0].code);
let tg = ttt("init", { numPlayers: 2 });
tg.state.board = ["X", "X", null, "O", "O", null, null, null, null]; tg.state.turn = 1;
const cm = ttt("computer", { state: tg.state });
if (cm.type !== "place" || cm.cell !== 5) throw new Error("computer should win at cell 5, got " + JSON.stringify(cm));
tg.state.board = ["X", "X", null, "O", null, null, null, null, null]; tg.state.turn = 1;
if (ttt("computer", { state: tg.state }).cell !== 2) throw new Error("computer should block at cell 2");
console.log("tic-tac-toe: backend move format, computer wins and blocks");
const endless = load(`const game = { allowedPlayers: [2], init: () => ({ turn: 0 }), currentPlayer: s => s.turn,
 legalMoves: () => [{ type: 'wait' }], applyMove: s => ({ turn: 1-s.turn }), result: () => null, render: () => ({ html: '<button data-move="{}">Wait</button>' }) };`);
let endlessRejected = false;
try { endless('smoke'); } catch (e) { endlessRejected = /did not end/.test(e.message); }
if (!endlessRejected) throw new Error('Non-terminating game passed playtesting');
console.log("ALL HARNESS TESTS PASSED");
