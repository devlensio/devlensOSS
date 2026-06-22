// Copies the canonical skill (the single source of truth) into this package's
// bundled `skill/` dir so it ships inside the npm tarball. Runs on `prepack`
// (i.e. before `npm publish`/`npm pack`), so there is only ever one authored
// copy in the repo at plugins/devlens/skills/devlens.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "..", "..", "..", "plugins", "devlens", "skills", "devlens");
const dest = path.resolve(here, "..", "skill");

if (!fs.existsSync(src)) {
  console.error(`bundle-skill: source skill not found at ${src}`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`bundle-skill: copied skill -> ${path.relative(process.cwd(), dest)}`);
