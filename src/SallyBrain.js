const DEFAULT_SCENARIO = {
  loanPurpose: "",
  language: "",
  occupancy: "",
  purchasePrice: "",
  downPayment: "",
  downPaymentPercent: "",
  loanAmount: "",
  creditScore: "",
  propertyState: "",
  propertyZip: "",
  incomeMonthly: "",
  monthlyDebts: "",
  propertyType: "single_family",
  loanProgram: "",
};

const RESET_PATTERNS = [
  /start over/i,
  /reset/i,
  /new scenario/i,
  /begin again/i,
  /clear everything/i,
];

const ENGLISH_PATTERNS = [/english/i, /in english/i];
const SPANISH_PATTERNS = [/spanish/i, /espanol/i, /español/i];

const OCCUPANCY_PATTERNS = [
  { value: "primary", patterns: [/primary/i, /primary home/i, /live in it/i, /owner occupied/i] },
  { value: "second_home", patterns: [/second home/i, /vacation home/i] },
  { value: "investment", patterns: [/investment/i, /rental/i, /investor/i] },
];

const PURPOSE_PATTERNS = [
  { value: "purchase", patterns: [/buy/i, /purchase/i, /buy a house/i, /looking to buy/i] },
  { value: "refinance", patterns: [/refinance/i, /refi/i] },
  { value: "cash_out", patterns: [/cash out/i, /cash-out/i, /pull cash/i, /take cash/i] },
];

const PROGRAM_PATTERNS = [
  { value: "conventional", patterns: [/conventional/i, /conv/i] },
  { value: "fha", patterns: [/fha/i] },
  { value: "va", patterns: [/va\b/i, /veteran/i] },
  { value: "usda", patterns: [/usda/i] },
  { value: "jumbo", patterns: [/jumbo/i] },
];

function cloneScenario(scenario = {}) {
  return { ...DEFAULT_SCENARIO, ...scenario };
}

function parsePrice(message) {
  const match = message.match(/\$?\s?(\d{2,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!match) return "";

  const base = Number(String(match[1]).replace(/,/g, ""));
  const suffix = (match[2] || "").toLowerCase();

  if (suffix === "k") return Math.round(base * 1000);
  if (suffix === "m") return Math.round(base * 1000000);
  return Math.round(base);
}

function parseCreditScore(message) {
  const match = message.match(/(?:credit score|score|fico)?\s*(?:is|around|about)?\s*(\d{3})/i);
  if (!match) return "";
  const score = Number(match[1]);
  if (score < 300 || score > 850) return "";
  return score;
}

function parseMonthlyIncome(message) {
  const monthlyMatch = message.match(/\$?\s?(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(?:\/month|per month|monthly|a month)/i);
  if (monthlyMatch) {
    return Math.round(Number(String(monthlyMatch[1]).replace(/,/g, "")));
  }

  const annualMatch = message.match(/\$?\s?(\d{2,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:\/year|per year|yearly|annually|a year)/i);
  if (annualMatch) {
    const base = Number(String(annualMatch[1]).replace(/,/g, ""));
    const annual = annualMatch[2] ? base * 1000 : base;
    return Math.round(annual / 12);
  }

  return "";
}

function parseDownPayment(message) {
  const pct = message.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:down|down payment)?/i);
  if (pct) {
    return { type: "percent", value: Number(pct[1]) };
  }

  const amountMatch = message.match(/(?:down payment|put down|putting down|down)\s*(?:is|will be)?\s*\$?\s?(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (amountMatch) {
    const base = Number(String(amountMatch[1]).replace(/,/g, ""));
    const suffix = (amountMatch[2] || "").toLowerCase();
    if (suffix === "k") return { type: "amount", value: Math.round(base * 1000) };
    if (suffix === "m") return { type: "amount", value: Math.round(base * 1000000) };
    return { type: "amount", value: Math.round(base) };
  }

  return null;
}

function detectIntent(message) {
  if (!message || !message.trim()) return "unknown";

  if (RESET_PATTERNS.some((pattern) => pattern.test(message))) return "reset_scenario";
  if (/change|update|switch/i.test(message)) return "update_scenario";
  if (/what can i afford|how much can i afford|qualify for/i.test(message)) return "affordability";
  if (PURPOSE_PATTERNS.some((item) => item.patterns.some((pattern) => pattern.test(message)))) return "new_scenario";
  return "collect_details";
}

function detectLanguage(message, scenario) {
  if (ENGLISH_PATTERNS.some((pattern) => pattern.test(message))) return "english";
  if (SPANISH_PATTERNS.some((pattern) => pattern.test(message))) return "spanish";
  return scenario.language || "";
}

function detectPurpose(message, scenario) {
  for (const item of PURPOSE_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(message))) return item.value;
  }
  return scenario.loanPurpose || "";
}

function detectOccupancy(message, scenario) {
  for (const item of OCCUPANCY_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(message))) return item.value;
  }
  return scenario.occupancy || "";
}

function detectProgram(message, scenario) {
  for (const item of PROGRAM_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(message))) return item.value;
  }
  return scenario.loanProgram || "";
}

function inferLoanAmount(scenario) {
  const purchasePrice = Number(scenario.purchasePrice || 0);
  if (!purchasePrice) return scenario.loanAmount || "";

  if (typeof scenario.downPayment === "number") {
    return Math.max(purchasePrice - scenario.downPayment, 0);
  }

  if (scenario.downPaymentPercent) {
    return Math.max(Math.round(purchasePrice * (1 - scenario.downPaymentPercent / 100)), 0);
  }

  return scenario.loanAmount || "";
}

function applyExtractedData(currentScenario, message) {
  const scenario = cloneScenario(currentScenario);

  scenario.language = detectLanguage(message, scenario);
  scenario.loanPurpose = detectPurpose(message, scenario);
  scenario.occupancy = detectOccupancy(message, scenario);
  scenario.loanProgram = detectProgram(message, scenario);

  const parsedPrice = parsePrice(message);
  if (parsedPrice && !/credit score/i.test(message)) {
    if (/purchase price|price range|home price|house price|buy/i.test(message) || !scenario.purchasePrice) {
      scenario.purchasePrice = parsedPrice;
    }
  }

  const parsedCredit = parseCreditScore(message);
  if (parsedCredit) {
    scenario.creditScore = parsedCredit;
  }

  const parsedIncome = parseMonthlyIncome(message);
  if (parsedIncome) {
    scenario.incomeMonthly = parsedIncome;
  }

  const parsedDownPayment = parseDownPayment(message);
  if (parsedDownPayment) {
    if (parsedDownPayment.type === "amount") {
      scenario.downPayment = parsedDownPayment.value;
      scenario.downPaymentPercent = "";
    }
    if (parsedDownPayment.type === "percent") {
      scenario.downPaymentPercent = parsedDownPayment.value;
      scenario.downPayment = "";
    }
  }

  scenario.loanAmount = inferLoanAmount(scenario);
  return scenario;
}

function getMissingFields(scenario) {
  const orderedFields = [
    "loanPurpose",
    "language",
    "occupancy",
    "purchasePrice",
    "downPayment",
    "creditScore",
  ];

  return orderedFields.filter((field) => {
    if (field === "downPayment") {
      return !scenario.downPayment && !scenario.downPaymentPercent;
    }
    return !scenario[field];
  });
}

function formatCurrency(value) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function nextQuestionForField(field, scenario) {
  const questions = {
    loanPurpose: "Are you looking to buy a home, refinance, or take cash out?",
    language: "Would you like to continue in English or Spanish?",
    occupancy: "Will this be your primary home, second home, or an investment property?",
    purchasePrice: "What price range are you looking at?",
    downPayment: scenario.purchasePrice
      ? `How much do you want to put down on a ${formatCurrency(scenario.purchasePrice)} purchase?`
      : "How much do you want to put down?",
    creditScore: "About where is your credit score right now?",
  };

  return questions[field] || "Tell me a little more so I can build the loan scenario.";
}

function buildNaturalIntro(intent, scenario) {
  if (intent === "reset_scenario") {
    return "Absolutely. I cleared everything and we’re starting fresh.";
  }

  if (scenario.loanProgram && scenario.purchasePrice) {
    return `Got it. I’m building a ${scenario.loanProgram.toUpperCase()} scenario around ${formatCurrency(scenario.purchasePrice)}.`;
  }

  if (scenario.purchasePrice) {
    return `Perfect. I’m building this around a purchase price of ${formatCurrency(scenario.purchasePrice)}.`;
  }

  if (scenario.occupancy === "primary") {
    return "Perfect. I’ve got this as your primary home.";
  }

  if (scenario.occupancy === "investment") {
    return "Got it. I’ve got this as an investment property.";
  }

  return "Got it.";
}

function buildResponse(intent, scenario) {
  const missing = getMissingFields(scenario);
  const naturalIntro = buildNaturalIntro(intent, scenario);

  if (!missing.length) {
    return {
      message: `${naturalIntro} I have the main scenario details. Next I can help estimate payments, review loan options, or compare programs.`,
      scenario,
    };
  }

  const nextField = missing[0];

  return {
    message: `${naturalIntro} ${nextQuestionForField(nextField, scenario)}`,
    scenario,
  };
}

export function createEmptyScenario() {
  return cloneScenario(DEFAULT_SCENARIO);
}

export function processSallyMessage(message, currentScenario = DEFAULT_SCENARIO) {
  const intent = detectIntent(message);

  if (intent === "reset_scenario") {
    const freshScenario = createEmptyScenario();
    return buildResponse(intent, freshScenario);
  }

  const updatedScenario = applyExtractedData(currentScenario, message);
  return buildResponse(intent, updatedScenario);
}

export { DEFAULT_SCENARIO };