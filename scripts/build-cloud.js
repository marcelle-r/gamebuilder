const fs = require('fs');
const path = require('path');
require('./build.js');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%227%22 fill=%22%2310141f%22/%3E%3Ctext x=%225%22 y=%2224%22 fill=%22%23c7f564%22 font-size=%2224%22%3Eg%3C/text%3E%3C/svg%3E">' +
  '<script>window.__gbCloud=true;\n' + read('src/cloud.js') + '</script></head><body>' + read('dist/gamebuilder.html') + '</body></html>';
fs.mkdirSync(path.join(root, 'dist/server'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/server/index.js'), read('server/worker.mjs') + '\nexport default createWorker(' + JSON.stringify(page) + ');\n');
const manifest = path.join(root, '.openai/hosting.json');
if (fs.existsSync(manifest)) {
  fs.mkdirSync(path.join(root, 'dist/.openai'), { recursive: true });
  fs.copyFileSync(manifest, path.join(root, 'dist/.openai/hosting.json'));
  fs.cpSync(path.join(root, 'drizzle'), path.join(root, 'dist/.openai/drizzle'), { recursive: true });
}
console.log('Built cloud Worker with the GameBuilder page.');
