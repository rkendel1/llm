# llm
AI that just works.

Install one package. Write `llm()`. Never think about models again.

```ts
import { llm } from "llm";

const response = await llm("Explain this code");
console.log(response.text);
```

If no local models or provider credentials are configured yet, `llm()` returns setup guidance:

```txt
No local models or provider credentials are configured yet.
Run `npx llm setup` to get started.
```

## MVP status

### Phase 1 (implemented)

- TypeScript runtime
- `llm()` API
- Streaming via `llm.stream()`
- Structured output parsing (`output.parse`)
- Tool-calling abstraction (`tools`)
- Normalized response shape with routing metadata
- Provider plugin interface with deterministic priority routing

### Phase 2 (implemented) — Living Model Registry

- Provider-neutral canonical `ModelDefinition`
- Registry package at `/home/runner/work/llm/llm/packages/registry`
- Local cache for offline use
- Refresh flow for provider metadata ingestion
- Capability-aware and pricing-aware querying
- Versioned and inspectable snapshots
- Core runtime integration so routing can expose selected model metadata and verification time

## Core API

### `llm(input)`

Input can be a prompt string or a request object:

```ts
const result = await llm({
  messages: [{ role: "user", content: "Analyze this contract" }],
  model: "auto", // auto | cheap | fast | reasoning | vision | local | custom
});

console.log(result.text);
console.log(result.routing);
```

### Structured output

```ts
const result = await llm({
  messages: [{ role: "user", content: "Return JSON with an `answer` field" }],
  output: {
    parse: (text) => JSON.parse(text) as { answer: number },
  },
});

console.log(result.structured?.answer);
```

### Tool calling

```ts
const result = await llm({
  messages: [{ role: "user", content: "What is 2 + 3?" }],
  tools: {
    add: ({ a, b }: any) => a + b,
  },
});
```

### Streaming

```ts
for await (const chunk of llm.stream("Write a haiku")) {
  if (chunk.type === "text") process.stdout.write(chunk.text ?? "");
}
```

## Provider plugins

Register providers as peers via the provider interface:

```ts
import { llm, type LLMProvider } from "llm";

const provider: LLMProvider = {
  id: "my-provider",
  priority: 10,
  supports: () => true,
  generate: async () => ({
    text: "Hello",
    model: "my-model",
  }),
};

llm.registerProvider(provider);
```

## Registry API

```ts
import { llm, type RegistryProviderAdapter } from "llm";

const adapter: RegistryProviderAdapter = {
  id: "openai",
  discover: async () => [
    {
      id: "gpt-4.1-mini",
      context: { input: 1_000_000 },
      capabilities: { tools: true, structuredOutput: true },
      pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    },
  ],
};

llm.setRegistryProviders([adapter]);
await llm.refreshModelRegistry();
console.log(llm.inspectModelRegistry());
```

Routing is deterministic:

1. Filter providers by `supports(request)`
2. Select highest-priority provider
3. Return transparent routing metadata with alternatives

## Local-first direction

The product direction remains:

- Zero-config default DX
- Local-first inference (Ollama when available)
- Developer-owned keys and routing
- Transparent routing decisions
- Optional OpenAI-compatible proxy in a later phase

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```
