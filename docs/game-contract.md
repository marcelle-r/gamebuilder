# Game contract

Every game in GameBuilder, both the built-in Tic-Tac-Toe and every AI-generated game, is plain JavaScript that defines one object:

```js
const game = {
  title: "Tic-Tac-Toe",
  allowedPlayers: [2],           // every total number of players supported, 1-10 (a set, not a range)
  hiddenInformation: false,      // true when players hold secrets, such as cards in hand

  init(numPlayers, random) {},             // → starting state
  currentPlayer(state) {},                 // → index of the player to move, or null when the game is over
  legalMoves(state) {},                    // → every legal move for that player; never empty while the game is on
  applyMove(state, move, random) {},       // → a NEW state; throws Error("readable reason") for an illegal move
  result(state) {},                        // → null while playing, else { winners: [indices], summary }; [] means a draw
  computerMove(state, random) {},          // optional → one of legalMoves(state)
  render(state, viewer, ui) {},            // → { html, css } as seen by `viewer` (-1 = spectator at game end)
};
```

## Rules the code must follow

- State and moves are plain JSON. Moves are named by their action, for example `{"type": "place", "cell": 4}`.
- `legalMoves` and `applyMove` agree: every listed move is accepted, and nothing else is.
- `currentPlayer` is `null` exactly when `result` is not `null`.
- The game always ends. Add a move limit or a draw rule if the rules alone don't guarantee it.
- When `hiddenInformation` is true, `render` shows the viewer only their own secrets.
- No DOM access, timers, network or `Math.random`. Use the `random` function the game is given.

## How the UI talks back

`render` returns HTML. Clickable elements are `<button>`s:

| Attribute | Effect |
|---|---|
| `data-move='{"type":"place","cell":4}'` | submits that move |
| `data-ui='{"selected":"8C"}'` | merges into the `ui` object and redraws (`null` removes a key). Used for choices that take several clicks. `ui` resets after every move. |

Colors come from CSS variables so games follow the page's light or dark theme: `--g-bg`, `--g-surface`, `--g-fg`, `--g-muted`, `--g-line`, `--g-accent`, `--g-accent-ink`, `--g-board`, and `--g-p0` to `--g-p9` (one per player).

## Automatic playtest

Before a version is shown, the sandbox plays several complete games with random and computer moves, for the smallest and largest allowed player counts. It fails the version if:
- `legalMoves` is empty while the game is not over,
- `applyMove` rejects a move the game itself offered,
- `currentPlayer` returns an invalid index,
- `render` throws.

On failure, the error message is sent back to the AI once for a fix.
