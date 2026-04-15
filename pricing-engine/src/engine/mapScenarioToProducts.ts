import type { PricingScenario } from "../types/scenario.js";

export function getMissingScenarioFields(scenario: Partial<PricingScenario>) {
  const missing: string[] = [];

  if (!scenario.loanAmount || scenario.loanAmount <= 0) missing.push("loanAmount");
  if (!scenario.creditScore || scenario.creditScore <= 0) missing.push("creditScore");
  if (!scenario.occupancy) missing.push("occupancy");
  if (!scenario.loanPurpose) missing.push("loanPurpose");
  if (!scenario.purchasePrice || scenario.purchasePrice <= 0) missing.push("purchasePrice");

  return missing;
}

export function calculateLtv(scenario: PricingScenario) {
  if (scenario.ltv && scenario.ltv > 0) return scenario.ltv;
  if (!scenario.purchasePrice) return null;
  return (scenario.loanAmount / scenario.purchasePrice) * 100;
}
