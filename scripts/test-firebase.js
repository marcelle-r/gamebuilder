const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status || 0;
}
let status = run(['scripts/build-firebase.js'], { ...process.env, FIREBASE_CONFIG_FILE: 'tests/firebase-config.json' });
if (!status) status = run(['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:exec', '--project', 'demo-gamebuilder', '--only', 'auth,firestore', 'node tests/firebase-suite.cjs']);
// Leave the deployment build pointed at the real project after testing.
const restored = run(['scripts/build-firebase.js']);
process.exitCode = status || restored;
