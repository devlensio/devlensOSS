import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import type { Command } from "commander";
import { resolveConfig } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit } from "../output.js";

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

        // summarization provider / key
        const cfg = resolveConfig();
        const provider = cfg.summarization.provider;
        checks.provider = { ok: true, detail: `${provider}/${cfg.summarization.model}` };
        if (provider === "ollama") {
          checks.apiKey = { ok: true, detail: "ollama — no API key needed" };
        } else {
          const hasKey = !!cfg.summarization.apiKey;
          checks.apiKey = { ok: hasKey, detail: hasKey ? "API key set" : `no API key for ${provider} — summarize will fail` };
        }

        // ollama reachability (best effort; only a problem if you intend to use it)
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 1500);
          const r = await fetch("http://localhost:11434", { signal: ctrl.signal });
          clearTimeout(t);
          checks.ollama = { ok: r.ok, detail: r.ok ? "reachable" : "responded but not OK" };
        } catch {
          checks.ollama = { ok: provider !== "ollama", detail: "not running (fine if using a cloud provider)" };
        }

        const ok = Object.values(checks).every((c) => c.ok);
        emit({ ok, checks });
      })
  );
}