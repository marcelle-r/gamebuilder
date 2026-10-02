// Builds the single-file page: inlines the example games and the sandbox harness into src/index.html.
// Output: dist/gamebuilder.html (the file that is published).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
// Drop the Node-only `module.exports` line at the end of the shared files.
const forBrowser = (s) => s.replace(/\nif \(typeof module[^\n]*\n?$/, "\n");

const page = read("src/index.html")
  .replace("/*__EXAMPLES__*/", () => forBrowser(read("src/examples.js")))
  .replace("/*__HARNESS__*/", () => forBrowser(read("src/harness.js")));

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "gamebuilder.html"), page);
console.log(`Built dist/gamebuilder.html (${(page.length / 1024).toFixed(1)} KB)`);
