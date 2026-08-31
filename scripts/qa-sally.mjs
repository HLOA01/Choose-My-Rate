import { createEmptyScenario, processSallyMessage } from "../src/SallyBrain.js";
import {
  buildScenarioDiff,
  normalizeRefinanceScenarioFields,
  toNumber,
} from "../src/scenario/scenarioUtils.js";
import { buildRefinanceComparison } from "../src/utils/refinanceComparison.js";
import { buildDebtConsolidationComparison } from "../src/utils/debtConsolidationComparison.js";

const REFINANCE_COLLECTION_FIELDS = [
  {
    key: "propertyValue",
    question: "What is the estimated property value?",
    valueType: "money",
  },
  {
    key: "currentLoanBalance",
    question: "About how much do you currently owe on the property?",
    valueType: "money",
  },
  {
    key: "currentInterestRate",
    question: "What is your current interest rate?",
    valueType: "rate",
  },
  {
    key: "currentRemainingTermYears",
    question: "About how many years are left on your current loan?",
    valueType: "years",
  },
  {
    key: "newLoanAmount",
    question: "What new loan amount would you like to compare?",
    valueType: "money",
  },
  {
    key: "newInterestRate",
    question: "What new interest rate should I compare?",
    valueType: "rate",
  },
  {
    key: "newLoanTermYears",
    question: "What new loan term should I use, such as 15, 20, or 30 years?",
    valueType: "years",
  },
  {
    key: "estimatedClosingCosts",
    question: "What estimated closing costs should I use? If there are none, you can enter 0.",
    valueType: "money",
  },
  {
    key: "requestedCashOut",
    question: "How much cash would you like to take out?",
    valueType: "money",
    cashOutOnly: true,
  },
];

const tests = [];
const LENDER_NAME_PATTERN = /\b(PRMG|rocket|loanDepot|guaranteed rate|uwm|pennyMac|caliber|crosscountry)\b/i;
const POSITIVE_LOCK_PATTERN = /\b(rate|pricing)\s+(?:is|was|has been|looks)\s+locked\b|\blocked in\b/i;
const APPROVAL_PATTERN = /\b(?:you are|you're|loan is|refinance is|scenario is)\s+approved\b|\bapproved for\b/i;
const GUARANTEE_PATTERN = /\bguaranteed\b|\bguarantee\b/i;

function normalizeIntentText(value) {
  return String(value || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasScenarioValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function isRefinancePurpose(value) {
  return value === "rate_term_refinance" || value === "cash_out_refinance";
}

function detectRefinancePurposeDetail(value) {
  const text = normalizeIntentText(value);
  if (/\b(debt|consolidat|credit card|pay off credit|payoff credit|pay off card|payoff card)\b/.test(text)) {
    return "debt_consolidation";
  }
  if (/\b(cash out|cashout|take cash|take out cash|take equity|pull equity|equity out)\b/.test(text)) {
    return "cash_out";
  }
  if (/\b(shorter term|shorten term|shorten the term|15 year|20 year|pay off faster|pay loan off faster)\b/.test(text)) {
    return "shorten_term";
  }
  if (/\b(lower payment|lower my payment|save monthly|monthly savings|reduce payment)\b/.test(text)) {
    return "lower_payment";
  }
  return "";
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatRefinancePurposeDetail(value) {
  const labels = {
    lower_payment: "lower payment",
    cash_out: "cash out",
    debt_consolidation: "debt consolidation",
    shorten_term: "shorter term",
    unknown: "not sure yet",
  };

  return labels[value] || labels.unknown;
}

function getRefinanceCollectionFields(scenario) {
  const source = normalizeRefinanceScenarioFields(scenario);
  return REFINANCE_COLLECTION_FIELDS.filter((field) => {
    if (!field.cashOutOnly) return true;
    return source.loanPurpose === "cash_out_refinance";
  });
}

function getNextMissingRefinanceCollectionField(scenario) {
  const source = normalizeRefinanceScenarioFields(scenario);
  return getRefinanceCollectionFields(source).find((field) => !hasScenarioValue(source[field.key])) || null;
}

function parseGuidedNumber(value) {
  const text = String(value || "").replace(/,/g, "").toLowerCase();
  const match = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/);
  if (!match) return "";

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return "";

  const suffix = match[2] || "";
  if (suffix === "k" || suffix === "thousand") return String(Math.round(numeric * 1000));
  if (suffix === "m" || suffix === "million") return String(Math.round(numeric * 1000000));
  return String(numeric);
}

function parseGuidedValue(value, valueType) {
  const text = normalizeIntentText(value);
  if (valueType === "money" && /\b(no|none|zero)\b/.test(text)) return "0";

  const numericValue = parseGuidedNumber(value);
  if (!numericValue) return "";

  if (valueType === "money") return String(Math.round(Number(numericValue)));
  if (valueType === "rate") return Number(numericValue).toFixed(3);
  if (valueType === "years") return String(Number(numericValue));
  return numericValue;
}

function getExplicitRefinanceUpdates(value) {
  const source = String(value || "");
  const updates = {};
  const extractMoney = (patterns) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      const parsed = parseGuidedValue(match[0], "money");
      if (parsed !== "") return parsed;
    }
    return "";
  };
  const extractNumber = (patterns, valueType) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      const parsed = parseGuidedValue(match[0], valueType);
      if (parsed !== "") return parsed;
    }
    return "";
  };

  const propertyValue = extractMoney([
    /\b(?:property value|home value|house value|estimated value)(?:\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:property value|home value|house value)/i,
  ]);
  const currentLoanBalance = extractMoney([
    /\b(?:current loan balance|loan balance|mortgage balance|payoff|owe)(?:\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:current loan balance|loan balance|mortgage balance|payoff)/i,
  ]);
  const newLoanAmount = extractMoney([
    /\b(?:new loan amount|new loan|refinance amount)(?:\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:new loan amount|new loan|refinance amount)/i,
  ]);
  const estimatedClosingCosts = extractMoney([
    /\b(?:estimated closing costs|closing costs|costs)(?:\s+are|\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:closing costs|costs)/i,
  ]);
  const requestedCashOut = extractMoney([
    /\b(?:requested cash out|cash out|cash-out|take out)(?:\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:cash out|cash-out|cash back)/i,
  ]);
  const debtConsolidationAmount = extractMoney([
    /\b(?:debt|credit card debt|debt consolidation amount|pay off debt)(?:\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:debt|credit card debt|credit cards)/i,
  ]);
  const debtConsolidationMonthlyPayments = extractMoney([
    /\b(?:monthly debt payments|debt payments|credit card payments|monthly payments on those debts)(?:\s+are|\s+is|\s+of)?\s+\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?/i,
    /\$?\s*\d+(?:\.\d+)?\s*(?:per month|monthly)\s*(?:on debt|for debt|for credit cards|debt payments)?/i,
  ]);
  const currentInterestRate = extractNumber([
    /\b(?:current interest rate|current rate)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*%?/i,
  ], "rate");
  const newInterestRate = extractNumber([
    /\b(?:new interest rate|new rate|refinance rate)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*%?/i,
  ], "rate");
  const currentRemainingTermYears = extractNumber([
    /\b(?:current remaining term|remaining term|years left)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*(?:years|year|yrs|yr)?/i,
    /\b\d+(?:\.\d+)?\s*(?:years|year|yrs|yr)\s+(?:left|remaining)/i,
  ], "years");
  const newLoanTermYears = extractNumber([
    /\b(?:new loan term|new term|refinance term)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*(?:years|year|yrs|yr)?/i,
    /\b(?:15|20|25|30)\s*(?:year|years|yr|yrs)\b/i,
  ], "years");

  if (propertyValue) updates.propertyValue = propertyValue;
  if (currentLoanBalance) updates.currentLoanBalance = currentLoanBalance;
  if (currentInterestRate) updates.currentInterestRate = currentInterestRate;
  if (currentRemainingTermYears) updates.currentRemainingTermYears = currentRemainingTermYears;
  if (newLoanAmount) updates.newLoanAmount = newLoanAmount;
  if (newInterestRate) updates.newInterestRate = newInterestRate;
  if (newLoanTermYears) updates.newLoanTermYears = newLoanTermYears;
  if (estimatedClosingCosts) updates.estimatedClosingCosts = estimatedClosingCosts;
  if (requestedCashOut) updates.requestedCashOut = requestedCashOut;
  if (debtConsolidationAmount) updates.debtConsolidationAmount = debtConsolidationAmount;
  if (debtConsolidationMonthlyPayments) updates.debtConsolidationMonthlyPayments = debtConsolidationMonthlyPayments;

  return updates;
}

function buildGuidedRefinanceScenario(currentScenario, localScenario, userText) {
  const current = normalizeRefinanceScenarioFields(currentScenario);
  let next = normalizeRefinanceScenarioFields(localScenario);
  const explicitUpdates = getExplicitRefinanceUpdates(userText);
  const refinancePurpose = detectRefinancePurposeDetail(userText);
  const nextMissingFromCurrent = getNextMissingRefinanceCollectionField(current);

  if (refinancePurpose) {
    explicitUpdates.refinancePurpose = refinancePurpose;
    if (refinancePurpose === "debt_consolidation") explicitUpdates.cashOutPurpose = refinancePurpose;
  }

  if (
    nextMissingFromCurrent?.key === "currentRemainingTermYears" &&
    explicitUpdates.newLoanTermYears &&
    !explicitUpdates.currentRemainingTermYears &&
    !/\b(?:new loan term|new term|refinance term)\b/i.test(userText)
  ) {
    explicitUpdates.currentRemainingTermYears = explicitUpdates.newLoanTermYears;
    delete explicitUpdates.newLoanTermYears;
  }

  if (Object.keys(explicitUpdates).length) {
    next = normalizeRefinanceScenarioFields({ ...next, ...explicitUpdates });

    if (explicitUpdates.requestedCashOut && !explicitUpdates.newLoanAmount) {
      const currentLoanBalance = toNumber(next.currentLoanBalance);
      const requestedCashOut = toNumber(explicitUpdates.requestedCashOut);

      if (currentLoanBalance || requestedCashOut) {
        const newLoanAmount = String(Math.round(currentLoanBalance + requestedCashOut));
        next = normalizeRefinanceScenarioFields({
          ...next,
          loanAmount: newLoanAmount,
          newLoanAmount,
          estimatedNewLoanAmount: newLoanAmount,
        });
      }
    }
  } else if (current.refinancePurpose === "debt_consolidation" && !hasScenarioValue(current.debtConsolidationAmount)) {
    const guidedDebtAmount = parseGuidedValue(userText, "money");
    if (guidedDebtAmount !== "") next = normalizeRefinanceScenarioFields({ ...next, debtConsolidationAmount: guidedDebtAmount });
  } else if (current.refinancePurpose === "debt_consolidation" && !hasScenarioValue(current.debtConsolidationMonthlyPayments)) {
    const guidedDebtPayments = parseGuidedValue(userText, "money");
    if (guidedDebtPayments !== "") {
      next = normalizeRefinanceScenarioFields({ ...next, debtConsolidationMonthlyPayments: guidedDebtPayments });
    }
  } else if (current.refinancePurpose === "cash_out" && !hasScenarioValue(current.cashOutPurpose)) {
    const cashOutPurpose = String(userText || "").trim();
    if (cashOutPurpose) next = normalizeRefinanceScenarioFields({ ...next, cashOutPurpose, cashOutGoal: cashOutPurpose });
  } else if (isRefinancePurpose(current.loanPurpose) && nextMissingFromCurrent) {
    const guidedValue = parseGuidedValue(userText, nextMissingFromCurrent.valueType);
    if (guidedValue !== "") next = normalizeRefinanceScenarioFields({ ...next, [nextMissingFromCurrent.key]: guidedValue });
  }

  if (next.requestedCashOut && next.loanPurpose !== "cash_out_refinance") next.loanPurpose = "cash_out_refinance";

  if (
    (next.refinancePurpose === "cash_out" || next.refinancePurpose === "debt_consolidation") &&
    next.loanPurpose !== "cash_out_refinance"
  ) {
    next.loanPurpose = "cash_out_refinance";
  }

  return normalizeRefinanceScenarioFields(next);
}

function getRefinancePurposeFollowUp(scenario) {
  const source = normalizeRefinanceScenarioFields(scenario);
  if (source.refinancePurpose === "cash_out" && !hasScenarioValue(source.cashOutPurpose)) {
    return "What do you plan to use the cash out for?";
  }
  if (source.refinancePurpose === "debt_consolidation" && !hasScenarioValue(source.debtConsolidationAmount)) {
    return "About how much debt are you planning to pay off?";
  }
  if (source.refinancePurpose === "debt_consolidation" && !hasScenarioValue(source.debtConsolidationMonthlyPayments)) {
    return "About how much are the monthly payments on those debts right now?";
  }
  if (source.refinancePurpose === "lower_payment") {
    return "Got it - we'll compare your current payment against the new estimated payment.";
  }
  if (source.refinancePurpose === "shorten_term") {
    return "Got it - we'll compare the shorter term payment and long-term interest impact later.";
  }
  return "";
}

function buildGuidedRefinanceReply(scenario, localMessage = "") {
  const source = normalizeRefinanceScenarioFields(scenario);
  const purposeFollowUp = getRefinancePurposeFollowUp(source);
  const nextMissingField = getNextMissingRefinanceCollectionField(source);
  const prefix = localMessage && !/^got it\.?$/i.test(localMessage.trim()) ? `${localMessage} ` : "";

  if (
    purposeFollowUp &&
    ((source.refinancePurpose === "cash_out" && !hasScenarioValue(source.cashOutPurpose)) ||
      (source.refinancePurpose === "debt_consolidation" &&
        (!hasScenarioValue(source.debtConsolidationAmount) || !hasScenarioValue(source.debtConsolidationMonthlyPayments))))
  ) {
    return `${prefix}${purposeFollowUp}`.trim();
  }

  if (nextMissingField) {
    const purposeText =
      purposeFollowUp && (source.refinancePurpose === "lower_payment" || source.refinancePurpose === "shorten_term")
        ? `${purposeFollowUp} `
        : "";
    return `${prefix}${purposeText}${nextMissingField.question}`.trim();
  }

  const purposeText =
    source.refinancePurpose && source.refinancePurpose !== "unknown"
      ? ` for ${formatRefinancePurposeDetail(source.refinancePurpose)}`
      : "";

  return `Great, I have the core refinance inputs${purposeText}. The refinance comparison is ready, and you can ask me to explain it anytime.`;
}

function isRefinanceDataCollectionPrompt(value, scenario) {
  const text = normalizeIntentText(value);
  const purposeDetail = detectRefinancePurposeDetail(value);
  const source = normalizeRefinanceScenarioFields(scenario);
  const missingPurposeDetail =
    (source.refinancePurpose === "cash_out" && !hasScenarioValue(source.cashOutPurpose)) ||
    (source.refinancePurpose === "debt_consolidation" && !hasScenarioValue(source.debtConsolidationAmount));
  const isRefinanceStart =
    /\b(i want to refinance|refinance my house|refinance my home|cash out refinance|lower my payment|take cash out|compare my refinance)\b/.test(text) ||
    (/\b(refi|refinance)\b/.test(text) && /\b(start|begin|want|compare|house|home|payment|rate)\b/.test(text));

  if (isRefinanceStart || purposeDetail) return true;
  return isRefinancePurpose(source.loanPurpose) && (missingPurposeDetail || Boolean(getNextMissingRefinanceCollectionField(source)));
}

function isRefinanceExplanationPrompt(value, scenario) {
  const text = normalizeIntentText(value);
  const loanPurpose = scenario?.loanPurpose || "";
  const hasRefinanceContext =
    isRefinancePurpose(loanPurpose) ||
    /\b(refi|refinance|cash out|cashout|break even|current loan|new loan)\b/.test(text);

  if (!hasRefinanceContext) return false;

  return (
    /\bexplain\b.*\b(refi|refinance|cash out|cashout)\b/.test(text) ||
    /\b(refi|refinance|cash out|cashout)\b.*\b(make sense|good|worth it|explain)\b/.test(text) ||
    /\bhow much\b.*\b(sav|cash out|cash|getting)\b/.test(text) ||
    /\bwhat(?:'s| is)?\b.*\bbreak even\b/.test(text) ||
    /\bbreak even\b/.test(text) ||
    /\bcompare\b.*\b(current loan|new loan|refi|refinance)\b/.test(text) ||
    /\bcurrent loan\b.*\bnew loan\b/.test(text)
  );
}

function buildRefinanceComparisonInput(scenario, pricing = {}) {
  const source = normalizeRefinanceScenarioFields(scenario);
  return {
    propertyValue: source.propertyValue,
    currentLoanBalance: source.currentLoanBalance,
    currentInterestRate: source.currentInterestRate,
    currentLoanTermYears: source.currentLoanTermYears,
    currentRemainingTermYears: source.currentRemainingTermYears,
    newLoanAmount: source.newLoanAmount,
    newInterestRate: source.newInterestRate || pricing.rate,
    newLoanTermYears: source.newLoanTermYears,
    estimatedClosingCosts: source.estimatedClosingCosts || pricing.estimatedCashToClose,
    requestedCashOut: source.requestedCashOut,
  };
}

function getMissingRefinanceExplanationFields(scenario, pricing = {}) {
  const source = normalizeRefinanceScenarioFields(scenario);
  const input = buildRefinanceComparisonInput(source, pricing);
  const missingFields = [
    ["propertyValue", "property value"],
    ["currentLoanBalance", "current loan balance"],
    ["currentInterestRate", "current interest rate"],
    ["currentRemainingTermYears", "current remaining term in years"],
    ["newLoanAmount", "new loan amount"],
    ["newInterestRate", "new interest rate"],
    ["newLoanTermYears", "new loan term in years"],
    ["estimatedClosingCosts", "estimated closing costs, or 0 if there are none"],
  ].filter(([key]) => !hasScenarioValue(input[key])).map(([, label]) => label);

  if (source.loanPurpose === "cash_out_refinance" && !hasScenarioValue(input.requestedCashOut)) {
    missingFields.push("requested cash out");
  }

  return missingFields;
}

function formatRefinanceMoney(value) {
  return formatMoney(value) || "not available";
}

function formatRefinancePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "not available";
  return `${numeric.toFixed(2)}%`;
}

function formatRefinanceType(value) {
  if (value === "cash_out") return "cash-out refinance";
  if (value === "rate_and_term") return "rate-and-term refinance";
  return "refinance";
}

function formatCashFlowImpact(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "not available";
  if (numeric > 0) return `${formatRefinanceMoney(numeric)} improvement`;
  if (numeric < 0) return `${formatRefinanceMoney(Math.abs(numeric))} reduction`;
  return "$0 change";
}

function buildMissingRefinanceInputsReply(missingFields) {
  const fieldList = missingFields.slice(0, 4).join(", ");
  const extraCount = missingFields.length - 4;
  const extraText = extraCount > 0 ? `, plus ${extraCount} more item${extraCount === 1 ? "" : "s"}` : "";

  return `I can explain the refinance once I have the key comparison inputs. Please add ${fieldList}${extraText}.`;
}

function buildMissingDebtConsolidationReply(scenario) {
  if (!hasScenarioValue(scenario.debtConsolidationAmount)) {
    return "About how much total debt are you planning to pay off?";
  }
  if (!hasScenarioValue(scenario.debtConsolidationMonthlyPayments)) {
    return "About how much are the monthly payments on those debts right now?";
  }
  return "";
}

function buildSallyRefinanceExplanation(scenario, pricing = {}) {
  const normalizedScenario = normalizeRefinanceScenarioFields(scenario);
  const missingFields = getMissingRefinanceExplanationFields(normalizedScenario, pricing);

  if (missingFields.length) return buildMissingRefinanceInputsReply(missingFields);

  if (normalizedScenario.refinancePurpose === "debt_consolidation") {
    const missingDebtReply = buildMissingDebtConsolidationReply(normalizedScenario);
    if (missingDebtReply) return missingDebtReply;
  }

  const comparison = buildRefinanceComparison(buildRefinanceComparisonInput(normalizedScenario, pricing));
  const debtComparison = buildDebtConsolidationComparison({
    debtConsolidationAmount: normalizedScenario.debtConsolidationAmount,
    debtConsolidationMonthlyPayments: normalizedScenario.debtConsolidationMonthlyPayments,
    refinancePaymentChange: comparison.monthlyPaymentDifference,
  });
  const paymentDifference = Number(comparison.monthlyPaymentDifference);
  const paymentText =
    Number.isFinite(paymentDifference) && paymentDifference < 0
      ? `That is about ${formatRefinanceMoney(Math.abs(paymentDifference))} lower per month.`
      : Number.isFinite(paymentDifference) && paymentDifference > 0
        ? `That is about ${formatRefinanceMoney(paymentDifference)} higher per month.`
        : "That is about the same monthly principal and interest payment.";
  const breakEvenText = comparison.breakevenMonths
    ? `The estimated break-even point is about ${comparison.breakevenMonths} months.`
    : "There is no break-even month shown yet because the new payment is not lower than the current payment, or closing costs are not available.";
  const cashOutText =
    comparison.cashOutExceedsAvailableEquity
      ? "The requested cash out may be higher than the available equity based on the property value and current balance entered."
      : comparison.refinanceType === "cash_out" && comparison.cashOutAmount > 0
        ? `Estimated cash out is ${formatRefinanceMoney(comparison.cashOutAmount)}, and estimated net cash to the borrower is ${formatRefinanceMoney(comparison.netCashToBorrower)} after closing costs.`
        : `This is showing as a ${formatRefinanceType(comparison.refinanceType)} with no cash out amount shown yet.`;
  const purposeText =
    normalizedScenario.refinancePurpose && normalizedScenario.refinancePurpose !== "unknown"
      ? `Your stated refinance purpose is ${formatRefinancePurposeDetail(normalizedScenario.refinancePurpose)}.`
      : "";
  const debtConsolidationText =
    normalizedScenario.refinancePurpose === "debt_consolidation"
      ? `For debt consolidation, you entered ${formatRefinanceMoney(debtComparison.debtConsolidationAmount)} of debts being paid off and ${formatRefinanceMoney(debtComparison.currentDebtMonthlyPayments)} in current monthly debt payments. The simple estimated monthly cash-flow impact is ${formatCashFlowImpact(debtComparison.estimatedMonthlyCashFlowImprovement)}. This does not calculate interest savings or debt payoff timelines.`
      : "";

  const guardrailText =
    "Savings, break-even timing, cash-out proceeds, and debt consolidation cash-flow impact are estimates for comparison only. Program and cash-out eligibility are subject to final underwriting. Lender disclosures are provided during the official loan process. This is not a loan approval, and rates are not locked.";

  return [
    "Here is the refinance comparison in plain English.",
    purposeText,
    `The current principal and interest payment is ${formatRefinanceMoney(comparison.currentMonthlyPrincipalAndInterest)}.`,
    `The new principal and interest payment is ${formatRefinanceMoney(comparison.newMonthlyPrincipalAndInterest)}.`,
    paymentText,
    `Estimated closing costs are ${formatRefinanceMoney(comparison.totalEstimatedClosingCosts)}.`,
    cashOutText,
    debtConsolidationText,
    breakEvenText,
    `The new loan-to-value is ${formatRefinancePercent(comparison.newLoanToValue)}, and the refinance type is ${formatRefinanceType(comparison.refinanceType)}.`,
    guardrailText,
  ].filter(Boolean).join(" ");
}

function sendSallyTurn(currentScenario, userText, pricing = {}) {
  const currentScenarioSnapshot = { ...currentScenario };
  const localResult = processSallyMessage(userText, currentScenarioSnapshot);
  const localScenarioUpdates = buildScenarioDiff(currentScenarioSnapshot, localResult?.scenario);
  const guidedRefinanceScenario = normalizeRefinanceScenarioFields(
    buildGuidedRefinanceScenario(
      currentScenarioSnapshot,
      localResult?.scenario || currentScenarioSnapshot,
      userText,
    ),
  );
  const hadMissingGuidedRefinanceField = Boolean(getNextMissingRefinanceCollectionField(currentScenarioSnapshot));
  const shouldCollectRefinanceData =
    isRefinanceDataCollectionPrompt(userText, guidedRefinanceScenario) ||
    (isRefinancePurpose(guidedRefinanceScenario.loanPurpose) && hadMissingGuidedRefinanceField);
  const hasMissingGuidedRefinanceField = Boolean(getNextMissingRefinanceCollectionField(guidedRefinanceScenario));
  let message = localResult?.message || "";
  let route = "local";

  if (
    shouldCollectRefinanceData &&
    (hasMissingGuidedRefinanceField || !isRefinanceExplanationPrompt(userText, guidedRefinanceScenario))
  ) {
    message = buildGuidedRefinanceReply(guidedRefinanceScenario, localResult?.message || "");
    route = "refinance_collection";
  } else if (isRefinanceExplanationPrompt(userText, guidedRefinanceScenario)) {
    message = buildSallyRefinanceExplanation(guidedRefinanceScenario, pricing);
    route = "refinance_explanation";
  }

  return {
    route,
    message,
    scenario: guidedRefinanceScenario,
    updates: buildScenarioDiff(currentScenarioSnapshot, guidedRefinanceScenario),
    localScenarioUpdates,
  };
}

function addTest(category, name, turns, options = {}) {
  tests.push({ category, name, turns, options });
}

function assert(condition, message, actual) {
  return condition ? null : { message, actual };
}

function messageIncludes(message, expected) {
  const source = String(message || "").toLowerCase();
  return [].concat(expected).every((item) => source.includes(String(item).toLowerCase()));
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

function runConversationTest(test) {
  let scenario = test.options.initialScenario || createEmptyScenario();
  const transcript = [];
  const failures = [];
  const seenMissingFields = [];

  for (const [index, turn] of test.turns.entries()) {
    const before = normalizeRefinanceScenarioFields(scenario);
    const result = sendSallyTurn(before, turn.user, test.options.pricing || {});
    const after = normalizeRefinanceScenarioFields(result.scenario);
    const nextMissing = getNextMissingRefinanceCollectionField(after);
    const beforeMissing = getNextMissingRefinanceCollectionField(before);

    transcript.push({
      turn: index + 1,
      user: turn.user,
      route: result.route,
      message: result.message,
      updates: result.updates,
      scenario: after,
      nextMissingField: nextMissing?.key || null,
    });

    failures.push(...assertSafeMessage(result.message));

    if (beforeMissing?.key && result.updates[beforeMissing.key] === undefined && !turn.allowNoMissingFieldUpdate) {
      failures.push(assert(false, "Sally should not skip the next required missing field", {
        expectedField: beforeMissing.key,
        updates: result.updates,
        user: turn.user,
      }));
    }

    if (turn.expectRoute) {
      failures.push(assert(result.route === turn.expectRoute, "Expected Sally route", result.route));
    }

    if (turn.expectMessageIncludes) {
      failures.push(assert(messageIncludes(result.message, turn.expectMessageIncludes), "Expected Sally next question/message", result.message));
    }

    if (turn.expectMessageExcludes) {
      for (const excluded of [].concat(turn.expectMessageExcludes)) {
        failures.push(assert(!String(result.message || "").toLowerCase().includes(String(excluded).toLowerCase()), "Sally message should not include text", {
          excluded,
          message: result.message,
        }));
      }
    }

    if (turn.expectUpdates) {
      for (const [field, expectedValue] of Object.entries(turn.expectUpdates)) {
        failures.push(assert(String(result.updates[field] ?? after[field] ?? "") === String(expectedValue), `Expected field update: ${field}`, {
          expectedValue,
          updates: result.updates,
          scenarioValue: after[field],
        }));
      }
    }

    if (turn.expectScenario) {
      for (const [field, expectedValue] of Object.entries(turn.expectScenario)) {
        failures.push(assert(String(after[field] ?? "") === String(expectedValue), `Expected scenario field: ${field}`, after[field]));
      }
    }

    if (turn.expectNextMissingField !== undefined) {
      failures.push(assert((nextMissing?.key || null) === turn.expectNextMissingField, "Expected next missing field", nextMissing?.key || null));
    }

    if (beforeMissing?.key && result.updates[beforeMissing.key] !== undefined) {
      seenMissingFields.push(beforeMissing.key);
    }
    scenario = after;
  }

  if (test.options.expectedMissingOrder) {
    const observed = seenMissingFields.slice(0, test.options.expectedMissingOrder.length);
    failures.push(assert(
      JSON.stringify(observed) === JSON.stringify(test.options.expectedMissingOrder),
      "Expected required-field order",
      observed,
    ));
  }

  return {
    category: test.category,
    scenarioName: test.name,
    inputs: test.turns.map((turn) => turn.user),
    expectedResult: {
      turns: test.turns.map((turn) => ({
        expectRoute: turn.expectRoute,
        expectMessageIncludes: turn.expectMessageIncludes,
        expectUpdates: turn.expectUpdates,
        expectScenario: turn.expectScenario,
        expectNextMissingField: turn.expectNextMissingField,
      })),
      expectedMissingOrder: test.options.expectedMissingOrder,
    },
    actualResult: transcript,
    pass: failures.filter(Boolean).length === 0,
    failures: failures.filter(Boolean),
  };
}

const completeRateTermScenario = {
  ...createEmptyScenario(),
  loanPurpose: "rate_term_refinance",
  refinancePurpose: "lower_payment",
  propertyValue: "650000",
  estimatedPropertyValue: "650000",
  currentLoanBalance: "400000",
  loanAmount: "400000",
  newLoanAmount: "400000",
  estimatedNewLoanAmount: "400000",
  currentInterestRate: "7.000",
  currentRemainingTermYears: "27",
  newInterestRate: "6.000",
  newLoanTermYears: "30",
  estimatedClosingCosts: "6000",
};

addTest("basic refinance start flow", "Starts refinance and asks property value", [
  {
    user: "I want to refinance",
    expectRoute: "refinance_collection",
    expectScenario: { loanPurpose: "rate_term_refinance" },
    expectMessageIncludes: "estimated property value",
    expectNextMissingField: "propertyValue",
    allowNoMissingFieldUpdate: true,
  },
]);

addTest("rate-and-term refinance with savings", "Collects rate-and-term fields and explains savings", [
  { user: "I want to refinance", expectRoute: "refinance_collection", expectNextMissingField: "propertyValue", allowNoMissingFieldUpdate: true },
  { user: "500k", expectUpdates: { propertyValue: "500000" }, expectMessageIncludes: "currently owe", expectNextMissingField: "currentLoanBalance" },
  { user: "300k", expectUpdates: { currentLoanBalance: "300000" }, expectMessageIncludes: "current interest rate", expectNextMissingField: "currentInterestRate" },
  { user: "6.25", expectUpdates: { currentInterestRate: "6.250" }, expectMessageIncludes: "years are left", expectNextMissingField: "currentRemainingTermYears" },
  { user: "28 years", expectUpdates: { currentRemainingTermYears: "28" }, expectMessageIncludes: "new interest rate", expectNextMissingField: "newInterestRate" },
  { user: "new rate is 5.75", expectUpdates: { newInterestRate: "5.750" }, expectMessageIncludes: "new loan term", expectNextMissingField: "newLoanTermYears" },
  { user: "30 years", expectUpdates: { newLoanTermYears: "30" }, expectMessageIncludes: "closing costs", expectNextMissingField: "estimatedClosingCosts" },
  { user: "0", expectUpdates: { estimatedClosingCosts: "0" }, expectMessageIncludes: "comparison is ready", expectNextMissingField: null },
  { user: "explain my refinance", expectRoute: "refinance_explanation", expectMessageIncludes: ["current principal", "new principal", "lower per month"] },
], {
  expectedMissingOrder: [
    "propertyValue",
    "currentLoanBalance",
    "currentInterestRate",
    "currentRemainingTermYears",
    "newInterestRate",
    "newLoanTermYears",
    "estimatedClosingCosts",
  ],
});

addTest("cash-out refinance", "Collects cash-out purpose and requested amount", [
  { user: "cash out refinance", expectRoute: "refinance_collection", expectScenario: { loanPurpose: "cash_out_refinance", refinancePurpose: "cash_out" }, expectMessageIncludes: "estimated property value", expectNextMissingField: "propertyValue", allowNoMissingFieldUpdate: true },
  { user: "700k", expectUpdates: { propertyValue: "700000" }, expectMessageIncludes: "currently owe", expectNextMissingField: "currentLoanBalance" },
  { user: "420k", expectUpdates: { currentLoanBalance: "420000" }, expectMessageIncludes: "current interest rate", expectNextMissingField: "currentInterestRate" },
  { user: "current rate is 6.875", expectUpdates: { currentInterestRate: "6.875" }, expectMessageIncludes: "years are left", expectNextMissingField: "currentRemainingTermYears" },
  { user: "25 years", expectUpdates: { currentRemainingTermYears: "25" }, expectMessageIncludes: "new interest rate", expectNextMissingField: "newInterestRate" },
  { user: "new rate is 6.5", expectUpdates: { newInterestRate: "6.500" }, expectMessageIncludes: "new loan term", expectNextMissingField: "newLoanTermYears" },
  { user: "30 years", expectUpdates: { newLoanTermYears: "30" }, expectMessageIncludes: "closing costs", expectNextMissingField: "estimatedClosingCosts" },
  { user: "8000", expectUpdates: { estimatedClosingCosts: "8000" }, expectMessageIncludes: "cash", expectNextMissingField: "requestedCashOut" },
  { user: "50000", expectUpdates: { requestedCashOut: "50000" }, expectMessageIncludes: "comparison is ready", expectNextMissingField: null },
]);

addTest("debt consolidation refinance", "Collects debt details before core refinance fields", [
  { user: "I want to consolidate debt", expectScenario: { loanPurpose: "cash_out_refinance", refinancePurpose: "debt_consolidation" }, expectMessageIncludes: "how much debt", allowNoMissingFieldUpdate: true },
  { user: "45k", expectUpdates: { debtConsolidationAmount: "45000" }, expectMessageIncludes: "monthly payments", allowNoMissingFieldUpdate: true },
  { user: "950", expectUpdates: { debtConsolidationMonthlyPayments: "950" }, expectMessageIncludes: "estimated property value", expectNextMissingField: "propertyValue", allowNoMissingFieldUpdate: true },
  { user: "650k", expectUpdates: { propertyValue: "650000" }, expectNextMissingField: "currentLoanBalance" },
  { user: "390k", expectUpdates: { currentLoanBalance: "390000" }, expectNextMissingField: "currentInterestRate" },
  { user: "7", expectUpdates: { currentInterestRate: "7.000" }, expectNextMissingField: "currentRemainingTermYears" },
  { user: "26 years", expectUpdates: { currentRemainingTermYears: "26" }, expectNextMissingField: "newInterestRate" },
  { user: "new rate is 6.5", expectUpdates: { newInterestRate: "6.500" }, expectNextMissingField: "newLoanTermYears" },
  { user: "30 years", expectUpdates: { newLoanTermYears: "30" }, expectNextMissingField: "estimatedClosingCosts" },
  { user: "8000", expectUpdates: { estimatedClosingCosts: "8000" }, expectNextMissingField: "requestedCashOut" },
  { user: "65000", expectUpdates: { requestedCashOut: "65000" }, expectMessageIncludes: "comparison is ready", expectNextMissingField: null },
  { user: "explain my refinance", expectRoute: "refinance_explanation", expectMessageIncludes: ["debt consolidation", "cash-flow impact", "not a loan approval"] },
]);

addTest("lower-payment refinance", "Acknowledges lower-payment purpose and keeps required-field flow", [
  { user: "I want to lower my payment", expectScenario: { refinancePurpose: "lower_payment" }, expectMessageIncludes: ["compare your current payment", "estimated property value"], expectNextMissingField: "propertyValue", allowNoMissingFieldUpdate: true },
  { user: "575k", expectUpdates: { propertyValue: "575000" }, expectNextMissingField: "currentLoanBalance" },
]);

addTest("shorten-term refinance", "Acknowledges shorten-term purpose and keeps required-field flow", [
  { user: "I want a shorter term", expectScenario: { refinancePurpose: "shorten_term" }, expectMessageIncludes: ["shorter term", "estimated property value"], expectNextMissingField: "propertyValue", allowNoMissingFieldUpdate: true },
  { user: "600k", expectUpdates: { propertyValue: "600000" }, expectNextMissingField: "currentLoanBalance" },
]);

addTest("missing input recovery", "Explanation with missing fields asks for missing inputs then recovers", [
  {
    user: "explain my refinance",
    expectRoute: "refinance_collection",
    expectMessageIncludes: "estimated property value",
    allowNoMissingFieldUpdate: true,
  },
  { user: "property value is 550k", expectUpdates: { propertyValue: "550000" }, expectMessageIncludes: "currently owe", expectNextMissingField: "currentLoanBalance" },
  { user: "I owe 350k", expectUpdates: { currentLoanBalance: "350000" }, expectMessageIncludes: "current interest rate", expectNextMissingField: "currentInterestRate" },
], {
  initialScenario: { ...createEmptyScenario(), loanPurpose: "rate_term_refinance" },
});

addTest("explicit field update phrases", "Explicit field phrases update the intended fields", [
  {
    user: "new rate is 6.5 and closing costs are 7500",
    expectUpdates: { newInterestRate: "6.500", estimatedClosingCosts: "7500" },
    expectMessageIncludes: "estimated property value",
    allowNoMissingFieldUpdate: true,
  },
], {
  initialScenario: { ...createEmptyScenario(), loanPurpose: "rate_term_refinance" },
});

addTest("short replies", "Short numeric replies map to the current missing field including zero", [
  { user: "6.25", expectUpdates: { currentInterestRate: "6.250" }, expectNextMissingField: "currentRemainingTermYears" },
  { user: "28 years", expectUpdates: { currentRemainingTermYears: "28" }, expectNextMissingField: "newInterestRate" },
  { user: "5.75", expectUpdates: { newInterestRate: "5.750" }, expectNextMissingField: "newLoanTermYears" },
  { user: "30 years", expectUpdates: { newLoanTermYears: "30" }, expectNextMissingField: "estimatedClosingCosts" },
  { user: "0", expectUpdates: { estimatedClosingCosts: "0" }, expectMessageIncludes: "comparison is ready", expectNextMissingField: null },
], {
  initialScenario: {
    ...createEmptyScenario(),
    loanPurpose: "rate_term_refinance",
    propertyValue: "500000",
    estimatedPropertyValue: "500000",
    currentLoanBalance: "300000",
    loanAmount: "300000",
    newLoanAmount: "300000",
    estimatedNewLoanAmount: "300000",
  },
});

addTest("refinance explanation complete", "Explains complete refinance after all required fields are present", [
  {
    user: "does this refinance make sense",
    expectRoute: "refinance_explanation",
    expectMessageIncludes: ["current principal", "new principal", "break-even", "not a loan approval"],
    allowNoMissingFieldUpdate: true,
  },
], {
  initialScenario: completeRateTermScenario,
});

addTest("purchase scenario sync", "Extracts purchase details from one borrower message", [
  {
    user: "I want to buy a home for $425,000. I have a 720 credit score, I want to put 5% down, taxes are about $400 per month, insurance is $150 per month, and there is no HOA.",
    expectRoute: "local",
    expectUpdates: {
      purchasePrice: "425000",
      downPayment: "21250",
      downPaymentPercent: "5.000",
      loanAmount: "403750",
      creditScore: "720",
      propertyTaxes: "400",
      homeownersInsurance: "150",
      hoaDues: "0",
    },
    expectMessageIncludes: ["$425,000 purchase price", "720 credit score", "$400/month in property taxes", "ZIP code"],
    expectMessageExcludes: "pricing",
    allowNoMissingFieldUpdate: true,
  },
], {
  initialScenario: { ...createEmptyScenario(), occupancy: "primary" },
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
