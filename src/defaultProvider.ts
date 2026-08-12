import { LLMProvider } from "./types.js";

export const setupProvider: LLMProvider = {
  id: "setup-required",
  priority: -100,
  supports: () => true,
  generate: async () => ({
    model: "none",
    text: "No local models or provider credentials are configured yet. Run `npx llm setup` to get started.",
  }),
  stream: async function* () {
    yield {
      type: "text",
      text: "No local models or provider credentials are configured yet. Run `npx llm setup` to get started.",
    };
    yield { type: "done" };
  },
};
