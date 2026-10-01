import { describe, test, expect } from "bun:test";
import { EventEmitter } from "node:events";
import type { CatalogProvider, ProviderConfigEntry } from "devlensio";
import {
  buildProviderChoices,
  protocolLabel,
  providerChoiceLabel,
  apiTypeChoices,
  keyPromptSpec,
  urlPromptSpec,
  validateBaseUrl,
  resolveBaseUrl,
  buildSavePayload,
  withEscBack,
  isLoneEsc,
  CUSTOM,
  GO_BACK,
} from "./initFlow.js";

const CATALOG: CatalogProvider[] = [
  { name: "deepseek", label: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com", requiresKey: true },
  { name: "anthropic", label: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com", requiresKey: true },
];

const SAVED: ProviderConfigEntry[] = [
  {
    provider: "openai",
    providerName: "deepseek",
    model: "deepseek-chat",
    apiKey: "sk-saved",
    baseUrl: "https://my-custom-proxy.example/v1",
    batchSize: 25,
  },
  {
    provider: "openai",
    providerName: "mycustom",
    model: "m1",
    apiKey: "k2",
    baseUrl: "https://custom.example/v1",
    batchSize: 50,
  },
];

describe("buildProviderChoices", () => {
  test("catalog + saved-only providers, deduped by name", () => {
    const { choices } = buildProviderChoices(CATALOG, SAVED, "openai:deepseek");
    const names = choices.map((c) => c.value.providerName);
    // deepseek appears ONCE (catalog entry enhanced with saved data)
    expect(names.filter((n) => n === "deepseek")).toHaveLength(1);
    // saved-only provider shows up (issue 12)
    expect(names).toContain("mycustom");
    // Custom… always last
    expect(names[names.length - 1]).toBe("");
    expect(choices[choices.length - 1].id).toBe(CUSTOM);
  });

  test("saved entry's data wins as defaults (baseUrl/key/model/batch)", () => {
    const { choices } = buildProviderChoices(CATALOG, SAVED, "openai:deepseek");
    const ds = choices.find((c) => c.value.providerName === "deepseek")!;
    expect(ds.value.baseUrl).toBe("https://my-custom-proxy.example/v1");
    expect(ds.value.savedApiKey).toBe("sk-saved");
    expect(ds.value.savedModel).toBe("deepseek-chat");
    expect(ds.value.savedBatchSize).toBe(25);
  });

  test("unsaved catalog provider falls back to catalog baseUrl, no key", () => {
    const { choices } = buildProviderChoices(CATALOG, [], undefined);
    const anth = choices.find((c) => c.value.providerName === "anthropic")!;
    expect(anth.value.baseUrl).toBe("https://api.anthropic.com");
    expect(anth.value.savedApiKey).toBeUndefined();
  });

  test("preselects the active provider; default to first otherwise", () => {
    // ids are `<protocol>:<name>` of the ENTRY the choice represents
    const base = buildProviderChoices(CATALOG, SAVED, undefined);
    const anthIdx = base.choices.findIndex((c) => c.value.providerName === "anthropic");
    const active = buildProviderChoices(CATALOG, SAVED, base.choices[anthIdx].id);
    expect(active.choices[active.defaultIndex].value.providerName).toBe("anthropic");
    // saved-backed entries match their composite key directly
    const ds = buildProviderChoices(CATALOG, SAVED, "openai:deepseek");
    expect(ds.choices[ds.defaultIndex].value.providerName).toBe("deepseek");
    const none = buildProviderChoices(CATALOG, SAVED, undefined);
    expect(none.defaultIndex).toBe(0);
    const bogus = buildProviderChoices(CATALOG, SAVED, "openai:nope");
    expect(bogus.defaultIndex).toBe(0);
  });

  test("choice wording shows the API type, not a bare '(openai)'", () => {
    const { choices } = buildProviderChoices(CATALOG, SAVED, undefined);
    expect(choices[0].name).toBe("DeepSeek — OpenAI-compatible API");
    expect(choices[1].name).toBe("Anthropic — Anthropic-compatible API");
  });
});

describe("wording helpers", () => {
  test("protocolLabel uses proper API wording", () => {
    expect(protocolLabel("openai")).toBe("OpenAI-compatible API");
    expect(protocolLabel("anthropic")).toBe("Anthropic-compatible API");
    expect(providerChoiceLabel("Groq", "openai")).toBe("Groq — OpenAI-compatible API");
  });

  test("apiType stage: openai default first, anthropic second, Back last", () => {
    const c = apiTypeChoices();
    expect(c[0].value).toBe("openai");
    expect(c[1].value).toBe("anthropic");
    expect(c[c.length - 1].value).toBe(GO_BACK);
    expect(c[0].name).toContain("Chat Completions");
    expect(c[1].name).toContain("Messages API");
  });
});

describe("key prompt (issue 8)", () => {
  test("re-selecting the provider WITH a saved key → keep semantics", () => {
    const spec = keyPromptSpec({ providerName: "deepseek", sameProvider: true, hasSavedKey: true, requiresKey: true });
    expect(spec.canKeep).toBe(true);
    expect(spec.message).toContain("keep the saved key for deepseek");
    // the message must reference the SELECTED provider only
    expect(spec.message).not.toContain("commandcode");
  });

  test("switching to a different provider → plain key prompt, no keep", () => {
    const spec = keyPromptSpec({ providerName: "openai", sameProvider: false, hasSavedKey: false, requiresKey: true });
    expect(spec.canKeep).toBe(false);
    expect(spec.message).toContain("API key for openai");
    expect(spec.message).not.toContain("keep");
  });
});

describe("base URL prompt (issue 9)", () => {
  test("default is the SELECTED provider's URL", () => {
    const spec = urlPromptSpec("DeepSeek", "https://api.deepseek.com");
    expect(spec.defaultUrl).toBe("https://api.deepseek.com");
    expect(spec.message).toContain("https://api.deepseek.com");
    expect(validateBaseUrl("", spec)).toBe(true);
    expect(resolveBaseUrl("", spec)).toBe("https://api.deepseek.com");
  });

  test("no default → required; garbage rejected", () => {
    const spec = urlPromptSpec("MyCustom", undefined);
    expect(validateBaseUrl("", spec)).toBe("Base URL is required");
    expect(validateBaseUrl("ftp://x", spec)).toBe("Must be an http(s):// URL");
    expect(validateBaseUrl("https://x/v1", spec)).toBe(true);
    expect(resolveBaseUrl(" https://x/v1 ", spec)).toBe("https://x/v1");
  });
});

describe("buildSavePayload", () => {
  test("omits empty key/baseUrl so writeConfig keeps a saved key on re-save", () => {
    const p = buildSavePayload({ providerName: "deepseek", label: "DeepSeek", protocol: "openai", model: "m", batchSize: 50 });
    expect(p.summarization).toEqual({ provider: "openai", providerName: "deepseek", model: "m", batchSize: 50 });
    expect("apiKey" in p.summarization).toBe(false);
  });
  test("includes key/baseUrl when provided", () => {
    const p = buildSavePayload({ providerName: "x", label: "x", protocol: "anthropic", apiKey: "k", baseUrl: "https://e.com", model: "m", batchSize: 10 });
    expect(p.summarization.apiKey).toBe("k");
    expect(p.summarization.baseUrl).toBe("https://e.com");
  });
});

describe("withEscBack (issue 11)", () => {
  test("isLoneEsc only matches a single 0x1b byte (arrow keys excluded)", () => {
    expect(isLoneEsc(Buffer.from([0x1b]))).toBe(true);
    expect(isLoneEsc(Buffer.from([0x1b, 0x5b, 0x41]))).toBe(false); // \x1b[A
    expect(isLoneEsc(Buffer.from([0x03]))).toBe(false);
    expect(isLoneEsc("nope")).toBe(false);
  });

  test("ESC during a prompt → aborts the signal → {kind:'back'}", async () => {
    const stdin = new EventEmitter() as unknown as Parameters<typeof withEscBack>[1];
    let sawSignal = false;
    const promise = withEscBack(
      (signal) =>
        new Promise<string>((_res, rej) => {
          // simulate @inquirer/core: rejects when the context signal aborts
          sawSignal = true;
          signal.addEventListener("abort", () =>
            rej(Object.assign(new Error("prompt aborted"), { name: "AbortPromptError" })),
          );
        }),
      stdin,
    );
    expect(sawSignal).toBe(true);
    (stdin as EventEmitter).emit("data", Buffer.from([0x1b]));
    const r = await promise;
    expect(r.kind).toBe("back");
  });

  test("arrow keys ([A chunks) do NOT go back", async () => {
    const stdin = new EventEmitter() as unknown as Parameters<typeof withEscBack>[1];
    const promise = withEscBack(
      (signal) =>
        new Promise<string>((res, rej) => {
          signal.addEventListener("abort", () =>
            rej(Object.assign(new Error("aborted"), { name: "AbortPromptError" })),
          );
          setTimeout(() => res("done"), 20);
        }),
      stdin,
    );
    (stdin as EventEmitter).emit("data", Buffer.from([0x1b, 0x5b, 0x41]));
    const r = await promise;
    expect(r).toEqual({ kind: "done", value: "done" });
  });

  test("real Ctrl+C (no ESC) rethrows ExitPromptError for the top-level handler", async () => {
    const stdin = new EventEmitter() as unknown as Parameters<typeof withEscBack>[1];
    const promise = withEscBack(
      () =>
        new Promise<string>((_res, rej) => {
          (stdin as EventEmitter).on("data", (b: Buffer) => {
            if (b[0] === 0x03) rej(Object.assign(new Error("User force closed the prompt with SIGINT"), { name: "ExitPromptError" }));
          });
        }),
      stdin,
    );
    (stdin as EventEmitter).emit("data", Buffer.from([0x03]));
    await expect(promise).rejects.toMatchObject({ name: "ExitPromptError" });
  });

  test("normal completion returns the value", async () => {
    const stdin = new EventEmitter() as unknown as Parameters<typeof withEscBack>[1];
    const r = await withEscBack(() => Promise.resolve("ok"), stdin);
    expect(r).toEqual({ kind: "done", value: "ok" });
  });

  test("listener is removed after the prompt settles", async () => {
    const stdin = new EventEmitter();
    await withEscBack(() => Promise.resolve(1), stdin as never);
    expect(stdin.listenerCount("data")).toBe(0);
  });

  test("listener removed after ESC → back too", async () => {
    const stdin = new EventEmitter();
    const p = withEscBack(
      (signal) =>
        new Promise<string>((_r, rej) =>
          signal.addEventListener("abort", () => rej(new Error("x"))),
        ),
      stdin as never,
    );
    (stdin as EventEmitter).emit("data", Buffer.from([0x1b]));
    await p;
    expect(stdin.listenerCount("data")).toBe(0);
  });
});
