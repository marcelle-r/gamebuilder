// Appended after the game's own code inside a sandboxed Web Worker.
// It exposes a small message API and an automatic playtest ("smoke").
const HARNESS = String.raw`
;(function () {
  var G = (typeof game !== "undefined") ? game : null;
  var R = function () { return Math.random(); };
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function msg(e) { return (e && e.message) ? e.message : String(e); }
  function need() {
    if (!G || typeof G !== "object") throw new Error("The code must define: const game = { ... }");
    ["init", "currentPlayer", "legalMoves", "applyMove", "result", "render"].forEach(function (k) {
      if (typeof G[k] !== "function") throw new Error("game." + k + " must be a function");
    });
  }
  function meta() {
    need();
    var allowed = [];
    if (Array.isArray(G.allowedPlayers)) {
      G.allowedPlayers.forEach(function (n) { n = Math.round(Number(n)); if (n >= 1 && n <= 10 && allowed.indexOf(n) < 0) allowed.push(n); });
    }
    if (!allowed.length) {
      var min = Math.max(1, Math.min(10, Number(G.minPlayers) || 2));
      var max = Math.max(min, Math.min(10, Number(G.maxPlayers) || min));
      for (var i = min; i <= max; i++) allowed.push(i);
    }
    allowed.sort(function (a, b) { return a - b; });
    return { title: String(G.title || ""), allowedPlayers: allowed, hiddenInformation: !!G.hiddenInformation };
  }
  function info(s) {
    var res = G.result(clone(s)) || null;
    var cur = res ? null : G.currentPlayer(clone(s));
    if (cur === undefined) cur = null;
    return {
      state: clone(s),
      current: cur,
      result: res ? { winners: Array.isArray(res.winners) ? res.winners.map(Number) : [], summary: String(res.summary || "") } : null
    };
  }
  function view(s, viewer, ui) {
    var out = G.render(clone(s), viewer, ui || {});
    if (typeof out === "string") out = { html: out, css: "" };
    if (!out || typeof out.html !== "string") throw new Error("render must return { html, css }");
    return { html: out.html, css: String(out.css || "") };
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function computer(s) {
    var m = null;
    if (typeof G.computerMove === "function") {
      try { m = G.computerMove(clone(s), R); } catch (e) { m = null; }
    }
    if (m === null || m === undefined) {
      var ms = G.legalMoves(clone(s));
      if (!ms || !ms.length) throw new Error("legalMoves returned no moves for the computer player");
      m = pick(ms);
    }
    return clone(m);
  }
  function smoke() {
    var md = meta();
    var a = md.allowedPlayers;
    var counts = a.length > 1 ? [a[0], a[a.length - 1]] : [a[0]];
    var games = 0, finished = 0, moves = 0;
    counts.forEach(function (n) {
      for (var g = 0; g < 3; g++) {
        games++;
        var s;
        try { s = G.init(n, R); } catch (e) { throw new Error("init(" + n + " players) failed: " + msg(e)); }
        if (s === undefined) throw new Error("init must return the starting state");
        s = clone(s);
        for (var step = 0; step < 600; step++) {
          var res = G.result(clone(s));
          if (res) {
            if (!Array.isArray(res.winners)) throw new Error("result(state).winners must be an array of player indices");
            finished++;
            break;
          }
          var cur = G.currentPlayer(clone(s));
          if (typeof cur !== "number" || cur < 0 || cur >= n) {
            throw new Error("currentPlayer returned " + JSON.stringify(cur) + " while result() says the game is not over (" + n + " players)");
          }
          var ms = G.legalMoves(clone(s));
          if (!Array.isArray(ms) || ms.length === 0) {
            throw new Error("legalMoves returned no moves while the game is not over (move " + step + ", " + n + " players)");
          }
          if (step % 5 === 0) {
            try { view(s, cur, {}); } catch (e) { throw new Error("render failed during play: " + msg(e)); }
          }
          var m = (step % 2 === 0) ? computer(s) : pick(ms);
          var s2;
          try { s2 = G.applyMove(clone(s), clone(m), R); }
          catch (e) { throw new Error("applyMove rejected a move the game itself offered: " + JSON.stringify(m) + " (" + msg(e) + ")"); }
          if (s2 === undefined) throw new Error("applyMove must return the new state");
          s = clone(s2);
          moves++;
        }
        try { view(s, -1, {}); view(s, 0, {}); } catch (e) { throw new Error("render failed at the end of a game: " + msg(e)); }
      }
    });
    return { games: games, finished: finished, moves: moves };
  }
  var H = {
    meta: function () { return meta(); },
    init: function (a) {
      need();
      var s = G.init(a.numPlayers, R);
      if (s === undefined) throw new Error("init must return the starting state");
      return info(s);
    },
    apply: function (a) {
      var s2 = G.applyMove(clone(a.state), clone(a.move), R);
      if (s2 === undefined) throw new Error("applyMove must return the new state");
      return info(s2);
    },
    info: function (a) { return info(a.state); },
    view: function (a) { return view(a.state, a.viewer, a.ui); },
    computer: function (a) { return computer(a.state); },
    smoke: function () { return smoke(); }
  };
  self.onmessage = function (e) {
    var d = e.data || {};
    var reply;
    try {
      if (!H[d.kind]) throw new Error("Unknown request");
      reply = { id: d.id, ok: true, value: H[d.kind](d.args || {}) };
    } catch (err) {
      reply = { id: d.id, ok: false, error: msg(err) };
    }
    self.postMessage(reply);
  };
  self.postMessage({ id: 0, ok: true, value: "ready" });
})();
`;

if (typeof module !== "undefined") module.exports = { HARNESS };
