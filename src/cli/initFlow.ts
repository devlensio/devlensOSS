// devlens init / config --set — the stage-loop flow logic.
//
// Everything in this file is PROMPT-FREE and unit-testable. The interactive
// shell lives in commands/config.ts; this module owns:
//
//   - GO_BACK / CUSTOM sentinels and the ProviderChoice shape
//   - buildProviderChoices(): the provider select list = shipped catalog
//     first, then saved config-only providers (deduped by name — the catalog
//     entry wins for display, but the SAVED entry's baseUrl/key/model become
//     the defaults, since that is what this user actually has), then a
//     "Custom…" entry; the active provider id is preselected.
//   - Prompt copy/defaults per stage, each pinned to the SELECTED provider so
//     values from a previously-active provider can never leak in:
//       keep-key wording only for re-selecting the same provider,
//       base-URL default = saved ?? catalog for this provider,
//       API-type choices with explicit wording, openai first.
//   - buildSavePayload(): the writeConfig() partial — omits empty apiKey so
//     writeConfig preserves an existing saved key on re-save.
//   - withEscBack(): ESC-to-go-back around @inquirer prompts. @inquirer
//     ignores ESC and cannot be cancelled by injecting bytes (Bun's readline
//     reads TTY input natively — stream emit()/push() never reach it), so the
//     wrapper arms a raw-data listener for a LONE ESC byte (arrow keys arrive
//     as multi-byte chunks like \x1b[A) and aborts the AbortSignal passed as
//     the inquirer context: @inquirer/core rejects AbortPromptError and runs
//     full cleanup (rl.close, raw-mode restore) via promise.finally, so the
//     next stage starts clean. A real Ctrl+C reaches readline natively and
//     rejects ExitPromptError, which is rethrown for the top-level handler
//     ("Cancelled.", exit 130).
//
// Flow: 0 provider → 1 API type → 2 API key → 3 base URL → 4 model →
//       5 batch size. ESC at stage 0 cancels without touching the config.
import type { CatalogProvider, ProviderConfigEntry } from "devlensio";

export const GO_BACK = Symbol("devlens.init.back");
export type Back = typeof GO_BACK;

export const CUSTOM = "__custom__";

export interface ProviderChoice {
  name: string;
  id: string;
  value: {
    providerName: string;
    label: string;
    protocol: "openai" | "anthropic";
    baseUrl?: string;
    savedApiKey?: string;
    savedModel?: string;
    savedBatchSize?: number;
    isCustom: boolean;
  };
}

export function protocolLabel(protocol: "openai" | "anthropic"): string {
  return protocol === "anthropic"
    ? "Anthropic-compatible API"
    : "OpenAI-compatible API";
}

export function providerChoiceLabel(label: string, protocol: "openai" | "anthropic"): string {
  return `${label} — ${protocolLabel(protocol)}`;
}

export function buildProviderChoices(
  catalog: CatalogProvider[],
  saved: ProviderConfigEntry[],
  activeKey?: string,
): { choices: ProviderChoice[]; defaultIndex: number } {
  const savedByName = new Map(saved.map((p) => [p.providerName.toLowerCase(), p]));
  const choices: ProviderChoice[] = [];

  for (const c of catalog) {
    const s = savedByName.get(c.name.toLowerCase());
    choices.push({
      name: providerChoiceLabel(c.label, s?.provider ?? c.protocol),
      id: `${s?.provider ?? c.protocol}:${c.name}`,
      value: {
        providerName: c.name,
        label: c.label,
        protocol: (s?.provider ?? c.protocol) as "openai" | "anthropic",
        baseUrl: s?.baseUrl ?? c.baseUrl,
        savedApiKey: s?.apiKey,
        savedModel: s?.model,
        savedBatchSize: s?.batchSize,
        isCustom: false,
      },
    });
  }

  const catalogNames = new Set(catalog.map((c) => c.name.toLowerCase()));
  for (const s of saved) {
    if (catalogNames.has(s.providerName.toLowerCase())) continue;
    choices.push({
      name: providerChoiceLabel(s.providerName, s.provider),
      id: `${s.provider}:${s.providerName}`,
      value: {
        providerName: s.providerName,
        label: s.providerName,
        protocol: s.provider,
        baseUrl: s.baseUrl,
        savedApiKey: s.apiKey,
        savedModel: s.model,
        savedBatchSize: s.batchSize,
        isCustom: true,
      },
    });
  }

  choices.push({
    name: "Custom…",
    id: CUSTOM,
    value: { providerName: "", label: "", protocol: "openai", isCustom: true },
  });

  let defaultIndex = 0;
  if (activeKey) {
    const i = choices.findIndex((c) => c.id === activeKey);
    if (i >= 0) defaultIndex = i;
  }
  return { choices, defaultIndex };
}

export function apiTypeChoices(): Array<{ name: string; value: "openai" | "anthropic" | Back }> {
  return [
    { name: "OpenAI-compatible (Chat Completions API)", value: "openai" },
    { name: "Anthropic-compatible (Messages API)", value: "anthropic" },
    { name: "← Back", value: GO_BACK },
  ];
}

export interface KeyPromptSpec {
  message: string;
  canKeep: boolean;
  requiresKey: boolean;
}

export function keyPromptSpec(opts: {
  providerName: string;
  sameProvider: boolean;
  hasSavedKey: boolean;
  requiresKey: boolean;
}): KeyPromptSpec {
  const { providerName, sameProvider, hasSavedKey, requiresKey } = opts;
  if (sameProvider && hasSavedKey) {
    return {
      message: `API key (Enter to keep the saved key for ${providerName})`,
      canKeep: true,
      requiresKey,
    };
  }
  return {
    message: `API key for ${providerName} (Enter to skip — summaries stay disabled without it)`,
    canKeep: false,
    requiresKey,
  };
}

export interface UrlPromptSpec {
  message: string;
  defaultUrl?: string;
  required: boolean;
}

export function urlPromptSpec(providerLabel: string, defaultUrl?: string): UrlPromptSpec {
  if (defaultUrl) {
    return {
      message: `Base URL for ${providerLabel} (Enter to use ${defaultUrl})  ·  ESC = back`,
      defaultUrl,
      required: true,
    };
  }
  return {
    message: `Base URL for ${providerLabel} (e.g. https://api.example.com/v1)  ·  ESC = back`,
    required: true,
  };
}

export function validateBaseUrl(input: string, spec: UrlPromptSpec): true | string {
  const v = input.trim();
  if (!v) return spec.defaultUrl ? true : "Base URL is required";
  return v.startsWith("http://") || v.startsWith("https://")
    ? true
    : "Must be an http(s):// URL";
}

export function resolveBaseUrl(input: string, spec: UrlPromptSpec): string | undefined {
  const v = input.trim();
  if (v) return v;
  return spec.defaultUrl;
}

export interface InitState {
  providerName: string;
  label: string;
  protocol: "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  model: string;
  batchSize: number;
}

export function buildSavePayload(state: InitState): {
  summarization: {
    provider: "openai" | "anthropic";
    providerName: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    batchSize: number;
  };
} {
  return {
    summarization: {
      provider: state.protocol,
      providerName: state.providerName,
      model: state.model,
      ...(state.apiKey ? { apiKey: state.apiKey } : {}),
      ...(state.baseUrl ? { baseUrl: state.baseUrl } : {}),
      batchSize: state.batchSize,
    },
  };
}

export type EscResult<T> = { kind: "done"; value: T } | { kind: "back" };

export function isLoneEsc(buf: unknown): boolean {
  return Buffer.isBuffer(buf) && buf.length === 1 && buf[0] === 0x1b;
}

export async function withEscBack<T>(
  run: (signal: AbortSignal) => Promise<T>,
  input: {
    on(ev: "data", fn: (b: Buffer) => void): unknown;
    removeListener(ev: "data", fn: (b: Buffer) => void): unknown;
  } = process.stdin as never,
): Promise<EscResult<T>> {
  let armed = true;
  const controller = new AbortController();
  const onData = (buf: Buffer) => {
    if (!armed || !isLoneEsc(buf)) return;
    armed = false;
    input.removeListener("data", onData);
    controller.abort();
  };
  input.on("data", onData);
  try {
    const value = await run(controller.signal);
    return { kind: "done", value };
  } catch (err) {
    if (!armed) return { kind: "back" };
    throw err;
  } finally {
    armed = false;
    input.removeListener("data", onData);
  }
}
