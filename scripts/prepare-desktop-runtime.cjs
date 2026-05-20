const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(process.cwd(), "desktop-runtime");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const ext = process.platform === "win32" ? ".exe" : "";
const target = path.join(outDir, `node${ext}`);
fs.copyFileSync(process.execPath, target);
fs.chmodSync(target, 0o755);
console.log(`Copied Node runtime to ${target}`);
