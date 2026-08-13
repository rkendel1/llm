# LLM Providers Package

Comprehensive provider adapters for five major LLM services (Ollama, OpenAI, Anthropic, Google, OpenRouter).

## Overview

This package implements the `LLMProvider` interface for multiple LLM services, providing:

- **Unified Interface**: All providers implement the same `LLMProvider` interface
- **Streaming Support**: All adapters support both standard and streaming responses
- **Tool Calling**: Built-in support for tool/function calling where available
- **Vision Capabilities**: Support for image inputs in OpenAI, Anthropic, and Google adapters
- **Error Handling**: Normalized error handling with retry logic for transient failures
- **Request/Response Normalization**: Transparent conversion between provider formats
- **Model Registry**: Discover and expose models from each provider

## Installation

```bash
npm install @llm/providers
```

## Quick Start

### Using Ollama (Local Models)

```typescript
import { createOllamaAdapter } from "@llm/providers";

const ollama = createOllamaAdapter("http://localhost:11434");

const response = await ollama.generate({
  messages: [{ role: "user", content: "Hello!" }],
  model: "llama2",
});

console.log(response.text);
```

### Using OpenAI

```typescript
import { createOpenAIAdapter } from "@llm/providers";

const openai = createOpenAIAdapter(process.env.OPENAI_API_KEY);

const response = await openai.generate({
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4",
});

console.log(response.text);
```

### Using Anthropic

```typescript
import { createAnthropicAdapter } from "@llm/providers";

const anthropic = createAnthropicAdapter(process.env.ANTHROPIC_API_KEY);

const response = await anthropic.generate({
  messages: [{ role: "user", content: "Hello!" }],
  model: "claude-3-opus",
});

console.log(response.text);
```

### Using Google (Gemini)

```typescript
import { createGoogleAdapter } from "@llm/providers";

const google = createGoogleAdapter(process.env.GOOGLE_API_KEY);

const response = await google.generate({
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-pro",
});

console.log(response.text);
```

### Using OpenRouter

```typescript
import { createOpenRouterAdapter } from "@llm/providers";

const openrouter = createOpenRouterAdapter(process.env.OPENROUTER_API_KEY);

const response = await openrouter.generate({
  messages: [{ role: "user", content: "Hello!" }],
  model: "openai/gpt-4",
});

console.log(response.text);
```

## Streaming

All providers support streaming responses:

```typescript
const stream = openai.stream({
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4",
});

for await (const chunk of stream) {
  if (chunk.type === "text") {
    process.stdout.write(chunk.text);
  }
}
```

## Tool Calling

```typescript
const response = await openai.generate({
  messages: [{ role: "user", content: "What's the weather?" }],
  model: "gpt-4",
  tools: {
    getWeather: async (args) => {
      // Implementation
      return { temperature: 72, condition: "sunny" };
    },
  },
});

console.log(response.toolCalls);
```

## Provider Capabilities

| Feature | Ollama | OpenAI | Anthropic | Google | OpenRouter |
|---------|--------|--------|-----------|--------|------------|
| Streaming | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tool Calling | ✗ | ✓ | ✓ | ✓ | ✓ |
| Vision | ✗ | ✓ | ✓ | ✓ | ✓ |
| Structured Output | ✗ | ✓ | ✗ | ✗ | ✓ |

## Provider Details

### Ollama
- **API**: `http://localhost:11434` (default)
- **Authentication**: None
- **Models**: Auto-discovered from local instance
- **Cost**: Free (local)
- **Capabilities**: Basic text generation, streaming

### OpenAI
- **API**: `api.openai.com/v1`
- **Authentication**: ******
- **Models**: gpt-4-turbo, gpt-4, gpt-3.5-turbo
- **Cost**: Pay-per-token
- **Capabilities**: All features including vision and structured output

### Anthropic
- **API**: `api.anthropic.com`
- **Authentication**: x-api-key header
- **Models**: claude-3-opus, claude-3-sonnet, claude-3-haiku
- **Cost**: Pay-per-token
- **Capabilities**: Streaming, tool calling, vision

### Google (Gemini)
- **API**: `generativelanguage.googleapis.com/v1beta/models`
- **Authentication**: API key
- **Models**: gemini-pro, gemini-pro-vision, gemini-1.5-*
- **Cost**: Pay-per-token
- **Capabilities**: Streaming, tool calling, vision

### OpenRouter
- **API**: `openrouter.ai/api/v1` (OpenAI-compatible)
- **Authentication**: ******
- **Models**: Routes to multiple providers
- **Cost**: Variable (provider-dependent)
- **Capabilities**: All features via routing

## Error Handling

All errors are normalized to `ProviderError`:

```typescript
import { ProviderError } from "@llm/providers";

try {
  await adapter.generate(request);
} catch (error) {
  if (error instanceof ProviderError) {
    console.log(error.code); // e.g., "RATE_LIMITED"
    console.log(error.provider); // e.g., "openai"
    if (error.retryable) {
      // Can retry after delay
    }
  }
}
```

## Model Discovery

Each provider includes model discovery/registry functions:

```typescript
import {
  getOpenAIModels,
  DEFAULT_OPENAI_MODELS,
  getAnthropicModels,
  DEFAULT_ANTHROPIC_MODELS,
  getGoogleModels,
  DEFAULT_GOOGLE_MODELS,
  getOpenRouterModels,
  DEFAULT_OPENROUTER_MODELS,
  discoverOllamaModels,
} from "@llm/providers";

const models = await getOpenAIModels(apiKey);
const anthropicModels = DEFAULT_ANTHROPIC_MODELS;
const localModels = await discoverOllamaModels();
```

## Architecture

### Structure

```
packages/providers/
├── src/
│   ├── types.ts              # Shared types (ProviderError, ProviderCapabilities)
│   ├── errors.ts             # Error handling utilities
│   ├── capabilities.ts       # Capability helpers
│   ├── normalization.ts      # Request/response normalization
│   ├── ollama/               # Ollama provider
│   │   ├── client.ts         # HTTP client
│   │   ├── adapter.ts        # LLMProvider implementation
│   │   ├── registry.ts       # Model discovery
│   │   └── index.ts          # Exports
│   ├── openai/               # OpenAI provider
│   ├── anthropic/            # Anthropic provider
│   ├── google/               # Google Gemini provider
│   ├── openrouter/           # OpenRouter provider
│   └── index.ts              # Main exports
└── test/
    ├── ollama.test.ts
    ├── openai.test.ts
    ├── anthropic.test.ts
    ├── google.test.ts
    ├── openrouter.test.ts
    └── providers.test.ts
```

### Key Classes

**OllamaAdapter**: Local model serving
- No authentication
- Auto-discovers models
- Stream-based generation

**OpenAIAdapter**: OpenAI API
- ****** auth
- Full feature set
- Structured output support

**AnthropicAdapter**: Anthropic Claude API
- x-api-key header auth
- Tool use format
- Vision support

**GoogleAdapter**: Google Gemini API
- API key auth
- Function calling
- Vision support

**OpenRouterAdapter**: OpenAI-compatible routing
- ****** auth
- Routes to multiple providers
- Full feature set

### Base Implementation

All adapters implement:
- `supports(request: LLMRequest): boolean | Promise<boolean>`
- `generate(request: LLMRequest): Promise<ProviderResponse>`
- `stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>`

## Testing

Tests use vitest with mocked HTTP calls:

```bash
npm test
```

Each adapter has:
- Unit tests for basic operations
- Streaming tests with mock chunks
- Tool calling tests
- Error handling tests

## Implementation Notes

### No Provider Logic in Core
All provider-specific transformations happen in adapter/client classes. The core runtime remains agnostic.

### Normalized Error Handling
Provider-specific errors are normalized to `ProviderError` with:
- Standardized error codes
- Retryable flag
- Provider identification

### Request/Response Normalization
- Incoming `LLMRequest` is converted to provider format
- Provider responses are normalized to `ProviderResponse`
- Tool calls maintain consistent format across providers

### Streaming Support
All adapters support server-sent events or similar streaming:
- Text chunks yielded with `type: "text"`
- Tool calls yield with `type: "tool_call"`
- Stream completes with `type: "done"`

### Capability Declaration
Each provider declares its capabilities:
- `streaming`: Can return streamed responses
- `toolCalling`: Supports function/tool calling
- `vision`: Can process images
- `structuredOutput`: Supports structured output mode

## License

ISC
