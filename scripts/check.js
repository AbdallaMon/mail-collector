const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

// Parse and resolve imports without executing modules or contacting services.
let checked = 0;
for (const folder of ["src", "public/js", "scripts", "prisma"]) {
  for (const entry of fs.readdirSync(folder, { recursive: true })) {
    if (!/\.(?:js|mjs)$/.test(entry)) continue;
    const file = path.resolve(folder, entry);
    const source = fs.readFileSync(file, "utf8");
    if (entry.endsWith(".mjs")) {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } else {
      new vm.Script(source, { filename: file });
    }
    const resolve = createRequire(file).resolve;
    for (const match of source.matchAll(/\brequire\(["']([^"']+)["']\)/g))
      resolve(match[1]);
    checked++;
  }
}
console.log(
  `Checked syntax and imports for ${checked} JavaScript files without starting services.`,
);
