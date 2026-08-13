import type { RoutingObservationStore } from "./store.js";
import type { RoutingObservation } from "./types.js";

export class MemoryRoutingObservationStore implements RoutingObservationStore {
  private observations: RoutingObservation[] = [];
  constructor(private readonly maximumSize = 10_000) {}
  record(observation: RoutingObservation): void {
    this.observations.push({ ...observation });
    if (this.observations.length > this.maximumSize) this.observations.splice(0, this.observations.length - this.maximumSize);
  }
  list(filter: Partial<Pick<RoutingObservation, "modelId" | "routeId" | "provider">> = {}): RoutingObservation[] {
    return this.observations.filter((item) => Object.entries(filter).every(([key, value]) => item[key as keyof typeof filter] === value)).map((item) => ({ ...item }));
  }
  clear(): void { this.observations = []; }
}

export const runtimeObservationStore = new MemoryRoutingObservationStore();
