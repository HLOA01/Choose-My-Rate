function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
  const numeric = toNumberOrNull(value);
  return numeric === null ? null : Math.round(numeric);
}

function roundPercent(value) {
  const numeric = toNumberOrNull(value);
  return numeric === null ? null : Number(numeric.toFixed(2));
}

function getFirstNumber(source, keys) {
  const values = source && typeof source === "object" ? source : {};

  for (const key of keys) {
    const numeric = toNumberOrNull(values[key]);
    if (numeric !== null) return numeric;
  }

  return null;
}

function calculatePrincipalInterestPayment(loanAmount, annualRate, termMonths = 360) {
  const principal = toNumberOrNull(loanAmount);
  const rate = toNumberOrNull(annualRate);
  const term = toNumberOrNull(termMonths) || 360;

  if (!principal) return null;

  const monthlyRate = (rate || 0) / 100 / 12;
  if (!monthlyRate) return principal / term;

  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
}

function resolvePayment(loan) {
  if (typeof loan === "number" || typeof loan === "string") {
    return toNumberOrNull(loan);
  }

  const source = loan && typeof loan === "object" ? loan : {};
  const directPayment = getFirstNumber(source, [
    "monthlyPayment",
    "currentPayment",
    "newPayment",
    "payment",
    "paymentPITI",
    "total",
    "estimatedCurrentPayment",
    "estimatedNewPayment",
  ]);

  if (directPayment !== null) return directPayment;

  const loanAmount = getFirstNumber(source, ["loanAmount", "currentLoanBalance", "newLoanAmount"]);
  const annualRate = getFirstNumber(source, ["interestRate", "rate", "currentInterestRate", "newInterestRate"]);
  const termMonths = getFirstNumber(source, ["termMonths", "loanTermMonths"]) || 360;

  return calculatePrincipalInterestPayment(loanAmount, annualRate, termMonths);
}

function resolveClosingCosts(refinanceLoan, options) {
  const optionCosts = getFirstNumber(options, ["estimatedClosingCosts", "closingCosts"]);
  if (optionCosts !== null) return Math.abs(optionCosts);

  const loanCosts = getFirstNumber(refinanceLoan, [
    "estimatedClosingCosts",
    "closingCosts",
    "costs",
    "pointsDollars",
  ]);

  return loanCosts === null ? null : Math.abs(loanCosts);
}

function calculateLtv(loanAmount, propertyValue) {
  const amount = toNumberOrNull(loanAmount);
  const value = toNumberOrNull(propertyValue);

  if (!amount || !value) return null;
  return roundPercent((amount / value) * 100);
}

export function calculateRefinanceDeltas(currentLoanOrPayment, refinanceLoanOrPayment, options = {}) {
  const currentPayment = resolvePayment(currentLoanOrPayment);
  const newPayment = resolvePayment(refinanceLoanOrPayment);
  const paymentDifference =
    currentPayment !== null && newPayment !== null ? roundMoney(newPayment - currentPayment) : null;
  const monthlySavings =
    currentPayment !== null && newPayment !== null ? roundMoney(currentPayment - newPayment) : null;
  const annualSavings = monthlySavings !== null ? roundMoney(monthlySavings * 12) : null;
  const estimatedClosingCosts = resolveClosingCosts(refinanceLoanOrPayment, options);
  const breakEvenMonths =
    estimatedClosingCosts !== null && monthlySavings !== null && monthlySavings > 0
      ? Math.ceil(estimatedClosingCosts / monthlySavings)
      : null;

  return {
    currentPayment: roundMoney(currentPayment),
    newPayment: roundMoney(newPayment),
    paymentDifference,
    monthlySavings,
    annualSavings,
    estimatedClosingCosts: roundMoney(estimatedClosingCosts),
    breakEvenMonths,
  };
}

export function buildRateTermRefinanceComparison(currentLoan = {}, refinanceLoan = {}, options = {}) {
  return {
    comparisonType: "rate_term_refinance",
    ...calculateRefinanceDeltas(currentLoan, refinanceLoan, options),
  };
}

export function buildCashOutRefinanceComparison(currentLoan = {}, refinanceLoan = {}, options = {}) {
  const currentLoanBalance = getFirstNumber(currentLoan, ["currentLoanBalance", "loanBalance", "balance", "loanAmount"]);
  const desiredCashOut =
    getFirstNumber(refinanceLoan, ["desiredCashOut", "cashOut", "cashReceived"]) ??
    getFirstNumber(options, ["desiredCashOut", "cashOut", "cashReceived"]);
  const newLoanAmount =
    getFirstNumber(refinanceLoan, ["newLoanAmount", "loanAmount"]) ??
    (currentLoanBalance !== null && desiredCashOut !== null ? currentLoanBalance + desiredCashOut : null);
  const estimatedPropertyValue =
    getFirstNumber(refinanceLoan, ["estimatedPropertyValue", "propertyValue", "homeValue"]) ??
    getFirstNumber(currentLoan, ["estimatedPropertyValue", "propertyValue", "homeValue"]) ??
    getFirstNumber(options, ["estimatedPropertyValue", "propertyValue", "homeValue"]);
  const cashReceived =
    desiredCashOut ?? (newLoanAmount !== null && currentLoanBalance !== null ? newLoanAmount - currentLoanBalance : null);
  const deltas = calculateRefinanceDeltas(currentLoan, refinanceLoan, options);

  return {
    comparisonType: "cash_out_refinance",
    currentLoanBalance: roundMoney(currentLoanBalance),
    desiredCashOut: roundMoney(desiredCashOut),
    newLoanAmount: roundMoney(newLoanAmount),
    estimatedPropertyValue: roundMoney(estimatedPropertyValue),
    estimatedLTV: calculateLtv(newLoanAmount, estimatedPropertyValue),
    currentPayment: deltas.currentPayment,
    newPayment: deltas.newPayment,
    paymentDifference: deltas.paymentDifference,
    cashReceived: roundMoney(cashReceived),
  };
}

export function formatRefinanceComparisonSummary(comparison) {
  const source = comparison && typeof comparison === "object" ? comparison : {};
  const parts = [];

  if (source.monthlySavings !== null && source.monthlySavings !== undefined) {
    if (source.monthlySavings > 0) {
      parts.push(`New payment is about $${source.monthlySavings.toLocaleString("en-US")} lower per month`);
    } else if (source.monthlySavings < 0) {
      parts.push(`New payment is about $${Math.abs(source.monthlySavings).toLocaleString("en-US")} higher per month`);
    } else {
      parts.push("New payment is about the same as the current payment");
    }
  }

  if (source.annualSavings > 0) {
    parts.push(`estimated annual savings are about $${source.annualSavings.toLocaleString("en-US")}`);
  }

  if (source.breakEvenMonths) {
    parts.push(`estimated break-even is about ${source.breakEvenMonths} months`);
  }

  if (source.comparisonType === "cash_out_refinance" && source.cashReceived !== null && source.cashReceived !== undefined) {
    parts.push(`estimated cash received is about $${source.cashReceived.toLocaleString("en-US")}`);
  }

  if (source.comparisonType === "cash_out_refinance" && source.estimatedLTV !== null && source.estimatedLTV !== undefined) {
    parts.push(`estimated LTV is ${source.estimatedLTV.toFixed(2)}%`);
  }

  if (!parts.length) {
    return "Refinance comparison will be available once current and new loan details are provided.";
  }

  return `${parts.join(". ")}.`;
}
