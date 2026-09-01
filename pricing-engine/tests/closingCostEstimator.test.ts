import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BorrowerPricingOption } from "../src/types/pricing.js";
import type { PricingScenario } from "../src/types/scenario.js";
import {
  estimateClosingCosts,
  type ClosingCostFeeSchedule,
} from "../src/closingCosts/closingCostEstimator.js";
import { assembleBorrowerQuote } from "../src/closingCosts/borrowerQuoteAssembler.js";

const asOf = new Date("2026-08-31T12:00:00.000Z");

function scenario(overrides: Partial<PricingScenario> = {}): PricingScenario {
  return {
    purchasePrice: 500000,
    loanAmount: 400000,
    creditScore: 740,
    occupancy: "primary",
    loanPurpose: "purchase",
    loanTypePreference: "conventional",
    propertyType: "single_family",
    zipCode: "92660",
    downPayment: 100000,
    ltv: 80,
    language: "en",
    ...overrides,
  };
}

function feeSchedule(overrides: Partial<ClosingCostFeeSchedule> = {}): ClosingCostFeeSchedule {
  return {
    version: "qa-fees-v1",
    effectiveDate: "2026-08-31",
    complete: true,
    fees: [
      {
        id: "lender-underwriting",
        label: "Underwriting fee",
        amount: 995,
        source: "qa-fixture",
        category: "lender",
        calculationType: "fixed",
      },
      {
        id: "title-settlement",
        label: "Settlement services",
        amount: 1800,
        source: "qa-fixture",
        category: "title",
        calculationType: "fixed",
      },
      {
        id: "recording",
        label: "County recording",
        percent: 0.05,
        source: "qa-fixture",
        category: "recording",
        calculationType: "loan_amount_percent",
      },
    ],
    ...overrides,
  };
}

function option(overrides: Partial<BorrowerPricingOption> = {}): BorrowerPricingOption {
  return {
    optionId: "rate-option",
    program: "Conventional 30 Year Fixed",
    rate: 6.5,
    price: 0,
    paymentPI: 2528.27,
    paymentPITI: 3153.27,
    estimatedCashToClose: 100000,
    tags: [],
    displayLender: false,
    ...overrides,
  };
}

describe("closing cost estimation contract", () => {
  it("does not provide default production fees without an injected schedule", () => {
    const estimate = estimateClosingCosts(scenario(), null, asOf);

    assert.equal(estimate.status, "estimate_unavailable");
    assert.equal(estimate.feeScheduleVersion, null);
    assert.equal(estimate.estimatedBaseClosingCosts, null);
    assert.deepEqual(estimate.fees, []);
    assert.deepEqual(estimate.reasons, ["missing_fee_schedule"]);
  });

  it("uses deterministic injected fixtures and includes source metadata", () => {
    const estimate = estimateClosingCosts(scenario(), feeSchedule(), asOf);

    assert.equal(estimate.status, "complete");
    assert.equal(estimate.feeScheduleVersion, "qa-fees-v1");
    assert.equal(estimate.estimatedBaseClosingCosts, 2995);
    assert.equal(estimate.fees[0]?.source, "qa-fixture");
    assert.deepEqual(estimate.includedCategories, ["lender", "title", "recording"]);
  });

  it("marks configured but incomplete schedules without inventing missing categories", () => {
    const estimate = estimateClosingCosts(scenario(), feeSchedule({ complete: false }), asOf);

    assert.equal(estimate.status, "estimate_incomplete");
    assert.deepEqual(estimate.reasons, ["incomplete_fee_schedule"]);
    assert.equal(estimate.estimatedBaseClosingCosts, 2995);
  });

  it("excludes down payment, prepaids, escrows, payoffs, and complete cash to close", () => {
    const estimate = estimateClosingCosts(scenario(), feeSchedule(), asOf);

    assert.ok(estimate.excludedItems.includes("down payment"));
    assert.ok(estimate.excludedItems.includes("prepaid interest"));
    assert.ok(estimate.excludedItems.includes("initial escrow deposits"));
    assert.ok(estimate.excludedItems.includes("payoffs"));
    assert.ok(estimate.excludedItems.includes("complete cash to close"));
  });

  it("adds discount-point dollars to estimated closing charges", () => {
    const estimate = estimateClosingCosts(scenario(), feeSchedule(), asOf);
    const quote = assembleBorrowerQuote(option({ price: 0.875 }), estimate, scenario());

    assert.equal(quote.pricingOption.pointsPercent, 0.875);
    assert.equal(quote.pricingOption.pointsDollars, 3500);
    assert.equal(quote.pricingOption.lenderCreditDollars, 0);
    assert.equal(quote.estimatedClosingCharges, 6495);
  });

  it("subtracts lender-credit dollars from estimated closing charges", () => {
    const estimate = estimateClosingCosts(scenario(), feeSchedule(), asOf);
    const quote = assembleBorrowerQuote(option({ price: -0.625 }), estimate, scenario());

    assert.equal(quote.pricingOption.lenderCreditPercent, 0.625);
    assert.equal(quote.pricingOption.lenderCreditDollars, 2500);
    assert.equal(quote.pricingOption.pointsDollars, 0);
    assert.equal(quote.estimatedClosingCharges, 495);
  });

  it("keeps closing charges unavailable when base costs are unavailable", () => {
    const estimate = estimateClosingCosts(scenario(), null, asOf);
    const quote = assembleBorrowerQuote(option({ price: 0.875 }), estimate, scenario());

    assert.equal(quote.estimatedClosingCharges, null);
    assert.equal(quote.closingCostEstimate.status, "estimate_unavailable");
  });
});
