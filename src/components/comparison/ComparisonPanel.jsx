import { DisclosureNote } from "../common/DisclosureNote";
import { DISCLOSURE_COPY } from "../common/disclosureCopy";

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

function formatPercent(value, digits = 3) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(digits)}%`;
}

function formatDeltaCurrency(delta) {
  const numeric = Number(delta);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "$0";
  const prefix = numeric > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(numeric))}`;
}

function formatMonthlyWinner(leftLabel, rightLabel, difference) {
  const numeric = Number(difference);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "Payments are the same";

  const winner = numeric > 0 ? leftLabel : rightLabel;
  return `${winner} saves ${formatCurrency(Math.abs(numeric))}/month`;
}

function formatLowerCashWinner(leftLabel, rightLabel, difference) {
  const numeric = Number(difference);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "Upfront cash is the same";

  const winner = numeric > 0 ? leftLabel : rightLabel;
  return `${winner} needs ${formatCurrency(Math.abs(numeric))} less upfront`;
}

function getMetric(side, keys) {
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

function getScenarioValue(side, key) {
  const scenario = side?.scenario && typeof side.scenario === "object" ? side.scenario : {};
  return scenario[key] ?? "";
}

function calculateDownPaymentPercent(side) {
  const existingPercent = getScenarioValue(side, "downPaymentPercent");
  if (existingPercent !== "" && existingPercent !== null && existingPercent !== undefined) {
    return existingPercent;
  }

  const purchasePrice = Number(getScenarioValue(side, "purchasePrice"));
  const downPayment = Number(getScenarioValue(side, "downPayment"));

  if (!Number.isFinite(purchasePrice) || !Number.isFinite(downPayment) || !purchasePrice || !downPayment) {
    return "";
  }

  return (downPayment / purchasePrice) * 100;
}

function formatCostCredit(value, dollarsValue) {
  const numeric = Number(value || 0);
  const dollars = Math.abs(Number(dollarsValue || 0));

  if (!Number.isFinite(numeric)) return "-";
  if (numeric < 0) return `${formatPercent(Math.abs(numeric))} Credit${dollars ? ` (${formatCurrency(dollars)})` : ""}`;
  if (numeric > 0) return `${formatPercent(numeric)} Cost${dollars ? ` (${formatCurrency(dollars)})` : ""}`;
  return "No Points";
}

function ComparisonSideCard({ side, fallbackLabel }) {
  const label = side?.label || fallbackLabel;
  const program = getMetric(side, ["program"]) || getScenarioValue(side, "loanType");
  const rate = getMetric(side, ["rate"]);
  const payment = getMetric(side, ["total", "paymentPITI", "monthlyPayment"]);
  const downPayment = getScenarioValue(side, "downPayment");
  const pointsPct = getMetric(side, ["pointsPct", "price"]);
  const pointsDollars = getMetric(side, ["pointsDollars"]);
  const mortgageInsurance = getMetric(side, ["mortgageInsurance"]);
  const assumptionRows = [
    ["Loan Type", getScenarioValue(side, "loanType")],
    ["Down Payment Percent", formatPercent(calculateDownPaymentPercent(side), 1)],
    ["Loan Amount", formatCurrency(getScenarioValue(side, "loanAmount"))],
    ["Occupancy", getScenarioValue(side, "occupancy") || "-"],
    ["ZIP Code", getScenarioValue(side, "zipCode") || "-"],
    ["Credit Score", getScenarioValue(side, "creditScore") || "-"],
  ];

  return (
    <div className="comparison-side-card">
      <div className="comparison-side-label">{label}</div>
      {side?.message ? <div className="comparison-side-message">{side.message}</div> : null}
      <div className="comparison-metric">
        <span>Program</span>
        <strong>{program || "-"}</strong>
      </div>
      <div className="comparison-metric">
        <span>Rate</span>
        <strong>{formatPercent(rate)}</strong>
      </div>
      <div className="comparison-metric">
        <span>Monthly Payment</span>
        <strong>{formatCurrency(payment)}</strong>
      </div>
      <div className="comparison-metric">
        <span>Down Payment</span>
        <strong>{formatCurrency(downPayment)}</strong>
      </div>
      <div className="comparison-metric">
        <span>Cost / Credit</span>
        <strong>{formatCostCredit(pointsPct, pointsDollars)}</strong>
      </div>
      <div className="comparison-metric">
        <span>Mortgage Insurance</span>
        <strong>{formatCurrency(mortgageInsurance)}</strong>
      </div>
      <div className="comparison-assumptions" aria-label={`${label} assumptions`}>
        <div className="comparison-assumptions-title">Assumptions</div>
        {assumptionRows.map(([name, value]) => (
          <div className="comparison-assumption-row" key={name}>
            <span>{name}</span>
            <strong>{value || "-"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparisonPanel({ comparison, isOpen = true, onClose }) {
  if (!isOpen || !comparison) return null;

  const deltas = comparison.summary?.deltas || comparison.deltas || {};
  const summaryText = comparison.summary?.text || comparison.summaryText || "";
  const leftLabel = comparison.left?.label || "Left";
  const rightLabel = comparison.right?.label || "Right";
  const leftPayment = getMetric(comparison.left, ["total", "paymentPITI", "monthlyPayment"]);
  const rightPayment = getMetric(comparison.right, ["total", "paymentPITI", "monthlyPayment"]);
  const leftCashToClose = getMetric(comparison.left, ["estimatedCashToClose", "cashToClose"]);
  const rightCashToClose = getMetric(comparison.right, ["estimatedCashToClose", "cashToClose"]);
  const leftMortgageInsurance = getMetric(comparison.left, ["mortgageInsurance"]);
  const rightMortgageInsurance = getMetric(comparison.right, ["mortgageInsurance"]);
  const assumptionScenario = comparison.left?.scenario || comparison.right?.scenario || {};
  const assumptions = [
    [`${leftLabel} Down Payment`, formatPercent(calculateDownPaymentPercent(comparison.left), 1)],
    [`${rightLabel} Down Payment`, formatPercent(calculateDownPaymentPercent(comparison.right), 1)],
    ["Purchase Price", formatCurrency(assumptionScenario.purchasePrice)],
    ["Credit Score", assumptionScenario.creditScore || "-"],
    ["ZIP", assumptionScenario.zipCode || "-"],
    ["Occupancy", assumptionScenario.occupancy || "-"],
  ];

  return (
    <section className="comparison-panel" aria-label="Loan comparison" data-testid="loan-comparison-panel">
      <div className="comparison-header">
        <div>
          <h2 className="panel-title comparison-title">{comparison.title || "Scenario Comparison"}</h2>
          <div className="comparison-status">{comparison.status || "read-only"}</div>
        </div>
        {onClose ? (
          <button type="button" className="comparison-close-btn" onClick={onClose}>
            Back to Rate Options
          </button>
        ) : null}
      </div>

      <div className="comparison-payment-summary">
        <div className="comparison-payment-summary-title">Monthly Payment Comparison</div>
        <div className="comparison-payment-grid">
          <div>
            <span>{leftLabel} Payment</span>
            <strong>{formatCurrency(leftPayment)}</strong>
          </div>
          <div>
            <span>{rightLabel} Payment</span>
            <strong>{formatCurrency(rightPayment)}</strong>
          </div>
          <div>
            <span>Monthly Difference</span>
            <strong>{formatMonthlyWinner(leftLabel, rightLabel, deltas.monthlyPayment?.difference)}</strong>
          </div>
        </div>
      </div>

      <DisclosureNote copy={DISCLOSURE_COPY.comparison} testId="comparison-disclosure" />

      <div className="comparison-payment-summary comparison-cash-summary">
        <div className="comparison-payment-summary-title">Cash to Close / Upfront Cost Comparison</div>
        <div className="comparison-payment-grid">
          <div>
            <span>{leftLabel} Estimated Upfront</span>
            <strong>{formatCurrency(leftCashToClose)}</strong>
          </div>
          <div>
            <span>{rightLabel} Estimated Upfront</span>
            <strong>{formatCurrency(rightCashToClose)}</strong>
          </div>
          <div>
            <span>Upfront Difference</span>
            <strong>{formatLowerCashWinner(leftLabel, rightLabel, deltas.cashToClose?.difference)}</strong>
          </div>
        </div>
      </div>

      <div className="comparison-assumptions-summary">
        <div className="comparison-assumptions-title">Assumptions Used</div>
        <div className="comparison-assumptions-grid">
          {assumptions.map(([name, value]) => (
            <div className="comparison-assumption-chip" key={name}>
              <span>{name}</span>
              <strong>{value || "-"}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="comparison-sides">
        <ComparisonSideCard side={comparison.left} fallbackLabel="Left option" />
        <ComparisonSideCard side={comparison.right} fallbackLabel="Right option" />
      </div>

      <div className="comparison-summary">
        <div className="comparison-summary-item">
          <span>Payment Difference</span>
          <strong>{formatDeltaCurrency(deltas.monthlyPayment?.difference)}</strong>
        </div>
        <div className="comparison-summary-item">
          <span>Cost Difference</span>
          <strong>{formatDeltaCurrency(deltas.cashToClose?.difference)}</strong>
        </div>
        <div className="comparison-summary-item">
          <span>Mortgage Insurance Difference</span>
          <strong>{formatDeltaCurrency(deltas.mortgageInsurance?.difference)}</strong>
        </div>
        <div className="comparison-summary-item">
          <span>{leftLabel} Mortgage Insurance</span>
          <strong>{formatCurrency(leftMortgageInsurance)}</strong>
        </div>
        <div className="comparison-summary-item">
          <span>{rightLabel} Mortgage Insurance</span>
          <strong>{formatCurrency(rightMortgageInsurance)}</strong>
        </div>
        {summaryText ? <p>{summaryText}</p> : null}
      </div>
    </section>
  );
}
