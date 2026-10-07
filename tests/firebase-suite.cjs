const { spawnSync } = require('node:child_process');
for (const file of ['tests/firebase-rules.test.cjs', 'tests/firebase-browser.test.cjs']) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status) { process.exitCode = result.status; break; }
}
