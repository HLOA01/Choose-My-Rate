const DEFAULT_SCENARIO = {
  loanPurpose: "purchase",
  purchasePrice: "",
  downPayment: "",
  downPaymentPercent: "",
  loanAmount: "",
  creditScore: "",
  loanType: "Conventional",
  occupancy: "",
  zipCode: "",
};

const FUNNEL_DEFAULT_SCENARIO = {
  borrowerPath: "purchase",
  homePrice: "",
  downPayment: "",
  downPaymentAmount: "",
  downPaymentPercent: "",
  downPaymentInputMode: "dollars",
  propertyValue: "",
  currentMortgageBalance: "",
  refinanceGoal: "lower_payment",
  currentInterestRate: "",
  requestedCashOut: "",
  propertyType: "",
  firstTimeHomebuyer: "unknown",
  occupancy: "",
  creditScore: "",
  creditRange: "",
  zipCode: "",
  annualIncome: "",
};

const CREDIT_RANGES = [
  { label: "760+", min: 760, max: 850 },
  { label: "740-759", min: 740, max: 759 },
  { label: "720-739", min: 720, max: 739 },
  { label: "700-719", min: 700, max: 719 },
  { label: "680-699", min: 680, max: 699 },
  { label: "660-679", min: 660, max: 679 },
  { label: "640-659", min: 640, max: 659 },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function createScenarioCopy(currentScenario = DEFAULT_SCENARIO) {
  return { ...DEFAULT_SCENARIO, ...currentScenario };
}

function inferLoanPurpose(text) {
  if (/\bcash[\s-]?out\b/.test(text)) return "cash_out";
  if (/\brefi|refinance\b/.test(text)) return "refinance";
  if (/\bbuy|purchase|buying|shopping\b/.test(text)) return "purchase";
  return "";
}

function inferOccupancy(text) {
  if (/\binvestment|rental|investor\b/.test(text)) return "investment";
  if (/\bsecond home|vacation\b/.test(text)) return "second_home";
  if (/\bprimary|live in|owner occupied|my home\b/.test(text)) return "primary";
  return "";
}

function inferLoanType(text) {
  if (/\bfha\b/.test(text)) return "FHA";
  if (/\bva\b|v\.a\./.test(text)) return "VA";
  if (/\busda\b|\brural\b/.test(text)) return "USDA";
  if (/\bjumbo\b|\bhigh[\s-]?balance\b/.test(text)) return "Jumbo";
  if (/\bdscr\b|\bdebt service\b|\brental cash flow\b|\binvestor cash flow\b/.test(text)) return "DSCR";
  if (/\bconventional\b|\bconv\b|\bfnma\b|\bfannie\b|\bfhlmc\b|\bfreddie\b/.test(text)) return "Conventional";
  return "";
}

function extractCreditScore(text) {
  const matches = [
    ...text.matchAll(/\b(?:credit|score|fico)\b(?:\W+\w+){0,4}?\W+([5-8]\d{2})\b/gi),
    ...text.matchAll(/\b([5-8]\d{2})\b(?:\W+\w+){0,4}?\W+\b(?:credit|score|fico)\b/gi),
  ];
  if (!matches.length) return "";
  const score = Number(matches[0][1]);
  if (score >= 500 && score <= 850) return String(score);
  return "";
}

function extractZipCode(text) {
  const match = text.match(/\b(\d{5})\b/);
  return match ? match[1] : "";
}

function detectReset(text) {
  return /\b(start over|reset|new scenario|restart)\b/.test(text);
}

function detectAffordabilityUnknown(text) {
  return /\bnot sure|don'?t know|i don't know|whatever i qualify|what can i afford\b/.test(
    text
  );
}

function extractMoneyValues(text) {
  const normalized = text.replace(/,/g, "");
  const results = [];

  const regex = /(\$)?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/gi;

  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const hasDollar = Boolean(match[1]);
    const raw = Number(match[2]);
    const suffix = normalizeText(match[3]);

    if (!Number.isFinite(raw)) continue;
    if (!hasDollar && !suffix) continue;

    let amount = raw;

    if (suffix === "k") amount = raw * 1000;
    if (suffix === "m" || suffix === "million") amount = raw * 1000000;
    if (suffix === "thousand") amount = raw * 1000;

    results.push(Math.round(amount));
  }

  return results;
}

function firstMoneyNear(text, pattern) {
  const normalized = text.replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\$)?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/gi)];

  for (const match of matches) {
    const hasDollar = Boolean(match[1]);
    const suffix = normalizeText(match[3]);
    if (!hasDollar && !suffix) continue;

    const start = Math.max(0, match.index - 42);
    const end = Math.min(normalized.length, match.index + match[0].length + 42);
    const context = normalized.slice(start, end).toLowerCase();
    if (!pattern.test(context)) continue;

    const raw = Number(match[2]);
    if (!Number.isFinite(raw)) continue;

    let amount = raw;
    if (suffix === "k") amount = raw * 1000;
    if (suffix === "m" || suffix === "million") amount = raw * 1000000;
    if (suffix === "thousand") amount = raw * 1000;
    return String(Math.round(amount));
  }

  return "";
}

function extractPercentDown(text) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:down|down payment)?\b/i);
  if (!match) return "";
  const percent = Number(match[1]);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return "";
  return String(percent);
}

function inferPropertyType(text) {
  if (/\bsingle[\s-]?family|sfh|detached\b/.test(text)) return "single_family";
  if (/\bcondo|minium\b/.test(text)) return "condo";
  if (/\btown[\s-]?home|townhouse\b/.test(text)) return "townhome";
  if (/\b2[\s-]?4|duplex|triplex|fourplex|multi[\s-]?unit\b/.test(text)) return "multi_unit";
  return "";
}

function inferFirstTimeHomebuyer(text) {
  if (/\b(first[\s-]?time|1st[\s-]?time)\s+home\s*buyer\b/.test(text)) return "yes";
  if (/\bnot\s+(?:a\s+)?first[\s-]?time\s+home\s*buyer\b/.test(text)) return "no";
  if (/\bunsure|not sure\b/.test(text) && /\bfirst[\s-]?time\b/.test(text)) return "not_sure";
  return "";
}

function extractIncome(text) {
  const monthlyIncome = firstMoneyNear(text, /\b(make|earn|income|salary|gross|household)\b.*\b(month|monthly|per month)\b|\b(month|monthly|per month)\b.*\b(make|earn|income|salary|gross|household)\b/);
  if (monthlyIncome) return String(Math.round(toNumber(monthlyIncome) * 12));

  const annualIncome = firstMoneyNear(text, /\b(make|earn|income|salary|gross|household)\b.*\b(year|annual|annually|per year)\b|\b(year|annual|annually|per year)\b.*\b(make|earn|income|salary|gross|household)\b/);
  if (annualIncome) return annualIncome;

  return "";
}

function extractCurrentRate(text) {
  const match = text.match(/\b(?:current\s+)?(?:rate|interest)\D{0,18}(\d+(?:\.\d+)?)\s*%?\b/i);
  if (!match) return "";
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 25) return "";
  return String(rate);
}

export function mapCreditScoreToRange(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "";
  const range = CREDIT_RANGES.find((item) => numeric >= item.min && numeric <= item.max);
  return range?.label || "";
}

function normalizeDownPaymentFields(scenario) {
  const next = { ...scenario };
  const homePrice = toNumber(next.homePrice);
  const amount = toNumber(next.downPaymentAmount || next.downPayment);
  const percent = toNumber(next.downPaymentPercent);

  if (homePrice > 0 && percent > 0 && next.downPaymentInputMode === "percent") {
    next.downPaymentAmount = String(Math.round((homePrice * percent) / 100));
    next.downPayment = next.downPaymentAmount;
  } else if (homePrice > 0 && amount > 0) {
    next.downPaymentAmount = String(Math.round(amount));
    next.downPayment = next.downPaymentAmount;
    next.downPaymentPercent = String(Math.round((amount / homePrice) * 1000) / 10);
  } else if (amount > 0) {
    next.downPaymentAmount = String(Math.round(amount));
    next.downPayment = next.downPaymentAmount;
  }

  return next;
}

function createFunnelScenarioCopy(currentScenario = FUNNEL_DEFAULT_SCENARIO) {
  return normalizeDownPaymentFields({ ...FUNNEL_DEFAULT_SCENARIO, ...currentScenario });
}

function fillFunnelScenarioFromMessage(currentScenario, message) {
  const previousScenario = createFunnelScenarioCopy(currentScenario);
  let scenario = { ...previousScenario };
  const text = normalizeText(message);
  const moneyValues = extractMoneyValues(message);

  const purpose = inferLoanPurpose(text);
  if (purpose === "purchase") scenario.borrowerPath = "purchase";
  if (purpose === "refinance" || purpose === "cash_out") {
    scenario.borrowerPath = "refinance";
    scenario.refinanceGoal = purpose === "cash_out" ? "cash_out" : scenario.refinanceGoal || "lower_payment";
  }

  const occupancy = inferOccupancy(text);
  if (occupancy) scenario.occupancy = occupancy;

  const propertyType = inferPropertyType(text);
  if (propertyType) scenario.propertyType = propertyType;

  const firstTimeHomebuyer = inferFirstTimeHomebuyer(text);
  if (firstTimeHomebuyer) scenario.firstTimeHomebuyer = firstTimeHomebuyer;

  const creditScore = extractCreditScore(text);
  if (creditScore) {
    scenario.creditScore = creditScore;
    scenario.creditRange = mapCreditScoreToRange(creditScore) || scenario.creditRange;
  }

  const zipCode = extractZipCode(text);
  if (zipCode) scenario.zipCode = zipCode;

  const income = extractIncome(text);
  if (income) scenario.annualIncome = income;

  const percentDown = extractPercentDown(text);
  if (percentDown) {
    scenario.downPaymentPercent = percentDown;
    scenario.downPaymentInputMode = "percent";
  }

  const downPaymentAmount = firstMoneyNear(text, /\bdown\s+payment|put\s+down|putting\b/);
  if (downPaymentAmount) {
    scenario.downPaymentAmount = downPaymentAmount;
    scenario.downPayment = downPaymentAmount;
    scenario.downPaymentInputMode = "dollars";
  }

  const purchasePrice = firstMoneyNear(text, /\bbuy|purchase|home|house|property|price\b/);
  if (scenario.borrowerPath === "purchase" && purchasePrice) {
    scenario.homePrice = purchasePrice;
  } else if (scenario.borrowerPath === "purchase" && !scenario.homePrice && moneyValues[0] && !downPaymentAmount) {
    scenario.homePrice = String(moneyValues[0]);
  }

  const propertyValue = firstMoneyNear(text, /\bworth|value|valued|appraise|property\b/);
  if (scenario.borrowerPath === "refinance" && propertyValue) scenario.propertyValue = propertyValue;

  const balance = firstMoneyNear(text, /\bowe|balance|mortgage\b/);
  if (scenario.borrowerPath === "refinance" && balance) scenario.currentMortgageBalance = balance;

  const cashOut = firstMoneyNear(text, /\bcash[\s-]?out|take\s+out\b/);
  if (scenario.borrowerPath === "refinance" && cashOut && scenario.refinanceGoal === "cash_out") {
    scenario.requestedCashOut = cashOut;
  }

  const currentInterestRate = extractCurrentRate(text);
  if (scenario.borrowerPath === "refinance" && currentInterestRate) {
    scenario.currentInterestRate = currentInterestRate;
  }

  scenario = normalizeDownPaymentFields(scenario);

  const updates = {};
  for (const [key, value] of Object.entries(scenario)) {
    if (String(value ?? "") !== String(previousScenario[key] ?? "")) {
      updates[key] = value;
    }
  }

  return { scenario, updates, intentDetected: Boolean(purpose) };
}

function nextQuestionForFunnelScenario(scenario) {
  if (scenario.borrowerPath === "purchase") {
    if (!scenario.zipCode) return "What ZIP code is the home in?";
    if (!scenario.homePrice) return "What purchase price should we use?";
    if (!scenario.downPaymentAmount && !scenario.downPaymentPercent) return "How much do you plan to put down?";
    if (!scenario.propertyType) return "Is it a single-family home, condo, townhome, or 2-4 unit property?";
  } else {
    if (!scenario.zipCode) return "What ZIP code is the property in?";
    if (!scenario.propertyValue) return "What is the estimated property value?";
    if (!scenario.currentMortgageBalance) return "What is the current mortgage balance?";
    if (!scenario.currentInterestRate) return "What is your current interest rate?";
    if (scenario.refinanceGoal === "cash_out" && !scenario.requestedCashOut) {
      return "How much cash out would you like to request?";
    }
  }

  if (!scenario.creditScore && !scenario.creditRange) return "About where is your credit score right now?";
  if (!scenario.occupancy) return "Will this be your primary home, second home, or an investment property?";
  if (!scenario.annualIncome) return "What is your estimated gross annual household income?";
  return "Great. I updated your scenario. You can review your details and request live rates when you are ready.";
}

function buildFunnelReply(previousScenario, updatedScenario) {
  const changes = [];
  if (updatedScenario.borrowerPath !== previousScenario.borrowerPath) {
    changes.push(`I set this up as a ${updatedScenario.borrowerPath} scenario`);
  }
  if (updatedScenario.homePrice !== previousScenario.homePrice && updatedScenario.homePrice) {
    changes.push("I added the home price");
  }
  if (updatedScenario.downPaymentAmount !== previousScenario.downPaymentAmount && updatedScenario.downPaymentAmount) {
    changes.push("I added the down payment");
  }
  if (updatedScenario.propertyType !== previousScenario.propertyType && updatedScenario.propertyType) {
    changes.push("I marked the property type");
  }
  if (updatedScenario.occupancy !== previousScenario.occupancy && updatedScenario.occupancy) {
    changes.push("I marked the occupancy");
  }
  if (updatedScenario.creditScore !== previousScenario.creditScore && updatedScenario.creditScore) {
    changes.push("I added your credit score");
  }
  if (updatedScenario.firstTimeHomebuyer !== previousScenario.firstTimeHomebuyer && updatedScenario.firstTimeHomebuyer !== "unknown") {
    changes.push("I saved your first-time homebuyer answer");
  }
  if (updatedScenario.zipCode !== previousScenario.zipCode && updatedScenario.zipCode) {
    changes.push("I added the ZIP code");
  }
  if (updatedScenario.annualIncome !== previousScenario.annualIncome && updatedScenario.annualIncome) {
    changes.push("I added your income");
  }

  const prefix = changes.length ? `${changes.join(". ")}.` : "Got it.";
  return `${prefix} ${nextQuestionForFunnelScenario(updatedScenario)}`.trim();
}

export function createEmptyFunnelScenario() {
  return { ...FUNNEL_DEFAULT_SCENARIO };
}

export function processBorrowerMessageForFunnel(message, currentScenario = FUNNEL_DEFAULT_SCENARIO) {
  const text = normalizeText(message);

  if (detectReset(text)) {
    const scenario = createEmptyFunnelScenario();
    return {
      message: "Absolutely. We're starting fresh. Are you looking to purchase or refinance?",
      scenario,
      updates: scenario,
      nextQuestion: "Are you looking to purchase or refinance?",
    };
  }

  if (detectAffordabilityUnknown(text)) {
    const scenario = createFunnelScenarioCopy(currentScenario);
    return {
      message: "That's okay. We can build this step by step. Are you purchasing or refinancing?",
      scenario,
      updates: {},
      nextQuestion: nextQuestionForFunnelScenario(scenario),
    };
  }

  const previousScenario = createFunnelScenarioCopy(currentScenario);
  const { scenario, updates, intentDetected } = fillFunnelScenarioFromMessage(currentScenario, message);
  const nextQuestion = nextQuestionForFunnelScenario(scenario);

  return {
    message: buildFunnelReply(previousScenario, scenario),
    scenario,
    updates,
    nextQuestion,
    intentDetected,
  };
}

function applyDerivedValues(scenario) {
  const purchasePrice = toNumber(scenario.purchasePrice);
  const downPayment = toNumber(scenario.downPayment);
  const loanAmount = toNumber(scenario.loanAmount);

  if (purchasePrice > 0 && downPayment > 0 && !loanAmount) {
    scenario.loanAmount = String(Math.max(purchasePrice - downPayment, 0));
  }

  if (purchasePrice > 0 && loanAmount > 0 && !downPayment) {
    scenario.downPayment = String(Math.max(purchasePrice - loanAmount, 0));
  }

  const freshPurchasePrice = toNumber(scenario.purchasePrice);
  const freshDownPayment = toNumber(scenario.downPayment);

  if (freshPurchasePrice > 0 && freshDownPayment > 0) {
    scenario.downPaymentPercent = (
      (freshDownPayment / freshPurchasePrice) *
      100
    ).toFixed(3);
  }

  return scenario;
}

function fillScenarioFromMessage(currentScenario, message) {
  const scenario = createScenarioCopy(currentScenario);
  const text = normalizeText(message);
  const moneyValues = extractMoneyValues(message);

  const purpose = inferLoanPurpose(text);
  if (purpose) scenario.loanPurpose = purpose;

  const occupancy = inferOccupancy(text);
  if (occupancy) scenario.occupancy = occupancy;

  const loanType = inferLoanType(text);
  if (loanType) scenario.loanType = loanType;

  const creditScore = extractCreditScore(text);
  if (creditScore) scenario.creditScore = creditScore;

  const zipCode = extractZipCode(text);
  if (zipCode) scenario.zipCode = zipCode;

  if (/\bdown payment\b/.test(text) && moneyValues[0]) {
    scenario.downPayment = String(moneyValues[0]);
  }

  if (/\bloan amount\b/.test(text) && moneyValues[0]) {
    scenario.loanAmount = String(moneyValues[0]);
  }

  if (
    /\bpurchase price\b/.test(text) ||
    /\bhouse for\b/.test(text) ||
    /\bbuy.*for\b/.test(text) ||
    /\bprice\b/.test(text)
  ) {
    if (moneyValues[0]) {
      scenario.purchasePrice = String(moneyValues[0]);
    }
  } else if (
    scenario.loanPurpose === "purchase" &&
    !scenario.purchasePrice &&
    moneyValues[0]
  ) {
    scenario.purchasePrice = String(moneyValues[0]);
  }

  if (
    /\b(\d+(?:\.\d+)?)\s*%\s*(down|down payment)?\b/.test(text) &&
    toNumber(scenario.purchasePrice) > 0
  ) {
    const percentMatch = text.match(/\b(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      const percent = Number(percentMatch[1]);
      scenario.downPaymentPercent = percent.toFixed(3);
      scenario.downPayment = String(
        Math.round((toNumber(scenario.purchasePrice) * percent) / 100)
      );
      scenario.loanAmount = String(
        Math.max(toNumber(scenario.purchasePrice) - toNumber(scenario.downPayment), 0)
      );
    }
  }

  return applyDerivedValues(scenario);
}

function nextQuestionForScenario(scenario) {
  if (!scenario.loanPurpose) {
    return "Are you looking to buy a home, refinance, or take cash out?";
  }

  if (scenario.loanPurpose === "purchase") {
    if (!scenario.occupancy) {
      return "Will this be your primary home, second home, or an investment property?";
    }

    if (!scenario.purchasePrice) {
      return "What price range are you looking at?";
    }

    if (!scenario.downPayment && !scenario.loanAmount) {
      return "How much are you planning to put down?";
    }

    if (!scenario.creditScore) {
      return "About where is your credit score right now?";
    }

    if (!scenario.loanType) {
      return "Do you want to look at Conventional, FHA, VA, USDA, Jumbo, or DSCR financing?";
    }

    if (!scenario.zipCode) {
      return "What ZIP code are you shopping in?";
    }

    return "Great. I updated your scenario. You can keep adjusting the numbers or tell me what you want to change next.";
  }

  if (scenario.loanPurpose === "refinance" || scenario.loanPurpose === "cash_out") {
    if (!scenario.occupancy) {
      return "Is this property your primary home, second home, or investment property?";
    }

    if (!scenario.purchasePrice) {
      return "What is the estimated value of the property?";
    }

    if (!scenario.loanAmount) {
      return "About how much do you currently owe on the property?";
    }

    if (!scenario.creditScore) {
      return "About where is your credit score right now?";
    }

    if (!scenario.loanType) {
      return "Do you want to explore Conventional, FHA, VA, USDA, Jumbo, or DSCR options?";
    }

    if (!scenario.zipCode) {
      return "What ZIP code is the property in?";
    }

    return "Perfect. I updated your refinance scenario. Tell me what you want to adjust next.";
  }

  return "Tell me a little more about the scenario you want to build.";
}

function buildReplyPrefix(previousScenario, updatedScenario) {
  const changes = [];

  if (updatedScenario.loanPurpose !== previousScenario.loanPurpose && updatedScenario.loanPurpose) {
    const purposeMap = {
      purchase: "purchase",
      refinance: "refinance",
      cash_out: "cash-out",
    };
    changes.push(`I set this up as a ${purposeMap[updatedScenario.loanPurpose]} scenario`);
  }

  if (updatedScenario.occupancy !== previousScenario.occupancy && updatedScenario.occupancy) {
    const occupancyMap = {
      primary: "primary home",
      second_home: "second home",
      investment: "investment property",
    };
    changes.push(`I marked the occupancy as ${occupancyMap[updatedScenario.occupancy]}`);
  }

  if (updatedScenario.purchasePrice !== previousScenario.purchasePrice && updatedScenario.purchasePrice) {
    changes.push(`I added the purchase price`);
  }

  if (updatedScenario.downPayment !== previousScenario.downPayment && updatedScenario.downPayment) {
    changes.push(`I added your down payment`);
  }

  if (updatedScenario.loanAmount !== previousScenario.loanAmount && updatedScenario.loanAmount) {
    changes.push(`I added the loan amount`);
  }

  if (updatedScenario.creditScore !== previousScenario.creditScore && updatedScenario.creditScore) {
    changes.push(`I added your credit score`);
  }

  if (updatedScenario.loanType !== previousScenario.loanType && updatedScenario.loanType) {
    changes.push(`I updated the loan type`);
  }

  if (updatedScenario.zipCode !== previousScenario.zipCode && updatedScenario.zipCode) {
    changes.push(`I added the ZIP code`);
  }

  if (!changes.length) return "Got it.";
  return `${changes.join(". ")}.`;
}

export function createEmptyScenario() {
  return { ...DEFAULT_SCENARIO };
}

export function processSallyMessage(message, currentScenario = DEFAULT_SCENARIO) {
  const text = normalizeText(message);

  if (detectReset(text)) {
    return {
      message: "Absolutely. We’re starting fresh. Are you looking to buy a home, refinance, or take cash out?",
      scenario: createEmptyScenario(),
    };
  }

  if (detectAffordabilityUnknown(text)) {
    const scenario = createScenarioCopy(currentScenario);
    return {
      message:
        "That’s okay. We can still build it step by step. Let’s start with whether this is a purchase, refinance, or cash-out scenario.",
      scenario,
    };
  }

  const previousScenario = createScenarioCopy(currentScenario);
  const updatedScenario = fillScenarioFromMessage(currentScenario, message);
  const prefix = buildReplyPrefix(previousScenario, updatedScenario);
  const nextQuestion = nextQuestionForScenario(updatedScenario);

  return {
    message: `${prefix} ${nextQuestion}`.trim(),
    scenario: updatedScenario,
  };
}
