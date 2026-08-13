/**
 * Provider adapters for ingestion sources
 */

import type { RegistrySource, RawModel } from "../sources/index.js";

/**
 * Base configuration for provider adapters
 */
export interface ProviderAdapterConfig {
  id: string;
  provider: string;
  refreshIntervalMs: number;
  authority?: "official" | "aggregator" | "runtime";
}

/**
 * OpenAI provider adapter
 */
export class OpenAIAdapter implements RegistrySource {
  id: string;
  provider = "openai";
  metadata: any;
  private apiKey: string;

  constructor(config: ProviderAdapterConfig & { apiKey: string }) {
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.metadata = {
      authority: config.authority || "official",
      refreshInterval: config.refreshIntervalMs,
      lastRefreshAt: undefined,
      nextRefreshAt: undefined,
    };
  }

  async fetch(): Promise<RawModel[]> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.data?.map((model: any) => ({
        source: this.id,
        provider: this.provider,
        externalId: model.id,
        name: model.id,
        metadata: {
          owned_by: model.owned_by,
          created: model.created,
        },
      })) || [];
    } catch (error) {
      throw new Error(`Failed to fetch OpenAI models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Anthropic provider adapter
 */
export class AnthropicAdapter implements RegistrySource {
  id: string;
  provider = "anthropic";
  metadata: any;
  private apiKey: string;

  constructor(config: ProviderAdapterConfig & { apiKey: string }) {
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.metadata = {
      authority: config.authority || "official",
      refreshInterval: config.refreshIntervalMs,
      lastRefreshAt: undefined,
      nextRefreshAt: undefined,
    };
  }

  async fetch(): Promise<RawModel[]> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    // Anthropic models are hardcoded and not returned by an API
    // In a real implementation, we'd fetch from their documentation or maintained list
    const models = [
      { id: "claude-opus", name: "Claude Opus" },
      { id: "claude-sonnet", name: "Claude Sonnet" },
      { id: "claude-haiku", name: "Claude Haiku" },
    ];

    return models.map((model) => ({
      source: this.id,
      provider: this.provider,
      externalId: model.id,
      name: model.name,
      metadata: {
        type: "text",
      },
    }));
  }
}

/**
 * Google provider adapter
 */
export class GoogleAdapter implements RegistrySource {
  id: string;
  provider = "google";
  metadata: any;
  private apiKey: string;

  constructor(config: ProviderAdapterConfig & { apiKey: string }) {
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.metadata = {
      authority: config.authority || "official",
      refreshInterval: config.refreshIntervalMs,
      lastRefreshAt: undefined,
      nextRefreshAt: undefined,
    };
  }

  async fetch(): Promise<RawModel[]> {
    if (!this.apiKey) {
      throw new Error("Google API key is required");
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Google API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.models?.map((model: any) => ({
        source: this.id,
        provider: this.provider,
        externalId: model.name,
        name: model.displayName,
        metadata: {
          supportedGenerationMethods: model.supportedGenerationMethods,
        },
      })) || [];
    } catch (error) {
      throw new Error(`Failed to fetch Google models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * OpenRouter provider adapter
 */
export class OpenRouterAdapter implements RegistrySource {
  id: string;
  provider = "openrouter";
  metadata: any;
  private apiKey: string;

  constructor(config: ProviderAdapterConfig & { apiKey: string }) {
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.metadata = {
      authority: config.authority || "aggregator",
      refreshInterval: config.refreshIntervalMs,
      lastRefreshAt: undefined,
      nextRefreshAt: undefined,
    };
  }

  async fetch(): Promise<RawModel[]> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.data?.map((model: any) => ({
        source: this.id,
        provider: this.provider,
        externalId: model.id,
        name: model.name,
        contextWindow: {
          input: model.context_length,
          output: model.output_tokens,
        },
        pricing: {
          input: model.pricing?.prompt,
          output: model.pricing?.completion,
        },
        metadata: {
          architecture: model.architecture,
          top_provider: model.top_provider,
        },
      })) || [];
    } catch (error) {
      throw new Error(`Failed to fetch OpenRouter models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Ollama provider adapter
 */
export class OllamaAdapter implements RegistrySource {
  id: string;
  provider = "ollama";
  metadata: any;
  private baseUrl: string;

  constructor(config: ProviderAdapterConfig & { baseUrl?: string }) {
    this.id = config.id;
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.metadata = {
      authority: config.authority || "runtime",
      refreshInterval: config.refreshIntervalMs,
      lastRefreshAt: undefined,
      nextRefreshAt: undefined,
    };
  }

  async fetch(): Promise<RawModel[]> {
    try {
      const url = this.baseUrl + "/api/tags";
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.models?.map((model: any) => ({
        source: this.id,
        provider: this.provider,
        externalId: model.name,
        name: model.name,
        metadata: {
          size: model.size,
          digest: model.digest,
          modified_at: model.modified_at,
        },
      })) || [];
    } catch (error) {
      throw new Error(`Failed to fetch Ollama models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Create adapters for all providers
 */
export function createProviderAdapters(config: {
  openai?: { apiKey: string; refreshIntervalMs?: number };
  anthropic?: { apiKey: string; refreshIntervalMs?: number };
  google?: { apiKey: string; refreshIntervalMs?: number };
  openrouter?: { apiKey?: string; refreshIntervalMs?: number };
  ollama?: { baseUrl?: string; refreshIntervalMs?: number };
}): RegistrySource[] {
  const adapters: RegistrySource[] = [];

  if (config.openai) {
    adapters.push(
      new OpenAIAdapter({
        id: "openai-official",
        provider: "openai",
        apiKey: config.openai.apiKey,
        refreshIntervalMs: config.openai.refreshIntervalMs || 86400000, // 24 hours
        authority: "official",
      })
    );
  }

  if (config.anthropic) {
    adapters.push(
      new AnthropicAdapter({
        id: "anthropic-official",
        provider: "anthropic",
        apiKey: config.anthropic.apiKey,
        refreshIntervalMs: config.anthropic.refreshIntervalMs || 86400000,
        authority: "official",
      })
    );
  }

  if (config.google) {
    adapters.push(
      new GoogleAdapter({
        id: "google-official",
        provider: "google",
        apiKey: config.google.apiKey,
        refreshIntervalMs: config.google.refreshIntervalMs || 86400000,
        authority: "official",
      })
    );
  }

  if (config.openrouter) {
    adapters.push(
      new OpenRouterAdapter({
        id: "openrouter-aggregator",
        provider: "openrouter",
        apiKey: config.openrouter.apiKey || "",
        refreshIntervalMs: config.openrouter.refreshIntervalMs || 86400000,
        authority: "aggregator",
      })
    );
  }

  if (config.ollama) {
    adapters.push(
      new OllamaAdapter({
        id: "ollama-runtime",
        provider: "ollama",
        baseUrl: config.ollama.baseUrl,
        refreshIntervalMs: config.ollama.refreshIntervalMs || 3600000, // 1 hour
        authority: "runtime",
      })
    );
  }

  return adapters;
}
