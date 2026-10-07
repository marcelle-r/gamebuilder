const fs = require('fs');
const path = require('path');
require('./build.js');
const root = path.join(__dirname, '..');
const configPath = path.join(root, process.env.FIREBASE_CONFIG_FILE || 'firebase-config.json');
if (!fs.existsSync(configPath)) throw new Error('Create firebase-config.json from your Firebase web app configuration. See firebase-config.example.json.');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) if (!config[key] || /YOUR_|not your|public web/.test(config[key])) throw new Error('Missing Firebase setting: ' + key);
const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%227%22 fill=%22%2310141f%22/%3E%3Ctext x=%225%22 y=%2224%22 fill=%22%23c7f564%22 font-size=%2224%22%3Eg%3C/text%3E%3C/svg%3E">' +
  '<script>window.__gbCloud=true;window.__gbFirebaseConfig=' + safeConfig + ';\n' + read('src/firebase-cloud.js') + '</script></head><body>' + read('dist/gamebuilder.html') + '</body></html>';
fs.mkdirSync(path.join(root, 'dist/firebase'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/firebase/index.html'), page);
console.log('Built Firebase Hosting page for project ' + config.projectId);
