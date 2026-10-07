# Cloud demo

This describes the earlier Worker/D1 deployment. The current live demo uses
Firebase; see [firebase-demo.md](firebase-demo.md).

The hosted demo uses a Cloudflare Worker and a D1 SQLite database. Sites keeps
the deployment private to its owner and requires sign-in on every device.
The library is shared inside that private owner Site, including service API
calls. Do not change the deployment to public without adding per-user API
authorization and data isolation first.

## Demo flow

1. Open the deployed URL on computer A and sign in with the owner account.
2. In AI settings select OpenAI or Anthropic, enter an available model ID and an
   API key, and press **Use this key**. API billing belongs to that provider.
3. Describe a small game, such as Tic-Tac-Toe on a 4×4 board, four in a row wins.
4. Wait for playtesting and the **Saved to cloud** confirmation.
5. Open the same URL on computer B or a phone using the same owner account.
   The game appears in **My games**. A key is unnecessary for loading or playing.
6. Refine the game on A, then reload B or press **Refresh cloud games** to see
   the saved version. The library also refreshes when the tab regains focus.

Keys remain in a closure in the current browser tab, pass to the server only for
generation, and are forwarded to the selected provider. They are not stored in
browser storage or D1, included in game documents, or logged by application code.
OpenAI generation requests set `store: false`. Refreshing clears the key.

If saving fails, keep the tab open and press **Retry cloud saves**. Unsaved games
remain visible, and refreshing the cloud list preserves pending changes. Avoid
editing the same game on both devices at once: the latest completed save wins.
Each saved game keeps its five most recent versions and 24 chat messages.

## Build and verification

Node >=22.6 is required for the cloud tests and fetch API. The SQLite browser
test requires a Node version with `node:sqlite` and Playwright.

```
npm install
npm test
npm run build:cloud
npm run db:generate  # only when changing db/schema.ts
node tests/cloud-browser.test.cjs
```

`PLAYWRIGHT_CHANNEL=chrome` selects an installed Chrome instead of Playwright's
downloaded Chromium. The browser test uses actual SQLite and separate browser
contexts; only the paid AI response is simulated. Provider adapter tests cover
both HTTP formats and safe error handling. A real provider generation needs a
working API key and cannot be verified with the simulated responses.

`scripts/build-cloud.js` emits the Worker in `dist/server/index.js` with the page
embedded. A hosting manifest declares the private Site ID and logical `DB` D1
binding. Drizzle migrations are deployed before the Worker. The original
`npm run build` still produces the Claude artifact without the cloud adapter.

## API

All endpoints are behind the private Site access boundary. Browser writes also
reject cross-site origins. SQL uses prepared statements.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/session` | Owner library session and display name |
| GET | `/api/health` | Checks the deployed database table |
| GET | `/api/games` | Loads saved documents and versions |
| PUT | `/api/games/{id}` | Saves a validated game document |
| DELETE | `/api/games/{id}` | Removes a saved game |
| POST | `/api/generate` | Forwards prompt and ephemeral key to the selected provider |

This extension covers GameBuilder's cloud creation/load milestone. Multiplayer
between devices belongs to the separate portal/backend milestone.
