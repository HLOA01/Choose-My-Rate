import { createEmptyScenario, processSallyMessage } from "../src/SallyBrain.js";

const tests = [];

function addTest(group, name, check) {
  tests.push({ group, name, check });
}

function assert(condition, message, actual) {
  return condition ? null : { message, actual };
}

function hasNoBadDisplayValues(value) {
  return !/NaN|Infinity|undefined/.test(JSON.stringify(value));
}

function runCase(test) {
  try {
    const { actual, failures } = test.check();
    const cleanFailures = failures.filter(Boolean);

    return {
      group: test.group,
      scenarioName: test.name,
      actualResult: actual,
      pass: cleanFailures.length === 0,
      failures: cleanFailures,
    };
  } catch (error) {
    return {
      group: test.group,
      scenarioName: test.name,
      actualResult: null,
      pass: false,
      failures: [{ message: error.message, actual: error.stack }],
    };
  }
}

addTest("scenario defaults", "creates an empty purchase scenario", () => {
  const actual = createEmptyScenario();

  return {
    actual,
    failures: [
      assert(actual.loanPurpose === "purchase", "Expected purchase default", actual.loanPurpose),
      assert(actual.loanType === "Conventional", "Expected conventional default", actual.loanType),
      assert(actual.purchasePrice === "", "Expected empty purchase price", actual.purchasePrice),
      assert(hasNoBadDisplayValues(actual), "Scenario should not contain bad display values", actual),
    ],
  };
});

addTest("purchase parsing", "extracts purchase fields from borrower text", () => {
  const actual = processSallyMessage(
    "I want to buy a home for $425,000 with 5% down, a 720 credit score, conventional, primary, 92660.",
    createEmptyScenario(),
  );

  return {
    actual,
    failures: [
      assert(actual.scenario.loanPurpose === "purchase", "Expected purchase purpose", actual.scenario.loanPurpose),
      assert(actual.scenario.purchasePrice === "425000", "Expected purchase price capture", actual.scenario.purchasePrice),
      assert(actual.scenario.downPayment === "21250", "Expected down payment from percent", actual.scenario.downPayment),
      assert(actual.scenario.loanAmount === "403750", "Expected derived loan amount", actual.scenario.loanAmount),
      assert(actual.scenario.creditScore === "720", "Expected credit score capture", actual.scenario.creditScore),
      assert(actual.scenario.occupancy === "primary", "Expected occupancy capture", actual.scenario.occupancy),
      assert(actual.scenario.zipCode === "92660", "Expected ZIP capture", actual.scenario.zipCode),
      assert(hasNoBadDisplayValues(actual), "Purchase result should not contain bad display values", actual),
    ],
  };
});

addTest("refinance parsing", "extracts current refinance scenario fields", () => {
  const actual = processSallyMessage(
    "I want to refinance my primary home. Loan amount is $400,000, credit score 740, conventional, 30301.",
    createEmptyScenario(),
  );

  return {
    actual,
    failures: [
      assert(actual.scenario.loanPurpose === "refinance", "Expected refinance purpose", actual.scenario.loanPurpose),
      assert(actual.scenario.loanAmount === "400000", "Expected loan amount capture", actual.scenario.loanAmount),
      assert(actual.scenario.creditScore === "740", "Expected credit score capture", actual.scenario.creditScore),
      assert(actual.scenario.occupancy === "primary", "Expected occupancy capture", actual.scenario.occupancy),
      assert(actual.scenario.zipCode === "30301", "Expected ZIP capture", actual.scenario.zipCode),
      assert(/estimated value/i.test(actual.message), "Expected current-main value follow-up", actual.message),
      assert(hasNoBadDisplayValues(actual), "Refinance result should not contain bad display values", actual),
    ],
  };
});

addTest("cash-out parsing", "detects cash-out purpose and safe follow-up", () => {
  const actual = processSallyMessage("cash out refinance on my investment property", createEmptyScenario());

  return {
    actual,
    failures: [
      assert(actual.scenario.loanPurpose === "cash_out", "Expected cash-out purpose", actual.scenario.loanPurpose),
      assert(actual.scenario.occupancy === "investment", "Expected investment occupancy", actual.scenario.occupancy),
      assert(/estimated value/i.test(actual.message), "Expected next value question", actual.message),
      assert(hasNoBadDisplayValues(actual), "Cash-out result should not contain bad display values", actual),
    ],
  };
});

addTest("reset", "resets scenario without preserving borrower data", () => {
  const actual = processSallyMessage("start over", {
    ...createEmptyScenario(),
    purchasePrice: "500000",
    creditScore: "720",
  });

  return {
    actual,
    failures: [
      assert(actual.scenario.purchasePrice === "", "Expected purchase price reset", actual.scenario.purchasePrice),
      assert(actual.scenario.creditScore === "", "Expected credit score reset", actual.scenario.creditScore),
      assert(/starting fresh/i.test(actual.message), "Expected reset message", actual.message),
    ],
  };
});

addTest("network isolation", "does not require live service configuration during local QA", () => {
  const actual = {
    pricingApiConfigured: Boolean(process.env.VITE_PRICING_ENGINE_API_URL),
    sallyApiConfigured: Boolean(process.env.VITE_SALLY_API_URL),
    voiceApiConfigured: Boolean(process.env.VITE_SALLY_VOICE_API_URL),
  };

  return {
    actual,
    failures: [
      assert(actual.pricingApiConfigured === false, "Expected pricing API to be disabled in QA", actual.pricingApiConfigured),
      assert(actual.sallyApiConfigured === false, "Expected Sally API to be disabled in QA", actual.sallyApiConfigured),
      assert(actual.voiceApiConfigured === false, "Expected voice API to be disabled in QA", actual.voiceApiConfigured),
    ],
  };
});

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
