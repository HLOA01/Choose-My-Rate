export const REFINANCE_TYPES = {
  RATE_AND_TERM: "rate_and_term",
  CASH_OUT: "cash_out",
  UNKNOWN: "unknown",
};

export function parseSafeNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  const numeric = Number(normalized);

  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
  const numeric = parseSafeNumber(value);
  return numeric === null ? null : Math.round(numeric);
}

function roundPercent(value) {
  const numeric = parseSafeNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(2));
}

function clampNonNegative(value) {
  const numeric = parseSafeNumber(value);
  return numeric === null ? null : Math.max(numeric, 0);
}

function yearsToMonths(years) {
  const numeric = parseSafeNumber(years);
  return numeric && numeric > 0 ? Math.round(numeric * 12) : null;
}

export function calculateMonthlyPrincipalAndInterest(loanAmount, annualInterestRate, termYears) {
  const principal = parseSafeNumber(loanAmount);
  const rate = parseSafeNumber(annualInterestRate);
  const termMonths = yearsToMonths(termYears);

  if (!principal || !termMonths) return null;

  const monthlyRate = (rate || 0) / 100 / 12;
  if (!monthlyRate) return roundMoney(principal / termMonths);

  return roundMoney((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));
}

export function calculateLoanToValue(loanAmount, propertyValue) {
  const loan = parseSafeNumber(loanAmount);
  const value = parseSafeNumber(propertyValue);

  if (!loan || !value) return null;
  return roundPercent((loan / value) * 100);
}

export function determineRefinanceType(input = {}) {
  const requestedCashOut = parseSafeNumber(input.requestedCashOut) || 0;
  const currentLoanBalance = parseSafeNumber(input.currentLoanBalance);
  const newLoanAmount = parseSafeNumber(input.newLoanAmount);

  if (requestedCashOut > 0) return REFINANCE_TYPES.CASH_OUT;

  if (currentLoanBalance !== null && newLoanAmount !== null && newLoanAmount > currentLoanBalance) {
    return REFINANCE_TYPES.CASH_OUT;
  }

  if (currentLoanBalance !== null || newLoanAmount !== null) {
    return REFINANCE_TYPES.RATE_AND_TERM;
  }

  return REFINANCE_TYPES.UNKNOWN;
}

export function buildRefinanceComparison(input = {}) {
  const propertyValue = clampNonNegative(input.propertyValue);
  const currentLoanBalance = clampNonNegative(input.currentLoanBalance);
  const currentInterestRate = clampNonNegative(input.currentInterestRate);
  const currentLoanTermYears = clampNonNegative(input.currentLoanTermYears);
  const currentRemainingTermYears =
    clampNonNegative(input.currentRemainingTermYears) || currentLoanTermYears;
  const estimatedClosingCosts = clampNonNegative(input.estimatedClosingCosts) || 0;
  const requestedCashOut = clampNonNegative(input.requestedCashOut) || 0;
  const newLoanAmount =
    clampNonNegative(input.newLoanAmount) ??
    (currentLoanBalance !== null ? currentLoanBalance + requestedCashOut : null);
  const availableEquity =
    propertyValue !== null && currentLoanBalance !== null
      ? Math.max(propertyValue - currentLoanBalance, 0)
      : null;
  const cashOutExceedsAvailableEquity =
    availableEquity !== null && requestedCashOut > availableEquity;
  const currentMonthlyPrincipalAndInterest = calculateMonthlyPrincipalAndInterest(
    currentLoanBalance,
    currentInterestRate,
    currentRemainingTermYears,
  );
  const newMonthlyPrincipalAndInterest = calculateMonthlyPrincipalAndInterest(
    newLoanAmount,
    input.newInterestRate,
    input.newLoanTermYears,
  );
  const monthlyPaymentDifference =
    currentMonthlyPrincipalAndInterest !== null && newMonthlyPrincipalAndInterest !== null
      ? roundMoney(newMonthlyPrincipalAndInterest - currentMonthlyPrincipalAndInterest)
      : null;
  const monthlySavings =
    monthlyPaymentDifference !== null && monthlyPaymentDifference < 0
      ? Math.abs(monthlyPaymentDifference)
      : 0;
  const cashOutAmount =
    requestedCashOut ||
    (newLoanAmount !== null && currentLoanBalance !== null
      ? Math.max(newLoanAmount - currentLoanBalance, 0)
      : 0);
  const netCashToBorrower = Math.max(cashOutAmount - estimatedClosingCosts, 0);
  const breakevenMonths =
    estimatedClosingCosts > 0 && monthlySavings > 0
      ? Math.ceil(estimatedClosingCosts / monthlySavings)
      : null;

  return {
    refinanceType: determineRefinanceType({
      currentLoanBalance,
      newLoanAmount,
      requestedCashOut,
    }),
    propertyValue,
    currentLoanBalance,
    currentInterestRate,
    currentLoanTermYears,
    currentRemainingTermYears,
    newLoanAmount,
    newInterestRate: clampNonNegative(input.newInterestRate),
    newLoanTermYears: clampNonNegative(input.newLoanTermYears),
    currentMonthlyPrincipalAndInterest,
    newMonthlyPrincipalAndInterest,
    monthlyPaymentDifference,
    monthlySavings,
    totalEstimatedClosingCosts: roundMoney(estimatedClosingCosts) || 0,
    cashOutAmount: roundMoney(cashOutAmount) || 0,
    netCashToBorrower: roundMoney(netCashToBorrower) || 0,
    breakevenMonths,
    newLoanToValue: calculateLoanToValue(newLoanAmount, propertyValue),
    availableEquity: roundMoney(availableEquity),
    cashOutExceedsAvailableEquity,
  };
}
