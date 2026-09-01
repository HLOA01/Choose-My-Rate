import type { PricingScenario } from "../types/scenario.js";

export type ClosingCostEstimateStatus = "complete" | "estimate_incomplete" | "estimate_unavailable";
export type ClosingCostCategory = "lender" | "third_party" | "recording" | "title" | "other";
export type FeeCalculationType = "fixed" | "loan_amount_percent" | "purchase_price_percent";

export interface ClosingCostFee {
  id: string;
  label: string;
  amount: number;
  source: string;
  category: ClosingCostCategory;
  calculationType: FeeCalculationType;
}

export interface ClosingCostFeeDefinition {
  id: string;
  label: string;
  source: string;
  category: ClosingCostCategory;
  calculationType: FeeCalculationType;
  amount?: number;
  percent?: number;
}

export interface ClosingCostFeeSchedule {
  version: string;
  effectiveDate: string;
  complete: boolean;
  fees: ClosingCostFeeDefinition[];
}

export interface ClosingCostEstimate {
  status: ClosingCostEstimateStatus;
  feeScheduleVersion: string | null;
  asOf: string;
  fees: ClosingCostFee[];
  estimatedBaseClosingCosts: number | null;
  includedCategories: ClosingCostCategory[];
  excludedItems: string[];
  reasons: string[];
}

export const CLOSING_COST_DISCLOSURE_VERSION = "closing-cost-prelim-v1";

export const EXCLUDED_CLOSING_COST_ITEMS = [
  "down payment",
  "prepaid interest",
  "property taxes",
  "homeowners insurance",
  "mortgage insurance",
  "HOA dues",
  "initial escrow deposits",
  "escrow reserves",
  "earnest money deposit",
  "seller credits",
  "final tax prorations",
  "payoffs",
  "cash-out proceeds",
  "complete cash to close",
];

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

function calculateFeeAmount(definition: ClosingCostFeeDefinition, scenario: PricingScenario) {
  if (definition.calculationType === "fixed") return definition.amount ?? 0;

  const percent = definition.percent ?? 0;
  const basis =
    definition.calculationType === "loan_amount_percent"
      ? scenario.loanAmount
      : scenario.purchasePrice;

  return basis * (percent / 100);
}

export function estimateClosingCosts(
  scenario: PricingScenario,
  feeSchedule?: ClosingCostFeeSchedule | null,
  asOf: Date = new Date(),
): ClosingCostEstimate {
  if (!feeSchedule) {
    return {
      status: "estimate_unavailable",
      feeScheduleVersion: null,
      asOf: asOf.toISOString(),
      fees: [],
      estimatedBaseClosingCosts: null,
      includedCategories: [],
      excludedItems: EXCLUDED_CLOSING_COST_ITEMS,
      reasons: ["missing_fee_schedule"],
    };
  }

  const fees = feeSchedule.fees.map((definition) => ({
    id: definition.id,
    label: definition.label,
    amount: fromCents(toCents(calculateFeeAmount(definition, scenario))),
    source: definition.source,
    category: definition.category,
    calculationType: definition.calculationType,
  }));

  const baseClosingCosts = fromCents(fees.reduce((sum, fee) => sum + toCents(fee.amount), 0));
  const includedCategories = [...new Set(fees.map((fee) => fee.category))];
  const reasons = feeSchedule.complete ? [] : ["incomplete_fee_schedule"];

  return {
    status: feeSchedule.complete ? "complete" : "estimate_incomplete",
    feeScheduleVersion: feeSchedule.version,
    asOf: asOf.toISOString(),
    fees,
    estimatedBaseClosingCosts: baseClosingCosts,
    includedCategories,
    excludedItems: EXCLUDED_CLOSING_COST_ITEMS,
    reasons,
  };
}
