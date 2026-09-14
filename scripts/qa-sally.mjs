import {
  createEmptyScenario,
  createEmptyFunnelScenario,
  mapCreditScoreToRange,
  processBorrowerMessageForFunnel,
  processSallyMessage,
} from "../src/SallyBrain.js";

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
const funnelTests = [
  {
    name: "extracts individual purchase price",
    user: "I want to buy a $500,000 house.",
    expectScenario: { borrowerPath: "purchase", homePrice: "500000" },
  },
  {
    name: "extracts percent down after purchase price",
    initialScenario: { ...createEmptyFunnelScenario(), homePrice: "500000" },
    user: "I'm putting 5 percent down.",
    expectScenario: { downPaymentPercent: "5", downPaymentAmount: "25000", downPayment: "25000" },
  },
  {
    name: "extracts dollar down payment and derives percent",
    initialScenario: { ...createEmptyFunnelScenario(), homePrice: "500000" },
    user: "I have $25,000 for the down payment.",
    expectScenario: { downPaymentAmount: "25000", downPaymentPercent: "5" },
  },
  {
    name: "extracts primary occupancy",
    user: "It's going to be my primary residence.",
    expectScenario: { occupancy: "primary" },
  },
  {
    name: "extracts single-family property type",
    user: "It's a single family home.",
    expectScenario: { propertyType: "single_family" },
  },
  {
    name: "extracts credit score and pricing bucket",
    user: "My credit score is around 740.",
    expectScenario: { creditScore: "740", creditRange: "740-759" },
  },
  {
    name: "extracts first-time homebuyer",
    user: "I'm a first-time homebuyer.",
    expectScenario: { firstTimeHomebuyer: "yes" },
  },
  {
    name: "keeps first-time homebuyer unknown until answered",
    user: "I want to buy a $500,000 house.",
    expectScenario: { firstTimeHomebuyer: "unknown" },
  },
  {
    name: "extracts ZIP code",
    user: "The property is in ZIP code 30004.",
    expectScenario: { zipCode: "30004" },
  },
  {
    name: "extracts monthly income as annual income",
    user: "I make about $9,000 a month.",
    expectScenario: { annualIncome: "108000" },
  },
  {
    name: "combined statement extracts every supported purchase field",
    user:
      "I want to buy a $500,000 single family house in 30004. It's going to be my primary residence. My credit is around 740 and I'm putting 5 percent down. I'm a first-time homebuyer. I make about $9,000 a month.",
    expectScenario: {
      borrowerPath: "purchase",
      homePrice: "500000",
      propertyType: "single_family",
      zipCode: "30004",
      occupancy: "primary",
      creditScore: "740",
      creditRange: "740-759",
      downPaymentPercent: "5",
      downPaymentAmount: "25000",
      firstTimeHomebuyer: "yes",
      annualIncome: "108000",
    },
    rejectMessageIncludes: "What ZIP code",
  },
];

function runFunnelTest(test) {
  const scenario = test.initialScenario || createEmptyFunnelScenario();
  const result = processBorrowerMessageForFunnel(test.user, scenario);
  const failures = [];

  if (test.expectScenario) {
    for (const [field, expectedValue] of Object.entries(test.expectScenario)) {
      failures.push(assert(String(result.scenario[field] ?? "") === String(expectedValue), `Expected funnel field: ${field}`, result.scenario[field]));
    }
  }

  if (test.rejectMessageIncludes) {
    failures.push(assert(!messageIncludes(result.message, test.rejectMessageIncludes), "Sally should not ask for an answered field", result.message));
  }

  return {
    category: "active funnel extraction",
    scenarioName: test.name,
    inputs: [test.user],
    actualResult: result,
    pass: failures.filter(Boolean).length === 0,
    failures: failures.filter(Boolean),
  };
}

const funnelResults = funnelTests.map(runFunnelTest);
const allResults = results.concat(funnelResults);
const passed = allResults.filter((result) => result.pass).length;
const failed = allResults.length - passed;
const groups = [...new Set(results.map((result) => result.category))].map((category) => {
  const groupResults = allResults.filter((result) => result.category === category);
  const groupPassed = groupResults.filter((result) => result.pass).length;
  return {
    category,
    passed: groupPassed,
    failed: groupResults.length - groupPassed,
    total: groupResults.length,
  };
});
groups.push({
  category: "active funnel extraction",
  passed: funnelResults.filter((result) => result.pass).length,
  failed: funnelResults.filter((result) => !result.pass).length,
  total: funnelResults.length,
});

console.log("Choose My Rate Sally Conversation QA");
console.log(`Credit score 740 maps to ${mapCreditScoreToRange(740)}.`);
console.log(`Total: ${passed}/${allResults.length} passed`);
for (const group of groups) {
  console.log(`- ${group.category}: ${group.passed}/${group.total} passed`);
}

if (failed > 0) {
  console.log("\nFailures:");
  for (const result of allResults.filter((item) => !item.pass)) {
    console.log(JSON.stringify(result, null, 2));
  }
}

process.exitCode = failed > 0 ? 1 : 0;
