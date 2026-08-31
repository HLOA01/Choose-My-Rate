export const GUEST_SCENARIO_STORAGE_KEY = "chooseMyRate.guestScenario.v1";
export const GUEST_SCENARIO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SCENARIO_FIELDS = [
  "loanPurpose",
  "purchasePrice",
  "downPayment",
  "downPaymentPercent",
  "loanAmount",
  "propertyValue",
  "estimatedPropertyValue",
  "currentLoanBalance",
  "currentInterestRate",
  "currentLoanTermYears",
  "currentRemainingTermYears",
  "currentMonthlyPayment",
  "requestedCashOut",
  "desiredCashOut",
  "newLoanAmount",
  "newInterestRate",
  "newLoanTermYears",
  "estimatedClosingCosts",
  "estimatedNewLoanAmount",
  "refinancePurpose",
  "cashOutPurpose",
  "debtConsolidationAmount",
  "debtConsolidationMonthlyPayments",
  "refinanceGoal",
  "cashOutGoal",
  "creditScore",
  "loanType",
  "occupancy",
  "zipCode",
  "propertyTaxes",
  "homeownersInsurance",
  "hoaDues",
];

const BORROWER_GOALS = new Set(["buy", "refinance", "cash-out", "fha-conventional"]);
const FLOW_STEPS = new Set(["goal", "property", "loan", "monthly-costs", "rate-options"]);

function sanitizeString(value, maxLength = 80) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[^\w\s.,%$/-]/g, "").slice(0, maxLength);
}

export function sanitizeGuestScenario(source = {}) {
  const scenario = {};

  for (const field of SCENARIO_FIELDS) {
    const value = source[field];
    if (value === undefined || value === null || value === "") continue;
    scenario[field] = sanitizeString(value);
  }

  return scenario;
}

export function hasMeaningfulGuestScenario(source = {}) {
  const scenario = sanitizeGuestScenario(source);
  return [
    "purchasePrice",
    "downPayment",
    "downPaymentPercent",
    "loanAmount",
    "propertyValue",
    "estimatedPropertyValue",
    "currentLoanBalance",
    "creditScore",
    "zipCode",
    "propertyTaxes",
    "homeownersInsurance",
    "hoaDues",
    "requestedCashOut",
    "desiredCashOut",
  ].some((field) => scenario[field] !== undefined && scenario[field] !== "");
}

function sanitizeDraft(payload) {
  if (!payload || typeof payload !== "object") return null;

  const savedAt = Number(payload.savedAt);
  if (!Number.isFinite(savedAt)) return null;
  if (Date.now() - savedAt > GUEST_SCENARIO_MAX_AGE_MS) return null;

  const scenario = sanitizeGuestScenario(payload.scenario);
  if (!hasMeaningfulGuestScenario(scenario)) return null;

  const selectedBorrowerGoal = BORROWER_GOALS.has(payload.selectedBorrowerGoal)
    ? payload.selectedBorrowerGoal
    : "buy";
  const borrowerFlowStep = FLOW_STEPS.has(payload.borrowerFlowStep)
    ? payload.borrowerFlowStep
    : "goal";

  return {
    version: 1,
    savedAt,
    selectedBorrowerGoal,
    borrowerFlowStep,
    scenario,
  };
}

export function readGuestScenarioDraft(storage = window.localStorage) {
  try {
    const raw = storage?.getItem(GUEST_SCENARIO_STORAGE_KEY);
    if (!raw) return null;

    return sanitizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveGuestScenarioDraft({ scenario, selectedBorrowerGoal, borrowerFlowStep }, storage = window.localStorage) {
  if (!hasMeaningfulGuestScenario(scenario)) return false;

  const draft = sanitizeDraft({
    version: 1,
    savedAt: Date.now(),
    selectedBorrowerGoal,
    borrowerFlowStep,
    scenario,
  });

  if (!draft) return false;

  try {
    storage?.setItem(GUEST_SCENARIO_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestScenarioDraft(storage = window.localStorage) {
  try {
    storage?.removeItem(GUEST_SCENARIO_STORAGE_KEY);
  } catch {
    // Ignore storage failures. The app should keep working without local save.
  }
}
