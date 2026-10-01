import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import type { Command } from "commander";
import { resolveConfig, resolveAllProviders, loadCatalog, findProvider, listModels } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, colors } from "../output.js";
import { extractorStatuses } from "../extractors.js";
import { resolveTolerant } from "../../core/tolerantConfig.js";

interface Check {
  ok: boolean;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  withGlobalFlags(
    program
      .command("doctor")
      .description("Check environment health (git, storage, LLM provider)")
      .action(async () => {
        const checks: Record<string, Check> = {};

        try {
          checks.git = { ok: true, detail: execSync("git --version").toString().trim() };
        } catch {
          checks.git = { ok: false, detail: "git not found — analyze falls back to a timestamp instead of a commit" };
        }

        const dir = path.join(os.homedir(), ".devlens");
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.accessSync(dir, fs.constants.W_OK);
          checks.storage = { ok: true, detail: dir };
        } catch {
          checks.storage = { ok: false, detail: `cannot write ${dir}` };
        }

        try {
          const catalog = loadCatalog();
          checks.catalog = { ok: true, detail: `${catalog.length} providers in catalog` };
        } catch (err: any) {
          checks.catalog = { ok: false, detail: `failed to load catalog: ${err?.message ?? err}` };
        }

        try {
          const cfg = resolveTolerant();
          const provider = cfg.summarization.provider;
          const providerName = cfg.summarization.providerName ?? provider;

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

          const canProbeModels = !needsKey || !!cfg.summarization.apiKey;
          if (!canProbeModels) {
            checks.models = { ok: false, detail: `skipped — no API key for ${providerName}` };
          } else try {
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

        const extStatuses = await extractorStatuses();
        for (const s of extStatuses) checks[s.name] = { ok: s.ok, detail: s.detail };

        const ok = Object.values(checks).every((c) => c.ok);
        emit({ ok, checks });
      })
  );
}
