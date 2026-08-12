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

## Phase 1 MVP (implemented)

This repository currently ships the **core runtime** milestone:

- TypeScript runtime
- `llm()` API
- Streaming via `llm.stream()`
- Structured output parsing (`output.parse`)
- Tool-calling abstraction (`tools`)
- Normalized response shape with routing metadata
- Provider plugin interface with deterministic priority routing

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
