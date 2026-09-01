import type { BorrowerPricingOption } from "../types/pricing.js";
import type { PricingScenario } from "../types/scenario.js";
import type { ClosingCostEstimate } from "./closingCostEstimator.js";

export interface BorrowerQuotePricingOption {
  optionId: string;
  rate: number;
  principalAndInterest: number;
  pointsPercent: number;
  pointsDollars: number;
  lenderCreditPercent: number;
  lenderCreditDollars: number;
}

export interface BorrowerQuote {
  pricingOption: BorrowerQuotePricingOption;
  closingCostEstimate: ClosingCostEstimate;
  estimatedClosingCharges: number | null;
}

function roundedMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeBorrowerPricingOption(
  pricingOption: BorrowerPricingOption,
  scenario: PricingScenario,
): BorrowerQuotePricingOption {
  const price = Number(pricingOption.price || 0);
  const pointsPercent = price > 0 ? price : 0;
  const lenderCreditPercent = price < 0 ? Math.abs(price) : 0;

  return {
    optionId: pricingOption.optionId,
    rate: pricingOption.rate,
    principalAndInterest: pricingOption.paymentPI,
    pointsPercent,
    pointsDollars: roundedMoney(scenario.loanAmount * (pointsPercent / 100)),
    lenderCreditPercent,
    lenderCreditDollars: roundedMoney(scenario.loanAmount * (lenderCreditPercent / 100)),
  };
}

export function assembleBorrowerQuote(
  pricingOption: BorrowerPricingOption,
  closingCostEstimate: ClosingCostEstimate,
  scenario: PricingScenario,
): BorrowerQuote {
  const normalizedPricingOption = normalizeBorrowerPricingOption(pricingOption, scenario);
  const baseClosingCosts = closingCostEstimate.estimatedBaseClosingCosts;
  const estimatedClosingCharges =
    baseClosingCosts == null
      ? null
      : roundedMoney(
          baseClosingCosts +
            normalizedPricingOption.pointsDollars -
            normalizedPricingOption.lenderCreditDollars,
        );

  return {
    pricingOption: normalizedPricingOption,
    closingCostEstimate,
    estimatedClosingCharges,
  };
}
