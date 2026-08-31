import { useMemo } from "react";
import { DISCLOSURE_COPY, DisclosureNote } from "./common/DisclosureNote";
import { useRefinanceComparison } from "../hooks/useRefinanceComparison";
import { LOAN_PURPOSES, normalizeLoanPurpose } from "../loanPurpose/loanPurposeConfig";
import { normalizeRefinanceScenarioFields } from "../scenario/scenarioUtils";
import { buildDebtConsolidationComparison } from "../utils/debtConsolidationComparison";

function formatCurrency(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatSignedCurrency(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "$0";

  const prefix = numeric > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(numeric))}`;
}

function formatPercent(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(2)}%`;
}

function formatMonths(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return `${numeric} months`;
}

function formatRefinanceType(value) {
  const labels = {
    rate_and_term: "Rate-and-term",
    cash_out: "Cash-out",
    unknown: "Unknown",
  };

  return labels[value] || labels.unknown;
}

function formatPurpose(value) {
  const labels = {
    lower_payment: "Lower payment",
    cash_out: "Cash out",
    debt_consolidation: "Debt consolidation",
    shorten_term: "Shorten term",
    unknown: "Not sure yet",
  };

  return labels[value] || labels.unknown;
}

function formatPaymentMovement(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "$0 change";
  if (numeric < 0) return `${formatCurrency(Math.abs(numeric))} savings`;
  return `${formatCurrency(numeric)} increase`;
}

function formatCashFlowImpact(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "$0 change";
  if (numeric > 0) return `${formatCurrency(numeric)} improvement`;
  return `${formatCurrency(Math.abs(numeric))} reduction`;
}

function hasCoreRefinanceInputs(scenario) {
  return Boolean(
    scenario?.propertyValue ||
      scenario?.estimatedPropertyValue ||
      scenario?.currentLoanBalance ||
      scenario?.currentInterestRate ||
      scenario?.requestedCashOut ||
      scenario?.desiredCashOut ||
      scenario?.newLoanAmount ||
      scenario?.loanAmount,
  );
}

function buildComparisonInput(scenario, pricing) {
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

function MetricCard({ label, value }) {
  return (
    <div className="refinance-comparison-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="comparison-assumption-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function RefinanceComparisonPanel({ scenario, pricing }) {
  const normalizedScenario = useMemo(() => normalizeRefinanceScenarioFields(scenario), [scenario]);
  const loanPurpose = normalizeLoanPurpose(normalizedScenario.loanPurpose);
  const isRefinance =
    loanPurpose === LOAN_PURPOSES.RATE_TERM_REFINANCE ||
    loanPurpose === LOAN_PURPOSES.CASH_OUT_REFINANCE;
  const comparisonInput = useMemo(() => buildComparisonInput(normalizedScenario, pricing), [normalizedScenario, pricing]);
  const comparison = useRefinanceComparison(comparisonInput);
  const debtComparison = useMemo(
    () =>
      buildDebtConsolidationComparison({
        debtConsolidationAmount: normalizedScenario.debtConsolidationAmount,
        debtConsolidationMonthlyPayments: normalizedScenario.debtConsolidationMonthlyPayments,
        refinancePaymentChange: comparison.monthlyPaymentDifference,
      }),
    [
      comparison.monthlyPaymentDifference,
      normalizedScenario.debtConsolidationAmount,
      normalizedScenario.debtConsolidationMonthlyPayments,
    ],
  );

  if (!isRefinance) return null;

  const isPending = !hasCoreRefinanceInputs(normalizedScenario);
  const isDebtConsolidation = normalizedScenario.refinancePurpose === "debt_consolidation";

  return (
    <section
      className="comparison-panel refinance-comparison-panel"
      aria-label="Refinance comparison"
      data-testid="refinance-comparison-panel"
    >
      <div className="comparison-header">
        <div>
          <h2 className="panel-title comparison-title">Refinance Comparison</h2>
          <div className="comparison-status">read-only</div>
        </div>
      </div>

      {isPending ? (
        <div className="rate-stack-empty">
          <strong>Refinance comparison is waiting for loan details</strong>
          <span>Add the current balance, property value, current rate, and new refinance details to compare them here.</span>
        </div>
      ) : (
        <>
          <div className="comparison-assumptions-summary refinance-benefit-summary" data-testid="refinance-benefit-summary">
            <div className="comparison-assumptions-title">Borrower Summary</div>
            <div className="comparison-assumptions-grid">
              <SummaryCard label="Purpose" value={formatPurpose(normalizedScenario.refinancePurpose)} />
              <SummaryCard
                label="Current Payment"
                value={formatCurrency(comparison.currentMonthlyPrincipalAndInterest)}
              />
              <SummaryCard
                label="New Payment"
                value={formatCurrency(comparison.newMonthlyPrincipalAndInterest)}
              />
              <SummaryCard
                label="Mortgage Payment Change"
                value={formatPaymentMovement(comparison.monthlyPaymentDifference)}
              />
              <SummaryCard label="Cash Out Amount" value={comparison.cashOutAmount ? formatCurrency(comparison.cashOutAmount) : "-"} />
              <SummaryCard label="Net Cash To Borrower" value={formatCurrency(comparison.netCashToBorrower)} />
              <SummaryCard label="Break-even" value={formatMonths(comparison.breakevenMonths)} />
              <SummaryCard label="New LTV" value={formatPercent(comparison.newLoanToValue)} />
              {comparison.cashOutExceedsAvailableEquity ? (
                <div data-testid="high-cash-out-warning">
                  <SummaryCard label="Equity Check" value="Cash out may exceed available equity" />
                </div>
              ) : null}
              {isDebtConsolidation ? (
                <>
                  <SummaryCard
                    label="Debt Being Paid Off"
                    value={formatCurrency(debtComparison.debtConsolidationAmount)}
                  />
                  <SummaryCard
                    label="Current Debt Payments"
                    value={formatCurrency(debtComparison.currentDebtMonthlyPayments)}
                  />
                  <SummaryCard
                    label="Monthly Cash-flow Impact"
                    value={formatCashFlowImpact(debtComparison.estimatedMonthlyCashFlowImprovement)}
                  />
                </>
              ) : null}
            </div>
            {isDebtConsolidation ? <p>{debtComparison.note}</p> : null}
          </div>

          <DisclosureNote copy={DISCLOSURE_COPY.refinance} testId="refinance-disclosure" />

          <div className="comparison-payment-summary">
            <div className="comparison-payment-summary-title">Payment Comparison</div>
            <div className="comparison-payment-grid">
              <MetricCard
                label="Current Payment"
                value={formatCurrency(comparison.currentMonthlyPrincipalAndInterest)}
              />
              <MetricCard
                label="New Payment"
                value={formatCurrency(comparison.newMonthlyPrincipalAndInterest)}
              />
              <MetricCard
                label="Monthly Savings"
                value={formatCurrency(comparison.monthlySavings)}
              />
            </div>
          </div>

          <div className="comparison-summary">
            <MetricCard
              label="Monthly Difference"
              value={formatSignedCurrency(comparison.monthlyPaymentDifference)}
            />
            <MetricCard
              label="Estimated Closing Costs"
              value={formatCurrency(comparison.totalEstimatedClosingCosts)}
            />
            <MetricCard
              label="Cash Out Amount"
              value={comparison.cashOutAmount ? formatCurrency(comparison.cashOutAmount) : "-"}
            />
            <MetricCard
              label="Net Cash To Borrower"
              value={formatCurrency(comparison.netCashToBorrower)}
            />
            <MetricCard
              label="Break-even Months"
              value={formatMonths(comparison.breakevenMonths)}
            />
            <MetricCard
              label="New LTV"
              value={formatPercent(comparison.newLoanToValue)}
            />
            <MetricCard
              label="Refinance Type"
              value={formatRefinanceType(comparison.refinanceType)}
            />
          </div>
        </>
      )}
    </section>
  );
}
