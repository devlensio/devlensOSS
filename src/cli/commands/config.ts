import { select, input, password, search } from "@inquirer/prompts";
import type { Command } from "commander";
import { resolveConfig, maskConfig, writeConfig, resolveAllProviders, setActiveProvider, removeProviderConfig, loadCatalog, findProvider, listModels } from "devlensio";
import type { LLMProvider, CatalogProvider } from "devlensio";
import { withGlobalFlags } from "../options.js";
import { emit, success, info, warn, die } from "../output.js";

const CUSTOM_SENTINEL = "__custom__";

// `devlens config` — show config; with flags or --set, update it.
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

      // ── --active: switch active provider ─────────────────────────────────
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

      // ── --remove: remove a provider entry ────────────────────────────────
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
        // Validate --provider: must be a valid protocol, or resolvable via catalog
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

        // Non-interactive scripting path
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
        // Flags + --set → interactive with pre-filled values
        await configInteractive(opts);
      } else if (opts.set) {
        await configInteractive({});
      }

      // Always show the (masked) current config.
      showConfig();
    });

  // Add `devlens config set` as an alias for `devlens config --set`
  withGlobalFlags(
    cmd
      .command("set")
      .description("Interactively set summarization configuration")
      .action(async () => {
        await configInteractive({});
        emit(maskConfig(resolveConfig()));
      })
  );

  // Apply global flags to both the parent and subcommand
  withGlobalFlags(cmd);
}

// ── Display all configured providers ───────────────────────────────────────

function showConfig(): void {
  // Show masked flat config for backward compat
  emit(maskConfig(resolveConfig()));

  // Show all configured providers
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
  } catch {
    // best-effort — ignore errors
  }
}

// ── Interactive config flow ──────────────────────────────────────────────────

export async function configInteractive(prefill: Record<string, any> = {}): Promise<void> {
  const cur = resolveConfig().summarization;
  const catalog = loadCatalog();

  // Build provider choices
  type ChoiceValue = CatalogProvider | typeof CUSTOM_SENTINEL;
  const knownChoices = catalog.map(p => ({
    name: `${p.label} (${p.protocol})`,
    value: p as ChoiceValue,
  }));
  const allChoices: Array<{ name: string; value: ChoiceValue }> = [
    ...knownChoices,
    { name: "Custom…", value: CUSTOM_SENTINEL as ChoiceValue },
  ];

  // Determine pre-selected provider
  const prefillName = prefill.providerName ?? prefill["provider-name"];
  const defaultProvider = prefillName
    ? allChoices.find(
        c => typeof c.value === "object" && c.value.name === prefillName
      )?.value
    : allChoices.find(
        c => typeof c.value === "object" && c.value.name === cur.providerName
      )?.value;

  // 1) Pick provider
  const picked = await select<ChoiceValue>({
    message: "Choose a summarization provider",
    choices: allChoices,
    ...(defaultProvider ? { default: defaultProvider } : {}),
  });

  let providerName: string;
  let protocol: "openai" | "anthropic";
  let baseUrl: string;
  let apiKey: string | undefined;

  if (typeof picked === "string" && picked === CUSTOM_SENTINEL) {
    providerName = await input({
      message: "Provider name (e.g. my-lmalite)",
      default: prefillName ?? "",
      validate: (s) => (s.trim() ? true : "Provider name is required"),
    });

    protocol = await select<"openai" | "anthropic">({
      message: "API style",
      choices: [
        { name: "OpenAI-compatible", value: "openai" },
        { name: "Anthropic-compatible", value: "anthropic" },
      ],
      default: prefill.provider === "anthropic" ? "anthropic" : "openai",
    });

    baseUrl = await input({
      message: "Base URL (https://…/v1)",
      default: prefill.baseUrl ?? "",
      validate: (u) =>
        u.startsWith("http") ? true : "Must be an http(s):// URL",
    });

    apiKey = await password({
      message: "API key",
      mask: "*",
    });
  } else {
    providerName = picked.name;
    protocol = picked.protocol as "openai" | "anthropic";
    baseUrl = picked.baseUrl;
    const needsKey = picked.requiresKey;

    if (needsKey) {
      apiKey =
        (await password({
          message: `API key (leave empty to keep "${cur.providerName || "current"}" key)`,
          mask: "*",
        })) || undefined;
    } else {
      apiKey = undefined;
      info(`${picked.label} — no API key needed`);
    }

    // Allow overriding base URL
    const overrideBase = await input({
      message: "Base URL (leave empty for default)",
      default: cur.baseUrl ?? "",
    });
    if (overrideBase.trim()) baseUrl = overrideBase.trim();
  }

  // 2) Model: fetch live list, fall back to free text
  let model = "";
  let models: string[] = [];

  try {
    info("Fetching models from provider…");
    models = await listModels({
      protocol,
      baseUrl,
      apiKey: apiKey || undefined,
    });
  } catch (err: any) {
    warn(`Couldn't fetch model list: ${err?.message ?? err}. You can type a model name manually.`);
  }

  if (models.length > 0) {
    // Append a "Custom model" option
    const modelChoices = [
      ...models.map((m) => ({ name: m, value: m })),
      { name: "Other (type a custom model)", value: "__type__" as const },
    ];

    const selected = await search({
      message: "Model",
      source: (input = "", _opt) => {
        const q = input.toLowerCase();
        const filtered = q
          ? modelChoices.filter((m) => m.value === "__type__" || m.name.toLowerCase().includes(q))
          : modelChoices;
        return filtered.slice(0, 25).map((m) => ({
          name: m.name,
          value: m.value,
          description: m.value === "__type__" ? "Enter any model name" : undefined,
        }));
      },
    });

    if (selected === "__type__") {
      model = await input({
        message: "Custom model name",
        default: cur.model,
        validate: (s) => (s.trim() ? true : "Model name is required"),
      });
    } else {
      model = selected;
    }
  } else {
    model = await input({
      message: "Model name",
      default: prefill.model ?? cur.model,
      validate: (s) => (s.trim() ? true : "Model name is required"),
    });
  }

  // 3) Batch size
  const batchSizeRaw = await input({
    message: "Batch size",
    default: String(prefill.batchSize ?? cur.batchSize ?? 50),
    validate: (s) => {
      const n = parseInt(s, 10);
      return !isNaN(n) && n >= 1 && n <= 500 ? true : "Must be a number between 1 and 500";
    },
  });

  // 4) Write config
  writeConfig({
    summarization: {
      provider: protocol,
      providerName,
      model,
      ...(apiKey ? { apiKey } : {}),
      baseUrl,
      batchSize: parseInt(batchSizeRaw, 10),
    },
  });

  success(`Config saved — ${providerName} / ${model}`);
}
