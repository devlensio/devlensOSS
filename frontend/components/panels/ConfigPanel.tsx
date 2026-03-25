"use client";

import React, { useEffect, useState } from 'react';
import { useConfig, usePatchConfig } from '@/lib/hooks';
import type { LLMProvider, SummarizationConfig } from '@/lib/types';
import { Field, Input, Section, Select } from './helpers';
import { toast } from 'react-toastify';

const LLM_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "openrouter", "gemini", "ollama"];

interface ConfigPanelProps {
  open:    boolean;
  onClose: () => void;
}

export default function ConfigPanel({ open, onClose }: ConfigPanelProps) {

  const { data: config, isLoading } = useConfig();
  const patch = usePatchConfig();

  const [sumConfig, setSumConfig] = useState<SummarizationConfig>({
    provider:  "anthropic",
    model:     "",
    apiKey:    "",
    baseUrl:   "",
    batchSize: 50,
  });

  useEffect(() => {
    if (!config?.summarization) return;
    setSumConfig({
      provider:  config.summarization.provider,
      model:     config.summarization.model,
      apiKey:    "",
      baseUrl:   config.summarization.baseUrl ?? "",
      batchSize: config.summarization.batchSize,
    });
  }, [config]);

  function updateSum<K extends keyof SummarizationConfig>(key: K, value: SummarizationConfig[K]) {
    setSumConfig(prev => ({ ...prev, [key]: typeof value === "string" ? value.trim() : value }));
  }

  function handleSave() {
    console.log(sumConfig);
    patch.mutate({
      summarization: {
        provider:  sumConfig.provider,
        model:     sumConfig.model,
        baseUrl:   sumConfig.baseUrl || undefined,
        batchSize: sumConfig.batchSize,
        ...(sumConfig.apiKey ? { apiKey: sumConfig.apiKey } : {}),
      },
    } as any, {
      onSuccess: (result) =>{
        toast.success( "Your Configuration has been Saved Successfully!")
        onClose();
      } 
    });
  }


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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-10 rounded-lg bg-elevated animate-pulse" />
              ))}
            </div>
          ) : (
            <Section title="Summarization" description="LLM used to generate code summaries">
              <Field label="Provider">
                <Select
                  value={sumConfig.provider}
                  onChange={v => updateSum("provider", v as LLMProvider)}
                  options={LLM_PROVIDERS}
                />
              </Field>
              <Field label="Model">
                <Input
                  value={sumConfig.model}
                  onChange={v => updateSum("model", v)}
                  placeholder="e.g. claude-haiku-4-5"
                  mono
                />
              </Field>
              <Field label="API Key">
                <Input
                  value={sumConfig.apiKey ?? ""}
                  onChange={v => updateSum("apiKey", v)}
                  placeholder="Leave empty to keep existing key"
                  type="password"
                  mono
                />
              </Field>
              {sumConfig.provider === "ollama" && (
                <Field label="Base URL">
                  <Input
                    value={sumConfig.baseUrl ?? ""}
                    onChange={v => updateSum("baseUrl", v)}
                    placeholder="http://localhost:11434"
                    mono
                  />
                </Field>
              )}
              <Field label="Batch Size">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={sumConfig.batchSize}
                    onChange={e => updateSum("batchSize", Number(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-sm font-mono text-primary w-8 text-right">
                    {sumConfig.batchSize}
                  </span>
                </div>
              </Field>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          {patch.isError && (
            <p className="text-xs text-error mb-3">
              {(patch.error as Error)?.message ?? "Failed to save config"}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-muted border border-border
                         rounded-lg hover:text-primary hover:border-accent/50
                         transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={patch.isPending}
              className="flex-1 py-2.5 text-sm font-semibold text-[#090c10]
                         bg-accent hover:bg-accent-dim disabled:opacity-40
                         rounded-lg transition-colors"
            >
              {patch.isPending ? "Saving..." : "Save Config"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}