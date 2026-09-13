import {
  collectAllowedNumbers,
  extractCurrencyAndPercentClaims,
  findUnsourcedFinancialClaims,
  validateReplyText,
} from "../lambda/openai-sally.mjs";

const tests = [];

function addTest(name, check) {
  tests.push({ name, check });
}

function assert(condition, message, actual) {
  return condition ? null : { message, actual };
}

function runCase(test) {
  try {
    const { failures } = test.check();
    const cleanFailures = failures.filter(Boolean);
    return { name: test.name, pass: cleanFailures.length === 0, failures: cleanFailures };
  } catch (error) {
    return { name: test.name, pass: false, failures: [{ message: "Threw an error", actual: String(error?.stack || error) }] };
  }
}

const PRICING_OPTIONS = [
  { rate: 6.75, price: -0.25, paymentPI: 2454.83, paymentPITI: 2900.1, estimatedCashToClose: 15320 },
  { rate: 7.125, price: 1.1, paymentPI: 2380.12, paymentPITI: 2825.4, estimatedCashToClose: 9800 },
];

const CURRENT_SCENARIO = {
  loanPurpose: "purchase",
  purchasePrice: "500000",
  downPayment: "25000",
  loanAmount: "475000",
  creditScore: "740",
};

const LOCAL_RESULT = { scenario: CURRENT_SCENARIO, message: "Got it. What ZIP code are you shopping in?" };

addTest("no numeric claims passes cleanly", () => {
  const result = validateReplyText("Great, tell me a little more about the property.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(result.safe, "Expected safe reply with no numbers", result)] };
});

addTest("rate figure sourced from a real pricing option passes", () => {
  const result = validateReplyText("One option shows a rate around 6.75% with roughly $2,455 a month for principal and interest.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(result.safe, "Expected reply matching a real pricing option to pass", result)] };
});

addTest("cash-to-close figure sourced from a real pricing option passes", () => {
  const result = validateReplyText("Estimated cash to close on that option is about $15,320.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(result.safe, "Expected reply matching estimatedCashToClose to pass", result)] };
});

addTest("scenario figures (purchase price, down payment) pass", () => {
  const result = validateReplyText("With a $500,000 purchase price and $25,000 down, here is what changes.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(result.safe, "Expected scenario-sourced dollar figures to pass", result)] };
});

addTest("fabricated rate not present in any pricing option is rejected", () => {
  const result = validateReplyText("I can get you a rate around 4.25% today.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return {
    failures: [
      assert(!result.safe, "Expected a fabricated rate to be rejected", result),
      assert(result.unsourcedClaims.includes(4.25), "Expected 4.25 to be flagged as unsourced", result.unsourcedClaims),
    ],
  };
});

addTest("fabricated payment figure not present anywhere is rejected", () => {
  const result = validateReplyText("Your payment would be about $1,900 a month.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(!result.safe, "Expected a fabricated payment figure to be rejected", result)] };
});

addTest("reasonable rounding of a real figure still passes (relative tolerance)", () => {
  const result = validateReplyText("That option runs about $2,450 a month for principal and interest.", {
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  return { failures: [assert(result.safe, "Expected a small rounding of paymentPI (2454.83 -> 2450) to pass", result)] };
});

addTest("extractCurrencyAndPercentClaims ignores plain numbers without $ or %", () => {
  const claims = extractCurrencyAndPercentClaims("Your credit score of 740 in ZIP 30004 looks good.");
  return { failures: [assert(claims.length === 0, "Expected no $/% claims extracted from plain numbers", claims)] };
});

addTest("collectAllowedNumbers tolerates missing/partial context", () => {
  const allowed = collectAllowedNumbers({});
  return { failures: [assert(allowed instanceof Set, "Expected a Set even with empty context", allowed)] };
});

addTest("findUnsourcedFinancialClaims flags multiple unsourced figures independently", () => {
  const allowedNumbers = collectAllowedNumbers({
    currentScenario: CURRENT_SCENARIO,
    pricingOptions: PRICING_OPTIONS,
    localResult: LOCAL_RESULT,
    deterministicUpdates: {},
  });
  const unsourced = findUnsourcedFinancialClaims("That could be 3.99% with $500 in lender credit.", allowedNumbers);
  return { failures: [assert(unsourced.length === 2, "Expected both fabricated figures to be flagged", unsourced)] };
});

const results = tests.map(runCase);
const passed = results.filter((result) => result.pass).length;
const failed = results.length - passed;

console.log("Choose My Rate Sally Reply Guardrail QA");
console.log(`Total: ${passed}/${results.length} passed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const result of results.filter((item) => !item.pass)) {
    console.log(JSON.stringify(result, null, 2));
  }
}

process.exitCode = failed > 0 ? 1 : 0;
