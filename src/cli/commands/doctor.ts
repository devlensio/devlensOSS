import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Command } from "commander";
import { resolveConfig, resolveAllProviders, loadCatalog, findProvider, listModels } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, colors } from "../output.js";

interface Check {
  ok: boolean;
  detail: string;
}

// `devlens doctor` — environment health for analyze/summarize.
export function registerDoctorCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("doctor")
      .description("Check environment health (git, storage, LLM provider)")
      .action(async () => {
        const checks: Record<string, Check> = {};

        // git — engine shells out to it for commit info (not bundled in the binary)
        try {
          checks.git = { ok: true, detail: execSync("git --version").toString().trim() };
        } catch {
          checks.git = { ok: false, detail: "git not found — analyze falls back to a timestamp instead of a commit" };
        }

        // storage / config dir writable
        const dir = path.join(os.homedir(), ".devlens");
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.accessSync(dir, fs.constants.W_OK);
          checks.storage = { ok: true, detail: dir };
        } catch {
          checks.storage = { ok: false, detail: `cannot write ${dir}` };
        }

        // provider catalog load
        try {
          const catalog = loadCatalog();
          checks.catalog = { ok: true, detail: `${catalog.length} providers in catalog` };
        } catch (err: any) {
          checks.catalog = { ok: false, detail: `failed to load catalog: ${err?.message ?? err}` };
        }

        // summarization provider / key
        try {
          const cfg = resolveConfig();
          const provider = cfg.summarization.provider;
          const providerName = cfg.summarization.providerName ?? provider;

          // Multi-provider count
          let providerCount = 1;
          try {
            const allProviders = resolveAllProviders();
            providerCount = allProviders.providers.length;
          } catch { /* best-effort */ }

          checks.provider = {
            ok: true,
            detail: providerCount > 1
              ? `${providerCount} providers configured (active: ${providerName}/${provider})`
              : `${providerName} (${provider}) / ${cfg.summarization.model}`,
          };

          const entry = findProvider(providerName);
          const needsKey = entry?.requiresKey ?? true;
          if (needsKey) {
            const hasKey = !!cfg.summarization.apiKey;
            checks.apiKey = {
              ok: hasKey,
              detail: hasKey ? "API key set" : `no API key for ${providerName} — summarize will fail`,
            };
          } else {
            checks.apiKey = { ok: true, detail: `${entry?.label ?? providerName} — no API key needed` };
          }

          // model list reachability (best-effort)
          try {
            const baseUrl = cfg.summarization.baseUrl ?? entry?.baseUrl ?? "";
            const models = await listModels({
              protocol: provider as "openai" | "anthropic",
              baseUrl,
              apiKey: needsKey ? (cfg.summarization.apiKey || undefined) : undefined,
            });
            checks.models = { ok: true, detail: `${models.length} models available` };
          } catch (err: any) {
            checks.models = {
              ok: false,
              detail: `model list unreachable: ${err?.message ?? "unknown error"}`,
            };
          }
        } catch (err: any) {
          checks.provider = { ok: false, detail: `config not set up: ${err?.message ?? err}` };
          checks.apiKey = { ok: false, detail: "N/A — config incomplete" };
        }

        // ollama reachability (best effort; only a problem if you intend to use it)
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 1500);
          const r = await fetch("http://localhost:11434", { signal: ctrl.signal });
          clearTimeout(t);
          checks.ollama = { ok: r.ok, detail: r.ok ? "reachable" : "responded but not OK" };
        } catch {
          checks.ollama = { ok: false, detail: "not running (fine if using a cloud provider)" };
        }

        // ── Extractor runtimes (multi-language support) ─────────────────────
        // The engine ships 4 subprocess extractors inside devlensio: a Python
        // venv (created by postinstall), a Java fat jar, and Go/Rust static
        // binaries (no runtime needed). bun blocks dependency postinstall by
        // default, so the python venv is the one that silently goes missing.
        // In a compiled binary `require.resolve` can't see node_modules, so we
        // walk up from the cwd to find the devlensio package as well.
        let engineRoot: string | null = null;
        try {
          engineRoot = path.dirname(createRequire(import.meta.url).resolve("devlensio/package.json"));
        } catch {
          let dir = path.resolve(process.cwd());
          while (dir !== path.dirname(dir)) {
            const nm = path.join(dir, "node_modules", "devlensio");
            if (fs.existsSync(nm)) { engineRoot = nm; break; }
            dir = path.dirname(dir);
          }
        }
        const platformDir = `${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}`;
        const pyVenvPython = engineRoot ? path.join(
          engineRoot, "extractors", "python", ".venv",
          process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
        ) : null;
        const javaJar = engineRoot ? path.join(engineRoot, "extractors", "java", "devlens_java_extractor.jar") : null;
        const goBin = engineRoot ? path.join(engineRoot, "extractors", "go", "bin", platformDir, "devlens_go_extractor") : null;
        const rustBin = engineRoot ? path.join(engineRoot, "extractors", "rust", "bin", platformDir, "devlens_rust_extractor") : null;

        const VENV_HINT =
          "run `bun pm trust devlensio && bun install` (or `npm install` which runs postinstall), " +
          (engineRoot ? `or manually: node ${path.join(engineRoot, "extractors", "python", "setup.mjs")}` : "");

        if (!engineRoot) {
          checks["extractor.python"] = { ok: false, detail: "devlensio package not found (install it, or run from a project that has it)" };
          checks["extractor.java"] = { ok: false, detail: "devlensio package not found" };
          checks["extractor.go"] = { ok: false, detail: "devlensio package not found" };
          checks["extractor.rust"] = { ok: false, detail: "devlensio package not found" };
        } else {
          if (pyVenvPython && fs.existsSync(pyVenvPython)) {
            try {
              execFileSync(pyVenvPython, ["-c", "import devlens_extractors_python"], { stdio: "pipe", timeout: 20000 });
              checks["extractor.python"] = { ok: true, detail: "venv + module import OK (Python)" };
            } catch {
              checks["extractor.python"] = { ok: false, detail: `venv present but import failed — ${VENV_HINT}` };
            }
          } else {
            checks["extractor.python"] = {
              ok: false,
              detail: `no Python venv (${pyVenvPython}) — postinstall was likely blocked by bun/npm. ${VENV_HINT}`,
            };
          }

          checks["extractor.java"] = javaJar && fs.existsSync(javaJar)
            ? (() => {
                try {
                  execFileSync("java", ["-version"], { stdio: "pipe", timeout: 10000 });
                  return { ok: true, detail: "fat jar + JVM 17+ runtime OK (Java)" };
                } catch {
                  return { ok: false, detail: `jar present (${javaJar}) but no JVM on PATH — install Java 17+` };
                }
              })()
            : { ok: false, detail: `missing java extractor jar (${javaJar}) — reinstall devlensio` };

          checks["extractor.go"] = {
            ok: !!goBin && fs.existsSync(goBin),
            detail: goBin && fs.existsSync(goBin) ? `static binary OK (${goBin}) — no Go toolchain needed` : `missing go extractor binary (${goBin}) — reinstall devlensio`,
          };

          checks["extractor.rust"] = {
            ok: !!rustBin && fs.existsSync(rustBin),
            detail: rustBin && fs.existsSync(rustBin) ? `static binary OK (${rustBin}) — no Rust toolchain needed` : `missing rust extractor binary (${rustBin}) — reinstall devlensio`,
          };
        }

        const ok = Object.values(checks).every((c) => c.ok);
        emit({ ok, checks });
      })
  );
}
