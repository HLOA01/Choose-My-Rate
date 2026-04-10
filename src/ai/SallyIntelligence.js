// SallyIntelligence.js
// HLOA4 - Full borrower conversation flow with language-first sequence

export const DEFAULT_SCENARIO = {
  language: "",
  purpose: "",
  loanPurpose: "",
  occupancy: "",
  propertyUse: "",
  propertyType: "",
  refinanceGoal: "",
  timeline: "",
  programPreference: "",

  purchasePrice: null,
  estimatedValue: null,
  appraisalValue: null,
  downPayment: null,
  downPaymentPercent: null,
  loanAmount: null,
  desiredCashOut: null,
  currentLoanBalance: null,
  creditScoreRange: "",
  creditScore: "",
  monthlyIncome: null,
  monthlyDebts: null,
  zipCode: "",
  area: "",
  county: "",
  state: "",

  loanType: "",
  loanTerm: "30-Year Fixed",

  lastReviewed: false,
};

export const STAGES = {
  LANGUAGE: "language",
  PURPOSE: "purpose",
  OCCUPANCY: "occupancy",
  PRICE: "price",
  DOWN_PAYMENT: "down_payment",
  CREDIT: "credit",
  INCOME: "income",
  LOCATION: "location",
  REVIEW: "review",
  PRICING_READY: "pricing_ready",
};

export const INTENTS = {
  SET_LANGUAGE: "set_language",

  START_PURCHASE: "start_purchase",
  START_REFINANCE: "start_refinance",
  START_EXPLORE: "start_explore",

  SET_OCCUPANCY: "set_occupancy",
  SET_PURCHASE_PRICE: "set_purchase_price",
  SET_DOWN_PAYMENT: "set_down_payment",
  SET_CREDIT: "set_credit",
  SET_INCOME: "set_income",
  SET_LOCATION: "set_location",
  SET_PROGRAM: "set_program",

  CONFIRM_REVIEW: "confirm_review",
  REJECT_REVIEW: "reject_review",
  RESET_SCENARIO: "reset_scenario",

  UNKNOWN: "unknown",
};

export function createEmptyScenario() {
  return { ...DEFAULT_SCENARIO };
}

export function processSallyMessage(message, currentScenario = DEFAULT_SCENARIO) {
  const safeMessage = String(message || "").trim();
  const intent = classifyIntent(safeMessage, currentScenario);
  const extracted = extractScenarioData(safeMessage, intent, currentScenario);
  const updatedScenario = mergeScenario(currentScenario, extracted, intent);
  const nextStage = determineNextStage(updatedScenario, intent);

  return buildResponse(intent, updatedScenario, nextStage);
}

function classifyIntent(message, currentScenario = DEFAULT_SCENARIO) {
  const text = normalizeText(message);

  if (!text) return INTENTS.UNKNOWN;

  if (/(start over|reset|new scenario|clear everything|begin again)/.test(text)) {
    return INTENTS.RESET_SCENARIO;
  }

  if (/^(english|spanish|espanol|español)$/.test(text)) {
    return INTENTS.SET_LANGUAGE;
  }

  if (/(i want to buy|buy a house|buy a home|purchase a house|purchase a home|purchase)/.test(text)) {
    return INTENTS.START_PURCHASE;
  }

  if (/(refinance|cash out|cashout|lower my payment|lower payment|rate and term)/.test(text)) {
    return INTENTS.START_REFINANCE;
  }

  if (/(just exploring|just looking|exploring|see my options|not sure yet)/.test(text)) {
    return INTENTS.START_EXPLORE;
  }

  if (/^(primary|primary residence|owner occupied|i'm going to live in it|i will live in it)$/.test(text)) {
    return INTENTS.SET_OCCUPANCY;
  }

  if (/^(investment|investment property|rental|investor)$/.test(text)) {
    return INTENTS.SET_OCCUPANCY;
  }

  if (/^(second home|vacation home|second)$/.test(text)) {
    return INTENTS.SET_OCCUPANCY;
  }

  if (/(primary residence|owner occupied|live in it|investment property|rental|second home|vacation home)/.test(text)) {
    return INTENTS.SET_OCCUPANCY;
  }

  if (/^\d{5}$/.test(text)) {
    return INTENTS.SET_LOCATION;
  }

  if (containsZipCode(text) && !containsMoneyWords(text)) {
    return INTENTS.SET_LOCATION;
  }

  if (/(fha|conventional|va|usda)/.test(text)) {
    return INTENTS.SET_PROGRAM;
  }

  if (/(credit|fico|score|excellent credit|good credit|fair credit|poor credit)/.test(text)) {
    return INTENTS.SET_CREDIT;
  }

  if (/^\d{3}$/.test(text)) {
    return INTENTS.SET_CREDIT;
  }

  if (/(income|make|salary|monthly income|per month|before taxes|a month)/.test(text)) {
    return INTENTS.SET_INCOME;
  }

  if (/(down payment|put down|% down|percent down|enganche)/.test(text)) {
    return INTENTS.SET_DOWN_PAYMENT;
  }

  if (/^\d+(k)?\s*down$/.test(text)) {
    return INTENTS.SET_DOWN_PAYMENT;
  }

  if (/^\d{1,2}(\.\d+)?%$/.test(text) && currentScenario.purpose === "purchase") {
    return INTENTS.SET_DOWN_PAYMENT;
  }

  if (/(yes|correct|that looks right|looks right|that's right)/.test(text)) {
    return INTENTS.CONFIRM_REVIEW;
  }

  if (/(no|not right|that is wrong|that's wrong|incorrect|change it|change that)/.test(text)) {
    return INTENTS.REJECT_REVIEW;
  }

  if (currentScenario.purpose === "purchase" && looksLikePriceAnswer(text)) {
    return INTENTS.SET_PURCHASE_PRICE;
  }

  return INTENTS.UNKNOWN;
}

function extractScenarioData(message, intent, currentScenario = DEFAULT_SCENARIO) {
  const text = normalizeText(message);
  const updates = {};

  if (intent === INTENTS.SET_LANGUAGE) {
    if (/(english)/.test(text)) {
      updates.language = "English";
    } else if (/(spanish|espanol|español)/.test(text)) {
      updates.language = "Spanish";
    }
  }

  if (intent === INTENTS.START_PURCHASE) {
    updates.purpose = "purchase";
    updates.loanPurpose = "Purchase";
  }

  if (intent === INTENTS.START_REFINANCE) {
    updates.purpose = "refinance";
    updates.loanPurpose = "Refinance";
  }

  if (intent === INTENTS.START_EXPLORE) {
    updates.purpose = currentScenario.purpose || "explore";
    updates.loanPurpose = currentScenario.loanPurpose || "Explore";
  }

  if (intent === INTENTS.SET_OCCUPANCY) {
    const occupancy = extractOccupancy(text);
    if (occupancy) {
      updates.occupancy = occupancy;
      updates.propertyUse = occupancy;
    }
  }

  if (intent === INTENTS.SET_LOCATION) {
    const location = extractLocation(text);
    if (location.zipCode) updates.zipCode = location.zipCode;
    if (location.area) updates.area = location.area;
    if (location.county) updates.county = location.county;
    if (location.state) updates.state = location.state;
  }

  if (intent === INTENTS.SET_PROGRAM) {
    const program = extractProgram(text);
    if (program) {
      updates.programPreference = program;
      updates.loanType = program.toUpperCase();
    }
  }

  if (intent === INTENTS.SET_CREDIT) {
    const creditRange = extractCreditRange(text);
    if (creditRange) {
      updates.creditScoreRange = creditRange;
      updates.creditScore = creditRange;
    }
  }

  if (intent === INTENTS.SET_INCOME) {
    const income = extractMonthlyIncome(text);
    if (income !== null) {
      updates.monthlyIncome = income;
    }
  }

  if (intent === INTENTS.SET_DOWN_PAYMENT) {
    const downPaymentInfo = extractDownPayment(text);
    if (downPaymentInfo.downPayment !== null) {
      updates.downPayment = downPaymentInfo.downPayment;
    }
    if (downPaymentInfo.downPaymentPercent !== null) {
      updates.downPaymentPercent = downPaymentInfo.downPaymentPercent;
    }
  }

  if (intent === INTENTS.SET_PURCHASE_PRICE) {
    const purchasePrice = extractPurchasePrice(text);
    if (purchasePrice !== null) {
      updates.purchasePrice = purchasePrice;
    }
  }

  return updates;
}

function mergeScenario(currentScenario, extractedData, intent) {
  if (intent === INTENTS.RESET_SCENARIO) {
    return { ...DEFAULT_SCENARIO };
  }

  const merged = {
    ...currentScenario,
    ...extractedData,
    lastReviewed: false,
  };

  if (merged.purpose === "purchase" && !merged.loanPurpose) {
    merged.loanPurpose = "Purchase";
  }

  if (merged.purpose === "refinance" && !merged.loanPurpose) {
    merged.loanPurpose = "Refinance";
  }

  if (
    merged.purchasePrice !== null &&
    merged.downPayment !== null &&
    merged.downPayment !== undefined
  ) {
    merged.loanAmount = Math.max(merged.purchasePrice - merged.downPayment, 0);
  }

  if (
    merged.purchasePrice !== null &&
    merged.downPaymentPercent !== null &&
    merged.downPaymentPercent !== undefined &&
    (merged.downPayment === null || merged.downPayment === undefined)
  ) {
    merged.downPayment = Math.round(merged.purchasePrice * (merged.downPaymentPercent / 100));
    merged.loanAmount = Math.max(merged.purchasePrice - merged.downPayment, 0);
  }

  if (
    merged.purchasePrice !== null &&
    merged.downPayment !== null &&
    merged.downPayment !== undefined &&
    (merged.downPaymentPercent === null || merged.downPaymentPercent === undefined)
  ) {
    merged.downPaymentPercent = Number(
      ((merged.downPayment / merged.purchasePrice) * 100).toFixed(2)
    );
  }

  return merged;
}

function determineNextStage(scenario, intent) {
  if (intent === INTENTS.RESET_SCENARIO) return STAGES.LANGUAGE;

  if (!scenario.language) return STAGES.LANGUAGE;
  if (!scenario.purpose || scenario.purpose === "explore") return STAGES.PURPOSE;
  if (!scenario.occupancy) return STAGES.OCCUPANCY;
  if (scenario.purpose === "purchase" && !scenario.purchasePrice) return STAGES.PRICE;

  if (
    scenario.purpose === "purchase" &&
    scenario.downPayment === null &&
    scenario.downPaymentPercent === null
  ) {
    return STAGES.DOWN_PAYMENT;
  }

  if (!scenario.creditScoreRange) return STAGES.CREDIT;
  if (!scenario.monthlyIncome) return STAGES.INCOME;
  if (!scenario.zipCode && !scenario.area) return STAGES.LOCATION;

  return STAGES.REVIEW;
}

function buildResponse(intent, scenario, nextStage) {
  if (intent === INTENTS.RESET_SCENARIO) {
    return {
      message: "Let’s start fresh. Would you like to continue in English or Spanish?",
      scenario,
      nextStage,
      actions: {
        updateScenarioPanel: true,
        triggerPricing: false,
        showReviewCard: false,
      },
    };
  }

  if (intent === INTENTS.REJECT_REVIEW) {
    return {
      message:
        "Got it. Tell me what you want to change, for example the price, down payment, credit, income, ZIP code, or loan program.",
      scenario,
      nextStage: STAGES.REVIEW,
      actions: {
        updateScenarioPanel: true,
        triggerPricing: false,
        showReviewCard: false,
      },
    };
  }

  if (intent === INTENTS.CONFIRM_REVIEW && isPricingReady(scenario)) {
    return {
      message:
        "Perfect. I’m ready to show you rate options so you can see how the payment changes.",
      scenario: {
        ...scenario,
        lastReviewed: true,
      },
      nextStage: STAGES.PRICING_READY,
      actions: {
        updateScenarioPanel: true,
        triggerPricing: true,
        showReviewCard: false,
      },
    };
  }

  if (isPricingReady(scenario)) {
    return {
      message: buildReviewSummary(scenario),
      scenario,
      nextStage: STAGES.REVIEW,
      actions: {
        updateScenarioPanel: true,
        triggerPricing: false,
        showReviewCard: true,
      },
    };
  }

  switch (nextStage) {
    case STAGES.LANGUAGE:
      return {
        message: "Would you like to continue in English or Spanish?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.PURPOSE:
      return {
        message: "Are you looking to buy a home or refinance?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.OCCUPANCY:
      return {
        message: "Will this be primary, investment, or second home?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.PRICE:
      return {
        message: "What price range are you looking at?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.DOWN_PAYMENT:
      return {
        message: "How much are you thinking of putting down?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.CREDIT:
      return {
        message: "What’s your estimated credit score?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.INCOME:
      return {
        message: "About how much do you make per month before taxes?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    case STAGES.LOCATION:
      return {
        message: "What ZIP code are you looking in?",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };

    default:
      return {
        message: "Tell me a little more.",
        scenario,
        nextStage,
        actions: {
          updateScenarioPanel: true,
          triggerPricing: false,
          showReviewCard: false,
        },
      };
  }
}

function isPricingReady(scenario) {
  return Boolean(
    scenario.language &&
      scenario.purpose === "purchase" &&
      scenario.occupancy &&
      scenario.purchasePrice &&
      (scenario.downPayment !== null || scenario.downPaymentPercent !== null) &&
      scenario.creditScoreRange &&
      scenario.monthlyIncome &&
      (scenario.zipCode || scenario.area)
  );
}

function buildReviewSummary(scenario) {
  const occupancyLabel = prettyOccupancy(scenario.occupancy);

  return [
    "Here’s what I’m seeing so far:",
    `Language: ${scenario.language || "Not set"}`,
    `Loan purpose: ${scenario.loanPurpose || "Not set"}`,
    `Purchase price: ${formatCurrency(scenario.purchasePrice)}`,
    `Down payment: ${formatCurrency(scenario.downPayment)}`,
    `Loan amount: ${formatCurrency(scenario.loanAmount)}`,
    `Property use: ${occupancyLabel}`,
    `Estimated credit: ${scenario.creditScoreRange || "Not set"}`,
    `Monthly income: ${formatCurrency(scenario.monthlyIncome)}`,
    `ZIP code: ${scenario.zipCode || "Not set"}`,
    "",
    "Does that look right?",
  ].join("\n");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsZipCode(text) {
  return /\b\d{5}\b/.test(text);
}

function containsMoneyWords(text) {
  return /(down|put down|price|purchase price|home price|income|salary|month|credit|score)/.test(text);
}

function looksLikePriceAnswer(text) {
  if (!containsNumericValue(text)) return false;
  if (/^\d{5}$/.test(text)) return false;
  if (/(down|put down|credit|score|income|zip|zipcode|fha|conventional|va|english|spanish)/.test(text)) {
    return false;
  }
  return true;
}

function containsNumericValue(text) {
  return /\$?\d[\d,]*(\.\d+)?\s?(k)?\b/.test(text);
}

function extractOccupancy(text) {
  if (/(primary|primary residence|owner occupied|live in it)/.test(text)) return "primary";
  if (/(investment|investment property|rental|investor)/.test(text)) return "investment";
  if (/(second home|vacation home|second)/.test(text)) return "second_home";
  return "";
}

function extractProgram(text) {
  if (/\bfha\b/.test(text)) return "fha";
  if (/\bconventional\b/.test(text)) return "conventional";
  if (/\bva\b/.test(text)) return "va";
  if (/\busda\b/.test(text)) return "usda";
  return "";
}

function extractCreditRange(text) {
  const scoreMatch = text.match(/\b(5\d{2}|6\d{2}|7\d{2}|8\d{2})\b/);
  if (scoreMatch) {
    const score = Number(scoreMatch[1]);
    if (score >= 760) return "760+";
    if (score >= 720) return "720-759";
    if (score >= 680) return "680-719";
    if (score >= 620) return "620-679";
    return "below_620";
  }

  if (/(excellent|great)/.test(text)) return "760+";
  if (/(good)/.test(text)) return "720-759";
  if (/(fair)/.test(text)) return "680-719";
  if (/(poor|bad)/.test(text)) return "below_620";
  return "";
}

function extractMonthlyIncome(text) {
  if (!/(income|make|salary|monthly|per month|before taxes|a month)/.test(text)) return null;
  const values = extractMoneyValues(text);
  return values.length ? values[0] : null;
}

function extractDownPayment(text) {
  const result = {
    downPayment: null,
    downPaymentPercent: null,
  };

  const percentMatch = text.match(/\b(\d{1,2}(\.\d+)?)\s?%/);
  if (percentMatch) {
    result.downPaymentPercent = Number(percentMatch[1]);
  }

  const values = extractMoneyValues(text);
  if (values.length) {
    result.downPayment = values[0];
  }

  return result;
}

function extractPurchasePrice(text) {
  if (/^\d{5}$/.test(text)) return null;

  const rangeMatch = text.match(/between\s+\$?([\d,]+k?)\s+(and|to)\s+\$?([\d,]+k?)/);
  if (rangeMatch) {
    const low = parseMoneyToken(rangeMatch[1]);
    const high = parseMoneyToken(rangeMatch[3]);
    if (low && high) return Math.round((low + high) / 2);
  }

  const values = extractMoneyValues(text);
  return values.length ? values[0] : null;
}

function extractLocation(text) {
  const result = {
    zipCode: "",
    area: "",
    county: "",
    state: "",
  };

  const zipMatch = text.match(/\b\d{5}\b/);
  if (zipMatch) {
    result.zipCode = zipMatch[0];
  }

  return result;
}

function extractMoneyValues(text) {
  const matches = text.match(/\$?\d[\d,]*(\.\d{1,2})?\s?k?/g) || [];
  return matches.map(parseMoneyToken).filter((value) => value !== null);
}

function parseMoneyToken(value) {
  if (!value) return null;

  const cleaned = String(value)
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  if (cleaned.endsWith("k")) {
    const num = Number(cleaned.slice(0, -1));
    return Number.isFinite(num) ? num * 1000 : null;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "N/A";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function prettyOccupancy(value) {
  if (value === "primary") return "Primary residence";
  if (value === "investment") return "Investment property";
  if (value === "second_home") return "Second home";
  return value || "Not set";
}