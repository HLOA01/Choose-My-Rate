/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { useSallyVoice } from "./hooks/useSallyVoice";
import { usePricingEngine } from "./hooks/usePricingEngine";
import { useScenarioComparison } from "./hooks/useScenarioComparison";
import { createEmptyScenario, processSallyMessage } from "./SallyBrain";
import { quotePricing } from "./pricingApi";
import { callSallyBrain, callSallyBrainStream } from "./sallyApi";
import { BorrowerGuidedFlow } from "./components/borrower/BorrowerGuidedFlow";
import { SavedScenarioRestore } from "./components/borrower/SavedScenarioRestore";
import { SallySideAssistant } from "./components/borrower/SallySideAssistant";
import { ComparisonPanel } from "./components/comparison/ComparisonPanel";
import { PricingEnginePanel } from "./components/pricing/PricingEnginePanel";
import { RefinanceComparisonPanel } from "./components/RefinanceComparisonPanel";
import { SallyPanel } from "./components/sally/SallyPanel";
import { ScenarioPanel } from "./components/scenario/ScenarioPanel";
import { getScenarioFields } from "./scenario/scenarioFields";
import { getRefinanceDemoPreset, REFINANCE_DEMO_PRESETS } from "./scenario/refinancePresets";
import {
  buildScenarioDiff,
  calculateDownPaymentPercent,
  normalizeRefinanceScenarioFields,
  normalizeScenarioUpdatesForUi,
  toNumber,
} from "./scenario/scenarioUtils";
import {
  clearGuestScenarioDraft,
  readGuestScenarioDraft,
  saveGuestScenarioDraft,
} from "./scenario/scenarioStorage";
import {
  adaptPricingOptionToPanel,
  buildPricingScenario,
  calculatePricing,
  getBaseRate,
} from "./pricing/pricingScenario";
import { buildScenarioVariant } from "./comparison/comparisonUtils";
import { buildRefinanceComparison } from "./utils/refinanceComparison";
import { buildDebtConsolidationComparison } from "./utils/debtConsolidationComparison";

const INITIAL_PROMPT =
  "Hi, I’m Sally. I can help you build your loan scenario and guide you step by step. Are you looking to buy a home, refinance, or take cash out?";

const CHAT_MODE_STORAGE_KEY = "choose-my-rate-sally-chat-mode";
const INITIAL_CONVERSATION_HISTORY = [{ role: "assistant", content: INITIAL_PROMPT }];
const FHA_COMPARISON_DOWN_PAYMENT_PERCENT = 3.5;
const STANDARD_CONVENTIONAL_DOWN_PAYMENT_PERCENT = 5;
const LOW_DOWN_CONVENTIONAL_DOWN_PAYMENT_PERCENT = 3;
const CONVENTIONAL_DOWN_PAYMENT_QUESTION =
  "For the Conventional option, would you like me to compare 3% down if eligible or 5% down as a standard Conventional loan?";
const REFINANCE_COLLECTION_FIELDS = [
  {
    key: "propertyValue",
    label: "property value",
    question: "What is the estimated property value?",
    valueType: "money",
  },
  {
    key: "currentLoanBalance",
    label: "current loan balance",
    question: "About how much do you currently owe on the property?",
    valueType: "money",
  },
  {
    key: "currentInterestRate",
    label: "current interest rate",
    question: "What is your current interest rate?",
    valueType: "rate",
  },
  {
    key: "currentRemainingTermYears",
    label: "current remaining term",
    question: "About how many years are left on your current loan?",
    valueType: "years",
  },
  {
    key: "newLoanAmount",
    label: "new loan amount",
    question: "What new loan amount would you like to compare?",
    valueType: "money",
  },
  {
    key: "newInterestRate",
    label: "new interest rate",
    question: "What new interest rate should I compare?",
    valueType: "rate",
  },
  {
    key: "newLoanTermYears",
    label: "new loan term",
    question: "What new loan term should I use, such as 15, 20, or 30 years?",
    valueType: "years",
  },
  {
    key: "estimatedClosingCosts",
    label: "estimated closing costs",
    question: "What estimated closing costs should I use? If there are none, you can enter 0.",
    valueType: "money",
  },
  {
    key: "requestedCashOut",
    label: "requested cash out",
    question: "How much cash would you like to take out?",
    valueType: "money",
    cashOutOnly: true,
  },
];

function getEarlySpeechCandidate(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  if (!sentenceMatches.length) return "";

  let candidate = "";
  for (const sentence of sentenceMatches) {
    candidate = `${candidate} ${sentence}`.trim();
    if (candidate.length >= 70 || /[?]$/.test(candidate) || candidate.length >= 180) {
      return candidate;
    }
  }

  return candidate.length >= 90 ? candidate : "";
}

function estimateSpeechDurationMs(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.round((words / 155) * 60_000) + 350);
}

function normalizeIntentText(value) {
  return String(value || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isFhaConventionalComparisonPrompt(value) {
  const text = normalizeIntentText(value);
  return text.includes("fha") && text.includes("conventional") && /\b(compare|comparison|both|side by side)\b/.test(text);
}

function isComparisonConfirmation(value) {
  const text = normalizeIntentText(value);
  return (
    text === "yes" ||
    text === "yeah" ||
    text === "yep" ||
    text === "sure" ||
    text.includes("yes compare") ||
    text.includes("compare it") ||
    text.includes("show me") ||
    text.includes("compare both") ||
    text.includes("compare them") ||
    text.includes("want to compare both") ||
    text.includes("i want to compare both")
  );
}

function parseConventionalDownPaymentPreference(value) {
  const text = normalizeIntentText(value);
  const percentMatches = Array.from(text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:percent|pct|down)?\b/g));
  const percent = percentMatches
    .map((match) => Number(match[1]))
    .find((candidate) => Number.isFinite(candidate) && candidate > 0 && candidate <= 100);

  if (Number.isFinite(percent)) return percent;
  if (/\bthree\b/.test(text)) return LOW_DOWN_CONVENTIONAL_DOWN_PAYMENT_PERCENT;
  if (/\bfive\b/.test(text)) return STANDARD_CONVENTIONAL_DOWN_PAYMENT_PERCENT;
  if (/\bstandard|safe|default|doesn t matter|you choose|whatever|not sure\b/.test(text)) {
    return STANDARD_CONVENTIONAL_DOWN_PAYMENT_PERCENT;
  }

  return null;
}

function hasConventionalDownPaymentPreference(scenario) {
  const percent = Number(scenario?.downPaymentPercent);
  return isConventionalLoanType(scenario?.loanType) && Number.isFinite(percent) && percent > 0;
}

function shouldOpenFhaConventionalComparison(userText, currentPrompt, conversationHistory) {
  if (!isComparisonConfirmation(userText)) return false;

  const lastAssistantMessage = [...conversationHistory]
    .reverse()
    .find((message) => message?.role === "assistant")?.content;

  return (
    isFhaConventionalComparisonPrompt(currentPrompt) ||
    isFhaConventionalComparisonPrompt(lastAssistantMessage)
  );
}

function selectDefaultComparisonOption(quote) {
  const options = Array.isArray(quote?.options) ? quote.options : [];
  return options[0] || null;
}

function buildComparisonPricing(option, scenario) {
  const fallbackRate = Number(option?.rate);
  const fallbackPricing = calculatePricing(
    scenario,
    Number.isFinite(fallbackRate) ? fallbackRate : getBaseRate(scenario),
  );

  return adaptPricingOptionToPanel(option, scenario, fallbackPricing);
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

function getComparisonMetric(side, keys) {
  const source = side && typeof side === "object" ? side : {};
  const pricing = source.pricing && typeof source.pricing === "object" ? source.pricing : {};
  const selectedOption =
    source.selectedOption && typeof source.selectedOption === "object" ? source.selectedOption : {};

  for (const key of keys) {
    if (pricing[key] !== undefined && pricing[key] !== null && pricing[key] !== "") return pricing[key];
    if (selectedOption[key] !== undefined && selectedOption[key] !== null && selectedOption[key] !== "") {
      return selectedOption[key];
    }
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }

  return "";
}

function formatComparisonDifference(difference, leftLabel, rightLabel, metricLabel) {
  const numeric = Number(difference);
  if (!Number.isFinite(numeric)) return `${metricLabel}: rate options are still being calculated.`;
  if (numeric === 0) return `${metricLabel}: both options are the same.`;

  const winner = numeric > 0 ? leftLabel : rightLabel;
  const loser = numeric > 0 ? rightLabel : leftLabel;
  return `${metricLabel}: ${winner} is ${formatMoney(Math.abs(numeric))} lower than ${loser}.`;
}

function describeLowerOption(difference, leftLabel, rightLabel, equalText) {
  const numeric = Number(difference);
  if (!Number.isFinite(numeric)) return "I am still checking that difference.";
  if (numeric === 0) return equalText;

  const winner = numeric > 0 ? leftLabel : rightLabel;
  const loser = numeric > 0 ? rightLabel : leftLabel;
  return `${winner} is lower than ${loser} by ${formatMoney(Math.abs(numeric))}.`;
}

function buildSallyComparisonSummary(comparison) {
  if (!comparison?.left?.pricing || !comparison?.right?.pricing) {
    return "I am opening the comparison, but one side still needs rate options before I can explain the tradeoff.";
  }

  const leftLabel = comparison.left.label || "FHA";
  const rightLabel = comparison.right.label || "Conventional";
  const deltas = comparison.summary?.deltas || {};
  const leftPayment = getComparisonMetric(comparison.left, ["total", "paymentPITI", "monthlyPayment"]);
  const rightPayment = getComparisonMetric(comparison.right, ["total", "paymentPITI", "monthlyPayment"]);
  const leftDownPaymentPercent = Number(comparison.left?.scenario?.downPaymentPercent);
  const rightDownPaymentPercent = Number(comparison.right?.scenario?.downPaymentPercent);
  const assumptionText = `I used ${leftLabel} at ${
    Number.isFinite(leftDownPaymentPercent) ? `${leftDownPaymentPercent}%` : "the selected"
  } down and ${rightLabel} at ${
    Number.isFinite(rightDownPaymentPercent) ? `${rightDownPaymentPercent}%` : "the selected"
  } down.`;

  return [
    `Here is the side-by-side comparison using the rate options loaded now.`,
    assumptionText,
    `${leftLabel} payment is ${formatMoney(leftPayment) || "not available"} and ${rightLabel} payment is ${formatMoney(rightPayment) || "not available"}.`,
    `Monthly payment: ${describeLowerOption(deltas.monthlyPayment?.difference, leftLabel, rightLabel, "both options have the same estimated payment")}`,
    `Upfront cash: ${describeLowerOption(deltas.cashToClose?.difference, leftLabel, rightLabel, "both options need about the same upfront cash")}`,
    `Mortgage insurance: ${describeLowerOption(deltas.mortgageInsurance?.difference, leftLabel, rightLabel, "both options have about the same mortgage insurance")}`,
    "These are estimates based on current 30-day rate options and are not locked until application and property address are complete.",
  ].join(" ");
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

function isRefinanceDataCollectionPrompt(value, scenario) {
  const text = normalizeIntentText(value);
  const purposeDetail = detectRefinancePurposeDetail(value);
  const source = normalizeRefinanceScenarioFields(scenario);
  const missingPurposeDetail =
    (source.refinancePurpose === "cash_out" && !hasScenarioValue(source.cashOutPurpose)) ||
    (source.refinancePurpose === "debt_consolidation" && !hasScenarioValue(source.debtConsolidationAmount));
  const isRefinanceStart =
    /\b(i want to refinance|refinance my house|refinance my home|cash out refinance|lower my payment|take cash out|compare my refinance)\b/.test(
      text,
    ) ||
    (/\b(refi|refinance)\b/.test(text) && /\b(start|begin|want|compare|house|home|payment|rate)\b/.test(text));

  if (isRefinanceStart || purposeDetail) return true;
  return (
    isRefinancePurpose(source.loanPurpose) &&
    (missingPurposeDetail || Boolean(getNextMissingRefinanceCollectionField(source)))
  );
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
    /\$?\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:per month|monthly)\s*(?:on debt|for debt|for credit cards|debt payments)?/i,
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
  const currentLoanTermYears = extractNumber([
    /\b(?:current loan term|original loan term)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*(?:years|year|yrs|yr)?/i,
  ], "years");
  const newLoanTermYears = extractNumber([
    /\b(?:new loan term|new term|refinance term)(?:\s+is|\s+of)?\s+\d+(?:\.\d+)?\s*(?:years|year|yrs|yr)?/i,
    /\b(?:15|20|25|30)\s*(?:year|years|yr|yrs)\b/i,
  ], "years");

  if (propertyValue) updates.propertyValue = propertyValue;
  if (currentLoanBalance) updates.currentLoanBalance = currentLoanBalance;
  if (currentInterestRate) updates.currentInterestRate = currentInterestRate;
  if (currentLoanTermYears) updates.currentLoanTermYears = currentLoanTermYears;
  if (currentRemainingTermYears) updates.currentRemainingTermYears = currentRemainingTermYears;
  if (newLoanAmount) updates.newLoanAmount = newLoanAmount;
  if (newInterestRate) updates.newInterestRate = newInterestRate;
  if (newLoanTermYears) updates.newLoanTermYears = newLoanTermYears;
  if (estimatedClosingCosts) updates.estimatedClosingCosts = estimatedClosingCosts;
  if (requestedCashOut) updates.requestedCashOut = requestedCashOut;
  if (debtConsolidationAmount) updates.debtConsolidationAmount = debtConsolidationAmount;
  if (debtConsolidationMonthlyPayments) {
    updates.debtConsolidationMonthlyPayments = debtConsolidationMonthlyPayments;
  }

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
    if (refinancePurpose === "debt_consolidation") {
      explicitUpdates.cashOutPurpose = refinancePurpose;
    }
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
    next = normalizeRefinanceScenarioFields({
      ...next,
      ...explicitUpdates,
    });

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

    if (guidedDebtAmount !== "") {
      next = normalizeRefinanceScenarioFields({
        ...next,
        debtConsolidationAmount: guidedDebtAmount,
      });
    }
  } else if (
    current.refinancePurpose === "debt_consolidation" &&
    !hasScenarioValue(current.debtConsolidationMonthlyPayments)
  ) {
    const guidedDebtPayments = parseGuidedValue(userText, "money");

    if (guidedDebtPayments !== "") {
      next = normalizeRefinanceScenarioFields({
        ...next,
        debtConsolidationMonthlyPayments: guidedDebtPayments,
      });
    }
  } else if (current.refinancePurpose === "cash_out" && !hasScenarioValue(current.cashOutPurpose)) {
    const cashOutPurpose = String(userText || "").trim();

    if (cashOutPurpose) {
      next = normalizeRefinanceScenarioFields({
        ...next,
        cashOutPurpose,
        cashOutGoal: cashOutPurpose,
      });
    }
  } else if (isRefinancePurpose(current.loanPurpose) && nextMissingFromCurrent) {
    const guidedValue = parseGuidedValue(userText, nextMissingFromCurrent.valueType);

    if (guidedValue !== "") {
      next = normalizeRefinanceScenarioFields({
        ...next,
        [nextMissingFromCurrent.key]: guidedValue,
      });
    }
  }

  if (next.requestedCashOut && next.loanPurpose !== "cash_out_refinance") {
    next.loanPurpose = "cash_out_refinance";
  }

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

  if (
    source.refinancePurpose === "debt_consolidation" &&
    !hasScenarioValue(source.debtConsolidationMonthlyPayments)
  ) {
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
        (!hasScenarioValue(source.debtConsolidationAmount) ||
          !hasScenarioValue(source.debtConsolidationMonthlyPayments))))
  ) {
    return `${prefix}${purposeFollowUp}`.trim();
  }

  if (nextMissingField) {
    const purposeText =
      purposeFollowUp && (source.refinancePurpose === "lower_payment" || source.refinancePurpose === "shorten_term")
        ? `${purposeFollowUp} `
        : "";
    if (prefix.toLowerCase().includes(nextMissingField.question.toLowerCase())) {
      return prefix.trim();
    }
    return `${prefix}${purposeText}${nextMissingField.question}`.trim();
  }

  const purposeText =
    source.refinancePurpose && source.refinancePurpose !== "unknown"
      ? ` for ${formatRefinancePurposeDetail(source.refinancePurpose)}`
      : "";

  return `Great, I have the core refinance inputs${purposeText}. The refinance comparison is ready, and you can ask me to explain it anytime.`;
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

function buildRefinanceComparisonInput(scenario, pricing) {
  const source = normalizeRefinanceScenarioFields(scenario);
  const pricingSource = pricing && typeof pricing === "object" ? pricing : {};

  return {
    propertyValue: source.propertyValue,
    currentLoanBalance: source.currentLoanBalance,
    currentInterestRate: source.currentInterestRate,
    currentLoanTermYears: source.currentLoanTermYears,
    currentRemainingTermYears: source.currentRemainingTermYears,
    newLoanAmount: source.newLoanAmount,
    newInterestRate: source.newInterestRate || pricingSource.rate,
    newLoanTermYears: source.newLoanTermYears,
    estimatedClosingCosts: source.estimatedClosingCosts || pricingSource.estimatedCashToClose,
    requestedCashOut: source.requestedCashOut,
  };
}

function getMissingRefinanceExplanationFields(scenario, pricing) {
  const source = normalizeRefinanceScenarioFields(scenario);
  const input = buildRefinanceComparisonInput(source, pricing);
  const missingFields = [];
  const requiredFields = [
    ["propertyValue", "property value"],
    ["currentLoanBalance", "current loan balance"],
    ["currentInterestRate", "current interest rate"],
    ["currentRemainingTermYears", "current remaining term in years"],
    ["newLoanAmount", "new loan amount"],
    ["newInterestRate", "new interest rate"],
    ["newLoanTermYears", "new loan term in years"],
    ["estimatedClosingCosts", "estimated closing costs, or 0 if there are none"],
  ];

  if (source.loanPurpose === "cash_out_refinance") {
    requiredFields.push(["requestedCashOut", "requested cash out"]);
  }

  for (const [key, label] of requiredFields) {
    if (!hasScenarioValue(input[key])) {
      missingFields.push(label);
    }
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

function buildSallyRefinanceExplanation(scenario, pricing) {
  const normalizedScenario = normalizeRefinanceScenarioFields(scenario);
  const missingFields = getMissingRefinanceExplanationFields(normalizedScenario, pricing);

  if (missingFields.length) {
    return buildMissingRefinanceInputsReply(missingFields);
  }

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
      ? `The requested cash out may be higher than the available equity based on the property value and current balance entered.`
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
    `Here is the refinance comparison in plain English.`,
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

function isConventionalLoanType(value) {
  return String(value || "").trim().toLowerCase().includes("conv");
}

function isFhaLoanType(value) {
  return String(value || "").trim().toLowerCase() === "fha";
}

function getProgramDownPaymentPercent(baseScenario, program, defaultPercent) {
  const currentPercent = Number(baseScenario?.downPaymentPercent);
  const loanType = baseScenario?.loanType;

  if (program === "FHA" && isFhaLoanType(loanType) && Number.isFinite(currentPercent) && currentPercent > 0) {
    return currentPercent;
  }

  if (
    program === "Conventional" &&
    isConventionalLoanType(loanType) &&
    Number.isFinite(currentPercent) &&
    currentPercent > 0
  ) {
    return currentPercent;
  }

  return defaultPercent;
}

function buildComparisonScenario(baseScenario, loanType, downPaymentPercent) {
  return buildScenarioVariant(baseScenario, {
    loanType,
    downPaymentPercent: String(downPaymentPercent),
  });
}

async function quoteComparisonSide(scenario) {
  const pricingScenario = buildPricingScenario(scenario);

  try {
    const quote = await quotePricing(pricingScenario);
    return {
      ok: true,
      quote,
      status: quote?.status || "unknown",
    };
  } catch (error) {
    return {
      ok: false,
      error,
      status: "request_failed",
    };
  }
}

function needsConventionalDownPaymentAssumption(scenario) {
  return String(scenario?.loanPurpose || "purchase") === "purchase" && !Number(scenario?.downPaymentPercent);
}

function createInitialScenario() {
  return {
    ...createEmptyScenario(),
    loanType: "Conventional",
    loanPurpose: "purchase",
    occupancy: "primary",
  };
}

export default function App() {
const [scenario, setScenario] = useState(createInitialScenario);

  const [selectedBorrowerGoal, setSelectedBorrowerGoal] = useState("buy");
  const [borrowerFlowStep, setBorrowerFlowStep] = useState("goal");
  const [savedScenarioDraft, setSavedScenarioDraft] = useState(null);
  const [hasCheckedSavedScenario, setHasCheckedSavedScenario] = useState(false);
  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [lastAnswer, setLastAnswer] = useState("");
  const [input, setInput] = useState("");
  const [conversationHistory, setConversationHistory] = useState(INITIAL_CONVERSATION_HISTORY);
  const [sallyDebug, setSallyDebug] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceInputStatus, setVoiceInputStatus] = useState("");
  const [pendingComparisonChoice, setPendingComparisonChoice] = useState(null);
  const [chatMode, setChatMode] = useState(() => {
    const savedMode = window.localStorage?.getItem(CHAT_MODE_STORAGE_KEY);
    return savedMode === "rules" ? "rules" : "ai";
  });
  const {
    speak,
    stop: stopSallyVoice,
    isSpeaking,
    muted,
    autoPlay,
    voiceError,
    voiceAvailable,
    setMuted,
    toggleAutoPlay,
  } = useSallyVoice();
  const voiceEnabled = !muted;
  const setVoiceEnabled = (valueOrUpdater) => {
    const nextValue = typeof valueOrUpdater === "function" ? valueOrUpdater(voiceEnabled) : valueOrUpdater;
    setMuted(!nextValue);
  };

  const recognitionRef = useRef(null);
  const comparisonPanelRef = useRef(null);
  const voiceInputBaseRef = useRef("");
  const voiceInputTranscriptRef = useRef("");
  const pendingStreamingVoiceTimerRef = useRef(null);

  const enrichedScenario = useMemo(() => {
    const downPaymentPercent = calculateDownPaymentPercent(scenario);

    const next = {
      ...scenario,
      downPaymentPercent,
    };

    if (next.loanPurpose !== "purchase") {
      next.downPayment = "";
      next.downPaymentPercent = "";
    }

    return normalizeRefinanceScenarioFields(next);
  }, [scenario]);

  const baseRate = useMemo(() => getBaseRate(enrichedScenario), [enrichedScenario]);

  useEffect(() => {
    window.localStorage?.setItem(CHAT_MODE_STORAGE_KEY, chatMode);
  }, [chatMode]);

  useEffect(() => {
    const normalizedInput = String(input || "").trim();

    if (!normalizedInput) {
      setIsUserTyping(false);
      return;
    }

    setIsUserTyping(true);
    const typingTimer = window.setTimeout(() => {
      setIsUserTyping(false);
    }, 700);

    return () => window.clearTimeout(typingTimer);
  }, [input]);

  const scenarioFields = useMemo(() => getScenarioFields(enrichedScenario), [enrichedScenario]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Recognition));

    if (!Recognition) {
      setVoiceInputStatus("");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceInputStatus("Listening...");
    };
    recognition.onend = () => {
      setIsListening(false);
      setVoiceInputStatus(
        voiceInputTranscriptRef.current
          ? "Review your message and press Send."
          : "",
      );
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceInputStatus(
        event?.error === "network"
          ? "Voice recognition service is unavailable. Please try again or type your response."
          : "",
      );
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      voiceInputTranscriptRef.current = transcript;
      const nextInput = [voiceInputBaseRef.current, transcript].filter(Boolean).join(" ");

      setInput(nextInput);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
      }
    };
  }, []);

  const stopVoice = () => {
    if (pendingStreamingVoiceTimerRef.current) {
      window.clearTimeout(pendingStreamingVoiceTimerRef.current);
      pendingStreamingVoiceTimerRef.current = null;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    stopSallyVoice();
    setIsListening(false);
  };

  const startVoice = () => {
    if (!recognitionRef.current) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    voiceInputBaseRef.current = String(input || "").trim();
    voiceInputTranscriptRef.current = "";
    stopSallyVoice();
    try {
      recognitionRef.current.start();
    } catch {
      setVoiceInputStatus("Processing...");
    }
  };

  const speakSallyMessage = useCallback(
    (message, { allowWhileTyping = false, ...voiceOptions } = {}) => {
      if (!message) return;
      if (!allowWhileTyping && isUserTyping) return;

      stopSallyVoice();
      speak(message, voiceOptions);
    },
    [isUserTyping, speak, stopSallyVoice],
  );

  const {
    enginePricing,
    hasPricingScenario,
    isPricingLoading,
    livePricingOptions,
    pricing,
    pricingPausedMessage,
    pricingQuote,
    refinanceAnalysis,
    pricingStatusText,
    rateGuidanceMessage,
    refreshPricing,
    selectedLiveOption,
    selectedLiveOptionIndex,
    selectedOptionPosition,
    selectedPricingTableRowRef,
    selectedRateStackItemRef,
    handleRateWheel,
    selectLiveOption,
  } = usePricingEngine({
    baseRate,
    enrichedScenario,
    setPrompt,
    speakSallyMessage,
  });
  const {
    activeComparison,
    clearComparison,
    isComparisonOpen,
    startComparison,
  } = useScenarioComparison();

  const startFhaConventionalComparison = async (options = {}) => {
    const comparisonBaseScenario = options.baseScenario || enrichedScenario;
    const fhaDownPaymentPercent = getProgramDownPaymentPercent(
      comparisonBaseScenario,
      "FHA",
      FHA_COMPARISON_DOWN_PAYMENT_PERCENT,
    );
    const conventionalDownPaymentPercent =
      options.conventionalDownPaymentPercent ??
      getProgramDownPaymentPercent(
        comparisonBaseScenario,
        "Conventional",
        STANDARD_CONVENTIONAL_DOWN_PAYMENT_PERCENT,
      );
    const fhaScenario = buildComparisonScenario(comparisonBaseScenario, "FHA", fhaDownPaymentPercent);
    const conventionalScenario = buildComparisonScenario(
      comparisonBaseScenario,
      "Conventional",
      conventionalDownPaymentPercent,
    );
    const conventionalAssumptionMessage = needsConventionalDownPaymentAssumption(conventionalScenario)
      ? "Conventional down payment assumption needed."
      : "";
    startComparison({
      type: "loan_program",
      title: "FHA vs Conventional",
      baseScenario: comparisonBaseScenario,
      status: "loading",
      left: {
        id: "fha",
        label: "FHA",
        scenario: fhaScenario,
        scenarioUpdates: { loanType: "FHA" },
      },
      right: {
        id: "conventional",
        label: "Conventional",
        scenario: conventionalScenario,
        scenarioUpdates: { loanType: "Conventional" },
        message: conventionalAssumptionMessage,
      },
    });

    try {
      const [fhaResult, conventionalResult] = await Promise.all([
        quoteComparisonSide(fhaScenario),
        quoteComparisonSide(conventionalScenario),
      ]);

      if (!fhaResult.ok || !conventionalResult.ok) {
        throw new Error(
          `Comparison pricing failed. FHA=${fhaResult.status}; Conventional=${conventionalResult.status}`,
        );
      }

      const fhaQuote = fhaResult.quote;
      const conventionalQuote = conventionalResult.quote;
      const fhaOption = selectDefaultComparisonOption(fhaQuote);
      const conventionalOption = selectDefaultComparisonOption(conventionalQuote);
      const fhaPricing = buildComparisonPricing(fhaOption, fhaScenario);
      const conventionalPricing = buildComparisonPricing(conventionalOption, conventionalScenario);
      const comparison = startComparison({
        type: "loan_program",
        title: "FHA vs Conventional",
        baseScenario: comparisonBaseScenario,
        status: "ready",
        left: {
          id: "fha",
          label: "FHA",
          scenario: fhaScenario,
          scenarioUpdates: { loanType: "FHA" },
          pricingQuote: fhaQuote,
          selectedOptionId: fhaOption?.optionId || "",
          selectedOption: fhaOption,
          pricing: fhaPricing,
        },
        right: {
          id: "conventional",
          label: "Conventional",
          scenario: conventionalScenario,
          scenarioUpdates: { loanType: "Conventional" },
          pricingQuote: conventionalQuote,
          selectedOptionId: conventionalOption?.optionId || "",
          selectedOption: conventionalOption,
          pricing: conventionalPricing,
          message: conventionalOption ? conventionalAssumptionMessage : "Conventional down payment assumption needed.",
        },
      });
      return comparison;
    } catch {
      return startComparison({
        type: "loan_program",
        title: "FHA vs Conventional",
        baseScenario: comparisonBaseScenario,
        status: "error",
        left: {
          id: "fha",
          label: "FHA",
          scenario: fhaScenario,
          scenarioUpdates: { loanType: "FHA" },
        },
        right: {
          id: "conventional",
          label: "Conventional",
          scenario: conventionalScenario,
          scenarioUpdates: { loanType: "Conventional" },
          message: conventionalAssumptionMessage || "Conventional down payment assumption needed.",
        },
        summary: {
          text: "Live comparison rate options are unavailable. Confirm the rate connection is running, then try again.",
        },
      });
    }
  };

  useEffect(() => {
    if (!isComparisonOpen || !activeComparison) return;

    window.requestAnimationFrame(() => {
      comparisonPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [activeComparison, isComparisonOpen]);

const normalizeScenarioAfterBrain = (next) => {
  const scenarioCopy = normalizeRefinanceScenarioFields({ ...next });

  if (!scenarioCopy.loanType) scenarioCopy.loanType = "Conventional";
  if (!scenarioCopy.loanPurpose) scenarioCopy.loanPurpose = "purchase";

  if (scenarioCopy.loanPurpose !== "purchase") {
    scenarioCopy.downPayment = "";
    scenarioCopy.downPaymentPercent = "";
  }

  return normalizeRefinanceScenarioFields(scenarioCopy);
};

  useEffect(() => {
    const draft = readGuestScenarioDraft();
    if (draft) setSavedScenarioDraft(draft);
    setHasCheckedSavedScenario(true);
  }, []);

  useEffect(() => {
    if (!hasCheckedSavedScenario || savedScenarioDraft) return;

    saveGuestScenarioDraft({
      scenario: enrichedScenario,
      selectedBorrowerGoal,
      borrowerFlowStep,
    });
  }, [borrowerFlowStep, enrichedScenario, hasCheckedSavedScenario, savedScenarioDraft, selectedBorrowerGoal]);

  const loadRefinanceDemoPreset = (presetId) => {
    const preset = getRefinanceDemoPreset(presetId);
    if (!preset) return;

    setPendingComparisonChoice(null);
    clearComparison();
    setScenario((prev) =>
      normalizeScenarioAfterBrain({
        ...prev,
        ...preset.scenario,
      }),
    );
    setPrompt(`Loaded demo preset: ${preset.label}. You can review the refinance comparison or ask me to explain it.`);
  };

  const sendMessage = async (rawInput = input) => {
    const userText = String(rawInput || "").trim();
    if (!userText || isThinking) return;

    const submitStartedAt = performance.now();
    const currentScenarioSnapshot = { ...scenario };
    const currentHistorySnapshot = [...conversationHistory, { role: "user", content: userText }];
    const shouldOpenComparison = shouldOpenFhaConventionalComparison(userText, prompt, conversationHistory);
    const isPendingConventionalChoice =
      pendingComparisonChoice?.type === "fha_conventional_down_payment";
    const requestedFhaConventionalComparison =
      isPendingConventionalChoice || shouldOpenComparison || isFhaConventionalComparisonPrompt(userText);
    const conventionalDownPaymentPreference = parseConventionalDownPaymentPreference(userText);
    const localResult = processSallyMessage(userText, currentScenarioSnapshot);
    const localScenarioUpdates = buildScenarioDiff(currentScenarioSnapshot, localResult?.scenario);

    if (pendingStreamingVoiceTimerRef.current) {
      window.clearTimeout(pendingStreamingVoiceTimerRef.current);
      pendingStreamingVoiceTimerRef.current = null;
    }

    setLastAnswer(userText);
    setInput("");
    setVoiceInputStatus("Processing...");
    setPrompt("Sally is thinking...");
    setIsUserTyping(false);
    setIsThinking(true);
    setConversationHistory(currentHistorySnapshot);

    const guidedRefinanceScenario = normalizeScenarioAfterBrain(
      buildGuidedRefinanceScenario(
        currentScenarioSnapshot,
        localResult?.scenario || currentScenarioSnapshot,
        userText,
      ),
    );
    const hadMissingGuidedRefinanceField = Boolean(
      getNextMissingRefinanceCollectionField(currentScenarioSnapshot),
    );
    const shouldCollectRefinanceData =
      isRefinanceDataCollectionPrompt(userText, guidedRefinanceScenario) ||
      (isRefinancePurpose(guidedRefinanceScenario.loanPurpose) && hadMissingGuidedRefinanceField);
    const hasMissingGuidedRefinanceField = Boolean(
      getNextMissingRefinanceCollectionField(guidedRefinanceScenario),
    );
    const isRefinanceExplanationRequest = isRefinanceExplanationPrompt(userText, guidedRefinanceScenario);

    if (
      shouldCollectRefinanceData &&
      !isRefinanceExplanationRequest &&
      hasMissingGuidedRefinanceField
    ) {
      const refinanceCollectionReply = buildGuidedRefinanceReply(
        guidedRefinanceScenario,
        localResult?.message || "",
      );

      setPendingComparisonChoice(null);
      setScenario(guidedRefinanceScenario);
      setPrompt(refinanceCollectionReply);
      setConversationHistory([...currentHistorySnapshot, { role: "assistant", content: refinanceCollectionReply }]);
      setVoiceInputStatus("");
      setIsThinking(false);
      speakSallyMessage(refinanceCollectionReply, {
        allowWhileTyping: true,
        timingLabel: "refinance-data-collection",
        submitStartedAt,
      });
      return;
    }

    const refinanceExplanationScenario = guidedRefinanceScenario;

    if (isRefinanceExplanationRequest) {
      const refinanceReply = buildSallyRefinanceExplanation(refinanceExplanationScenario, pricing);

      setPendingComparisonChoice(null);
      setScenario(refinanceExplanationScenario);
      setPrompt(refinanceReply);
      setConversationHistory([...currentHistorySnapshot, { role: "assistant", content: refinanceReply }]);
      setVoiceInputStatus("");
      setIsThinking(false);
      speakSallyMessage(refinanceReply, {
        allowWhileTyping: true,
        timingLabel: "refinance-explanation",
        submitStartedAt,
      });
      return;
    }

    if (Object.keys(localScenarioUpdates).length && !isRefinancePurpose(guidedRefinanceScenario.loanPurpose)) {
      const localScenarioReply = localResult?.message || "Got it. I updated what I could.";

      setPendingComparisonChoice(null);
      setScenario(normalizeScenarioAfterBrain(localResult.scenario));
      setPrompt(localScenarioReply);
      setConversationHistory([...currentHistorySnapshot, { role: "assistant", content: localScenarioReply }]);
      setVoiceInputStatus("");
      setIsThinking(false);
      speakSallyMessage(localScenarioReply, {
        allowWhileTyping: true,
        timingLabel: "local-scenario-sync",
        submitStartedAt,
      });
      return;
    }

    if (
      requestedFhaConventionalComparison &&
      !isPendingConventionalChoice &&
      !hasConventionalDownPaymentPreference(currentScenarioSnapshot) &&
      conventionalDownPaymentPreference === null
    ) {
      setPendingComparisonChoice({ type: "fha_conventional_down_payment" });
      setPrompt(CONVENTIONAL_DOWN_PAYMENT_QUESTION);
      setConversationHistory([...currentHistorySnapshot, { role: "assistant", content: CONVENTIONAL_DOWN_PAYMENT_QUESTION }]);
      setVoiceInputStatus("");
      setIsThinking(false);
      speakSallyMessage(CONVENTIONAL_DOWN_PAYMENT_QUESTION, {
        allowWhileTyping: true,
        timingLabel: "comparison-assumption-question",
        submitStartedAt,
      });
      return;
    }

    if (requestedFhaConventionalComparison) {
      const comparison = await startFhaConventionalComparison({
        conventionalDownPaymentPercent:
          conventionalDownPaymentPreference ?? undefined,
      });
      const comparisonReply = buildSallyComparisonSummary(comparison);
      setPendingComparisonChoice(null);
      setPrompt(comparisonReply);
      setConversationHistory([...currentHistorySnapshot, { role: "assistant", content: comparisonReply }]);
      setVoiceInputStatus("");
      setIsThinking(false);
      speakSallyMessage(comparisonReply, {
        allowWhileTyping: true,
        timingLabel: "comparison-summary",
        submitStartedAt,
      });
      return;
    }

    let result;
    let streamedReplyText = "";
    let earlySpeechText = "";
    let firstDeltaAt = null;

    try {
      result = await callSallyBrainStream({
        userMessage: userText,
        currentScenario: currentScenarioSnapshot,
        conversationHistory: currentHistorySnapshot,
        pricingOptions: livePricingOptions,
        localResult,
        onReplyDelta: (delta) => {
          if (!firstDeltaAt) {
            firstDeltaAt = performance.now();
          }

          streamedReplyText = `${streamedReplyText}${delta}`;
          setPrompt(streamedReplyText || "Sally is thinking...");

          if (earlySpeechText) return;

          const candidate = getEarlySpeechCandidate(streamedReplyText);
          if (!candidate) return;

          earlySpeechText = candidate;
          speakSallyMessage(candidate, {
            allowWhileTyping: true,
            timingLabel: "early-stream-candidate",
            submitStartedAt,
            responseStartedAt: firstDeltaAt,
          });
        },
      });
    } catch (error) {
      try {
        result = await callSallyBrain({
          userMessage: userText,
          currentScenario: currentScenarioSnapshot,
          conversationHistory: currentHistorySnapshot,
          pricingOptions: livePricingOptions,
          localResult,
        });
      } catch (fallbackError) {
        console.error("Sally API error:", fallbackError);
        result = {
          replyText: fallbackError instanceof Error ? fallbackError.message : "OpenAI Sally Brain request failed.",
          detectedIntent: "other",
          scenarioUpdates: {},
          nextQuestion: "",
          needsPricingRefresh: false,
          confidence: "low",
          debug: null,
        };
      }
    }

    const responseCompletedAt = performance.now();

    setSallyDebug(result?.debug || null);

    const nextReplyText = String(result.replyText || "OpenAI Sally Brain request failed.");
    const rawScenarioUpdates =
      result.scenarioUpdates && typeof result.scenarioUpdates === "object"
        ? result.scenarioUpdates
        : {};
    const apiScenarioUpdates = normalizeScenarioUpdatesForUi(rawScenarioUpdates);
    const normalizedLocalUpdates = normalizeScenarioUpdatesForUi(localScenarioUpdates);
    const nextScenarioUpdates = {
      ...normalizedLocalUpdates,
      ...apiScenarioUpdates,
    };
    const isReset = result.detectedIntent === "reset";

    setPrompt(nextReplyText);
    setScenario((prev) => {
      const nextScenario = isReset
        ? normalizeScenarioAfterBrain(createEmptyScenario())
        : normalizeScenarioAfterBrain({ ...prev, ...nextScenarioUpdates });

      return nextScenario;
    });
    setConversationHistory((prev) =>
      isReset ? [{ role: "assistant", content: nextReplyText }] : [...prev, { role: "assistant", content: nextReplyText }],
    );
    setIsThinking(false);
    setVoiceInputStatus("");
    if (result.needsPricingRefresh) {
      refreshPricing((value) => value + 1);
    }
    if (!earlySpeechText) {
      speakSallyMessage(nextReplyText, {
        allowWhileTyping: true,
        timingLabel: "final-reply",
        submitStartedAt,
        responseCompletedAt,
      });
    } else {
      const remainingReplyText = nextReplyText.slice(earlySpeechText.length).trim();

      if (remainingReplyText.length > 20) {
        pendingStreamingVoiceTimerRef.current = window.setTimeout(() => {
          pendingStreamingVoiceTimerRef.current = null;
          speakSallyMessage(remainingReplyText, {
            allowWhileTyping: true,
            timingLabel: "remaining-reply",
            submitStartedAt,
            responseStartedAt: firstDeltaAt,
            responseCompletedAt,
          });
        }, estimateSpeechDurationMs(earlySpeechText));
      }
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleSallyInputChange = (value) => {
    setInput(value);
    if (voiceInputStatus) {
      setVoiceInputStatus("Review your message and press Send.");
    }
  };

  const updateScenarioField = (field, rawValue) => {
    const numericFields = [
      "purchasePrice",
      "appraisalValue",
      "downPayment",
      "loanAmount",
      "propertyValue",
      "creditScore",
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
      "debtConsolidationAmount",
      "debtConsolidationMonthlyPayments",
    ];
    let value = rawValue;

    if (numericFields.includes(field)) {
      value = rawValue.replace(/[^\d.]/g, "");
    }

    if (field === "loanPurpose") {
      if (value === "purchase") setSelectedBorrowerGoal("buy");
      if (value === "rate_term_refinance") setSelectedBorrowerGoal("refinance");
      if (value === "cash_out_refinance") setSelectedBorrowerGoal("cash-out");
    }

    setScenario((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "loanPurpose" && value !== "purchase") {
  next.downPayment = "";
  next.downPaymentPercent = "";
}

      if (field === "estimatedPropertyValue") {
        next.propertyValue = value;
      }

      if (field === "propertyValue") {
        next.estimatedPropertyValue = value;
      }

      if (field === "desiredCashOut") {
        next.requestedCashOut = value;
      }

      if (field === "requestedCashOut") {
        next.desiredCashOut = value;
      }

      if (field === "refinancePurpose") {
        if (value === "cash_out" || value === "debt_consolidation") {
          next.loanPurpose = "cash_out_refinance";
          next.cashOutPurpose = value;
          next.cashOutGoal = value;
        }
      }

      if (field === "cashOutPurpose") {
        next.cashOutGoal = value;
        if (value === "debt_consolidation") {
          next.refinancePurpose = "debt_consolidation";
        } else if (value) {
          next.refinancePurpose = "cash_out";
        }
      }

      if (field === "loanAmount" && next.loanPurpose !== "purchase") {
        next.newLoanAmount = value;
        next.estimatedNewLoanAmount = value;
      }

      if (field === "newLoanAmount" || field === "estimatedNewLoanAmount") {
        next.loanAmount = value;
        next.newLoanAmount = value;
        next.estimatedNewLoanAmount = value;
      }

      if (field === "purchasePrice" || field === "downPayment") {
        const purchasePrice = toNumber(field === "purchasePrice" ? value : next.purchasePrice);
        const downPayment = toNumber(field === "downPayment" ? value : next.downPayment);

        if (purchasePrice && downPayment && purchasePrice >= downPayment) {
          next.loanAmount = String(Math.round(purchasePrice - downPayment));
        }
      }

      if (next.loanPurpose === "rate_term_refinance" && field === "currentLoanBalance") {
        const currentLoanBalance = toNumber(value);
        if (currentLoanBalance) {
          next.loanAmount = String(Math.round(currentLoanBalance));
          next.newLoanAmount = String(Math.round(currentLoanBalance));
          next.estimatedNewLoanAmount = String(Math.round(currentLoanBalance));
        }
      }

      if (
        next.loanPurpose === "cash_out_refinance" &&
        (field === "currentLoanBalance" || field === "desiredCashOut")
      ) {
        const currentLoanBalance = toNumber(field === "currentLoanBalance" ? value : next.currentLoanBalance);
        const desiredCashOut = toNumber(field === "desiredCashOut" ? value : next.desiredCashOut);

        if (currentLoanBalance || desiredCashOut) {
          const newLoanAmount = String(Math.round(currentLoanBalance + desiredCashOut));
          next.loanAmount = newLoanAmount;
          next.newLoanAmount = newLoanAmount;
          next.estimatedNewLoanAmount = newLoanAmount;
        }
      }

      return normalizeRefinanceScenarioFields(next);
    });
  };

  const selectBorrowerGoal = (goal) => {
    setSelectedBorrowerGoal(goal);
    setPendingComparisonChoice(null);

    if (goal !== "fha-conventional") {
      clearComparison();
    }

    if (goal === "buy") {
      setScenario((prev) =>
        normalizeScenarioAfterBrain({
          ...prev,
          loanPurpose: "purchase",
          refinancePurpose: "",
          cashOutPurpose: "",
          cashOutGoal: "",
          loanType: prev.loanType || "Conventional",
          occupancy: prev.occupancy || "primary",
        }),
      );
      setPrompt("Let's start with the basics for buying a home, then I can help compare rate and payment options.");
      return;
    }

    if (goal === "refinance") {
      setScenario((prev) =>
        normalizeScenarioAfterBrain({
          ...prev,
          loanPurpose: "rate_term_refinance",
          refinancePurpose: prev.refinancePurpose || "lower_payment",
          occupancy: prev.occupancy || "primary",
        }),
      );
      setPrompt("Let's look at your refinance goal. Add your current mortgage details and I will help compare the estimated payment change.");
      return;
    }

    if (goal === "cash-out") {
      setScenario((prev) =>
        normalizeScenarioAfterBrain({
          ...prev,
          loanPurpose: "cash_out_refinance",
          refinancePurpose: "cash_out",
          cashOutPurpose: "cash_out",
          cashOutGoal: "cash_out",
          occupancy: prev.occupancy || "primary",
        }),
      );
      setPrompt("Let's estimate a cash-out refinance. Add your property value, current balance, and the cash you want to take out.");
      return;
    }

    if (goal === "fha-conventional") {
      const comparisonScenario = normalizeScenarioAfterBrain({
        ...scenario,
        loanPurpose: "purchase",
        loanType: scenario.loanType || "Conventional",
        occupancy: scenario.occupancy || "primary",
      });

      setScenario(comparisonScenario);
      setPrompt("I'll open the FHA vs Conventional helper using the purchase details currently entered.");
      startFhaConventionalComparison({ baseScenario: comparisonScenario });
    }
  };

  const continueSavedScenario = () => {
    if (!savedScenarioDraft) return;

    setScenario(
      normalizeScenarioAfterBrain({
        ...createInitialScenario(),
        ...savedScenarioDraft.scenario,
      }),
    );
    setSelectedBorrowerGoal(savedScenarioDraft.selectedBorrowerGoal || "buy");
    setBorrowerFlowStep(savedScenarioDraft.borrowerFlowStep || "goal");
    setSavedScenarioDraft(null);
    setPrompt("Welcome back. I restored your saved scenario so you can continue comparing rate options.");
  };

  const startOverSavedScenario = () => {
    clearGuestScenarioDraft();
    clearComparison();
    setSavedScenarioDraft(null);
    setScenario(createInitialScenario());
    setSelectedBorrowerGoal("buy");
    setBorrowerFlowStep("goal");
    setPrompt(INITIAL_PROMPT);
    setLastAnswer("");
    setInput("");
    setConversationHistory(INITIAL_CONVERSATION_HISTORY);
    setPendingComparisonChoice(null);
  };

  return (
    <div className="cmr-page" data-testid="app-shell">
      <div className="galaxy-bg" />
      <div className="stars stars-a" />
      <div className="stars stars-b" />
      <div className="stars stars-c" />

      <div className="cmr-shell">
        <header className="topbar">
          <div className="brand-left">
            <div className="brand-title">CHOOSE MY RATE</div>
            <div className="brand-subtitle">Powered by Home Lenders of America</div>
          </div>

          <div className="topbar-right">
            <button type="button" className="login-btn">Login</button>
          </div>
        </header>

        <SavedScenarioRestore
          draft={savedScenarioDraft}
          onContinue={continueSavedScenario}
          onStartOver={startOverSavedScenario}
        />

        <section className="borrower-journey-layout" aria-label="Borrower journey">
          <div className="borrower-main-flow" data-testid="borrower-main-flow">
            <BorrowerGuidedFlow
              currentStep={borrowerFlowStep}
              hasRateOptions={livePricingOptions.length > 0}
              selectedGoal={selectedBorrowerGoal}
              scenario={enrichedScenario}
              onSelectGoal={selectBorrowerGoal}
              onStepChange={setBorrowerFlowStep}
            />
          </div>

          <SallySideAssistant>
            <SallyPanel
              autoPlay={autoPlay}
              chatMode={chatMode}
              input={input}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isThinking={isThinking}
              lastAnswer={lastAnswer}
              prompt={prompt}
              sallyDebug={sallyDebug}
              speechSupported={speechSupported}
              voiceAvailable={voiceAvailable}
              voiceEnabled={voiceEnabled}
              voiceError={voiceError}
              voiceInputStatus={voiceInputStatus}
              onInputChange={handleSallyInputChange}
              onInputKeyDown={handleKeyDown}
              onSendMessage={() => sendMessage()}
              onStartVoice={startVoice}
              onStopVoice={stopVoice}
              onToggleAutoPlay={toggleAutoPlay}
              onToggleChatMode={() => setChatMode((prev) => (prev === "ai" ? "rules" : "ai"))}
              onToggleVoice={() => setVoiceEnabled((prev) => !prev)}
            />
          </SallySideAssistant>
        </section>

        <section className="bottom-grid">
          <div className="borrower-advanced-details" data-testid="borrower-advanced-details">
            <div className="advanced-details-heading">
              <div>
                <div className="mini-label">Loan officer details</div>
                <h2>Adjust the details</h2>
              </div>
              <p>Use these fields to refine the estimate or review the deeper demo controls.</p>
            </div>
            <ScenarioPanel
              demoPresets={REFINANCE_DEMO_PRESETS}
              scenario={scenario}
              scenarioFields={scenarioFields}
              onChange={updateScenarioField}
              onLoadDemoPreset={loadRefinanceDemoPreset}
            />
            <button
              type="button"
              className="comparison-test-btn"
              data-testid="fha-conventional-compare"
              onClick={startFhaConventionalComparison}
            >
              Compare FHA vs Conventional
            </button>
          </div>

          <div ref={comparisonPanelRef}>
            {isComparisonOpen ? (
              <ComparisonPanel
                comparison={activeComparison}
                isOpen={isComparisonOpen}
                onClose={clearComparison}
              />
            ) : (
              <>
                <RefinanceComparisonPanel scenario={enrichedScenario} pricing={pricing} />
                <PricingEnginePanel
                  enginePricing={enginePricing}
                  hasPricingScenario={hasPricingScenario}
                  isPricingLoading={isPricingLoading}
                  livePricingOptions={livePricingOptions}
                  pricing={pricing}
                  pricingPausedMessage={pricingPausedMessage}
                  pricingQuote={pricingQuote}
                  refinanceAnalysis={refinanceAnalysis}
                  pricingStatusText={pricingStatusText}
                  rateGuidanceMessage={rateGuidanceMessage}
                  selectedLiveOption={selectedLiveOption}
                  selectedLiveOptionIndex={selectedLiveOptionIndex}
                  selectedOptionPosition={selectedOptionPosition}
                  selectedPricingTableRowRef={selectedPricingTableRowRef}
                  selectedRateStackItemRef={selectedRateStackItemRef}
                  onRateWheel={handleRateWheel}
                  onSelectLiveOption={selectLiveOption}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
