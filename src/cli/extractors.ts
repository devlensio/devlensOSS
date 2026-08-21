// DevLens CLI — extractor bootstrap for a self-contained, standalone binary.
//
// Problem: the compiled CLI binary bundles devlensio's JS logic but NOT its
// extractor DATA (python venv, java jar, go/rust binaries). Those live under
// `node_modules/devlensio/extractors`, which a globally-installed / standalone
// binary will never have. devlensio's resolver walks the filesystem for that
// folder and returns null → all non-JS/TS extractors fail, and `doctor`
// reports "devlensio package not found".
//
// Fix: the build embeds the portable extractor artifacts (go/rust static
// binaries + java jar + python module zip) as bunfs blobs. At the very start
// of the CLI (see preload.ts) we synchronously copy them out to a real,
// writable cache dir and set DEVLENS_EXTRACTORS_DIR BEFORE devlensio is imported
// — devlensio computes its extractor paths at module-load time, so the env
// var must already be set. We ALSO prepend the materialized python zip to
// PYTHONPATH: devlensio spawns `python3 -m devlens_extractors_python` with no
// env override (the child inherits process.env), so a zip on PYTHONPATH lets
// Python import straight out of it (PEP 273) — no venv, no pip, works for any
// python3.11+ on PATH.
//
// Python the INTERPRETER is not bundled (machine-specific and large); the
// MODULE is. So a user with python3 on PATH gets Python extraction out of the
// box — only the runtime is their responsibility (which Python devs have).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { embeddedArtifacts, enginePlatformDir } from "./extractorAssets.js";

const CACHE_VERSION = "1"; // bump to force a fresh extract when the bundle changes

/** Synchronous read that works for both bunfs virtual paths (compiled binary)
 *  and real on-disk paths (source / dev runs). bunfs paths look like
 *  `/$bunfs/root/<…>` and are served by bun's virtual FS inside a compiled
 *  binary, so this reads embedded bytes with no real file on disk. */
function readAssetBytes(handle: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(handle));
}

/** Directory where we materialize the embedded extractor tree. */
export function extractorCacheDir(): string {
  return path.join(os.homedir(), ".devlens", "extractors", `v${CACHE_VERSION}`);
}

/**
 * Synchronously materialise the embedded extractor artifacts onto disk and
 * return the extractors root (for DEVLENS_EXTRACTORS_DIR), or null if none.
 * Must run BEFORE devlensio is imported (see preload.ts).
 */
export function bootstrapExtractors(): string | null {
  const artifacts = embeddedArtifacts();
  const cacheRoot = extractorCacheDir();
  try {
    fs.mkdirSync(cacheRoot, { recursive: true });
    for (const art of artifacts) {
      const dest = path.join(cacheRoot, art.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const bytes = readAssetBytes(art.src);
      fs.writeFileSync(dest, bytes);
      // Keep the subprocess executables runnable on unix (the go/rust
      // binaries are spawned directly; the jar/zip are read, not executed).
      const isExec = !dest.endsWith(".jar") && !dest.endsWith(".zip");
      if (process.platform !== "win32" && isExec) {
        fs.chmodSync(dest, 0o755);
      }
    }
    // devlensio's resolver only adopts an extractors root that has BOTH a
    // `python` and a `java` dir (it gates on those two existing). The python
    // zip is materialized above; ensure both dirs exist so the engine adopts
    // this cache as its extractors root.
    fs.mkdirSync(path.join(cacheRoot, "python"), { recursive: true });
    fs.mkdirSync(path.join(cacheRoot, "java"), { recursive: true });

    // Put the python module zip on PYTHONPATH so `python3 -m
    // devlens_extractors_python` (spawned by devlensio with cwd=repoPath,
    // inheriting our env) imports it straight out of the zip. PREPEND so our
    // module wins, but PRESERVE any PYTHONPATH the user already had.
    const pyZip = path.join(cacheRoot, "python", "devlens_python.zip");
    if (fs.existsSync(pyZip)) {
      const sep = process.platform === "win32" ? ";" : ":";
      const existing = process.env.PYTHONPATH ?? "";
      process.env.PYTHONPATH = existing ? `${pyZip}${sep}${existing}` : pyZip;
    }
  } catch (err) {
    if (process.env.DEVLENS_VERBOSE) {
      console.error(`devlens: extractor materialisation failed: ${(err as Error).message}`);
    }
    return null;
  }
  return cacheRoot;
}

/**
 * Synchronously materialise embedded extractors and set DEVLENS_EXTRACTORS_DIR
 * so devlensio's (load-time) resolver finds them even when no
 * `node_modules/devlensio` is present anywhere on the machine.
 */
export function ensureExtractorsReady(): string | null {
  const root = bootstrapExtractors();
  if (root) process.env.DEVLENS_EXTRACTORS_DIR = root;
  return root;
}

/**
 * Report the extractor status for `doctor`. Returns per-artifact info.
 * Relies on the same extraction as the engine + the presence of runtimes. */
export interface ExtractorStatus {
  name: string;
  ok: boolean;
  detail: string;
}

export function extractorStatuses(): ExtractorStatus[] {
  const root = bootstrapExtractors() ?? process.env.DEVLENS_EXTRACTORS_DIR ?? null;
  const statuses: ExtractorStatus[] = [];

  // Go — static binary, no runtime needed.
  const go = root ? path.join(root, "go", "bin", enginePlatformDir(), "devlens_go_extractor") : null;
  statuses.push({
    name: "extractor.go",
    ok: !!go && fs.existsSync(go),
    detail: go && fs.existsSync(go) ? `static binary OK (${go})` : "missing go extractor binary — reinstall devlensio",
  });

  // Rust — static binary, no runtime needed.
  const rust = root ? path.join(root, "rust", "bin", enginePlatformDir(), "devlens_rust_extractor") : null;
  statuses.push({
    name: "extractor.rust",
    ok: !!rust && fs.existsSync(rust),
    detail: rust && fs.existsSync(rust) ? `static binary OK (${rust})` : "missing rust extractor binary — reinstall devlensio",
  });

  // Java — jar present + JVM on PATH.
  const jar = root ? path.join(root, "java", "devlens_java_extractor.jar") : null;
  if (jar && fs.existsSync(jar)) {
    const hasJava = commandOnPath("java");
    statuses.push({
      name: "extractor.java",
      ok: hasJava,
      detail: hasJava ? `fat jar + JVM 17+ runtime OK (${jar})` : `jar present (${jar}) but no JVM on PATH — install Java 17+`,
    });
  } else {
    statuses.push({
      name: "extractor.java",
      ok: false,
      detail: "missing java extractor jar — reinstall devlensio",
    });
  }

  // Python — the MODULE is bundled (a zip on PYTHONPATH); the INTERPRETER must
  // be on PATH (python3 on unix, python/python3 on win). Verify the module is
  // actually importable end-to-end, not just that the zip file exists.
  const pyZip = root ? path.join(root, "python", "devlens_python.zip") : null;
  const pyOnPath = commandOnPath("python3") || (process.platform === "win32" && commandOnPath("python"));
  if (!pyOnPath) {
    statuses.push({
      name: "extractor.python",
      ok: false,
      detail: "no Python 3.11+ runtime on PATH — install Python to analyze Python repos",
    });
  } else if (!pyZip || !fs.existsSync(pyZip)) {
    statuses.push({
      name: "extractor.python",
      ok: false,
      detail: "python runtime present but bundled module zip missing — reinstall devlensio",
    });
  } else {
    // Actually import the module from the zip the way devlensio will, so `doctor`
    // catches a corrupt/stale zip before `analyze` does.
    const ok = pythonModuleImports(pyZip);
    statuses.push({
      name: "extractor.python",
      ok,
      detail: ok ? `module + python3 runtime OK (zip on PYTHONPATH)` : `python3 present but module import failed (${pyZip})`,
    });
  }

  return statuses;
}

function commandOnPath(cmd: string): boolean {
  const pathEnv = process.env.PATH || "";
  const exts = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").toLowerCase().split(";")
    : [""];
  for (const dir of pathEnv.split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      if (fs.existsSync(path.join(dir, cmd + ext))) return true;
    }
  }
  return false;
}

/** Honestly verify the bundled python module imports from the zip on
 *  PYTHONPATH — the exact path devlensio's subprocess will take. Catches a
 *  corrupt/stale/empty zip (or a python3 that can't import it) before
 *  `analyze` does. Synchronous + best-effort (non-fatal). */
function pythonModuleImports(pyZip: string): boolean {
  const py = process.platform === "win32" ? "python" : "python3";
  try {
    const r = spawnSync(py, ["-c", "import devlens_extractors_python"], {
      env: { ...process.env, PYTHONPATH: pyZip },
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 15000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}
