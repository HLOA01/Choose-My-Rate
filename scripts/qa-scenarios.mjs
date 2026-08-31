import { buildScenarioVariant, calculateComparisonDeltas } from "../src/comparison/comparisonUtils.js";
import { buildPricingScenario, calculatePricing, hasMinimumPricingScenario } from "../src/pricing/pricingScenario.js";
import { buildDebtConsolidationComparison } from "../src/utils/debtConsolidationComparison.js";
import { buildRefinanceComparison } from "../src/utils/refinanceComparison.js";
import { createEmptyScenario, processSallyMessage } from "../src/SallyBrain.js";

const tests = [];

function addTest(group, name, inputs, expected, check) {
  tests.push({ group, name, inputs, expected, check });
}

function assert(condition, message, actual) {
  return condition ? null : { message, actual };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function around(actual, expected, tolerance = 1) {
  return isFiniteNumber(actual) && Math.abs(actual - expected) <= tolerance;
}

function hasNoBadDisplayValues(value) {
  return !/NaN|Infinity|undefined/.test(JSON.stringify(value));
}

function runCase(test) {
  try {
    const { actual, failures } = test.check(test.inputs);
    const cleanFailures = failures.filter(Boolean);

    return {
      group: test.group,
      scenarioName: test.name,
      inputs: test.inputs,
      expectedResult: test.expected,
      actualResult: actual,
      pass: cleanFailures.length === 0,
      failures: cleanFailures,
    };
  } catch (error) {
    return {
      group: test.group,
      scenarioName: test.name,
      inputs: test.inputs,
      expectedResult: test.expected,
      actualResult: null,
      pass: false,
      failures: [{ message: error.message, actual: error.stack }],
    };
  }
}

function refinance(inputs) {
  return buildRefinanceComparison(inputs);
}

function debt(inputs) {
  return buildDebtConsolidationComparison(inputs);
}

function sally(message, scenario = createEmptyScenario()) {
  return processSallyMessage(message, scenario);
}

function purchase(inputs) {
  const pricingScenario = buildPricingScenario(inputs);
  return {
    pricingScenario,
    hasMinimum: hasMinimumPricingScenario(pricingScenario),
    pricing: calculatePricing(inputs, inputs.manualRate ?? null),
  };
}

function addPurchaseTests() {
  const cases = [
    ["Conventional 20 percent down", { purchasePrice: 500000, downPayment: 100000, loanAmount: 400000, creditScore: 760, occupancy: "primary", zipCode: "92660", loanType: "Conventional" }, { minimum: true, mi: 0 }],
    ["Conventional low down payment includes MI", { purchasePrice: 450000, downPayment: 22500, loanAmount: 427500, creditScore: 720, occupancy: "primary", zipCode: "92101", loanType: "Conventional" }, { minimum: true, miGreaterThan: 0 }],
    ["FHA purchase includes MI", { purchasePrice: 390000, downPayment: 13650, loanAmount: 376350, creditScore: 680, occupancy: "primary", zipCode: "89101", loanType: "FHA" }, { minimum: true, loanTypePreference: "fha", miGreaterThan: 0 }],
    ["VA purchase has VA preference", { purchasePrice: 520000, downPayment: 0, loanAmount: 520000, creditScore: 740, occupancy: "primary", zipCode: "78201", loanType: "VA" }, { minimum: true, loanTypePreference: "va" }],
    ["Investment purchase gets higher base rate", { purchasePrice: 375000, downPayment: 75000, loanAmount: 300000, creditScore: 740, occupancy: "investment", zipCode: "85001", loanType: "Conventional" }, { minimum: true, rateGreaterThan: 6.6 }],
    ["Jumbo purchase preference", { purchasePrice: 1200000, downPayment: 300000, loanAmount: 900000, creditScore: 780, occupancy: "primary", zipCode: "94016", loanType: "Jumbo" }, { minimum: true, loanTypePreference: "jumbo" }],
    ["DSCR investment preference", { purchasePrice: 650000, downPayment: 162500, loanAmount: 487500, creditScore: 720, occupancy: "investment", zipCode: "33101", loanType: "DSCR" }, { minimum: true, loanTypePreference: "dscr" }],
    ["Purchase missing ZIP is incomplete", { purchasePrice: 350000, downPayment: 35000, loanAmount: 315000, creditScore: 700, occupancy: "primary", loanType: "Conventional" }, { minimum: false }],
    ["Scenario variant computes loan amount from percent", { purchasePrice: "600000", downPaymentPercent: "10", creditScore: "720", occupancy: "primary", zipCode: "30301", loanType: "Conventional" }, { loanAmount: "540000", downPayment: "60000" }],
    ["FHA versus Conventional MI delta", { purchasePrice: 410000, loanAmount: 389500, creditScore: 690, occupancy: "primary", zipCode: "80901" }, { fhaMiHigherOrEqual: true }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("purchase", name, inputs, expected, (scenario) => {
      if (name === "Scenario variant computes loan amount from percent") {
        const variant = buildScenarioVariant({}, scenario);
        return {
          actual: variant,
          failures: [
            assert(variant.loanAmount === expected.loanAmount, "Expected loan amount from down-payment percent", variant.loanAmount),
            assert(variant.downPayment === expected.downPayment, "Expected down payment from down-payment percent", variant.downPayment),
            assert(hasNoBadDisplayValues(variant), "Variant should not contain bad display values", variant),
          ],
        };
      }

      if (name === "FHA versus Conventional MI delta") {
        const fha = purchase({ ...scenario, loanType: "FHA" });
        const conventional = purchase({ ...scenario, loanType: "Conventional" });
        const deltas = calculateComparisonDeltas(
          { label: "FHA", pricing: fha.pricing },
          { label: "Conventional", pricing: conventional.pricing },
        );
        return {
          actual: { fha: fha.pricing, conventional: conventional.pricing, deltas },
          failures: [
            assert(fha.pricing.mortgageInsurance >= conventional.pricing.mortgageInsurance, "Expected FHA MI to be higher or equal in this sample", { fha: fha.pricing.mortgageInsurance, conventional: conventional.pricing.mortgageInsurance }),
            assert(deltas.monthlyPayment.difference !== null, "Expected payment delta to calculate", deltas.monthlyPayment),
          ],
        };
      }

      const actual = purchase(scenario);
      return {
        actual,
        failures: [
          assert(actual.hasMinimum === expected.minimum, "Expected minimum pricing scenario flag", actual.hasMinimum),
          expected.loanTypePreference
            ? assert(actual.pricingScenario.loanTypePreference === expected.loanTypePreference, "Expected loan type preference", actual.pricingScenario.loanTypePreference)
            : null,
          expected.mi === 0 ? assert(actual.pricing.mortgageInsurance === 0, "Expected no mortgage insurance", actual.pricing.mortgageInsurance) : null,
          expected.miGreaterThan !== undefined ? assert(actual.pricing.mortgageInsurance > expected.miGreaterThan, "Expected mortgage insurance", actual.pricing.mortgageInsurance) : null,
          expected.rateGreaterThan !== undefined ? assert(actual.pricing.rate > expected.rateGreaterThan, "Expected higher base rate", actual.pricing.rate) : null,
          assert(hasNoBadDisplayValues(actual), "Purchase result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addRefinanceTests() {
  const cases = [
    ["Rate-and-term monthly savings", { currentLoanBalance: 400000, currentInterestRate: 7, currentRemainingTermYears: 27, newLoanAmount: 400000, newInterestRate: 6, newLoanTermYears: 30, estimatedClosingCosts: 6000, propertyValue: 600000 }, { type: "rate_and_term", savingsGreaterThan: 0, breakeven: true }],
    ["Rate-and-term higher payment", { currentLoanBalance: 300000, currentInterestRate: 4, currentRemainingTermYears: 25, newLoanAmount: 300000, newInterestRate: 7, newLoanTermYears: 30, estimatedClosingCosts: 5000, propertyValue: 500000 }, { savings: 0, differenceGreaterThan: 0 }],
    ["Zero current rate amortizes safely", { currentLoanBalance: 240000, currentInterestRate: 0, currentRemainingTermYears: 20, newLoanAmount: 240000, newInterestRate: 5, newLoanTermYears: 30, propertyValue: 400000 }, { currentPayment: 1000 }],
    ["Zero new rate amortizes safely", { currentLoanBalance: 240000, currentInterestRate: 6, currentRemainingTermYears: 20, newLoanAmount: 240000, newInterestRate: 0, newLoanTermYears: 30, propertyValue: 400000 }, { newPayment: 667 }],
    ["Missing closing costs does not calculate breakeven", { currentLoanBalance: 450000, currentInterestRate: 7.25, currentRemainingTermYears: 28, newLoanAmount: 450000, newInterestRate: 6.25, newLoanTermYears: 30, propertyValue: 750000 }, { closingCosts: 0, breakeven: null }],
    ["New loan amount defaults from balance", { currentLoanBalance: 350000, requestedCashOut: 0, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.125, newLoanTermYears: 30, propertyValue: 550000 }, { newLoanAmount: 350000 }],
    ["String values parse safely", { currentLoanBalance: "$410,000", currentInterestRate: "7.125%", currentRemainingTermYears: "26", newLoanAmount: "$410,000", newInterestRate: "6.5%", newLoanTermYears: "30", estimatedClosingCosts: "$7,500", propertyValue: "$650,000" }, { closingCosts: 7500 }],
    ["Negative inputs clamp safely", { currentLoanBalance: -1000, currentInterestRate: -4, currentRemainingTermYears: -30, newLoanAmount: -500, newInterestRate: -3, newLoanTermYears: -30, propertyValue: -1 }, { currentBalance: 0, newLoanAmount: 0 }],
    ["LTV calculates", { currentLoanBalance: 300000, currentInterestRate: 6.75, currentRemainingTermYears: 25, newLoanAmount: 360000, newInterestRate: 6.5, newLoanTermYears: 30, propertyValue: 600000 }, { ltv: 60 }],
    ["Unknown refi when loan amounts missing", { propertyValue: 500000, currentInterestRate: 6, newInterestRate: 5.75, newLoanTermYears: 30 }, { type: "unknown" }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("refinance math", name, inputs, expected, (scenario) => {
      const actual = refinance(scenario);
      return {
        actual,
        failures: [
          expected.type ? assert(actual.refinanceType === expected.type, "Expected refinance type", actual.refinanceType) : null,
          expected.savingsGreaterThan !== undefined ? assert(actual.monthlySavings > expected.savingsGreaterThan, "Expected monthly savings", actual.monthlySavings) : null,
          expected.savings !== undefined ? assert(actual.monthlySavings === expected.savings, "Expected monthly savings value", actual.monthlySavings) : null,
          expected.differenceGreaterThan !== undefined ? assert(actual.monthlyPaymentDifference > expected.differenceGreaterThan, "Expected payment increase", actual.monthlyPaymentDifference) : null,
          expected.breakeven === true ? assert(actual.breakevenMonths > 0, "Expected breakeven months", actual.breakevenMonths) : null,
          expected.breakeven === null ? assert(actual.breakevenMonths === null, "Expected no breakeven", actual.breakevenMonths) : null,
          expected.currentPayment !== undefined ? assert(around(actual.currentMonthlyPrincipalAndInterest, expected.currentPayment), "Expected current payment", actual.currentMonthlyPrincipalAndInterest) : null,
          expected.newPayment !== undefined ? assert(around(actual.newMonthlyPrincipalAndInterest, expected.newPayment), "Expected new payment", actual.newMonthlyPrincipalAndInterest) : null,
          expected.closingCosts !== undefined ? assert(actual.totalEstimatedClosingCosts === expected.closingCosts, "Expected closing costs", actual.totalEstimatedClosingCosts) : null,
          expected.newLoanAmount !== undefined ? assert(actual.newLoanAmount === expected.newLoanAmount, "Expected new loan amount", actual.newLoanAmount) : null,
          expected.currentBalance !== undefined ? assert(actual.currentLoanBalance === expected.currentBalance, "Expected current balance", actual.currentLoanBalance) : null,
          expected.ltv !== undefined ? assert(actual.newLoanToValue === expected.ltv, "Expected LTV", actual.newLoanToValue) : null,
          assert(hasNoBadDisplayValues(actual), "Refinance result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addCashOutTests() {
  const cases = [
    ["Moderate requested cash out", { propertyValue: 700000, currentLoanBalance: 410000, requestedCashOut: 50000, currentInterestRate: 6.875, currentRemainingTermYears: 25, newInterestRate: 6.5, newLoanTermYears: 30, estimatedClosingCosts: 8000 }, { type: "cash_out", cashOut: 50000, netCash: 42000 }],
    ["Cash out inferred from new loan amount", { propertyValue: 650000, currentLoanBalance: 390000, newLoanAmount: 440000, currentInterestRate: 6.75, currentRemainingTermYears: 24, newInterestRate: 6.5, newLoanTermYears: 30, estimatedClosingCosts: 7000 }, { type: "cash_out", cashOut: 50000 }],
    ["Requested cash out plus closing cost net", { propertyValue: 800000, currentLoanBalance: 500000, requestedCashOut: 100000, currentInterestRate: 7, currentRemainingTermYears: 26, newInterestRate: 6.75, newLoanTermYears: 30, estimatedClosingCosts: 12000 }, { netCash: 88000 }],
    ["Closing costs can consume cash out", { propertyValue: 500000, currentLoanBalance: 300000, requestedCashOut: 5000, currentInterestRate: 6, currentRemainingTermYears: 24, newInterestRate: 6.25, newLoanTermYears: 30, estimatedClosingCosts: 8000 }, { netCash: 0 }],
    ["Cash out with no property value is safe", { currentLoanBalance: 250000, requestedCashOut: 40000, currentInterestRate: 6.5, currentRemainingTermYears: 24, newInterestRate: 6.5, newLoanTermYears: 30 }, { type: "cash_out", ltv: null }],
    ["Cash out with zero property value has null LTV", { propertyValue: 0, currentLoanBalance: 250000, requestedCashOut: 40000, currentInterestRate: 6.5, currentRemainingTermYears: 24, newInterestRate: 6.5, newLoanTermYears: 30 }, { ltv: null }],
    ["New loan amount defaults to balance plus cash out", { propertyValue: 700000, currentLoanBalance: 420000, requestedCashOut: 65000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.25, newLoanTermYears: 30 }, { newLoanAmount: 485000 }],
    ["Available equity calculates", { propertyValue: 725000, currentLoanBalance: 500000, requestedCashOut: 25000, currentInterestRate: 7, currentRemainingTermYears: 26, newInterestRate: 6.75, newLoanTermYears: 30 }, { availableEquity: 225000 }],
    ["Zero requested cash out remains rate-and-term when balances match", { propertyValue: 700000, currentLoanBalance: 450000, newLoanAmount: 450000, requestedCashOut: 0, currentInterestRate: 7, currentRemainingTermYears: 26, newInterestRate: 6.5, newLoanTermYears: 30 }, { type: "rate_and_term", cashOut: 0 }],
    ["Cash out LTV rounds", { propertyValue: 575000, currentLoanBalance: 330000, requestedCashOut: 55000, currentInterestRate: 7.125, currentRemainingTermYears: 26, newInterestRate: 6.625, newLoanTermYears: 30 }, { ltv: 66.96 }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("cash-out refinance", name, inputs, expected, (scenario) => {
      const actual = refinance(scenario);
      return {
        actual,
        failures: [
          expected.type ? assert(actual.refinanceType === expected.type, "Expected refinance type", actual.refinanceType) : null,
          expected.cashOut !== undefined ? assert(actual.cashOutAmount === expected.cashOut, "Expected cash out amount", actual.cashOutAmount) : null,
          expected.netCash !== undefined ? assert(actual.netCashToBorrower === expected.netCash, "Expected net cash to borrower", actual.netCashToBorrower) : null,
          expected.ltv !== undefined ? assert(actual.newLoanToValue === expected.ltv, "Expected LTV", actual.newLoanToValue) : null,
          expected.newLoanAmount !== undefined ? assert(actual.newLoanAmount === expected.newLoanAmount, "Expected new loan amount", actual.newLoanAmount) : null,
          expected.availableEquity !== undefined ? assert(actual.availableEquity === expected.availableEquity, "Expected available equity", actual.availableEquity) : null,
          assert(hasNoBadDisplayValues(actual), "Cash-out result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addDebtTests() {
  const cases = [
    ["Debt consolidation improves cash flow with payment increase", { debtConsolidationAmount: 35000, debtConsolidationMonthlyPayments: 900, refinancePaymentChange: 250 }, { status: "estimated_cash_flow_improvement", improvement: 650 }],
    ["Mortgage savings add to debt payment reduction", { debtConsolidationAmount: 50000, debtConsolidationMonthlyPayments: 1100, refinancePaymentChange: -175 }, { status: "estimated_cash_flow_improvement", improvement: 1275 }],
    ["Neutral cash flow", { debtConsolidationAmount: 20000, debtConsolidationMonthlyPayments: 400, refinancePaymentChange: 400 }, { status: "estimated_cash_flow_neutral", improvement: 0 }],
    ["Cash flow reduction", { debtConsolidationAmount: 25000, debtConsolidationMonthlyPayments: 300, refinancePaymentChange: 525 }, { status: "estimated_cash_flow_reduction", improvement: -225 }],
    ["Missing debt amount", { debtConsolidationMonthlyPayments: 500, refinancePaymentChange: 100 }, { status: "missing_debt_inputs", improvement: null }],
    ["Missing monthly payments", { debtConsolidationAmount: 25000, refinancePaymentChange: 100 }, { status: "missing_debt_inputs", improvement: null }],
    ["String amounts parse", { debtConsolidationAmount: "$45,000", debtConsolidationMonthlyPayments: "$1,025", refinancePaymentChange: "$225" }, { amount: 45000, payments: 1025, improvement: 800 }],
    ["Negative debt inputs clamp", { debtConsolidationAmount: -20000, debtConsolidationMonthlyPayments: -500, refinancePaymentChange: -100 }, { amount: 0, payments: 0, status: "missing_debt_inputs" }],
    ["Zero refinance payment change uses debt payments", { debtConsolidationAmount: 32000, debtConsolidationMonthlyPayments: 725, refinancePaymentChange: 0 }, { improvement: 725 }],
    ["Decimal payments round", { debtConsolidationAmount: 20000.4, debtConsolidationMonthlyPayments: 550.49, refinancePaymentChange: 100.2 }, { amount: 20000, payments: 550, improvement: 450 }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("debt consolidation", name, inputs, expected, (scenario) => {
      const actual = debt(scenario);
      return {
        actual,
        failures: [
          expected.status ? assert(actual.status === expected.status, "Expected debt consolidation status", actual.status) : null,
          Object.hasOwn(expected, "improvement") ? assert(actual.estimatedMonthlyCashFlowImprovement === expected.improvement, "Expected monthly cash-flow improvement", actual.estimatedMonthlyCashFlowImprovement) : null,
          expected.amount !== undefined ? assert(actual.debtConsolidationAmount === expected.amount, "Expected debt amount", actual.debtConsolidationAmount) : null,
          expected.payments !== undefined ? assert(actual.currentDebtMonthlyPayments === expected.payments, "Expected current debt monthly payments", actual.currentDebtMonthlyPayments) : null,
          assert(hasNoBadDisplayValues(actual), "Debt result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addSallyTests() {
  const refinanceScenario = {
    ...createEmptyScenario(),
    loanPurpose: "rate_term_refinance",
    propertyValue: "",
    currentLoanBalance: "",
    currentInterestRate: "",
    currentRemainingTermYears: "",
  };
  const completeScenario = {
    ...createEmptyScenario(),
    loanPurpose: "cash_out_refinance",
    refinancePurpose: "debt_consolidation",
    propertyValue: "650000",
    currentLoanBalance: "390000",
    currentInterestRate: "7",
    currentLoanTermYears: "30",
    currentRemainingTermYears: "26",
    newLoanAmount: "455000",
    newInterestRate: "6.5",
    newLoanTermYears: "30",
    estimatedClosingCosts: "8000",
    requestedCashOut: "65000",
    debtConsolidationAmount: "45000",
    debtConsolidationMonthlyPayments: "950",
  };
  const cases = [
    ["Starts refinance flow", { message: "I want to refinance", scenario: createEmptyScenario() }, { loanPurpose: "rate_term_refinance" }],
    ["Detects cash out refinance", { message: "cash out refinance", scenario: createEmptyScenario() }, { loanPurpose: "cash_out_refinance", refinancePurpose: "cash_out" }],
    ["Detects debt consolidation refinance", { message: "I want to consolidate debt", scenario: createEmptyScenario() }, { loanPurpose: "cash_out_refinance", refinancePurpose: "debt_consolidation" }],
    ["Detects credit card payoff", { message: "I want to pay off credit cards", scenario: createEmptyScenario() }, { refinancePurpose: "debt_consolidation" }],
    ["Detects lower payment purpose", { message: "I want to lower my payment", scenario: createEmptyScenario() }, { refinancePurpose: "lower_payment" }],
    ["Detects shorter term purpose", { message: "I want a shorter term", scenario: createEmptyScenario() }, { refinancePurpose: "shorten_term" }],
    ["Captures home value", { message: "my home is worth 575k", scenario: refinanceScenario }, { propertyValue: "575000" }],
    ["Captures current balance", { message: "I owe 345k", scenario: refinanceScenario }, { currentLoanBalance: "345000" }],
    ["Captures cash-out amount", { message: "cash out 42000", scenario: refinanceScenario }, { requestedCashOut: "42000", refinancePurpose: "cash_out" }],
    ["Keeps complete refinance data safe", { message: "compare my current loan to the new loan", scenario: completeScenario }, { messageIncludes: ["mortgage payment"] }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("Sally refinance intent", name, inputs, expected, ({ message, scenario }) => {
      const actual = sally(message, scenario);
      return {
        actual,
        failures: [
          expected.loanPurpose ? assert(actual.scenarioUpdates?.loanPurpose === expected.loanPurpose || actual.scenario?.loanPurpose === expected.loanPurpose, "Expected Sally loan purpose update", actual) : null,
          expected.refinancePurpose ? assert(actual.scenarioUpdates?.refinancePurpose === expected.refinancePurpose || actual.scenario?.refinancePurpose === expected.refinancePurpose, "Expected Sally refinance purpose update", actual) : null,
          expected.propertyValue ? assert(actual.scenarioUpdates?.propertyValue === expected.propertyValue || actual.scenario?.propertyValue === expected.propertyValue, "Expected Sally property value capture", actual) : null,
          expected.currentLoanBalance ? assert(actual.scenarioUpdates?.currentLoanBalance === expected.currentLoanBalance || actual.scenario?.currentLoanBalance === expected.currentLoanBalance, "Expected Sally current balance capture", actual) : null,
          expected.requestedCashOut ? assert(actual.scenarioUpdates?.requestedCashOut === expected.requestedCashOut || actual.scenario?.requestedCashOut === expected.requestedCashOut, "Expected Sally cash-out capture", actual) : null,
          expected.messageIncludes
            ? assert(expected.messageIncludes.every((text) => String(actual.message || "").toLowerCase().includes(text)), "Expected Sally message wording", actual.message)
            : null,
          assert(hasNoBadDisplayValues(actual), "Sally result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addHighCashOutTests() {
  const cases = [
    ["Requested cash out exceeds available equity", { propertyValue: 500000, currentLoanBalance: 480000, requestedCashOut: 50000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.75, newLoanTermYears: 30 }, { warning: true }],
    ["No warning when cash out is below equity", { propertyValue: 700000, currentLoanBalance: 420000, requestedCashOut: 50000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.75, newLoanTermYears: 30 }, { warning: false }],
    ["Current balance above value gives zero available equity", { propertyValue: 400000, currentLoanBalance: 425000, requestedCashOut: 1000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.75, newLoanTermYears: 30 }, { warning: true, availableEquity: 0 }],
    ["Exact available equity is not a warning", { propertyValue: 500000, currentLoanBalance: 450000, requestedCashOut: 50000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.75, newLoanTermYears: 30 }, { warning: false }],
    ["Missing property value cannot warn", { currentLoanBalance: 350000, requestedCashOut: 100000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6.75, newLoanTermYears: 30 }, { warning: false, availableEquity: null }],
  ];

  for (const [name, inputs, expected] of cases) {
    addTest("high cash-out warning", name, inputs, expected, (scenario) => {
      const actual = refinance(scenario);
      return {
        actual,
        failures: [
          assert(actual.cashOutExceedsAvailableEquity === expected.warning, "Expected high cash-out warning flag", actual.cashOutExceedsAvailableEquity),
          Object.hasOwn(expected, "availableEquity") ? assert(actual.availableEquity === expected.availableEquity, "Expected available equity", actual.availableEquity) : null,
          assert(hasNoBadDisplayValues(actual), "High cash-out result should not contain bad display values", actual),
        ],
      };
    });
  }
}

function addMissingInputTests() {
  const cases = [
    ["Empty refinance helper is safe", { kind: "refinance", inputs: {} }, { type: "unknown", currentPayment: null, newPayment: null }],
    ["Missing terms prevent payment math", { kind: "refinance", inputs: { currentLoanBalance: 350000, currentInterestRate: 6.5, newLoanAmount: 350000, newInterestRate: 6 } }, { currentPayment: null, newPayment: null }],
    ["Missing property value leaves LTV pending", { kind: "refinance", inputs: { currentLoanBalance: 350000, newLoanAmount: 375000, currentInterestRate: 6.5, currentRemainingTermYears: 25, newInterestRate: 6, newLoanTermYears: 30 } }, { ltv: null }],
    ["Missing debt inputs asks for debt details", { kind: "debt", inputs: { refinancePaymentChange: 200 } }, { status: "missing_debt_inputs", improvement: null }],
    ["Sally asks for missing refinance inputs", { kind: "sally", inputs: { message: "I want to refinance", scenario: { ...createEmptyScenario(), loanPurpose: "rate_term_refinance" } } }, { messageIncludes: "cash out" }],
  ];

  for (const [name, wrapper, expected] of cases) {
    addTest("missing input", name, wrapper, expected, ({ kind, inputs }) => {
      let actual;
      if (kind === "refinance") actual = refinance(inputs);
      if (kind === "debt") actual = debt(inputs);
      if (kind === "sally") actual = sally(inputs.message, inputs.scenario);

      return {
        actual,
        failures: [
          expected.type ? assert(actual.refinanceType === expected.type, "Expected refinance type", actual.refinanceType) : null,
          Object.hasOwn(expected, "currentPayment") ? assert(actual.currentMonthlyPrincipalAndInterest === expected.currentPayment, "Expected current payment", actual.currentMonthlyPrincipalAndInterest) : null,
          Object.hasOwn(expected, "newPayment") ? assert(actual.newMonthlyPrincipalAndInterest === expected.newPayment, "Expected new payment", actual.newMonthlyPrincipalAndInterest) : null,
          Object.hasOwn(expected, "ltv") ? assert(actual.newLoanToValue === expected.ltv, "Expected LTV", actual.newLoanToValue) : null,
          expected.status ? assert(actual.status === expected.status, "Expected status", actual.status) : null,
          Object.hasOwn(expected, "improvement") ? assert(actual.estimatedMonthlyCashFlowImprovement === expected.improvement, "Expected improvement", actual.estimatedMonthlyCashFlowImprovement) : null,
          expected.messageIncludes ? assert(String(actual.message || "").toLowerCase().includes(expected.messageIncludes), "Expected missing-input Sally message", actual.message) : null,
          assert(hasNoBadDisplayValues(actual), "Missing-input result should not contain bad display values", actual),
        ],
      };
    });
  }
}

addPurchaseTests();
addRefinanceTests();
addCashOutTests();
addDebtTests();
addSallyTests();
addHighCashOutTests();
addMissingInputTests();

const results = tests.map(runCase);
const passed = results.filter((result) => result.pass).length;
const failed = results.length - passed;
const groups = [...new Set(results.map((result) => result.group))].map((group) => {
  const groupResults = results.filter((result) => result.group === group);
  const groupPassed = groupResults.filter((result) => result.pass).length;
  return {
    group,
    passed: groupPassed,
    failed: groupResults.length - groupPassed,
    total: groupResults.length,
  };
});

console.log("Choose My Rate QA Scenario Harness");
console.log(`Total: ${passed}/${results.length} passed`);
for (const group of groups) {
  console.log(`- ${group.group}: ${group.passed}/${group.total} passed`);
}

if (failed > 0) {
  console.log("\nFailures:");
  for (const result of results.filter((item) => !item.pass)) {
    console.log(JSON.stringify(result, null, 2));
  }
}

process.exitCode = failed > 0 ? 1 : 0;
