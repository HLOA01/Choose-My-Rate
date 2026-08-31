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

function formatPointsCredit(value) {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric)) return "-";
  if (numeric < 0) return `${formatPercent(Math.abs(numeric))} credit`;
  if (numeric > 0) return `${formatPercent(numeric)} cost`;
  return "No points";
}

function getPayment(option) {
  const payment = Number(option?.paymentPITI ?? option?.paymentPI);
  return Number.isFinite(payment) ? payment : Number.POSITIVE_INFINITY;
}

function getCashToClose(option) {
  const cashToClose = Number(option?.estimatedCashToClose);
  return Number.isFinite(cashToClose) ? cashToClose : Number.POSITIVE_INFINITY;
}

function getPriceDistance(option) {
  const price = Number(option?.price || 0);
  return Number.isFinite(price) ? Math.abs(price) : Number.POSITIVE_INFINITY;
}

function pickLowestPayment(options) {
  return [...options].sort((left, right) => getPayment(left) - getPayment(right))[0] || null;
}

function pickLowestUpfront(options) {
  const withCashToClose = options.filter((option) => Number.isFinite(Number(option?.estimatedCashToClose)));
  const source = withCashToClose.length ? withCashToClose : options;

  return [...source].sort((left, right) => {
    const cashDelta = getCashToClose(left) - getCashToClose(right);
    if (Number.isFinite(cashDelta) && cashDelta !== 0) return cashDelta;
    return Number(left?.price || 0) - Number(right?.price || 0);
  })[0] || null;
}

function pickBalanced(options) {
  return [...options].sort((left, right) => {
    const priceDelta = getPriceDistance(left) - getPriceDistance(right);
    if (priceDelta !== 0) return priceDelta;
    return getPayment(left) - getPayment(right);
  })[0] || null;
}

function optionKey(option) {
  return option?.optionId || `${option?.rate}-${option?.price}-${option?.paymentPITI}`;
}

function chooseCards(options) {
  const validOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!validOptions.length) return [];

  const selected = [];
  const used = new Set();
  const candidates = [
    {
      id: "lower-payment",
      label: "Lower Payment",
      headline: "Pay less each month",
      tradeoff: "Usually means paying more upfront for the lower monthly payment.",
      option: pickLowestPayment(validOptions),
    },
    {
      id: "balanced-option",
      label: "Balanced Option",
      headline: "Middle-ground choice",
      tradeoff: "A balanced mix of monthly payment and upfront cost.",
      option: pickBalanced(validOptions),
    },
    {
      id: "lower-upfront-cost",
      label: "Lower Upfront Cost",
      headline: "Bring less cash now",
      tradeoff: "Usually means accepting a higher monthly payment for more credit or lower cost today.",
      option: pickLowestUpfront(validOptions),
    },
  ];

  for (const candidate of candidates) {
    let option = candidate.option;
    let key = optionKey(option);

    if (!option || used.has(key)) {
      option = validOptions.find((item) => !used.has(optionKey(item))) || option;
      key = optionKey(option);
    }

    if (!option) continue;
    used.add(key);
    selected.push({ ...candidate, option });
  }

  return selected;
}

export function BorrowerRateCards({ options, selectedOption, onSelectOption }) {
  const cards = chooseCards(options);

  if (!cards.length) {
    return (
      <section className="borrower-rate-cards" data-testid="borrower-rate-cards">
        <div className="borrower-rate-cards-header">
          <div>
            <div className="mini-label">Choose your rate</div>
            <h3>Rate choices will appear here</h3>
          </div>
        </div>
        <div className="borrower-rate-empty" data-testid="borrower-rate-cards-empty">
          Add the basic loan details to compare payment and upfront cost options.
        </div>
      </section>
    );
  }

  return (
    <section className="borrower-rate-cards" data-testid="borrower-rate-cards" aria-label="Choose your rate">
      <div className="borrower-rate-cards-header">
        <div>
          <div className="mini-label">Choose your rate</div>
          <h3>Compare payment vs upfront cost</h3>
        </div>
        <p>Pick the option that fits how you want to balance monthly payment and cash due now.</p>
      </div>

      <div className="borrower-rate-card-grid">
        {cards.map((card) => {
          const isSelected = optionKey(card.option) === optionKey(selectedOption);
          return (
            <button
              key={card.id}
              type="button"
              className={`borrower-rate-card ${isSelected ? "selected" : ""}`}
              data-testid={`borrower-rate-card-${card.id}`}
              onClick={() => onSelectOption?.(card.option)}
            >
              <span className="borrower-rate-card-label">{card.label}</span>
              <strong>{card.headline}</strong>
              <div className="borrower-rate-card-main">
                <span>{formatPercent(card.option.rate)}</span>
                <small>Estimated rate</small>
              </div>
              <div className="borrower-rate-card-details">
                <div>
                  <span>Payment</span>
                  <strong>{formatCurrency(card.option.paymentPITI || card.option.paymentPI)}</strong>
                </div>
                <div>
                  <span>Points / credit</span>
                  <strong>{formatPointsCredit(card.option.price)}</strong>
                </div>
                <div>
                  <span>Cash to close</span>
                  <strong>{formatCurrency(card.option.estimatedCashToClose)}</strong>
                </div>
              </div>
              <p>{card.tradeoff}</p>
            </button>
          );
        })}
      </div>

      <p className="borrower-rate-disclosure" data-testid="borrower-rate-cards-disclosure">
        Estimates only. Rate options are subject to change, rates are not locked, and this is not a loan approval.
      </p>
    </section>
  );
}
