export function safeScenario(value) {
  return sanitizeScenarioUpdates(value);
}

export function redactSensitiveText(text) {
  return text.replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, '[redacted SSN]')
    .replace(/\b\d{9}\b/g, '[redacted identifier]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[redacted email]');
}

export const SALLY_FALLBACK_TEXT = "Got it. Let's confirm that using your actual numbers before I go further.";
// Exact server-owned intake phrases, not a natural-language truth classifier.
// A provider may select these phrases but cannot author borrower-visible claims.
export const SALLY_INTAKE_TEXT = Object.freeze([
  SALLY_FALLBACK_TEXT,
  "Are you looking to buy a home, refinance, or take cash out?",
  "Will this be your primary home, second home, or an investment property?",
  "What price range are you looking at?",
  "How much are you planning to put down?",
  "About where is your credit score right now?",
  "Do you want to look at Conventional, FHA, VA, USDA, Jumbo, or DSCR financing?",
  "What ZIP code are you shopping in?",
  "What would you like to change about your scenario?",
  "Please review the quote details with a licensed loan officer.",
  "\u00bfBuscas comprar una casa, refinanciar o retirar efectivo?",
  "\u00bfEn qu\u00e9 c\u00f3digo postal buscas una propiedad?",
]);
export function validateTextOutput(text) {
  return typeof text === 'string' && (text === '' || SALLY_INTAKE_TEXT.includes(text));
}

const SCENARIO_KEYS = [
  "loanPurpose",
  "purchasePrice",
  "downPayment",
  "downPaymentPercent",
  "loanAmount",
  "creditScore",
  "loanType",
  "occupancy",
  "zipCode",
];

function sanitizeValue(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : value;
}

export function sanitizeScenarioUpdates(updates) {
  const clean = {};
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) return clean;

  for (const key of SCENARIO_KEYS) {
    const value = sanitizeValue(updates[key]);
    const enums = { loanPurpose: ['purchase', 'refinance', 'cash_out'],
      loanType: ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'DSCR'],
      occupancy: ['primary', 'second_home', 'investment'] };
    const valid = enums[key] ? enums[key].includes(value)
      : key === 'zipCode' ? typeof value === 'string' && /^\d{5}$/.test(value)
      : (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))
        && Number.isFinite(Number(value)) && Number(value) >= 0;
    if (value !== "" && valid) {
      clean[key] = value;
    }
  }

  return clean;
}

export function diffScenario(currentScenario, nextScenario) {
  const updates = {};

  for (const key of SCENARIO_KEYS) {
    const currentValue = sanitizeValue(currentScenario[key]);
    const nextValue = sanitizeValue(nextScenario[key]);

    if (nextValue !== "" && nextValue !== currentValue) {
      updates[key] = nextValue;
    }
  }

  return updates;
}

export function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const content = redactSensitiveText(String(item?.content || item?.text || "").trim()).slice(0, 4000);
      return content ? { role, content } : null;
    })
    .filter(Boolean)
    .slice(-12);
}

export function summarizePricingOptions(pricingOptions) {
  if (!Array.isArray(pricingOptions) || !pricingOptions.length) return [];

  return pricingOptions.slice(0, 12).map((option) => ({
    rate: option?.rate,
    price: option?.price,
    paymentPI: option?.paymentPI,
    paymentPITI: option?.paymentPITI,
    program: option?.program,
    tags: Array.isArray(option?.tags) ? option.tags : [],
  }));
}

export function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const textParts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

export function parseModelJson(text) {
  if (typeof text !== 'string' || text.length > 16000) return null;
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  const stripped = normalized
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

// --- Reply guardrail -------------------------------------------------------
//
// Sally's structured scenarioUpdates are already whitelisted against
// SCENARIO_KEYS above. This section closes the remaining gap: the free-form
// replyText the model writes for the borrower to read was previously
// returned unchecked. These functions verify that any dollar or percent
// figure appearing in replyText is actually traceable to a real source
// (the current scenario, the deterministic parser's output, or an actual
// returned pricing option) before the reply is shown to a borrower.
//
// This is intentionally scoped to $ and % figures, which cover the
// dollar-amount and rate/point claims Sally is instructed she "may explain."
// It is a guardrail, not a full natural-language fact-checker.

const CLAIM_MATCH_MIN_RELATIVE_TOLERANCE = 0.01; // 1% of the source value
const CLAIM_MATCH_MIN_ABSOLUTE_TOLERANCE = 0.5;

function addNumberVariants(allowedNumbers, rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return;
  allowedNumbers.add(numeric);
  allowedNumbers.add(Math.round(numeric));
  allowedNumbers.add(Math.round(numeric * 10) / 10);
  allowedNumbers.add(Math.round(numeric * 100) / 100);
}

export function collectAllowedNumbers({ currentScenario, pricingOptions, localResult, deterministicUpdates } = {}) {
  const allowedNumbers = new Set();

  for (const source of [currentScenario, localResult?.scenario, deterministicUpdates]) {
    if (source && typeof source === "object") {
      for (const value of Object.values(source)) {
        addNumberVariants(allowedNumbers, value);
      }
    }
  }

  for (const option of Array.isArray(pricingOptions) ? pricingOptions : []) {
    for (const key of ["rate", "price", "paymentPI", "paymentPITI", "estimatedCashToClose"]) {
      addNumberVariants(allowedNumbers, option?.[key]);
    }
  }

  return allowedNumbers;
}

export function extractCurrencyAndPercentClaims(text) {
  const source = String(text || "");
  const dollarPattern = /\$\s?-?\d[\d,]*(?:\.\d+)?/g;
  const percentPattern = /-?\d+(?:\.\d+)?\s?%/g;

  const dollars = [...source.matchAll(dollarPattern)].map((match) => Number(match[0].replace(/[$,\s]/g, "")));
  const percents = [...source.matchAll(percentPattern)].map((match) => Number(match[0].replace(/[%\s]/g, "")));

  return [...dollars, ...percents].filter((value) => Number.isFinite(value));
}

function isNumberSourced(claim, allowedNumbers) {
  for (const allowed of allowedNumbers) {
    const tolerance = Math.max(CLAIM_MATCH_MIN_ABSOLUTE_TOLERANCE, Math.abs(allowed) * CLAIM_MATCH_MIN_RELATIVE_TOLERANCE);
    if (Math.abs(claim - allowed) <= tolerance) return true;
  }
  return false;
}

export function findUnsourcedFinancialClaims(text, allowedNumbers) {
  return extractCurrencyAndPercentClaims(text).filter((claim) => !isNumberSourced(claim, allowedNumbers));
}

export function validateReplyText(replyText, context) {
  const allowedNumbers = collectAllowedNumbers(context);
  const unsourcedClaims = findUnsourcedFinancialClaims(replyText, allowedNumbers);
  return { safe: unsourcedClaims.length === 0, unsourcedClaims };
}

// --- End reply guardrail ----------------------------------------------------
