import type { LLMProvider, ProviderResponse } from "../../../../src/types.js";
abstract class SimulatedProvider implements LLMProvider { abstract id: string; supports = () => true; abstract generate(): Promise<ProviderResponse>; }
export class HealthyProvider extends SimulatedProvider { id = "healthy"; async generate() { return { text: "ok", model: "healthy-model" }; } }
export class VisionProvider extends HealthyProvider { id = "vision-provider"; }
export class TextOnlyProvider extends HealthyProvider { id = "text-only-provider"; }
export class TimeoutProvider extends SimulatedProvider { id = "timeout"; async generate(): Promise<never> { throw new Error("Provider generation timeout"); } }
export class RateLimitedProvider extends SimulatedProvider { id = "rate-limited"; async generate(): Promise<never> { throw new Error("429 rate limited"); } }
export class UnavailableProvider extends SimulatedProvider { id = "unavailable"; async generate(): Promise<never> { throw new Error("503 provider unavailable"); } }
export class AuthFailureProvider extends SimulatedProvider { id = "auth-failure"; async generate(): Promise<never> { throw new Error("401 invalid API key"); } }
