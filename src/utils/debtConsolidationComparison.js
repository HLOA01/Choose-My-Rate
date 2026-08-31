function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
  const numeric = toNumberOrNull(value);
  return numeric === null ? null : Math.round(numeric);
}

export function buildDebtConsolidationComparison(input = {}) {
  const debtConsolidationAmount = Math.max(toNumberOrNull(input.debtConsolidationAmount) || 0, 0);
  const currentDebtMonthlyPayments = Math.max(toNumberOrNull(input.debtConsolidationMonthlyPayments) || 0, 0);
  const hasDebtAmount = debtConsolidationAmount > 0;
  const hasDebtPayments = currentDebtMonthlyPayments > 0;
  const refinancePaymentChange = roundMoney(input.refinancePaymentChange) || 0;
  const mortgageSavings = refinancePaymentChange < 0 ? Math.abs(refinancePaymentChange) : 0;
  const refinancePaymentIncrease = refinancePaymentChange > 0 ? refinancePaymentChange : 0;
  const estimatedMonthlyCashFlowImprovement =
    hasDebtAmount && hasDebtPayments
      ? roundMoney(currentDebtMonthlyPayments + mortgageSavings - refinancePaymentIncrease)
      : null;
  const status =
    !hasDebtAmount || !hasDebtPayments
      ? "missing_debt_inputs"
      : estimatedMonthlyCashFlowImprovement > 0
      ? "estimated_cash_flow_improvement"
      : estimatedMonthlyCashFlowImprovement === 0
      ? "estimated_cash_flow_neutral"
      : "estimated_cash_flow_reduction";

  return {
    currentDebtMonthlyPayments: roundMoney(currentDebtMonthlyPayments) || 0,
    refinancePaymentChange,
    mortgageSavings,
    refinancePaymentIncrease,
    estimatedMonthlyCashFlowImprovement,
    debtConsolidationAmount: roundMoney(debtConsolidationAmount) || 0,
    status,
    note:
      status === "missing_debt_inputs"
        ? "Add the debt amount and current monthly debt payments to estimate cash-flow impact."
        : "This is a simple monthly cash-flow estimate only. It does not calculate interest savings or payoff timelines.",
  };
}
