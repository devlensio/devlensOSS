"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useConfig, usePatchConfig, useProviders, useSetActiveProvider, useRemoveProvider } from '@/lib/hooks';
import { api } from '@/lib/api';
import type { CatalogProvider, ProviderConfigEntry, AllProvidersResult } from '@/lib/types';
import { Field, Input, Section, Select, ModelSelect } from './helpers';
import { toast } from 'react-toastify';

const CUSTOM_SENTINEL = "__custom__";

interface SumConfigState {
  provider:      "openai" | "anthropic";
  providerName:  string;
  model:         string;
  apiKey?:       string;
  baseUrl?:      string;
  batchSize:     number;
}

interface ConfigPanelProps {
  open:    boolean;
  onClose: () => void;
}

/** Derive a composite key from protocol + providerName. */
function makeKey(protocol: string, providerName: string): string {
  return `${protocol}:${providerName}`;
}

export default function ConfigPanel({ open, onClose }: ConfigPanelProps) {

  const { data: config, isLoading } = useConfig();
  const { data: catalogProviders = [] } = useProviders();
  const patch = usePatchConfig();
  const setActive = useSetActiveProvider();
  const removeProv = useRemoveProvider();

  // ── Multi-provider state ──────────────────────────────────────────────────
  const [allProviders, setAllProviders] = useState<AllProvidersResult>({ active: "", providers: [] });

  // Track which provider we're currently editing (composite key)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Track whether we're adding a NEW provider
  const [isAddingNew, setIsAddingNew] = useState(false);

  // ── Form state for editing/adding ─────────────────────────────────────────
  const [sumConfig, setSumConfig] = useState<SumConfigState>({
    provider:     "anthropic",
    providerName: "anthropic",
    model:        "",
    apiKey:       "",
    baseUrl:      "",
    batchSize:    50,
  });

  // Custom provider fields
  const [customName,     setCustomName]     = useState("");
  const [customProtocol, setCustomProtocol] = useState<"openai" | "anthropic">("openai");
  const [customBaseUrl,  setCustomBaseUrl]  = useState("");
  const [customApiKey,   setCustomApiKey]   = useState("");

  // Model list state
  const [models, setModels]             = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError]     = useState<string | null>(null);

  // ── Sync allProviders from config ─────────────────────────────────────────
  useEffect(() => {
    const ap = (config as any)?.allProviders as AllProvidersResult | undefined;
    if (ap && ap.providers?.length > 0) {
      setAllProviders(ap);
      // If we're not currently editing/adding, select the active provider for display
      if (!editingKey && !isAddingNew) {
        setEditingKey(ap.active);
        const activeEntry = ap.providers.find(
          p => makeKey(p.provider, p.providerName) === ap.active
        );
        if (activeEntry) {
          loadProviderIntoForm(activeEntry);
        }
      }
    } else if (config?.summarization) {
      // Fallback: single flat config (before migration)
      const s = config.summarization;
      const key = makeKey(s.provider, s.providerName ?? s.provider);
      const entry: ProviderConfigEntry = {
        provider:     s.provider as "openai" | "anthropic",
        providerName: s.providerName ?? s.provider,
        model:        s.model ?? "",
        apiKey:       (s as any).apiKey,
        baseUrl:      s.baseUrl,
        batchSize:    s.batchSize ?? 50,
      };
      setAllProviders({ active: key, providers: [entry] });
      if (!editingKey && !isAddingNew) {
        setEditingKey(key);
        loadProviderIntoForm(entry);
      }
    }
  }, [config]);

  // ── Load a provider entry into the form ───────────────────────────────────
  function loadProviderIntoForm(entry: ProviderConfigEntry) {
    const isInCatalog = catalogProviders.find(p => p.name === entry.providerName);
    if (isInCatalog) {
      setSumConfig({
        provider:     entry.provider,
        providerName: entry.providerName,
        model:        entry.model,
        apiKey:       entry.apiKey,
        baseUrl:      entry.baseUrl ?? isInCatalog.baseUrl,
        batchSize:    entry.batchSize,
      });
    } else {
      // Custom provider
      setSumConfig({
        provider:     entry.provider,
        providerName: CUSTOM_SENTINEL,
        model:        entry.model,
        apiKey:       entry.apiKey,
        baseUrl:      entry.baseUrl ?? "",
        batchSize:    entry.batchSize,
      });
      setCustomName(entry.providerName);
      setCustomProtocol(entry.provider);
      setCustomBaseUrl(entry.baseUrl ?? "");
      setCustomApiKey(entry.apiKey ?? "");
    }
    // Clear model list when loading a different provider
    setModels([]);
    setModelsError(null);
  }

  // ── Derive current form mode ──────────────────────────────────────────────
  const isCustom   = sumConfig.providerName === CUSTOM_SENTINEL;
  const selected   = catalogProviders.find(p => p.name === sumConfig.providerName);

  // ── Model fetching ────────────────────────────────────────────────────────
  const doFetchModels = useCallback(async (protocol: string, baseUrl: string, apiKey?: string) => {
    if (!baseUrl) return;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await api.postProviderModels({ protocol, baseUrl, apiKey: apiKey || undefined });
      setModels(res.models ?? []);
      if (res.error) setModelsError(res.error);
    } catch (err: any) {
      setModelsError(err.message ?? "Failed to fetch models");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // ── Auto-fetch models ────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-fetch when a known provider is selected/loaded
  useEffect(() => {
    if (!isCustom && selected) {
      const baseUrl = sumConfig.baseUrl || selected.baseUrl;
      if (baseUrl) {
        doFetchModels(selected.protocol, baseUrl, sumConfig.apiKey);
      }
    }
  }, [isCustom, sumConfig.providerName]);

  // Debounced auto-fetch for custom provider baseUrl changes
  useEffect(() => {
    if (!isCustom || !customBaseUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doFetchModels(customProtocol, customBaseUrl, customApiKey);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [isCustom, customBaseUrl, customProtocol]);

  // ── Provider selection handlers ───────────────────────────────────────────
  function pickKnown(p: CatalogProvider) {
    setSumConfig(prev => ({
      ...prev,
      providerName: p.name,
      provider: p.protocol,
      baseUrl: p.baseUrl,  // Bug #2 fix: always reset to catalog default
      model: "",
    }));
    setModels([]);
    setModelsError(null);
  }

  function pickCustom() {
    setSumConfig(prev => ({
      ...prev,
      providerName: CUSTOM_SENTINEL,
      provider: "openai",
      baseUrl: "",
      model: "",
    }));
    setCustomName("");
    setCustomProtocol("openai");
    setCustomBaseUrl("");
    setCustomApiKey("");
    setModels([]);
    setModelsError(null);
  }

  // ── Edit existing provider ────────────────────────────────────────────────
  function handleEditProvider(providerKey: string) {
    const entry = allProviders.providers.find(
      p => makeKey(p.provider, p.providerName) === providerKey
    );
    if (!entry) return;
    setEditingKey(providerKey);
    setIsAddingNew(false);
    loadProviderIntoForm(entry);
  }

  // ── Start adding new provider ─────────────────────────────────────────────
  function handleStartAdd() {
    setIsAddingNew(true);
    setEditingKey(null);
    setSumConfig({
      provider:     "anthropic",
      providerName: "anthropic",
      model:        "",
      apiKey:       "",
      baseUrl:      "",
      batchSize:    50,
    });
    setCustomName("");
    setCustomProtocol("openai");
    setCustomBaseUrl("");
    setCustomApiKey("");
    setModels([]);
    setModelsError(null);
  }

  // ── Save (upsert) current form ────────────────────────────────────────────
  function handleSave() {
    const payloadProviderName = isCustom ? customName.trim() : sumConfig.providerName;
    const protocol = isCustom ? customProtocol : sumConfig.provider;

    if (isCustom && !customName.trim()) {
      toast.error("Please enter a name for your custom provider");
      return;
    }

    patch.mutate({
      summarization: {
        provider: protocol,
        providerName: payloadProviderName,
        model: sumConfig.model,
        baseUrl: isCustom
          ? (customBaseUrl || undefined)
          : (sumConfig.baseUrl !== selected?.baseUrl ? (sumConfig.baseUrl || undefined) : undefined),
        batchSize: sumConfig.batchSize,
        ...(isCustom
          ? (customApiKey ? { apiKey: customApiKey } : {})
          : (sumConfig.apiKey ? { apiKey: sumConfig.apiKey } : {})),
      },
    } as any, {
      onSuccess: () => {
        toast.success(isAddingNew ? "Provider added!" : "Configuration saved!");
        setIsAddingNew(false);
        // editingKey will be refreshed when allProviders updates
      },
    });
  }

  // ── Set active provider ──────────────────────────────────────────────────
  function handleSetActive(providerKey: string) {
    if (providerKey === allProviders.active) return;
    setActive.mutate(providerKey, {
      onSuccess: () => toast.success("Active provider switched"),
    });
  }

  // ── Remove provider ───────────────────────────────────────────────────────
  function handleRemove(providerKey: string) {
    if (providerKey === allProviders.active) {
      toast.error("Cannot remove the active provider. Switch to another first.");
      return;
    }
    if (!confirm(`Remove provider "${providerKey}"? This cannot be undone.`)) return;
    removeProv.mutate(providerKey, {
      onSuccess: () => {
        toast.success("Provider removed");
        if (editingKey === providerKey) {
          setEditingKey(null);
          setIsAddingNew(false);
        }
      },
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isFormBusy = patch.isPending || setActive.isPending || removeProv.isPending;

  return (
    <>
      {open && <div className="fixed inset-0 bg-base/60 backdrop-blur-sm z-40 " onClick={onClose} />}

      <div className={`fixed right-0 top-0 h-full w-120 bg-surface border-l border-border
                 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
                 ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-primary font-semibold ">Configuration</h2>
            <p className="text-xs text-muted mt-0.5">Saved to ~/.devlens/config.json</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-muted hover:text-primary hover:bg-elevated transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-10 rounded-lg bg-elevated animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* ── Configured Providers List ────────────────────────────── */}
              <Section title="Configured Providers" description="Select a provider to edit, or add a new one">
                <div className="space-y-2">
                  {allProviders.providers.map(entry => {
                    const key = makeKey(entry.provider, entry.providerName);
                    const isActive = key === allProviders.active;
                    const isEditing = key === editingKey && !isAddingNew;
                    const catEntry = catalogProviders.find(p => p.name === entry.providerName);
                    const label = catEntry?.label ?? entry.providerName;

                    return (
                      <div
                        key={key}
                        onClick={() => handleEditProvider(key)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer
                          transition-all group
                          ${isEditing
                            ? "border-accent bg-accent/5"
                            : "border-border bg-elevated hover:border-accent/40"
                          }`}
                      >
                        {/* Provider info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-primary truncate">
                              {label}
                            </span>
                            <span className="text-[10px] text-muted font-mono">
                              ({entry.provider})
                            </span>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded
                                bg-accent/10 text-accent font-medium">
                                active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted truncate font-mono">
                              {entry.model || "no model"}
                            </span>
                            {entry.apiKey && (
                              <span className="text-[10px] text-accent/70">
                                key set
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isActive && (
                            <button
                              onClick={e => { e.stopPropagation(); handleSetActive(key); }}
                              disabled={setActive.isPending}
                              className="px-2 py-1 text-[10px] font-medium rounded
                                bg-accent/10 text-accent hover:bg-accent/20
                                disabled:opacity-40 transition-colors"
                            >
                              Activate
                            </button>
                          )}
                          {!isActive && (
                            <button
                              onClick={e => { e.stopPropagation(); handleRemove(key); }}
                              disabled={removeProv.isPending}
                              className="px-2 py-1 text-[10px] font-medium rounded
                                text-error hover:bg-error/10
                                disabled:opacity-40 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add New Provider button */}
                  <button
                    onClick={handleStartAdd}
                    className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border
                      border-dashed transition-colors text-sm
                      ${isAddingNew
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-border text-muted hover:text-primary hover:border-accent/50"
                      }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add Provider
                  </button>
                </div>
              </Section>

              {/* ── Edit / Add Form ───────────────────────────────────────── */}
              {(editingKey && !isAddingNew) || isAddingNew ? (
                <Section
                  title={isAddingNew ? "Add Provider" : "Edit Provider"}
                  description={isAddingNew
                    ? "Configure a new LLM provider"
                    : `Editing ${editingKey ?? "provider"}`
                  }
                >
                  {/* Provider selector */}
                  <Field label="Provider">
                    <select
                      value={isAddingNew ? sumConfig.providerName : sumConfig.providerName}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === CUSTOM_SENTINEL) pickCustom();
                        else {
                          const p = catalogProviders.find(pr => pr.name === val);
                          if (p) pickKnown(p);
                        }
                      }}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2
                                 text-sm text-primary font-mono
                                 focus:outline-none focus:border-accent transition-colors"
                    >
                      {catalogProviders.map(p => (
                        <option key={p.name} value={p.name} className="bg-elevated">
                          {p.label}
                        </option>
                      ))}
                      <option value={CUSTOM_SENTINEL} className="bg-elevated">
                        Custom…
                      </option>
                    </select>
                  </Field>

                  {/* Custom provider block */}
                  {isCustom && (
                    <>
                      <Field label="Name">
                        <Input
                          value={customName}
                          onChange={setCustomName}
                          placeholder="e.g. my-lmalite"
                          mono
                        />
                      </Field>
                      <Field label="API Style">
                        <Select
                          value={customProtocol}
                          onChange={v => setCustomProtocol(v as "openai" | "anthropic")}
                          options={["openai", "anthropic"]}
                        />
                      </Field>
                      <Field label="Base URL">
                        <Input
                          value={customBaseUrl}
                          onChange={setCustomBaseUrl}
                          placeholder="https://api.example.com/v1"
                          mono
                        />
                      </Field>
                      <Field label="API Key">
                        <Input
                          value={customApiKey}
                          onChange={setCustomApiKey}
                          placeholder="API key"
                          type="password"
                          mono
                        />
                      </Field>
                    </>
                  )}

                  {/* Known provider: base URL */}
                  {!isCustom && selected && (
                    <Field label="Base URL">
                      <Input
                        value={sumConfig.baseUrl ?? selected.baseUrl}
                        onChange={v => setSumConfig(prev => ({ ...prev, baseUrl: v }))}
                        placeholder={selected.baseUrl}
                        mono
                      />
                    </Field>
                  )}

                  {/* Model — searchable combobox with custom model support */}
                  <Field label="Model">
                    <ModelSelect
                      value={sumConfig.model}
                      onChange={v => setSumConfig(prev => ({ ...prev, model: v }))}
                      options={models}
                      loading={modelsLoading}
                      error={modelsError}
                      placeholder={
                        modelsLoading
                          ? "Loading models…"
                          : models.length > 0
                            ? "Search or type a model name"
                            : "Enter model name manually"
                      }
                    />
                  </Field>

                  {/* API Key — hidden behind password field for security */}
                  {!isCustom && (selected?.requiresKey ?? true) && (
                    <Field label="API Key">
                      <Input
                        value={sumConfig.apiKey ?? ""}
                        onChange={v => setSumConfig(prev => ({ ...prev, apiKey: v }))}
                        placeholder="Leave empty to keep existing key"
                        type="password"
                        mono
                      />
                    </Field>
                  )}

                  {/* Batch Size */}
                  <Field label="Batch Size">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={200}
                        value={sumConfig.batchSize}
                        onChange={e => setSumConfig(prev => ({ ...prev, batchSize: Number(e.target.value) }))}
                        className="flex-1 accent-accent"
                      />
                      <span className="text-sm font-mono text-primary w-8 text-right">
                        {sumConfig.batchSize}
                      </span>
                    </div>
                  </Field>
                </Section>
              ) : (
                !isLoading && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted">
                      {allProviders.providers.length === 0
                        ? "No providers configured yet. Add one to get started."
                        : "Select a provider above to edit, or add a new one."}
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          {(patch.isError || setActive.isError || removeProv.isError) && (
            <p className="text-xs text-error mb-3">
              {(patch.error as Error)?.message
                ?? (setActive.error as Error)?.message
                ?? (removeProv.error as Error)?.message
                ?? "Failed to save config"}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-muted border border-border
                         rounded-lg hover:text-primary hover:border-accent/50
                         transition-colors"
            >
              Close
            </button>
            {(editingKey || isAddingNew) && (
              <button
                onClick={handleSave}
                disabled={isFormBusy}
                className="flex-1 py-2.5 text-sm font-semibold text-[#090c10]
                           bg-accent hover:bg-accent-dim disabled:opacity-40
                           rounded-lg transition-colors"
              >
                {patch.isPending ? "Saving..." : isAddingNew ? "Add Provider" : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
