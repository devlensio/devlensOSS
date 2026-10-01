// devlens init / config --set — stage-loop flow logic.
//
// Everything here is PROMPT-FREE and unit-testable: choice building, prompt
// message/defaults per provider, the save payload, and the ESC-to-go-back
// wrapper around @inquirer prompts (which ignore ESC themselves — see
// withEscBack below).
//
// Flow (each stage can go back with ESC or a visible "← Back" choice):
//   0 provider → 1 API type → 2 API key → 3 base URL → 4 model → 5 batch size
// ESC at stage 0 cancels the whole flow without touching the config.
import type { CatalogProvider, ProviderConfigEntry } from "devlensio";

// ── Sentinels ────────────────────────────────────────────────────────────────

/** Returned by a stage when the user asked to go back. */
export const GO_BACK = Symbol("devlens.init.back");
export type Back = typeof GO_BACK;

/** The "Custom…" entry in the provider select. */
export const CUSTOM = "__custom__";

// ── Provider choices (issue 12: catalog + saved, deduped, current preselected) ─

export interface ProviderChoice {
  /** What the select shows — `Label — OpenAI-compatible API` etc. */
  name: string;
  /** Stable identity: catalog name, or `provider:providerName` for saved-only. */
  id: string;
  value: {
    providerName: string;
    label: string;
    protocol: "openai" | "anthropic";
    /** Base URL default: saved entry wins over catalog (user's own override). */
    baseUrl?: string;
    /** Saved API key for this exact provider, if any. */
    savedApiKey?: string;
    savedModel?: string;
    savedBatchSize?: number;
    isCustom: boolean;
  };
}

/** Human wording for a wire protocol — "openai" alone reads like the vendor. */
export function protocolLabel(protocol: "openai" | "anthropic"): string {
  return protocol === "anthropic"
    ? "Anthropic-compatible API"
    : "OpenAI-compatible API";
}

export function providerChoiceLabel(label: string, protocol: "openai" | "anthropic"): string {
  return `${label} — ${protocolLabel(protocol)}`;
}

/**
 * Build the provider select choices: catalog entries first, then saved
 * config-only providers (deduped by name — catalog wins for display, but the
 * SAVED entry's baseUrl/key/model become the defaults when selected, since
 * that is what this user actually has).
 */
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
    if (catalogNames.has(s.providerName.toLowerCase())) continue; // deduped above
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
        isCustom: true, // not in the shipped catalog — but previously saved
      },
    });
  }

  choices.push({
    name: "Custom…",
    id: CUSTOM,
    value: { providerName: "", label: "", protocol: "openai", isCustom: true },
  });

  // Preselect the ACTIVE provider (falls back to first choice).
  let defaultIndex = 0;
  if (activeKey) {
    const i = choices.findIndex((c) => c.id === activeKey);
    if (i >= 0) defaultIndex = i;
  }
  return { choices, defaultIndex };
}

// ── API type stage (issue 10: explicit, proper wording, default openai) ──────

export function apiTypeChoices(): Array<{ name: string; value: "openai" | "anthropic" | Back }> {
  return [
    { name: "OpenAI-compatible (Chat Completions API)", value: "openai" },
    { name: "Anthropic-compatible (Messages API)", value: "anthropic" },
    { name: "← Back", value: GO_BACK },
  ];
}

// ── API key stage (issue 8: keep-key ONLY for the same provider) ─────────────

export interface KeyPromptSpec {
  message: string;
  /** True when empty input is allowed (saved key exists to retain). */
  canKeep: boolean;
  /** True when the user must provide a key to enable summarization here. */
  requiresKey: boolean;
}

export function keyPromptSpec(opts: {
  providerName: string;
  sameProvider: boolean; // re-selecting the provider that owns the saved entry
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

// ── Base URL stage (issue 9: default is THIS provider's, never the old one) ──

export interface UrlPromptSpec {
  message: string;
  /** Default to prefill; undefined = no sensible default (required input). */
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

/** Resolve what the user typed (or left empty) into the value we save. */
export function resolveBaseUrl(input: string, spec: UrlPromptSpec): string | undefined {
  const v = input.trim();
  if (v) return v;
  return spec.defaultUrl;
}

// ── Save payload (issue 6: never writes a config that cannot load) ───────────

export interface InitState {
  providerName: string;
  label: string;
  protocol: "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  model: string;
  batchSize: number;
}

/** writeConfig() partial for the state — identical shape to the old flow. */
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

// ── ESC → go back (issue 11) ─────────────────────────────────────────────────
//
// @inquirer prompts only handle enter/arrows/backspace — ESC is ignored and
// Ctrl+C rejects with ExitPromptError. We arm a raw-data listener while a
// prompt runs: a LONE ESC byte (arrow keys arrive as multi-byte chunks like
// \x1b[A, so they never match) aborts the prompt's AbortSignal —
// @inquirer/core rejects with AbortPromptError and runs its full cleanup
// (rl.close, raw-mode restore, cursor) via promise.finally, so the next
// stage's prompt starts from a clean slate. A REAL Ctrl+C reaches readline
// natively and rejects with ExitPromptError, which we rethrow so the
// top-level handler prints "Cancelled." and exits 130.
//
// Note: we originally tried injecting a ^C byte back into process.stdin —
// Bun's readline reads TTY input natively and ignores stream-level
// emit()/push(), so injection never reaches it. The AbortSignal path is
// the public cancel API and works everywhere.

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
    controller.abort(); // inquirer rejects AbortPromptError + cleans up
  };
  input.on("data", onData);
  try {
    const value = await run(controller.signal);
    return { kind: "done", value };
  } catch (err) {
    if (!armed) return { kind: "back" }; // we aborted → user pressed ESC
    throw err; // real Ctrl+C / prompt failure → propagate
  } finally {
    armed = false;
    input.removeListener("data", onData);
  }
}
