// Copies each compiled binary from dist/bin/ into its platform package folder
// under npm/, so each `npm/<platform>` is ready to `npm publish`.
//
// Run AFTER `bun run build:binaries`:
//   bun run stage:binaries   (or: node scripts/stage-binaries.mjs)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { binary: "devlens-darwin-arm64", dir: "darwin-arm64", out: "devlens" },
  { binary: "devlens-darwin-x64", dir: "darwin-x64", out: "devlens" },
  { binary: "devlens-linux-x64", dir: "linux-x64", out: "devlens" },
  { binary: "devlens-linux-arm64", dir: "linux-arm64", out: "devlens" },
  { binary: "devlens-windows-x64.exe", dir: "windows-x64", out: "devlens.exe" },
];

let staged = 0;
for (const { binary, dir, out } of TARGETS) {
  const src = path.join(root, "dist", "bin", binary);
  const destDir = path.join(root, "npm", dir);
  const dest = path.join(destDir, out);

  if (!fs.existsSync(src)) {
    console.warn(`• skip ${dir} — binary not built (${binary})`);
    continue;
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  if (out === "devlens") fs.chmodSync(dest, 0o755); // executable bit for unix targets

  console.log(`✔ staged ${binary} -> npm/${dir}/${out}`);
  staged++;
}

if (staged === 0) {
  console.error('\n✖ no binaries staged — run "bun run build:binaries" first.');
  process.exit(1);
}
console.log(`\nStaged ${staged} binaries. The corresponding npm/<platform> dirs are ready to publish.`);
