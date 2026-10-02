// Canned "Claude" replies for the browser test. The first one has a deliberate bug
// (legalMoves offers a move applyMove rejects) so the auto-fix path gets exercised.
const TTT = (size, need, buggy) => String.raw`<game_meta>{"title":"Tic-Tac-Toe ${size}×${size}","description":"Get ${need} in a row on a ${size}×${size} board.","rules":"Players take turns marking an empty square. ${need} in a row wins. A full board is a draw.","minPlayers":2,"maxPlayers":2,"hiddenInformation":false}</game_meta>
<game_code>
const game = {
  title: "Tic-Tac-Toe ${size}×${size}",
  minPlayers: 2, maxPlayers: 2, hiddenInformation: false,
  size: ${size}, need: ${need},
  init(n, random) { return { n, cells: Array(this.size * this.size).fill(null), turn: 0, winner: null, filled: 0 }; },
  currentPlayer(s) { return this.result(s) ? null : s.turn; },
  legalMoves(s) {
    if (this.result(s)) return [];
    const out = [];
    for (let i = 0; i < s.cells.length; i++) if (${buggy ? "true" : "s.cells[i] === null"}) out.push({ i });
    return out;
  },
  applyMove(s, m) {
    if (s.cells[m.i] !== null) throw new Error("That square is taken.");
    const cells = s.cells.slice(); cells[m.i] = s.turn;
    const next = { ...s, cells, filled: s.filled + 1 };
    if (this.wins(cells, s.turn)) next.winner = s.turn; else next.turn = 1 - s.turn;
    return next;
  },
  wins(c, p) {
    const N = this.size, K = this.need;
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++)
      for (const [dr, dq] of [[0,1],[1,0],[1,1],[1,-1]]) {
        let k = 0;
        while (k < K) { const rr = r + dr * k, qq = q + dq * k; if (rr < 0 || rr >= N || qq < 0 || qq >= N || c[rr * N + qq] !== p) break; k++; }
        if (k === K) return true;
      }
    return false;
  },
  result(s) {
    if (s.winner !== null) return { winners: [s.winner], summary: this.need + " in a row." };
    if (s.filled === s.cells.length) return { winners: [], summary: "Board full." };
    return null;
  },
  render(s, viewer, ui) {
    const mine = this.currentPlayer(s) === viewer;
    let html = '<div class="b" style="grid-template-columns:repeat(' + this.size + ',1fr)">';
    s.cells.forEach((v, i) => {
      html += '<button class="sq p' + v + '" ' + (v === null && mine ? "data-move='" + JSON.stringify({ i }) + "'" : 'disabled') + '>' + (v === 0 ? '✕' : v === 1 ? '◯' : '') + '</button>';
    });
    return { html: html + '</div><p class="x" onclick="alert(1)">Squares: ' + s.cells.length + '<script>window.pwned=1<\/script></p>', css: '.b{display:grid;gap:6px;max-width:360px}.sq{aspect-ratio:1;font-size:28px;border:1px solid var(--g-line);background:var(--g-surface);border-radius:8px}.p0{color:var(--g-p0)}.p1{color:var(--g-p2)}@import url(https://evil.example/x.css);' };
  }
};
</game_code>
<notes>Built Tic-Tac-Toe on a ${size}×${size} board where you need ${need} in a row.</notes>`;

module.exports = { TTT };
