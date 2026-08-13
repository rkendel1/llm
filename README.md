# llm

**AI without the model management.**
One package. One setup. Every provider. Automatic routing. Local fallback.

Models and providers are implementation details.

`llm` lets developers express what they need—automatic, cheap, fast, reasoning, vision, or local—and handles provider selection, model discovery, capability matching, credentials, failures, and fallback automatically.

## Quick Start

```bash
npm install @easy-llm/llm
npx --no-install llm setup
```

Or run setup without installing first:

```bash
npx @easy-llm/llm setup
```

Package binaries installed locally are run through `npx`. To use `llm`
directly from any directory, install it globally with
`npm install --global @easy-llm/llm`.

### Local Ollama

Ollama needs no API key. Start Ollama, pull a model, and initialize the local
provider before making a request:

```bash
ollama serve
ollama pull llama3.2
```

```ts
import { llm } from "@easy-llm/llm";

await llm.initializeDefaultProviders();
await llm.refreshModelRegistry();

const response = await llm({
  model: "llama3.2:latest",
  messages: [{ role: "user", content: "Explain closures simply." }],
});

console.log(response.text);
```

The default local endpoint is `http://localhost:11434`. Pass
`{ ollamaApiBase: "http://your-host:11434" }` to
`initializeDefaultProviders` when Ollama runs elsewhere.

From the CLI:

```bash
npx --no-install llm run --model llama3.2:latest "Explain closures simply."
```

For a configured remote provider:

```bash
npx --no-install llm run --provider openai --model gpt-4-turbo "Hello"
```

```ts
import { llm } from "@easy-llm/llm";
const answer = await llm("Explain this code");
```

### Shipped Model Registry

The package includes an automatically refreshed model registry with normalized
context windows, capabilities, lifecycle data, and pricing where available.

```ts
import registry from "@easy-llm/llm/registry-snapshot" with { type: "json" };

console.log(registry.models.length);
console.log(registry.models[0]);
```

## The Difference

### Traditional Approach

```ts
// Choose a provider
import OpenAI from "openai";

// Find the model ID
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Handle the specific API
const response = await client.chat.completions.create({
  model: "gpt-4-turbo",
  messages: [{
    role: "user",
    content: "Explain this code"
  }]
});

// Implement error handling and fallback
try {
  // ... provider-specific error handling
} catch (error) {
  // fallback to another provider?
}

// Track costs, tokens, rate limits...
// Add another provider? Rewrite integration.
```

### llm Approach

```ts
import { llm } from "@easy-llm/llm";
await llm("Explain this code");
```

Setup is a one-time CLI:

```bash
npx llm setup
```

That's it. The runtime automatically:

- Discovers installed providers (OpenAI, Anthropic, Google, OpenRouter, Ollama)
- Loads the current model registry
- Understands capabilities (vision, reasoning, tools, structured output)
- Scores and selects the best model
- Resolves credentials securely
- Executes the request
- Normalizes the response
- Falls back if needed
- Tracks usage and cost

## Features

### Production Hardening

- **Request tracing** with privacy-first observability (no prompts captured)
- **Automatic routing** with deterministic scoring
- **Fallback & resilience** with circuit breaker and rate-limit awareness
- **Timeout and cancellation** support via AbortSignal
- **Concurrency limits** to prevent overload
- **Provider health** monitoring and caching
- **Cost estimation** with normalized token accounting

### Developer Features

- **Six routing modes**: `auto`, `cheap`, `fast`, `reasoning`, `vision`, `local`
- **Automatic capabilities** matching (vision-capable models for images, etc.)
- **Tool calling** with multi-round execution
- **Structured output** with custom parsing
- **Streaming** for real-time responses
- **Local fallback** (Ollama) for privacy or cost

### Provider Support

- **OpenAI** (GPT-4, GPT-4o, GPT-3.5)
- **Anthropic** (Claude 3.5, Claude 3)
- **Google** (Gemini, Gemini 2.0)
- **OpenRouter** (200+ models)
- **Ollama** (local inference)
- Extensible provider interface

## Core API

### Simple Usage

```ts
const result = await llm("Explain this code");
console.log(result.text);
```

### Routing Modes

```ts
// Pick what matters, not which model
await llm(prompt, { model: "cheap" });      // Cost-optimized
await llm(prompt, { model: "fast" });       // Speed-optimized
await llm(prompt, { model: "reasoning" });  // o1/Claude reasoning
await llm(prompt, { model: "vision" });     // GPT-4V/Gemini vision
await llm(prompt, { model: "local" });      // Ollama only
```

### Structured Output

```ts
const result = await llm({
  messages: [{ role: "user", content: "Return JSON..." }],
  output: {
    parse: (text) => JSON.parse(text) as MyType,
  },
});
```

### Tool Calling

```ts
const result = await llm({
  messages: [{ role: "user", content: "What is 2 + 3?" }],
  tools: {
    add: (args: { a: number; b: number }) => args.a + args.b,
  },
});
```

### Streaming

```ts
for await (const chunk of llm.stream("Write a haiku")) {
  if (chunk.type === "text") process.stdout.write(chunk.text ?? "");
}
```

### Timeouts & Cancellation

```ts
const controller = new AbortController();
const result = await llm(prompt, {
  timeoutMs: 10_000,
  signal: controller.signal,
});
controller.abort(); // Cancel anytime
```

## OpenAI-Compatible Proxy

Use the local proxy with existing OpenAI SDK clients:

```bash
npx llm proxy
```

```ts
const client = new OpenAI({
  baseURL: "http://127.0.0.1:4040/v1",
  apiKey: "local",
});

// Use model aliases: "auto", "cheap", "fast", "reasoning", "vision", "local"
const result = await client.chat.completions.create({
  model: "auto",  // Router handles selection
  messages: [...]
});
```

No application changes except the endpoint.

## CLI Commands

- `llm setup` — Configure providers and credentials
- `llm models` — List available models
- `llm providers` — Show connected providers  
- `llm status` — Runtime health and metrics
- `llm doctor` — Diagnose issues
- `llm proxy` — Start OpenAI-compatible proxy

## Testing & Certification

```bash
# Offline certification (no API keys needed)
pnpm certify

# Live provider tests (with credentials)
LLM_LIVE_TEST=1 pnpm certify:providers
```

The certification suite validates:

- ✅ Registry freshness and model metadata
- ✅ Credential handling and security
- ✅ Provider discovery and execution
- ✅ Capability-aware routing
- ✅ Deterministic model selection
- ✅ Fallback with error handling
- ✅ Streaming and tool calling
- ✅ Structured output parsing
- ✅ OpenAI proxy compatibility
- ✅ Local-only isolation
- ✅ No credential leakage

## Philosophy

This is not a wrapper around OpenAI.

It's a **runtime** that:

1. **Owns the registry** — Knows every model, its capabilities, and pricing
2. **Owns the routing** — Deterministically selects the best model for your request
3. **Owns the credentials** — Manages secrets securely in a local vault
4. **Owns the fallback** — Retries intelligently when providers fail
5. **Owns the execution** — Normalizes responses across providers
6. **Owns the observability** — Tracks requests, usage, and costs without capturing prompts

Developers focus on **what they need** (automatic, fast, reasoning, vision, local).

The runtime handles **which model provides it**.

## Development

```bash
npm install
npm run build
npm test
```

## Status

PR7 production hardening is complete:

- ✅ Request lifecycle tracing
- ✅ Privacy-first observability
- ✅ Usage and cost accounting
- ✅ Resilience patterns (timeouts, circuit breaker, concurrency)
- ✅ Proxy hardening (security headers, request validation)
- ✅ Provider health caching
- ✅ Registry freshness detection
- ✅ Certification suite
- ✅ End-to-end tests
- ✅ Full documentation

Ready for production use.
