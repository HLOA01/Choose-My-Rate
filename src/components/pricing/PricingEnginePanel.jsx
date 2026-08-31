import { DISCLOSURE_COPY, DisclosureNote } from "../common/DisclosureNote";
import { BorrowerRateCards } from "./BorrowerRateCards";

function formatCurrency(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";

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

function formatPointsCreditLabel(value) {
  const numeric = Number(value || 0);

  if (numeric < 0) return `${formatPercent(Math.abs(numeric))} Credit`;
  if (numeric > 0) return `${formatPercent(numeric)} Cost`;
  return "No Points";
}

function formatCostCreditDollars(pointsPct, pointsDollars) {
  const pct = Number(pointsPct || 0);
  const dollars = Math.abs(Number(pointsDollars || 0));

  if (pct > 0) return `Cost: ${formatCurrency(dollars)}`;
  if (pct < 0) return `Credit: ${formatCurrency(dollars)}`;
  return "No Cost (Par)";
}

function formatSignedCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric === 0) return "$0";
  const prefix = numeric > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(numeric))}`;
}

function RefinanceSummaryCards({ analysis }) {
  if (!analysis) return null;

  if (analysis.loanPurpose === "rate_term_refinance") {
    return (
      <div className="refinance-summary-grid" aria-label="Rate-and-term refinance summary">
        <div className="refinance-summary-card">
          <span>Current Payment</span>
          <strong>{formatCurrency(analysis.estimatedCurrentPayment)}</strong>
        </div>
        <div className="refinance-summary-card">
          <span>New Payment</span>
          <strong>{formatCurrency(analysis.estimatedNewPayment)}</strong>
        </div>
        <div className="refinance-summary-card">
          <span>Monthly Savings</span>
          <strong>{formatSignedCurrency(analysis.monthlySavings)}</strong>
        </div>
      </div>
    );
  }

  if (analysis.loanPurpose === "cash_out_refinance") {
    return (
      <div className="refinance-summary-grid cash-out-summary-grid" aria-label="Cash-out refinance summary">
        <div className="refinance-summary-card">
          <span>Current Balance</span>
          <strong>{formatCurrency(analysis.currentLoanBalance)}</strong>
        </div>
        <div className="refinance-summary-card">
          <span>Cash Received</span>
          <strong>{formatCurrency(analysis.desiredCashOut)}</strong>
        </div>
        <div className="refinance-summary-card">
          <span>New Loan Amount</span>
          <strong>{formatCurrency(analysis.estimatedNewLoanAmount)}</strong>
        </div>
        <div className="refinance-summary-card">
          <span>Estimated LTV</span>
          <strong>{formatPercent(analysis.estimatedLTV, 2)}</strong>
        </div>
      </div>
    );
  }

  return null;
}

export function PricingEnginePanel({
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
  selectedLiveOption,
  selectedLiveOptionIndex,
  selectedOptionPosition,
  selectedPricingTableRowRef,
  selectedRateStackItemRef,
  onRateWheel,
  onSelectLiveOption,
}) {
  const isMockPricing = pricingQuote?.status === "mock";
  const pricingModeLabel = isMockPricing ? "Sample rate options" : enginePricing ? "Connected rate options" : "";
  const pricingHeaderText = isMockPricing ? "Sample rates for local development" : "Current rate options based on a 30-day lock";
  const rateStackLabel = isMockPricing ? "sample rate options" : "rate options";

  return (
    <div className="pricing-panel" data-testid="pricing-panel">
      <div className="panel-header pricing-header">
        <div>
          <h2 className="panel-title pricing-title-white">Your Rate Options</h2>
          <div className="pricing-status-line">{pricingHeaderText}</div>
          {pricingModeLabel ? (
            <div
              className={`pricing-mode-indicator ${isMockPricing ? "demo-mode" : "live-mode"}`}
              data-testid="pricing-mode-indicator"
            >
              {pricingModeLabel}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="pricing-info"
          title="This rate is not locked yet. A rate only becomes secured after a full application, property address, and confirmed lock with the lender."
          aria-label="Rate lock information"
        >
          i
        </button>
      </div>

      <div className="pricing-status-note">{pricingStatusText}</div>
      <DisclosureNote copy={DISCLOSURE_COPY.pricing} testId="pricing-disclosure" />
      {pricingQuote?.banner ? <div className="pricing-banner">{pricingQuote.banner}</div> : null}
      {pricingPausedMessage ? <div className="pricing-paused">{pricingPausedMessage}</div> : null}
      <RefinanceSummaryCards analysis={refinanceAnalysis} />

      {!pricingPausedMessage ? (
        <BorrowerRateCards
          options={livePricingOptions}
          selectedOption={selectedLiveOption}
          onSelectOption={onSelectLiveOption}
        />
      ) : null}

      <div className="payment-hero">
        <div className="payment-main">
          <div className="mini-label">Estimated Monthly Payment</div>
          <div className="payment-value">{formatCurrency(pricingPausedMessage ? "" : pricing.total)}</div>
          {pricing.program ? <div className="pricing-program">{pricing.program}</div> : null}
          {pricing.tags?.length ? (
            <div className="pricing-tags">
              {pricing.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="payment-mini-breakdown">
          <div><span>P&I</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.principalInterest)}</strong></div>
          <div><span>Taxes</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.taxes)}</strong></div>
          <div><span>Insurance</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.insurance)}</strong></div>
          <div><span>MI</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.mortgageInsurance)}</strong></div>
        </div>
      </div>

      {enginePricing && livePricingOptions.length > 0 ? (
        <div className="rate-wheel-section">
          <div className="rate-stack-heading">
            <span>Available Rates</span>
            <strong>{livePricingOptions.length} {rateStackLabel}</strong>
          </div>
          <div className="rate-wheel-shell">
            <button
              type="button"
              className="wheel-nav"
              onClick={() => onSelectLiveOption(livePricingOptions[selectedLiveOptionIndex - 1])}
              disabled={selectedLiveOptionIndex <= 0}
              aria-label="Previous rate"
            >
              &lsaquo;
            </button>
            <div className="rate-wheel" aria-label="Rate selector" onWheel={onRateWheel}>
              {livePricingOptions.map((option, index) => {
                const distance = Math.min(Math.abs(index - selectedLiveOptionIndex), 5);
                const isSelected = option.optionId === selectedLiveOption?.optionId;

                return (
                  <button
                    key={option.optionId}
                    ref={isSelected ? selectedRateStackItemRef : null}
                    type="button"
                    className={`rate-wheel-item ${isSelected ? "selected" : ""}`}
                    style={{
                      "--distance": distance,
                    }}
                    onClick={() => onSelectLiveOption(option)}
                    aria-label={`Select rate ${formatPercent(option.rate)}`}
                  >
                    <span>{formatPercent(option.rate)}</span>
                    <small>{formatPointsCreditLabel(option.price)}</small>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="wheel-nav"
              onClick={() => onSelectLiveOption(livePricingOptions[selectedLiveOptionIndex + 1])}
              disabled={selectedLiveOptionIndex >= livePricingOptions.length - 1}
              aria-label="Next rate"
            >
              &rsaquo;
            </button>
          </div>
          <div className="rate-option-count">
            Option {selectedOptionPosition} of {livePricingOptions.length}
          </div>
        </div>
      ) : (
        <div className="rate-stack-empty">
          <strong>
            {isPricingLoading
              ? "Loading lender rate stack"
              : hasPricingScenario
              ? "No eligible rate options returned"
              : "Current rate options will appear here"}
          </strong>
          <span>
            {hasPricingScenario
              ? "Adjust the loan details or program type so Sally can request another set of 30-day rate options."
              : "Add the core loan details and Sally will load selectable rate options."}
          </span>
        </div>
      )}

      <div className="pricing-detail-grid">
        <div className="pricing-detail-card">
          <span>Selected Rate</span>
          <strong>{formatPercent(pricingPausedMessage ? "" : pricing.rate)}</strong>
        </div>
        <div className="pricing-detail-card">
          <span>Points / Credit</span>
          <strong className={pricing.pointsPct < 0 ? "credit-text" : pricing.pointsPct > 0 ? "cost-text" : ""}>
            {pricingPausedMessage ? "Paused" : formatPointsCreditLabel(pricing.pointsPct)}
          </strong>
          <small>
            {pricingPausedMessage
              ? "Unavailable"
              : pricing.pointsPct > 0
              ? formatCurrency(pricing.pointsDollars)
              : pricing.pointsPct < 0
              ? `+${formatCurrency(Math.abs(pricing.pointsDollars))}`
              : "No charge"}
          </small>
        </div>
        <div className="pricing-detail-card">
          <span>Cost / Credit</span>
          <strong className={pricing.pointsPct < 0 ? "credit-text" : pricing.pointsPct > 0 ? "cost-text" : ""}>
            {pricingPausedMessage ? "Unavailable" : formatCostCreditDollars(pricing.pointsPct, pricing.pointsDollars)}
          </strong>
          <small>Rate option impact</small>
        </div>
      </div>

      {rateGuidanceMessage ? (
        <div className="sally-rate-guidance">
          <strong>Sally says</strong>
          <span>{rateGuidanceMessage}</span>
        </div>
      ) : null}

      <button type="button" className="closing-costs-link">
        Want to see estimated closing costs?
      </button>

      {!pricingPausedMessage && livePricingOptions.length > 0 ? (
        <div className="pricing-table-wrap">
          <div className="pricing-table-heading">
            <span>Available 30-day rate options</span>
            <strong>{livePricingOptions.length} options</strong>
          </div>
          <div className="pricing-table" role="table" aria-label="Available rate options">
            <div className="pricing-table-row pricing-table-head" role="row">
              <span>Rate</span>
              <span>Payment</span>
              <span>Points/Credit</span>
            </div>
            {livePricingOptions.map((option) => {
              const isSelected = selectedLiveOption?.optionId === option.optionId;
              return (
                <button
                  key={option.optionId}
                  ref={isSelected ? selectedPricingTableRowRef : null}
                  type="button"
                  className={`pricing-table-row ${isSelected ? "active" : ""}`}
                  onClick={() => onSelectLiveOption(option)}
                  role="row"
                >
                  <span>
                    {formatPercent(option.rate)}
                    {option.tags?.length ? (
                      <small className="pricing-row-note">{option.tags.join(" / ")}</small>
                    ) : null}
                  </span>
                  <span>{formatCurrency(option.paymentPITI)}</span>
                  <span className={option.price < 0 ? "credit-text" : option.price > 0 ? "cost-text" : ""}>
                    {formatPointsCreditLabel(option.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
