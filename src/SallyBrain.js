import {
  LOAN_PURPOSES,
  getQuestionFlowForPurpose,
  normalizeLoanPurpose,
} from "./loanPurpose/loanPurposeConfig";

const DEFAULT_SCENARIO = {
  loanPurpose: LOAN_PURPOSES.PURCHASE,
  purchasePrice: "",
  downPayment: "",
  downPaymentPercent: "",
  loanAmount: "",
  propertyValue: "",
  estimatedPropertyValue: "",
  currentLoanBalance: "",
  currentInterestRate: "",
  currentLoanTermYears: "",
  currentRemainingTermYears: "",
  currentMonthlyPayment: "",
  requestedCashOut: "",
  desiredCashOut: "",
  newLoanAmount: "",
  newInterestRate: "",
  newLoanTermYears: "",
  estimatedClosingCosts: "",
  estimatedNewLoanAmount: "",
  refinancePurpose: "unknown",
  cashOutPurpose: "",
  debtConsolidationAmount: "",
  debtConsolidationMonthlyPayments: "",
  refinanceGoal: "",
  cashOutGoal: "",
  creditScore: "",
  loanType: "Conventional",
  occupancy: "",
  zipCode: "",
  propertyTaxes: "",
  homeownersInsurance: "",
  hoaDues: "",
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
  if (/\bcash[\s-]?out\b|\btake equity out\b|\bpull equity\b|\bequity out\b/.test(text)) {
    return LOAN_PURPOSES.CASH_OUT_REFINANCE;
  }

  if (
    /\brefi|refinance\b/.test(text) ||
    /\blower (my )?(payment|rate)\b/.test(text) ||
    /\bremove (pmi|mi|mortgage insurance)\b/.test(text)
  ) {
    return LOAN_PURPOSES.RATE_TERM_REFINANCE;
  }

  if (/\bbuy|purchase|buying\b/.test(text)) return LOAN_PURPOSES.PURCHASE;
  return "";
}

function inferOccupancy(text) {
  if (/\binvestment|rental|investor\b/.test(text)) return "investment";
  if (/\bsecond home|vacation\b/.test(text)) return "second_home";
  if (/\bprimary|live in|live there|i will live|owner occupied|my home\b/.test(text)) return "primary";
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

function scaleMoneyValue(rawValue, suffixValue = "") {
  const raw = Number(String(rawValue || "").replace(/,/g, ""));
  const suffix = normalizeText(suffixValue);
  if (!Number.isFinite(raw)) return 0;

  if (suffix === "k") return Math.round(raw * 1000);
  if (suffix === "m" || suffix === "million") return Math.round(raw * 1000000);
  if (suffix === "thousand") return Math.round(raw * 1000);

  return Math.round(raw);
}

function extractContextMoneyValue(text, patterns) {
  const normalizedText = String(text || "").replace(/,/g, "");

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (!match) continue;

    const amount = scaleMoneyValue(match[1], match[2]);
    if (amount > 0) return amount;
  }

  return 0;
}

function extractMonthlyCostValue(text, patterns) {
  const normalizedText = String(text || "").replace(/,/g, "");

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (!match) continue;

    const noCostText = match.some((part) => /\b(no|none|zero)\b/i.test(String(part || "")));
    if (noCostText) return 0;

    const amount = scaleMoneyValue(match[1], match[2]);
    if (amount >= 0) return amount;
  }

  return null;
}

function detectReset(text) {
  return /\b(start over|reset|new scenario|restart)\b/.test(text);
}

function detectAffordabilityUnknown(text) {
  return /\bnot sure|don'?t know|i don't know|whatever i qualify|what can i afford\b/.test(
    text
  );
}

function detectRefinanceGoal(text) {
  const goals = [];

  if (/\blower (my )?payment|payment savings|save monthly\b/.test(text)) goals.push("lower_payment");
  if (/\blower (my )?rate|better rate\b/.test(text)) goals.push("lower_rate");
  if (/\bremove (pmi|mi|mortgage insurance)\b/.test(text)) goals.push("remove_mortgage_insurance");
  if (/\bshorten (the )?term|15 year|20 year|pay (it|loan) off faster\b/.test(text)) goals.push("shorten_term");

  return goals.join(",");
}

function detectRefinancePurpose(text) {
  if (/\bdebt|consolidat|credit card|pay off card|payoff card\b/.test(text)) return "debt_consolidation";
  if (/\bcash[\s-]?out|take cash|take equity|pull equity|equity out\b/.test(text)) return "cash_out";
  if (/\bshorten (the )?term|shorter term|15 year|20 year|pay (it|loan) off faster\b/.test(text)) {
    return "shorten_term";
  }
  if (/\blower (my )?payment|payment savings|save monthly\b/.test(text)) return "lower_payment";
  return "";
}

function detectCashOutGoal(text) {
  if (/\bdebt|consolidat|credit card\b/.test(text)) return "debt_consolidation";
  if (/\bremodel|renovat|home improvement|repair\b/.test(text)) return "home_improvement";
  if (/\binvest|business\b/.test(text)) return "investment";
  if (/\bcash|equity\b/.test(text)) return "access_equity";
  return "";
}

function hasRefinanceDetail(scenario) {
  return Boolean(
    scenario.estimatedPropertyValue ||
      scenario.currentLoanBalance ||
      scenario.currentInterestRate ||
      scenario.currentMonthlyPayment ||
      scenario.refinanceGoal ||
      scenario.desiredCashOut ||
      scenario.cashOutGoal,
  );
}

const PURPOSE_QUESTIONS = {
  [LOAN_PURPOSES.PURCHASE]: {
    purchasePrice: "What is the purchase price or price range?",
    downPayment: "How much are you planning to put down?",
    creditScore: "About where is your credit score right now?",
    occupancy: "Will this be your primary home, second home, or an investment property?",
    zipCode: "What ZIP code or area are you looking to buy in?",
  },
  [LOAN_PURPOSES.RATE_TERM_REFINANCE]: {
    estimatedPropertyValue: "What is the estimated value of the property?",
    currentLoanBalance: "About how much do you currently owe on the property?",
    currentInterestRate: "What is your current interest rate?",
    currentMonthlyPayment: "What is your current monthly mortgage payment?",
    refinanceGoal: "What is your main refinance goal: lower payment, lower rate, remove mortgage insurance, or shorten the term?",
    creditScore: "About where is your credit score right now?",
    occupancy: "Is this property your primary home, second home, or investment property?",
    zipCode: "What ZIP code is the property in?",
  },
  [LOAN_PURPOSES.CASH_OUT_REFINANCE]: {
    estimatedPropertyValue: "What is the estimated value of the property?",
    currentLoanBalance: "About how much do you currently owe on the property?",
    desiredCashOut: "How much cash would you like to take out?",
    currentMonthlyPayment: "What is your current monthly mortgage payment?",
    cashOutGoal: "What is the goal for the cash out?",
    creditScore: "About where is your credit score right now?",
    occupancy: "Is this property your primary home, second home, or investment property?",
    zipCode: "What ZIP code is the property in?",
  },
};

function extractMoneyValues(text) {
  const normalized = text.replace(/,/g, "");
  const results = [];

  const regex =
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/gi;

  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const raw = Number(match[1]);
    const suffix = normalizeText(match[2]);
    const matchedText = String(match[0] || "");

    if (!Number.isFinite(raw)) continue;
    if (!suffix && !matchedText.includes("$") && /^\d{5}$/.test(String(match[1]))) continue;

    const amount = scaleMoneyValue(raw, suffix);

    if (!suffix && raw < 1000 && !matchedText.includes("$")) continue;

    results.push(Math.round(amount));
  }

  return results;
}

function applyDerivedValues(scenario) {
  const loanPurpose = normalizeLoanPurpose(scenario.loanPurpose);
  scenario.loanPurpose = loanPurpose;

  if (loanPurpose === LOAN_PURPOSES.PURCHASE) {
    const purchasePrice = toNumber(scenario.purchasePrice);
    const downPayment = toNumber(scenario.downPayment);
    const downPaymentPercent = toNumber(scenario.downPaymentPercent);
    const loanAmount = toNumber(scenario.loanAmount);

    if (purchasePrice > 0 && downPaymentPercent > 0 && !downPayment) {
      scenario.downPayment = String(Math.round((purchasePrice * downPaymentPercent) / 100));
    }

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
  } else {
    scenario.downPayment = "";
    scenario.downPaymentPercent = "";

    const currentLoanBalance = toNumber(scenario.currentLoanBalance);
    const desiredCashOut = toNumber(scenario.desiredCashOut);

    if (loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE && currentLoanBalance > 0) {
      scenario.loanAmount = String(currentLoanBalance);
      scenario.newLoanAmount = String(currentLoanBalance);
      scenario.estimatedNewLoanAmount = String(currentLoanBalance);
    }

    if (loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE && currentLoanBalance > 0) {
      const estimatedNewLoanAmount = currentLoanBalance + desiredCashOut;
      scenario.loanAmount = String(estimatedNewLoanAmount);
      scenario.newLoanAmount = String(estimatedNewLoanAmount);
      scenario.estimatedNewLoanAmount = String(estimatedNewLoanAmount);
    }

    if (scenario.estimatedPropertyValue && !scenario.propertyValue) {
      scenario.propertyValue = scenario.estimatedPropertyValue;
    }

    if (scenario.propertyValue && !scenario.estimatedPropertyValue) {
      scenario.estimatedPropertyValue = scenario.propertyValue;
    }

    if (scenario.desiredCashOut && !scenario.requestedCashOut) {
      scenario.requestedCashOut = scenario.desiredCashOut;
    }

    if (scenario.requestedCashOut && !scenario.desiredCashOut) {
      scenario.desiredCashOut = scenario.requestedCashOut;
    }

    if (!scenario.refinancePurpose) {
      scenario.refinancePurpose = scenario.requestedCashOut ? "cash_out" : "unknown";
    }
  }

  return scenario;
}

function fillScenarioFromMessage(currentScenario, message) {
  const scenario = createScenarioCopy(currentScenario);
  const text = normalizeText(message);
  const moneyValues = extractMoneyValues(message);

  const purpose = inferLoanPurpose(text);
  if (purpose) scenario.loanPurpose = purpose;
  else scenario.loanPurpose = normalizeLoanPurpose(scenario.loanPurpose);

  const occupancy = inferOccupancy(text);
  if (occupancy) scenario.occupancy = occupancy;

  const loanType = inferLoanType(text);
  if (loanType) scenario.loanType = loanType;

  const creditScore = extractCreditScore(text);
  if (creditScore) scenario.creditScore = creditScore;

  const zipCode = extractZipCode(text);
  if (zipCode) scenario.zipCode = zipCode;

  const normalizedPurpose = normalizeLoanPurpose(scenario.loanPurpose);

  if (normalizedPurpose === LOAN_PURPOSES.PURCHASE) {
    const purchasePrice = extractContextMoneyValue(message, [
      /\b(?:home|house|property)\s+(?:for|is)\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
      /\b(?:purchase price|home price|house price|price)(?:\s+is|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
      /\b(?:buy|purchase|buying).*?\bfor\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    ]);

    if (purchasePrice) {
      scenario.purchasePrice = String(purchasePrice);
    }

    const downPaymentAmount = extractContextMoneyValue(message, [
      /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:down payment|down)\b/i,
      /\bdown payment(?:\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    ]);

    if (downPaymentAmount) {
      scenario.downPayment = String(downPaymentAmount);
    }

    const percentMatch = text.match(/\b(?:put\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:down|down payment)?\b|\bdown payment\s+is\s+(\d+(?:\.\d+)?)\s*(?:%|percent)\b/);
    const percentValue = percentMatch ? Number(percentMatch[1] || percentMatch[2]) : 0;
    if (percentValue > 0) {
      scenario.downPaymentPercent = percentValue.toFixed(3);
      if (toNumber(scenario.purchasePrice) > 0) {
        scenario.downPayment = String(Math.round((toNumber(scenario.purchasePrice) * percentValue) / 100));
      }
    }
  }

  const propertyTaxes = extractMonthlyCostValue(message, [
    /\b(?:property taxes|taxes)(?:\s+are|\s+is|\s+about|\s+around|\s+of)*\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\s*(?:property taxes|taxes)\b/i,
  ]);

  if (propertyTaxes !== null) {
    scenario.propertyTaxes = String(propertyTaxes);
  }

  const homeownersInsurance = extractMonthlyCostValue(message, [
    /\b(?:homeowners insurance|homeowner insurance|insurance)(?:\s+are|\s+is|\s+about|\s+around|\s+of)*\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\s*(?:homeowners insurance|homeowner insurance|insurance)\b/i,
  ]);

  if (homeownersInsurance !== null) {
    scenario.homeownersInsurance = String(homeownersInsurance);
  }

  const hoaDues = /\bno\s+hoa\b|\bhoa\s+(?:is\s+)?(?:none|zero|no)\b/i.test(message)
    ? 0
    : extractMonthlyCostValue(message, [
        /\b(?:hoa|hoa dues)(?:\s+are|\s+is|\s+about|\s+around|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\b/i,
        /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:per month|monthly|\/month|a month)?\s*(?:hoa|hoa dues)\b/i,
      ]);

  if (hoaDues !== null) {
    scenario.hoaDues = String(hoaDues);
  }

  const loanAmount = extractContextMoneyValue(message, [
    /\bloan amount(?:\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:loan amount|loan)\b/i,
  ]);

  if (loanAmount) {
    scenario.loanAmount = String(loanAmount);
  }

  const estimatedPropertyValue = extractContextMoneyValue(message, [
    /\b(?:estimated property value|property value|home value|house value|current value|estimated value)(?:\s+is|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:estimated property value|property value|home value|house value|current value)\b/i,
    /\b(?:my )?(?:home|house|property)\s+(?:is\s+)?worth\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
  ]);

  if (estimatedPropertyValue && normalizedPurpose !== LOAN_PURPOSES.PURCHASE) {
    scenario.propertyValue = String(estimatedPropertyValue);
    scenario.estimatedPropertyValue = String(estimatedPropertyValue);
  }

  const currentLoanBalance = extractContextMoneyValue(message, [
    /\b(?:current loan balance|loan balance|mortgage balance|current balance|payoff)(?:\s+is|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:current loan balance|loan balance|mortgage balance|current balance|payoff)\b/i,
    /\b(?:i\s+)?owe\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
  ]);

  if (currentLoanBalance && normalizedPurpose !== LOAN_PURPOSES.PURCHASE) {
    scenario.currentLoanBalance = String(currentLoanBalance);
  }

  const currentMonthlyPayment = extractContextMoneyValue(message, [
    /\b(?:current monthly payment|current payment|mortgage payment|payment)(?:\s+is|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:current monthly payment|current payment|mortgage payment|payment)\b/i,
  ]);

  if (currentMonthlyPayment && normalizedPurpose !== LOAN_PURPOSES.PURCHASE) {
    scenario.currentMonthlyPayment = String(currentMonthlyPayment);
  }

  const desiredCashOut = extractContextMoneyValue(message, [
    /\b(?:desired cash out|cash out|cash-out|take out|take equity out|pull equity)(?:\s+is|\s+of)?\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:cash out|cash-out|equity out|cash back)\b/i,
  ]);

  if (desiredCashOut) {
    scenario.requestedCashOut = String(desiredCashOut);
    scenario.desiredCashOut = String(desiredCashOut);
    scenario.loanPurpose = LOAN_PURPOSES.CASH_OUT_REFINANCE;
  }

  const currentRateMatch = text.match(/\b(?:current interest rate|current rate|interest rate)(?:\s+is|\s+of)?\s+(\d+(?:\.\d+)?)\s*%?\b/);
  if (currentRateMatch && normalizedPurpose !== LOAN_PURPOSES.PURCHASE) {
    scenario.currentInterestRate = Number(currentRateMatch[1]).toFixed(3);
  }

  const refinanceGoal = detectRefinanceGoal(text);
  if (refinanceGoal) {
    scenario.refinanceGoal = refinanceGoal;
    if (scenario.loanPurpose === LOAN_PURPOSES.PURCHASE) {
      scenario.loanPurpose = LOAN_PURPOSES.RATE_TERM_REFINANCE;
    }
  }

  const refinancePurpose = detectRefinancePurpose(text);
  if (refinancePurpose) {
    scenario.refinancePurpose = refinancePurpose;
    if (refinancePurpose === "cash_out" || refinancePurpose === "debt_consolidation") {
      scenario.loanPurpose = LOAN_PURPOSES.CASH_OUT_REFINANCE;
      if (refinancePurpose === "debt_consolidation") {
        scenario.cashOutPurpose = refinancePurpose;
        scenario.cashOutGoal = refinancePurpose;
      }
    } else if (scenario.loanPurpose === LOAN_PURPOSES.PURCHASE) {
      scenario.loanPurpose = LOAN_PURPOSES.RATE_TERM_REFINANCE;
    }
  }

  const cashOutGoal = detectCashOutGoal(text);
  if (cashOutGoal && normalizeLoanPurpose(scenario.loanPurpose) === LOAN_PURPOSES.CASH_OUT_REFINANCE) {
    scenario.cashOutPurpose = cashOutGoal;
    scenario.cashOutGoal = cashOutGoal;
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
    normalizeLoanPurpose(scenario.loanPurpose) === LOAN_PURPOSES.PURCHASE &&
    !scenario.purchasePrice &&
    moneyValues[0]
  ) {
    scenario.purchasePrice = String(moneyValues[0]);
  }

  if (
    normalizeLoanPurpose(scenario.loanPurpose) === LOAN_PURPOSES.PURCHASE &&
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

  const loanPurpose = normalizeLoanPurpose(scenario.loanPurpose);
  const questionFlow = getQuestionFlowForPurpose(loanPurpose).filter(
    (field) => field !== "loanPurpose" && field !== "propertyType",
  );
  const questionMap = PURPOSE_QUESTIONS[loanPurpose] || {};

  if (
    loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE ||
    loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE
  ) {
    if (loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE && !hasRefinanceDetail(scenario)) {
      return "Are you looking to lower or change your current loan, or are you looking to take cash out?";
    }
  }

  for (const field of questionFlow) {
    if (field === "downPayment" && (scenario.downPayment || scenario.loanAmount)) continue;
    if (scenario[field]) continue;
    if (questionMap[field]) return questionMap[field];
  }

  if (loanPurpose === LOAN_PURPOSES.PURCHASE) {
    return "Great. I updated your purchase scenario. You can now compare your rate options, monthly payment, closing costs, and cash to close.";
  }

  return "Perfect. I updated your refinance scenario. Tell me what you want to adjust next.";
}

function buildReplyPrefix(previousScenario, updatedScenario) {
  const changes = [];

  if (updatedScenario.loanPurpose !== previousScenario.loanPurpose && updatedScenario.loanPurpose) {
    const purposeMap = {
      purchase: "purchase",
      rate_term_refinance: "rate-and-term refinance",
      cash_out_refinance: "cash-out refinance",
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
    changes.push(`I updated your scenario with a ${formatMoneyForReply(updatedScenario.purchasePrice)} purchase price`);
  }

  if (
    updatedScenario.estimatedPropertyValue !== previousScenario.estimatedPropertyValue &&
    updatedScenario.estimatedPropertyValue
  ) {
    changes.push(`I added the estimated property value`);
  }

  if (updatedScenario.downPayment !== previousScenario.downPayment && updatedScenario.downPayment) {
    changes.push(`I added your ${formatMoneyForReply(updatedScenario.downPayment)} down payment`);
  } else if (
    updatedScenario.downPaymentPercent !== previousScenario.downPaymentPercent &&
    updatedScenario.downPaymentPercent
  ) {
    changes.push(`I added your ${formatPercentForReply(updatedScenario.downPaymentPercent)} down payment`);
  }

  if (updatedScenario.currentLoanBalance !== previousScenario.currentLoanBalance && updatedScenario.currentLoanBalance) {
    changes.push(`I added the current loan balance`);
  }

  if (updatedScenario.currentInterestRate !== previousScenario.currentInterestRate && updatedScenario.currentInterestRate) {
    changes.push(`I added the current interest rate`);
  }

  if (
    updatedScenario.currentMonthlyPayment !== previousScenario.currentMonthlyPayment &&
    updatedScenario.currentMonthlyPayment
  ) {
    changes.push(`I added the current monthly payment`);
  }

  if (updatedScenario.desiredCashOut !== previousScenario.desiredCashOut && updatedScenario.desiredCashOut) {
    changes.push(`I added the desired cash out`);
  }

  if (updatedScenario.loanAmount !== previousScenario.loanAmount && updatedScenario.loanAmount) {
    changes.push(`I added the loan amount`);
  }

  if (updatedScenario.creditScore !== previousScenario.creditScore && updatedScenario.creditScore) {
    changes.push(`I added your ${updatedScenario.creditScore} credit score`);
  }

  if (updatedScenario.loanType !== previousScenario.loanType && updatedScenario.loanType) {
    changes.push(`I updated the loan type`);
  }

  if (updatedScenario.zipCode !== previousScenario.zipCode && updatedScenario.zipCode) {
    changes.push(`I added the ZIP code`);
  }

  if (updatedScenario.propertyTaxes !== previousScenario.propertyTaxes && updatedScenario.propertyTaxes !== "") {
    changes.push(`I added about ${formatMoneyForReply(updatedScenario.propertyTaxes)}/month in property taxes`);
  }

  if (
    updatedScenario.homeownersInsurance !== previousScenario.homeownersInsurance &&
    updatedScenario.homeownersInsurance !== ""
  ) {
    changes.push(`I added about ${formatMoneyForReply(updatedScenario.homeownersInsurance)}/month in homeowners insurance`);
  }

  if (updatedScenario.hoaDues !== previousScenario.hoaDues && updatedScenario.hoaDues !== "") {
    changes.push(
      toNumber(updatedScenario.hoaDues) === 0
        ? "I marked HOA as $0/month"
        : `I added about ${formatMoneyForReply(updatedScenario.hoaDues)}/month in HOA dues`,
    );
  }

  if (!changes.length) return "Got it.";
  return `${changes.join(". ")}.`;
}

function formatMoneyForReply(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatPercentForReply(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value}%`;
  return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(2)}%`;
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
