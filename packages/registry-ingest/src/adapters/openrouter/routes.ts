const ROUTE_VARIANTS = new Set(["free", "batch"]);

export function classifyOpenRouterId(id: string): { canonicalId: string; variant?: string } {
  const separator = id.lastIndexOf(":");
  if (separator < 0) return { canonicalId: id };
  const suffix = id.slice(separator + 1);
  return ROUTE_VARIANTS.has(suffix) ? { canonicalId: id.slice(0, separator), variant: suffix } : { canonicalId: id };
}
