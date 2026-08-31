import { LOAN_PURPOSES, normalizeLoanPurpose } from "../loanPurpose/loanPurposeConfig";
import { toNumber } from "../scenario/scenarioUtils";

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return Math.round(numeric);
}

function calculatePrincipalInterest(loanAmount, annualRate, termMonths = 360) {
  const principal = toNumber(loanAmount);
  const rate = toNumber(annualRate);

  if (!principal) return "";

  const monthlyRate = rate / 100 / 12;
  if (!monthlyRate) return roundMoney(principal / termMonths);

  return roundMoney((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));
}

function calculateLtv(loanAmount, propertyValue) {
  const principal = toNumber(loanAmount);
  const value = toNumber(propertyValue);

  if (!principal || !value) return "";
  return Number(((principal / value) * 100).toFixed(2));
}

export function buildRateTermRefinanceAnalysis(scenario, pricing = {}) {
  const currentPayment =
    toNumber(scenario.currentMonthlyPayment) ||
    calculatePrincipalInterest(scenario.currentLoanBalance, scenario.currentInterestRate);
  const estimatedNewPayment = toNumber(pricing.total);
  const paymentDifference =
    currentPayment && estimatedNewPayment ? roundMoney(estimatedNewPayment - currentPayment) : "";
  const monthlySavings =
    currentPayment && estimatedNewPayment ? roundMoney(currentPayment - estimatedNewPayment) : "";
  const estimatedCosts = Math.abs(toNumber(pricing.pointsDollars));
  const breakEvenMonths =
    estimatedCosts && monthlySavings > 0 ? Math.ceil(estimatedCosts / monthlySavings) : "";

  return {
    loanPurpose: LOAN_PURPOSES.RATE_TERM_REFINANCE,
    estimatedCurrentPayment: currentPayment ? roundMoney(currentPayment) : "",
    estimatedNewPayment: estimatedNewPayment ? roundMoney(estimatedNewPayment) : "",
    monthlySavings,
    paymentDifference,
    breakEvenMonths,
  };
}

export function buildCashOutRefinanceAnalysis(scenario) {
  const currentLoanBalance = toNumber(scenario.currentLoanBalance);
  const desiredCashOut = toNumber(scenario.desiredCashOut);
  const estimatedNewLoanAmount = toNumber(scenario.loanAmount) || currentLoanBalance + desiredCashOut;

  return {
    loanPurpose: LOAN_PURPOSES.CASH_OUT_REFINANCE,
    currentLoanBalance: currentLoanBalance ? roundMoney(currentLoanBalance) : "",
    desiredCashOut: desiredCashOut ? roundMoney(desiredCashOut) : "",
    estimatedNewLoanAmount: estimatedNewLoanAmount ? roundMoney(estimatedNewLoanAmount) : "",
    estimatedLTV: calculateLtv(estimatedNewLoanAmount, scenario.estimatedPropertyValue),
  };
}

export function buildRefinanceAnalysis(scenario, pricing = {}) {
  const loanPurpose = normalizeLoanPurpose(scenario?.loanPurpose);

  if (loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE) {
    return buildRateTermRefinanceAnalysis(scenario, pricing);
  }

  if (loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE) {
    return buildCashOutRefinanceAnalysis(scenario);
  }

  return null;
}
