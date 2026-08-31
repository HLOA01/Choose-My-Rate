import { LOAN_PURPOSES, normalizeLoanPurpose } from "../loanPurpose/loanPurposeConfig";

export function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateDownPaymentPercent(scenario) {
  if (scenario.downPaymentPercent) return Number(scenario.downPaymentPercent);

  const purchasePrice = toNumber(scenario.purchasePrice);
  const downPayment = toNumber(scenario.downPayment);

  if (!purchasePrice || !downPayment) return "";
  return Number(((downPayment / purchasePrice) * 100).toFixed(2));
}

export function normalizeOccupancy(value) {
  const occupancy = String(value || "primary").toLowerCase();

  if (occupancy === "second" || occupancy === "second_home") return "second_home";
  if (occupancy === "investment") return "investment";
  return "primary";
}

export function normalizeLoanPurposeValue(value) {
  if (value === undefined || value === null || value === "") return "";
  return normalizeLoanPurpose(value);
}

export function normalizeLoanTypeValue(value) {
  const loanType = String(value || "").trim().toLowerCase();
  if (!loanType) return "";
  if (loanType === "fha") return "FHA";
  if (loanType === "va") return "VA";
  if (loanType === "usda") return "USDA";
  if (loanType === "jumbo") return "Jumbo";
  if (loanType === "dscr") return "DSCR";
  if (loanType.includes("conv")) return "Conventional";
  return value;
}

export function normalizeRefinancePurposeValue(value) {
  const purpose = String(value || "").trim().toLowerCase().replace(/[_-]/g, " ");
  if (!purpose) return "";
  if (purpose.includes("debt") || purpose.includes("credit card") || purpose.includes("consolid")) {
    return "debt_consolidation";
  }
  if (purpose.includes("cash") || purpose.includes("equity")) return "cash_out";
  if (purpose.includes("short") || purpose.includes("15") || purpose.includes("20")) return "shorten_term";
  if (purpose.includes("lower") || purpose.includes("payment") || purpose.includes("save")) return "lower_payment";
  if (purpose === "unknown" || purpose.includes("not sure")) return "unknown";
  return value;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function normalizeRefinanceScenarioFields(scenario) {
  const source = scenario && typeof scenario === "object" ? scenario : {};
  const next = { ...source };
  const loanPurpose = normalizeLoanPurpose(next.loanPurpose);
  const isRefinance =
    loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE ||
    loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE;

  if (!isRefinance) return next;

  if (!hasValue(next.refinancePurpose)) {
    if (hasValue(next.cashOutPurpose) || hasValue(next.cashOutGoal) || hasValue(next.requestedCashOut)) {
      next.refinancePurpose = "cash_out";
    } else {
      next.refinancePurpose = "unknown";
    }
  }

  next.refinancePurpose = normalizeRefinancePurposeValue(next.refinancePurpose);

  if (next.refinancePurpose === "debt_consolidation") {
    if (!hasValue(next.cashOutPurpose)) next.cashOutPurpose = "debt_consolidation";
    if (!hasValue(next.cashOutGoal)) next.cashOutGoal = "debt_consolidation";
  }

  if (next.refinancePurpose === "cash_out" && !hasValue(next.cashOutPurpose) && hasValue(next.cashOutGoal)) {
    next.cashOutPurpose = next.cashOutGoal;
  }

  if (!hasValue(next.propertyValue) && hasValue(next.estimatedPropertyValue)) {
    next.propertyValue = next.estimatedPropertyValue;
  }

  if (!hasValue(next.estimatedPropertyValue) && hasValue(next.propertyValue)) {
    next.estimatedPropertyValue = next.propertyValue;
  }

  if (!hasValue(next.requestedCashOut) && hasValue(next.desiredCashOut)) {
    next.requestedCashOut = next.desiredCashOut;
  }

  if (!hasValue(next.desiredCashOut) && hasValue(next.requestedCashOut)) {
    next.desiredCashOut = next.requestedCashOut;
  }

  if (!hasValue(next.newLoanAmount) && hasValue(next.estimatedNewLoanAmount)) {
    next.newLoanAmount = next.estimatedNewLoanAmount;
  }

  if (!hasValue(next.newLoanAmount) && hasValue(next.loanAmount)) {
    next.newLoanAmount = next.loanAmount;
  }

  if (!hasValue(next.newLoanAmount)) {
    const currentLoanBalance = toNumber(next.currentLoanBalance);
    const requestedCashOut = toNumber(next.requestedCashOut);

    if (loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE && currentLoanBalance) {
      next.newLoanAmount = String(Math.round(currentLoanBalance));
    }

    if (loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE && (currentLoanBalance || requestedCashOut)) {
      next.newLoanAmount = String(Math.round(currentLoanBalance + requestedCashOut));
    }
  }

  if (!hasValue(next.estimatedNewLoanAmount) && hasValue(next.newLoanAmount)) {
    next.estimatedNewLoanAmount = next.newLoanAmount;
  }

  if (!hasValue(next.loanAmount) && hasValue(next.newLoanAmount)) {
    next.loanAmount = next.newLoanAmount;
  }

  return next;
}

export function normalizeScenarioUpdatesForUi(updates) {
  const source = updates && typeof updates === "object" ? updates : {};
  const normalized = {};
  const aliases = {
    loanPurpose: ["loanPurpose", "purpose"],
    purchasePrice: ["purchasePrice", "propertyValue", "estimatedValue", "homePrice", "price"],
    propertyValue: ["propertyValue", "estimatedPropertyValue", "estimatedValue", "homeValue", "currentValue"],
    downPayment: ["downPayment", "downPaymentAmount", "cashDown"],
    downPaymentPercent: ["downPaymentPercent", "downPaymentPct"],
    loanAmount: ["loanAmount", "mortgageAmount"],
    estimatedPropertyValue: ["estimatedPropertyValue", "propertyValue", "estimatedValue", "homeValue", "currentValue"],
    currentLoanBalance: ["currentLoanBalance", "currentBalance", "mortgageBalance", "payoffBalance"],
    currentInterestRate: ["currentInterestRate", "currentRate", "existingRate"],
    currentLoanTermYears: ["currentLoanTermYears", "currentLoanTerm", "originalLoanTermYears"],
    currentRemainingTermYears: ["currentRemainingTermYears", "remainingTermYears", "remainingLoanTermYears"],
    currentMonthlyPayment: ["currentMonthlyPayment", "currentPayment", "existingPayment", "mortgagePayment"],
    desiredCashOut: ["desiredCashOut", "cashOutAmount", "cashOut", "cashBack", "equityOut"],
    requestedCashOut: ["requestedCashOut", "desiredCashOut", "cashOutAmount", "cashOut", "cashBack", "equityOut"],
    estimatedNewLoanAmount: ["estimatedNewLoanAmount", "newLoanAmount"],
    newLoanAmount: ["newLoanAmount", "estimatedNewLoanAmount", "loanAmount"],
    newInterestRate: ["newInterestRate", "newRate", "refinanceRate"],
    newLoanTermYears: ["newLoanTermYears", "newLoanTerm", "refinanceTermYears"],
    estimatedClosingCosts: ["estimatedClosingCosts", "closingCosts", "refinanceClosingCosts"],
    refinancePurpose: ["refinancePurpose", "refinanceGoal", "refiGoal", "purposeDetail"],
    cashOutPurpose: ["cashOutPurpose", "cashOutGoal", "cashOutReason"],
    debtConsolidationAmount: ["debtConsolidationAmount", "debtAmount", "creditCardDebt", "debtPayoffAmount"],
    debtConsolidationMonthlyPayments: [
      "debtConsolidationMonthlyPayments",
      "debtMonthlyPayments",
      "monthlyDebtPayments",
      "currentDebtPayments",
    ],
    refinanceGoal: ["refinanceGoal", "refiGoal", "goal"],
    cashOutGoal: ["cashOutGoal", "cashOutPurpose", "cashOutReason"],
    creditScore: ["creditScore", "fico", "ficoScore"],
    loanType: ["loanType", "loanProgram", "program", "loanTypePreference"],
    occupancy: ["occupancy", "propertyUse"],
    zipCode: ["zipCode", "zip", "propertyZip"],
    propertyTaxes: ["propertyTaxes", "taxes", "monthlyPropertyTaxes", "monthlyTaxes"],
    homeownersInsurance: ["homeownersInsurance", "insurance", "monthlyHomeownersInsurance", "monthlyInsurance"],
    hoaDues: ["hoaDues", "hoa", "monthlyHoa", "monthlyHoaDues"],
  };

  for (const [targetKey, keys] of Object.entries(aliases)) {
    const matchedKey = keys.find((key) => source[key] !== undefined && source[key] !== null && source[key] !== "");
    if (!matchedKey) continue;
    normalized[targetKey] = source[matchedKey];
  }

  if (normalized.loanPurpose) normalized.loanPurpose = normalizeLoanPurposeValue(normalized.loanPurpose);
  if (normalized.loanType) normalized.loanType = normalizeLoanTypeValue(normalized.loanType);
  if (normalized.occupancy) normalized.occupancy = normalizeOccupancy(normalized.occupancy);
  if (normalized.refinancePurpose) {
    normalized.refinancePurpose = normalizeRefinancePurposeValue(normalized.refinancePurpose);
  }

  for (const key of [
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
    "desiredCashOut",
    "requestedCashOut",
    "estimatedNewLoanAmount",
    "newLoanAmount",
    "newInterestRate",
    "newLoanTermYears",
    "estimatedClosingCosts",
    "debtConsolidationAmount",
    "debtConsolidationMonthlyPayments",
    "creditScore",
    "zipCode",
    "propertyTaxes",
    "homeownersInsurance",
    "hoaDues",
  ]) {
    if (normalized[key] !== undefined) {
      normalized[key] = String(normalized[key]).replace(/[^\d.]/g, "");
    }
  }

  if (normalized.zipCode) normalized.zipCode = normalized.zipCode.slice(0, 5);

  return normalizeRefinanceScenarioFields(normalized);
}

export function buildScenarioDiff(before, after) {
  const diff = {};
  const fields = [
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
    "desiredCashOut",
    "requestedCashOut",
    "estimatedNewLoanAmount",
    "newLoanAmount",
    "newInterestRate",
    "newLoanTermYears",
    "estimatedClosingCosts",
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

  for (const field of fields) {
    const nextValue = after?.[field];
    if (nextValue === undefined || nextValue === null || nextValue === "") continue;
    if (String(nextValue) === String(before?.[field] ?? "")) continue;
    diff[field] = nextValue;
  }

  return diff;
}
