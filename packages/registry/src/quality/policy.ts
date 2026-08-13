export interface QualityGatePolicy {
  canonicalModelDropPercent: number;
  routeDropPercent: number;
  maxContextCompletenessDrop: number;
  maxPricingCompletenessDrop: number;
  capabilityDropPercent: number;
  unknownToUnsupportedPercent: number;
  failOnDuplicateModels: boolean;
  failOnDuplicateRoutes: boolean;
  failOnInvalidPricing: boolean;
  failOnInvalidContext: boolean;
}
export const DEFAULT_QUALITY_GATE_POLICY: QualityGatePolicy = {
  canonicalModelDropPercent: 20, routeDropPercent: 30, maxContextCompletenessDrop: 5,
  maxPricingCompletenessDrop: 10, capabilityDropPercent: 50, unknownToUnsupportedPercent: 20,
  failOnDuplicateModels: true, failOnDuplicateRoutes: true, failOnInvalidPricing: true, failOnInvalidContext: true,
};
