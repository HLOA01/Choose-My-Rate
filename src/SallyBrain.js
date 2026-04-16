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
  if (/\bbuy|purchase|buying\b/.test(text)) return "purchase";
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
  const match = text.match(/\b([5-8]\d{2})\b/);
  if (!match) return "";
  const score = Number(match[1]);
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

  const regex =
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/gi;

  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const raw = Number(match[1]);
    const suffix = normalizeText(match[2]);

    if (!Number.isFinite(raw)) continue;

    let amount = raw;

    if (suffix === "k") amount = raw * 1000;
    if (suffix === "m" || suffix === "million") amount = raw * 1000000;
    if (suffix === "thousand") amount = raw * 1000;

    if (!suffix && raw < 1000 && !text.includes("$")) continue;

    results.push(Math.round(amount));
  }

  return results;
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
