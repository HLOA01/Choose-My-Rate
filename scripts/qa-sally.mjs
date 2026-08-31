import { createEmptyScenario, processSallyMessage } from "../src/SallyBrain.js";

const tests = [];
const LENDER_NAME_PATTERN = /\b(PRMG|rocket|loanDepot|guaranteed rate|uwm|pennyMac|caliber|crosscountry)\b/i;
const POSITIVE_LOCK_PATTERN = /\b(rate|pricing)\s+(?:is|was|has been|looks)\s+locked\b|\blocked in\b/i;
const APPROVAL_PATTERN = /\b(?:you are|you're|loan is|refinance is|scenario is)\s+approved\b|\bapproved for\b/i;
const GUARANTEE_PATTERN = /\bguaranteed\b|\bguarantee\b/i;

function addTest(category, name, turns, options = {}) {
  tests.push({ category, name, turns, options });
}

function assert(condition, message, actual) {
  return condition ? null : { message, actual };
}

function assertSafeMessage(message) {
  return [
    assert(!APPROVAL_PATTERN.test(message), "Sally should not make approval statements", message),
    assert(!POSITIVE_LOCK_PATTERN.test(message), "Sally should not say the rate is locked", message),
    assert(!GUARANTEE_PATTERN.test(message), "Sally should not make guarantee statements", message),
    assert(!LENDER_NAME_PATTERN.test(message), "Sally should not expose lender names", message),
    assert(!/NaN|Infinity|undefined/.test(message), "Sally message should not contain bad display values", message),
  ];
}

function messageIncludes(message, expected) {
  const source = String(message || "").toLowerCase();
  return [].concat(expected).every((item) => source.includes(String(item).toLowerCase()));
}

function runConversationTest(test) {
  let scenario = test.options.initialScenario || createEmptyScenario();
  const transcript = [];
  const failures = [];

  for (const [index, turn] of test.turns.entries()) {
    const result = processSallyMessage(turn.user, scenario);
    scenario = result.scenario;

    transcript.push({
      turn: index + 1,
      user: turn.user,
      message: result.message,
      scenario,
    });

    failures.push(...assertSafeMessage(result.message));

    if (turn.expectMessageIncludes) {
      failures.push(assert(messageIncludes(result.message, turn.expectMessageIncludes), "Expected Sally message", result.message));
    }

    if (turn.expectScenario) {
      for (const [field, expectedValue] of Object.entries(turn.expectScenario)) {
        failures.push(assert(String(scenario[field] ?? "") === String(expectedValue), `Expected scenario field: ${field}`, scenario[field]));
      }
    }
  }

  return {
    category: test.category,
    scenarioName: test.name,
    inputs: test.turns.map((turn) => turn.user),
    actualResult: transcript,
    pass: failures.filter(Boolean).length === 0,
    failures: failures.filter(Boolean),
  };
}

addTest("purchase conversation", "collects purchase basics and asks for missing ZIP", [
  {
    user: "I want to buy a home for $425,000 with 5% down and my score is 720.",
    expectScenario: {
      loanPurpose: "purchase",
      purchasePrice: "425000",
      downPayment: "21250",
      loanAmount: "403750",
      creditScore: "720",
    },
    expectMessageIncludes: "primary home",
  },
]);

addTest("purchase conversation", "updates occupancy and loan type safely", [
  {
    user: "This is an investment property and I want DSCR.",
    expectScenario: {
      occupancy: "investment",
      loanType: "DSCR",
    },
    expectMessageIncludes: "price range",
  },
]);

addTest("refinance conversation", "starts refinance and asks for property value", [
  {
    user: "I want to refinance",
    expectScenario: { loanPurpose: "refinance" },
    expectMessageIncludes: "primary home",
  },
]);

addTest("cash-out conversation", "starts cash-out flow without forbidden wording", [
  {
    user: "I want to take cash out of my house",
    expectScenario: { loanPurpose: "cash_out" },
    expectMessageIncludes: "primary home",
  },
]);

addTest("reset conversation", "clears scenario on start over", [
  {
    user: "start over",
    expectScenario: { purchasePrice: "", loanAmount: "", creditScore: "" },
    expectMessageIncludes: "starting fresh",
  },
], {
  initialScenario: {
    ...createEmptyScenario(),
    purchasePrice: "500000",
    loanAmount: "400000",
    creditScore: "740",
  },
});

const results = tests.map(runConversationTest);
const passed = results.filter((result) => result.pass).length;
const failed = results.length - passed;
const groups = [...new Set(results.map((result) => result.category))].map((category) => {
  const groupResults = results.filter((result) => result.category === category);
  const groupPassed = groupResults.filter((result) => result.pass).length;
  return {
    category,
    passed: groupPassed,
    failed: groupResults.length - groupPassed,
    total: groupResults.length,
  };
});

console.log("Choose My Rate Sally Conversation QA");
console.log(`Total: ${passed}/${results.length} passed`);
for (const group of groups) {
  console.log(`- ${group.category}: ${group.passed}/${group.total} passed`);
}

if (failed > 0) {
  console.log("\nFailures:");
  for (const result of results.filter((item) => !item.pass)) {
    console.log(JSON.stringify(result, null, 2));
  }
}

process.exitCode = failed > 0 ? 1 : 0;
