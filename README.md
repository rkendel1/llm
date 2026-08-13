# llm

One API for hosted and local language models, backed by a normalized model registry and automatic routing.

```bash
npm install @easy-llm/llm
npx llm setup
npx llm doctor
npx llm run "Explain closures simply."
```

The default is `auto`: you do not need to choose a provider or memorize a model ID.

## TypeScript API

```ts
import { llm } from "@easy-llm/llm";

const response = await llm("Explain this code");
console.log(response.text);
```

Use a routing intent when one quality matters most:

```ts
await llm(prompt, { model: "cheap" });
await llm(prompt, { model: "fast" });
await llm(prompt, { model: "reasoning" });
await llm(prompt, { model: "local" });
```

You can also request an exact canonical model ID. Images automatically require a vision-capable route:

```ts
await llm({
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What is in this image?" },
      { type: "image", source: { url: "https://example.com/image.jpg" } },
    ],
  }],
});
```

Inspect a decision without executing it:

```ts
const explanation = await llm.explain("Summarize this", { model: "cheap" });
console.log(explanation.selected.modelId, explanation.reasons);
```

The runtime loads the registry, resolves credentials, scores executable routes using capability evidence, confidence, freshness, observed health, latency, availability, pricing, and policy, then invokes the winner. Retryable failures are recorded and the remaining semantically equivalent routes are re-scored. The response includes the route and normalized usage metadata.

Runtime outcomes are held separately from the immutable canonical registry. Route health starts as `unknown`, requires multiple observations before becoming healthy or degraded, and uses a rolling window so one old failure cannot permanently poison a route. Prompt content is never stored in observations.

## Credentials

Credential resolution has one precedence order:

1. An explicitly supplied runtime credential
2. The provider environment variable, such as `OPENAI_API_KEY`
3. The encrypted `llm` vault

`llm setup` creates or updates the vault and verifies that the packaged canonical registry loads. In a long-running process, unlock the vault once:

```ts
await llm.unlock(process.env.LLM_VAULT_PASSWORD!);
// Subsequent llm(...) calls reuse the unlocked session.
```

Ollama needs no credential. Its default endpoint is `http://localhost:11434`.

## CLI journey

```bash
llm setup                         # configure credentials
llm doctor                        # actionable readiness summary
llm doctor --deep                 # include provider connectivity checks
llm run "Draft a release note"    # automatic execution
llm route "Draft a release note"  # explain the same runtime decision
llm models                        # canonical model inventory
llm model <canonical-model-id>    # inspect one normalized record
llm status                        # registry and executable-provider status
llm status --routes               # locally observed route health and latency
```

Add `--json` to automation-oriented inspection commands where supported.

## Canonical registry

The npm package ships the same normalized registry used by routing and the CLI. Consumers do not need repository-relative files.

```ts
import { loadCanonicalRegistry } from "@easy-llm/llm/registry";

const registry = await loadCanonicalRegistry();
console.log(registry.version, registry.models.length);
```

The loader prefers an explicitly supplied registry, then the packaged canonical snapshot. A local path is only a development fallback after packaged resolution fails.

## Advanced requests

The object request form remains available for messages, tools, structured output, streaming, timeouts, and cancellation:

```ts
const result = await llm({
  messages: [{ role: "user", content: "Return a JSON list of three colors" }],
  output: { parse: (text) => JSON.parse(text) as string[] },
  timeoutMs: 10_000,
});
```

```ts
for await (const chunk of llm.stream("Write a haiku")) {
  if (chunk.type === "text") process.stdout.write(chunk.text ?? "");
}
```

## Providers

Built-in adapters cover OpenAI, Anthropic, Google, OpenRouter, and Ollama. OpenAI and OpenRouter accept native image content through the unified request shape; other adapters preserve a text-compatible representation when native image transport is unavailable.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run test:fresh-install
```

The fresh-install test packs the project, installs the tarball in an empty consumer, loads the packaged registry, and executes an automatically routed request.

## License

MIT
