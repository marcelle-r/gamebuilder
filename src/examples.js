// Built-in example game (the course's shared test game), written to the same contract the AI writes to.
// Kept as source strings because they run inside the sandboxed worker.

const EXAMPLE_TIC_TAC_TOE = String.raw`const game = {
  title: "Tic-Tac-Toe 3×3",
  allowedPlayers: [2],
  hiddenInformation: false,
  lines: [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],

  init(numPlayers, random) {
    return { board: Array(9).fill(null), turn: 0, last: null };
  },

  symbol(p) { return p === 0 ? "X" : "O"; },

  winLine(board) {
    for (const l of this.lines) {
      const [a, b, c] = l;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return l;
    }
    return null;
  },

  result(s) {
    const line = this.winLine(s.board);
    if (line) {
      const p = s.board[line[0]] === "X" ? 0 : 1;
      return { winners: [p], summary: "Three in a row for " + s.board[line[0]] + "." };
    }
    if (s.board.every(c => c !== null)) return { winners: [], summary: "The board is full. It's a draw." };
    return null;
  },

  currentPlayer(s) { return this.result(s) ? null : s.turn; },

  legalMoves(s) {
    if (this.result(s)) return [];
    const out = [];
    s.board.forEach((c, i) => { if (c === null) out.push({ type: "place", cell: i }); });
    return out;
  },

  applyMove(s, move) {
    if (this.result(s)) throw new Error("The game is over.");
    if (!move || move.type !== "place") throw new Error("Unsupported action type.");
    const i = move.cell;
    if (!Number.isInteger(i) || i < 0 || i > 8) throw new Error("Pick one of the 9 squares.");
    if (s.board[i] !== null) throw new Error("That square is taken.");
    const board = s.board.slice();
    board[i] = this.symbol(s.turn);
    return { board, turn: 1 - s.turn, last: i };
  },

  computerMove(s, random) {
    const me = this.symbol(s.turn), them = this.symbol(1 - s.turn);
    const free = this.legalMoves(s).map(m => m.cell);
    for (const who of [me, them]) {
      for (const i of free) {
        const b = s.board.slice(); b[i] = who;
        if (this.winLine(b)) return { type: "place", cell: i };
      }
    }
    if (free.includes(4)) return { type: "place", cell: 4 };
    const corners = [0, 2, 6, 8].filter(i => free.includes(i));
    const pool = corners.length ? corners : free;
    return { type: "place", cell: pool[Math.floor(random() * pool.length)] };
  },

  render(s, viewer, ui) {
    const res = this.result(s);
    const line = this.winLine(s.board) || [];
    const mine = !res && s.turn === viewer;
    let html = '<div class="ttt">';
    s.board.forEach((c, i) => {
      const cls = "sq" + (c ? " " + c : "") + (line.includes(i) ? " win" : "") + (s.last === i ? " last" : "");
      const attrs = c === null && mine ? "data-move='" + JSON.stringify({ type: "place", cell: i }) + "'" : "disabled";
      html += '<button class="' + cls + '" ' + attrs + ' aria-label="Square ' + (i + 1) + '">' + (c || "") + '</button>';
    });
    html += '</div>';
    if (viewer >= 0) html += '<p class="you">You play <b class="' + this.symbol(viewer) + '">' + this.symbol(viewer) + '</b></p>';
    const css = [
      '.ttt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:320px;margin:0 auto}',
      '.sq{aspect-ratio:1;border-radius:12px;border:1px solid var(--g-line);background:var(--g-surface);font-size:44px;font-weight:700;line-height:1}',
      '.sq:not([disabled]):hover{border-color:var(--g-accent);background:var(--g-bg)}',
      '.X{color:var(--g-p0)}.O{color:var(--g-p2)}',
      '.sq.win{background:var(--g-accent);color:var(--g-accent-ink);border-color:transparent}',
      '.sq.last{box-shadow:0 0 0 2px var(--g-fg) inset}',
      '.you{text-align:center;margin:12px 0 0;color:var(--g-muted)}.you b{font-size:18px}'
    ].join('');
    return { html, css };
  }
};`;

const EXAMPLES = [
  {
    id: "example-tic-tac-toe",
    example: true,
    title: "Tic-Tac-Toe 3×3",
    description: "The course's shared test game: 3×3, X goes first, three in a row wins.",
    rules: "Two players take turns placing X and O on a 3×3 board. Three in a row across, down or diagonally wins. A full board is a draw. Moves use the backend's format: {\"type\": \"place\", \"cell\": 0-8}.",
    allowedPlayers: [2], hiddenInformation: false,
    tutorial: ["X goes first. Tap an empty square to place your mark.", "Take turns with O.", "Line up three of your marks across, down or diagonally to win.", "If all 9 squares fill with no line, it's a draw."],
    code: EXAMPLE_TIC_TAC_TOE,
  },
];

if (typeof module !== "undefined") module.exports = { EXAMPLES };
