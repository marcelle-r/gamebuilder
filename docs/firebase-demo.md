# Firebase demo

Live URL: https://gamebuilder-demo-c9e4e.web.app

Project: `gamebuilder-demo-c9e4e` (GameBuilder Demo). Firebase Hosting serves the
app; Firebase Authentication handles Google sign-in; Cloud Firestore stores games
in `users/{firebaseUid}/games/{gameId}`. Each account can access only its own
library. The default Standard database is in `nam5`, on the Spark plan.

## Where it runs and how access works

| Component | Service | Purpose |
| --- | --- | --- |
| Website | Google Firebase Hosting | Serves the app at the live URL over HTTPS |
| Account | Firebase Authentication with Google | Identifies the same user across devices |
| Saved games | Cloud Firestore | Stores code, rules, chat, and recent versions online |
| Game generation | OpenAI API | Uses the API key entered in the current tab |

The same Google account opens the same private game library from different
computers, phones, browsers, or locations with internet access. A different
Google account has a separate library and cannot access yours. Cloud storage is
independent of the device: no local development server needs to stay running.
On a second device, sign in and open **My games**; use **Refresh cloud games**
to see changes saved from the first device. An OpenAI key is needed only for
creating or changing a game, not for accessing saved games.

## Demo on two devices

1. Open the live URL on computer A and sign in with Google.
2. Enter an OpenAI API key in AI settings and press **Use this key**.
3. Describe a small game and wait for playtesting and **Saved to cloud**.
4. Open the same URL on computer B or a phone and use the same Google account.
5. Open the game from **My games**. No API key is needed to load or play it.
6. Refine the game on A; on B press **Refresh cloud games** to see its new version.
7. Show the game document in Firebase Console under Firestore → users → your UID
   → games, to demonstrate that the data is stored online.

To change a saved game, open it from **My games**, then use **Change the game**
beside the board (below the board on narrow screens). Enter a request such as
"make the board 5×5" and press **update game →**. If no key is active, the prompt
remains visible and **Open AI settings** takes you to key setup. Press **Use this
key** to enable updating, then wait for the new version and **Saved to cloud**.

Google login uses a redirect with the Hosting URL as `authDomain`, so the auth
helper shares the app's domain. Firebase's default domain and the `web.app`
handler are authorized in the Google provider configuration.

API keys stay only in the current tab's closure. They go directly to OpenAI for
generation and refinement, with `store: false`; they are never written to
Firestore or browser storage. Reloading or signing out clears the key. The
Firebase app configuration is public and contains no OpenAI key or admin
credentials. OpenAI API usage requires separate API billing.

Game code runs in an opaque-origin sandboxed iframe and data-URL worker so it
cannot read the parent app's Firebase authentication storage. Moves use the
worker's validated state. Saved documents retain the five most recent versions
and 24 chat messages, with a 900 KB application size limit.

Saving completes only after Firestore acknowledges the write. Keep the tab open
until the saved confirmation appears, especially when offline. Failed saves can
be retried. Avoid editing the same game simultaneously on two devices: the latest
completed save wins. **Import saved games** accepts a `gamebuilder-library-v1`
JSON backup and skips existing game IDs to protect newer cloud edits.

## Build, deploy, and test

Use Node >=24.12, Java >=21, and installed Chrome (or set `PLAYWRIGHT_CHANNEL`).
All test libraries and the official Firebase CLI are pinned in the lockfile.

```sh
npm ci
npm test
npm run test:firebase
firebase login
npm run deploy:firebase
```

GitHub stores the source repository. A Git push does not redeploy the Firebase
site; run `npm run deploy:firebase` to publish application changes there. The
repository's existing GitHub Pages workflow serves the original artifact, while
the cloud demo runs at the Firebase Hosting URL above.

`test:firebase` builds with a fake Firebase project, starts official Auth and
Firestore emulators, checks the security rules and two isolated browser contexts,
and restores the real deployment build afterward. Tests verify create/load,
refinement/version history, cross-account denial, sign-out isolation, and key
non-persistence. Paid OpenAI replies are substituted in automated tests.

For another Firebase project, register a web app, replace `firebase-config.json`
with its public configuration, update `.firebaserc`, and set the Google provider's
support email and redirect URI in `firebase.json`. Deploy auth, Hosting, and rules;
create the default Firestore Standard database first. Do not deploy a test
configuration to the live site.

The earlier Worker/D1 deployment remains available separately; it is not used by
the Firebase app. This milestone covers GameBuilder creation and cloud libraries.
Network multiplayer and integration with the backend team's publish API remain
separate portal/backend work.

References: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[Auth provider configuration](https://firebase.google.com/docs/auth/configure-providers-cli),
[redirect domain setup](https://firebase.google.com/docs/auth/web/redirect-best-practices).
