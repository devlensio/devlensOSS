// `devlens config` — show or update ~/.devlens/config.json, plus the
// interactive setup flow shared with `devlens init`.
//
// Surfaces:
//   - bare `devlens config` / always after mutations: masked flat config
//     (SafeConfig shape, embedding field kept for API compatibility but not
//     rendered) via resolveTolerant(), then a best-effort listing of every
//     saved provider with the active one starred.
//   - flags (--provider/--model/--api-key/…): non-interactive scripting path;
//     --provider accepts a wire protocol (openai|anthropic) or a catalog name
//     (resolved to protocol + providerName).
//   - --active <protocol:name> / --remove <key>: switch or delete a saved
//     provider entry; both fail with the engine's message via die().
//   - --set (alias `config set`): the interactive flow.
//
// configInteractive(prefill) is a 6-stage loop —
//   0 provider → 1 API type → 2 API key → 3 base URL → 4 model → 5 batch size
// — driven entirely by the pure helpers in ../initFlow.ts: every prompt value
// is pinned to the SELECTED provider (saved entry ?? catalog), never to the
// previously-active one; ESC (or a visible "← Back") returns one stage and ESC
// at stage 0 cancels without writing; Custom… collects a name inline at stage
// 0 and defaults its API type to openai. The model list is fetched live from
// the selected provider's endpoint and falls back to manual entry; a keyless
// save is allowed but warned (summarize stays disabled until a key is added).
// writeConfig() upserts the entry and activates it.
import { select, input, password, search } from "@inquirer/prompts";
import type { Command } from "commander";
import { maskConfig, writeConfig, resolveAllProviders, setActiveProvider, removeProviderConfig, loadCatalog, findProvider, listModels } from "devlensio";
import type { LLMProvider } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { resolveTolerant } from "../../core/tolerantConfig.js";
import { emit, success, info, warn, die } from "../output.js";
import {
  buildProviderChoices,
  apiTypeChoices,
  keyPromptSpec,
  urlPromptSpec,
  validateBaseUrl,
  resolveBaseUrl,
  buildSavePayload,
  withEscBack,
  GO_BACK,
  type ProviderChoice,
} from "../initFlow.js";

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command("config")
    .description("Show or update DevLens configuration (~/.devlens/config.json)")
    .option("--set", "interactively set summarization configuration")
    .option("--provider <p>", "summarization provider protocol (openai|anthropic)")
    .option("--provider-name <n>", "provider name/identity (e.g. deepseek, my-custom)")
    .option("--model <m>", "summarization model")
    .option("--api-key <k>", "summarization API key")
    .option("--base-url <u>", "base URL (e.g. https://api.deepseek.com)")
    .option("--batch-size <n>", "summarization batch size")
    .option("--active <key>", "switch active provider (e.g. openai:deepseek)")
    .option("--remove <key>", "remove a provider entry")
    .action(async (opts) => {
      const hasFlagUpdate =
        opts.provider || opts.providerName || opts.model || opts.apiKey || opts.baseUrl || opts.batchSize;

      if (opts.active) {
        try {
          setActiveProvider(opts.active);
          success(`Active provider set to "${opts.active}"`);
        } catch (err: any) {
          die(err?.message ?? "Failed to switch active provider");
        }
        showConfig();
        return;
      }

      if (opts.remove) {
        try {
          removeProviderConfig(opts.remove);
          success(`Provider "${opts.remove}" removed`);
        } catch (err: any) {
          die(err?.message ?? "Failed to remove provider");
        }
        showConfig();
        return;
      }

      if (hasFlagUpdate && !opts.set) {
        if (opts.provider && opts.provider !== "openai" && opts.provider !== "anthropic") {
          const entry = findProvider(opts.provider);
          if (entry) {
            opts.provider = entry.protocol;
            if (!opts.providerName) opts.providerName = entry.name;
          } else {
            die(
              `Invalid provider: "${opts.provider}".\n` +
              `  The --provider flag expects a wire protocol ("openai" | "anthropic")\n` +
              `  or a known provider name from the catalog.\n` +
              `  Use --provider-name for the brand identity (e.g. --provider openai --provider-name my-custom).\n` +
              `  Run "devlens providers list" to see catalog entries.`
            );
          }
        }

        writeConfig({
          summarization: {
            ...(opts.provider && { provider: opts.provider as LLMProvider }),
            ...(opts.providerName && { providerName: opts.providerName }),
            ...(opts.model && { model: opts.model }),
            ...(opts.apiKey && { apiKey: opts.apiKey }),
            ...(opts.baseUrl && { baseUrl: opts.baseUrl }),
            ...(opts.batchSize && { batchSize: parseInt(opts.batchSize, 10) }),
          },
        });
        success("Config updated.");
      } else if (hasFlagUpdate && opts.set) {
        await configInteractive(opts);
      } else if (opts.set) {
        await configInteractive({});
      }

      showConfig();
    });

  withGlobalFlags(
    cmd
      .command("set")
      .description("Interactively set summarization configuration")
      .action(async () => {
        await configInteractive({});
        emit(maskConfig(resolveTolerant()));
      })
  );

  withGlobalFlags(cmd);
}

function showConfig(): void {
  emit(maskConfig(resolveTolerant()));

  try {
    const allProviders = resolveAllProviders();
    if (allProviders.providers.length > 0) {
      info("");
      info("Configured providers:");
      for (const p of allProviders.providers) {
        const key = `${p.provider}:${p.providerName}`;
        const marker = key === allProviders.active ? " ★ (active)" : "";
        const keyStatus = p.apiKey ? " [key set]" : " [no key]";
        info(`  ${key}${marker}`);
        info(`    Model: ${p.model || "(not set)"}${keyStatus}  Batch: ${p.batchSize}`);
        if (p.baseUrl) info(`    Base: ${p.baseUrl}`);
      }
    }
  } catch {}
}

export async function configInteractive(prefill: Record<string, any> = {}): Promise<void> {
  const catalog = loadCatalog();
  const saved = resolveAllProviders();

  const built = buildProviderChoices(catalog, saved.providers, saved.active);
  const choices = built.choices;
  let defaultIndex = built.defaultIndex;
  if (prefill.providerName) {
    const i = choices.findIndex((c) => c.value.providerName === prefill.providerName);
    if (i >= 0) defaultIndex = i;
  }

  let stage = 0;
  let picked: ProviderChoice | null = null;
  let isCustom = false;
  let customName = String(prefill.providerName ?? "");
  let protocol: "openai" | "anthropic" = "openai";
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let label = "";
  let providerName = "";
  let model = "";
  let batchSize = 50;
  let preselected = choices[defaultIndex];
  let savedId: string | undefined = undefined;

  while (true) {
    if (stage === 0) {
      const res = await withEscBack((signal) =>
        select<ProviderChoice["value"]>({
          message: "Choose a summarization provider",
          choices: choices,
          default: preselected?.value,
        }, { signal }),
      );
      if (res.kind === "back") {
        info("Setup cancelled — your existing config was not changed.");
        return;
      }
      const chosen = choices.find((c) => c.value === res.value);

      if (res.value && (res.value as { providerName?: string }).providerName === "" ) {
        const nameRes = await withEscBack((signal) =>
          input({
            message: "Provider name (e.g. my-lmalite)  ·  ESC = back",
            default: customName,
            validate: (s: string) => (s.trim() ? true : "Provider name is required"),
          }, { signal }),
        );
        if (nameRes.kind === "back") continue;
        customName = nameRes.value.trim();
        isCustom = true;
        picked = null;
        providerName = customName;
        label = customName;
        savedId = undefined;
        protocol = "openai";
        apiKey = undefined;
        baseUrl = prefill.baseUrl ?? undefined;
      } else if (chosen) {
        isCustom = false;
        picked = chosen;
        providerName = chosen.value.providerName;
        label = chosen.value.label;
        protocol = chosen.value.protocol;
        apiKey = chosen.value.savedApiKey;
        baseUrl = prefill.baseUrl ?? chosen.value.baseUrl;
        preselected = chosen;
        savedId = chosen.id;
      }
      stage = 1;
      continue;
    }

    if (stage === 1) {
      const res = await withEscBack((signal) =>
        select<"openai" | "anthropic" | typeof GO_BACK>({
          message: `API type for ${label}`,
          choices: apiTypeChoices(),
          default: protocol,
        }, { signal }),
      );
      if (res.kind === "back" || res.value === GO_BACK) {
        stage = 0;
        continue;
      }
      protocol = res.value as "openai" | "anthropic";
      stage = 2;
      continue;
    }

    if (stage === 2) {
      const requiresKey = pickRequiresKey(catalog, providerName, isCustom);
      const spec = keyPromptSpec({
        providerName,
        sameProvider: !!apiKey,
        hasSavedKey: !!apiKey,
        requiresKey,
      });
      const res = await withEscBack((signal) =>
        password({
          message: spec.message,
          mask: "*",
        }, { signal }),
      );
      if (res.kind === "back") {
        stage = 1;
        continue;
      }
      const entered = res.value.trim();
      if (entered) {
        apiKey = entered;
      } else if (!spec.canKeep) {
        apiKey = undefined;
        if (requiresKey) {
          warn(`No API key saved — \`devlens summarize\` stays disabled for ${providerName} until you add one.`);
        }
      }
      stage = 3;
      continue;
    }

    if (stage === 3) {
      const spec = urlPromptSpec(label, baseUrl);
      const res = await withEscBack((signal) =>
        input({
          message: spec.message,
          default: spec.defaultUrl ?? "",
          validate: (s: string) => validateBaseUrl(s, spec),
        }, { signal }),
      );
      if (res.kind === "back") {
        stage = 2;
        continue;
      }
      baseUrl = resolveBaseUrl(res.value, spec);
      stage = 4;
      continue;
    }

    if (stage === 4) {
      let models: string[] = [];
      try {
        info("Fetching models from provider…");
        models = await listModels({
          protocol,
          baseUrl: baseUrl ?? "",
          apiKey: apiKey || undefined,
        });
      } catch (err: any) {
        warn(`Couldn't fetch model list: ${err?.message ?? err}. You can type a model name manually.`);
      }

      if (models.length > 0) {
        const modelChoices = [
          ...models.map((m) => ({ name: m, value: m as string | typeof GO_BACK | "__type__" })),
          { name: "Other (type a custom model)", value: "__type__" as string | typeof GO_BACK },
          { name: "← Back", value: GO_BACK as string | typeof GO_BACK },
        ];
        const selected = await withEscBack((signal) =>
          search<string | typeof GO_BACK | "__type__">({
            message: "Model",
            source: (q = "") => {
              const needle = q.toLowerCase();
              const filtered = needle
                ? modelChoices.filter(
                    (m) => m.value === "__type__" || m.value === GO_BACK || m.name.toLowerCase().includes(needle),
                  )
                : modelChoices;
              return filtered.slice(0, 25).map((m) => ({
                name: m.name,
                value: m.value,
                description: m.value === "__type__" ? "Enter any model name" : undefined,
              }));
            },
          }, { signal }),
        );
        if (selected.kind === "back" || selected.value === GO_BACK) {
          stage = 3;
          continue;
        }
        if (selected.value === "__type__") {
          const customRes = await withEscBack((signal) =>
            input({
              message: "Custom model name  ·  ESC = back",
              default: prefill.model ?? savedModelFor(savedId, saved),
              validate: (s: string) => (s.trim() ? true : "Model name is required"),
            }, { signal }),
          );
          if (customRes.kind === "back") {
            stage = 3;
            continue;
          }
          model = customRes.value.trim();
        } else {
          model = selected.value as string;
        }
      } else {
        const manualRes = await withEscBack((signal) =>
          input({
            message: "Model name  ·  ESC = back",
            default: prefill.model ?? savedModelFor(savedId, saved),
            validate: (s: string) => (s.trim() ? true : "Model name is required"),
          }, { signal }),
        );
        if (manualRes.kind === "back") {
          stage = 3;
          continue;
        }
        model = manualRes.value.trim();
      }
      stage = 5;
      continue;
    }

    const defaultBatch = String(
      prefill.batchSize ??
        (isCustom ? undefined : picked?.value.savedBatchSize) ??
        50,
    );
    const batchRes = await withEscBack((signal) =>
      input({
        message: "Batch size (nodes per request)  ·  ESC = back",
        default: defaultBatch,
        validate: (s: string) => {
          const n = parseInt(s, 10);
          return !isNaN(n) && n >= 1 && n <= 500 ? true : "Must be a number between 1 and 500";
        },
      }, { signal }),
    );
    if (batchRes.kind === "back") {
      stage = 4;
      continue;
    }
    batchSize = parseInt(batchRes.value, 10);
    break;
  }

  const payload = buildSavePayload({
    providerName,
    label,
    protocol,
    apiKey,
    baseUrl,
    model,
    batchSize,
  });
  writeConfig(payload);
  success(`Config saved — ${providerName} / ${model}`);
}

function pickRequiresKey(
  catalog: ReturnType<typeof loadCatalog>,
  providerName: string,
  isCustom: boolean,
): boolean {
  if (isCustom) return true;
  return catalog.find((c) => c.name === providerName)?.requiresKey ?? true;
}

function savedModelFor(id: string | undefined, saved: ReturnType<typeof resolveAllProviders>): string | undefined {
  if (!id) return undefined;
  const [provider, ...rest] = id.split(":");
  const name = rest.join(":");
  return saved.providers.find((p) => p.provider === provider && p.providerName === name)?.model;
}
