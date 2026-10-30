// Versioned client adapters for the existing public HLOA and legacy CMR schemas.
// These labels identify shape, not source approval, environment or freshness.
export const HLOA_QUOTE_V1 = 'hloa-borrower-quote-v1';
export const LEGACY_QUOTE_V1 = 'cmr-legacy-borrower-quote-v1';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const amount = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = (value) => amount(value) !== null && value >= 0 ? value : null;
const unavailableMessage = 'Online pricing is temporarily unavailable. No rates are shown until pricing is available.';

export function quoteUnavailableReason(quote, now = Date.now()) {
  if (!quote || !['live', 'warning'].includes(quote.status)) return 'unavailable';
  if (quote.contractVersion && ![HLOA_QUOTE_V1, LEGACY_QUOTE_V1].includes(quote.contractVersion)) return 'unsupported_contract';
  if (quote.snapshotStatus && quote.snapshotStatus !== 'live') return 'superseded';
  if (quote.supersededBy || quote.superseded === true) return 'superseded';
  if (quote.pricingAsOf != null && (!Number.isFinite(Date.parse(quote.pricingAsOf)) || Date.parse(quote.pricingAsOf) > now)) return 'invalid_timestamp';
  for (const field of ['expiresAt', 'quoteExpiresAt']) {
    if (quote[field] != null) {
      const deadline = Date.parse(quote[field]);
      if (!Number.isFinite(deadline)) return 'invalid_timestamp';
      if (deadline <= now) return 'expired';
    }
  }
  return null;
}

const unknownView = () => ({ contractVersion: null, feeStatus: 'UNAVAILABLE', pricingOption: null,
  knownClosingCosts: null, cashToClose: null, lineItems: [], unpriced: [], legacyEstimate: null });

function adjustments(pointsPercent, pointsDollars, lenderCreditPercent, lenderCreditDollars) {
  const values = [pointsPercent, pointsDollars, lenderCreditPercent, lenderCreditDollars].map(nonnegative);
  if (values.includes(null) || (pointsPercent > 0 && lenderCreditPercent > 0)
    || (pointsDollars > 0 && lenderCreditDollars > 0)
    || (pointsPercent === 0) !== (pointsDollars === 0)
    || (lenderCreditPercent === 0) !== (lenderCreditDollars === 0)) return null;
  return { pointsPercent, pointsDollars, lenderCreditPercent, lenderCreditDollars };
}

export function borrowerQuoteView(option) {
  if (option?.quoteView) return option.quoteView;
  const raw = option?.borrowerQuote;
  if (!raw || typeof raw !== 'object') return unknownView();
  // An explicit new-schema field always wins, including null/invalid values.
  // Never fill missing HLOA data from conflicting legacy fields.
  if (own(raw, 'feeCompleteness') || raw.contractVersion === HLOA_QUOTE_V1) {
    const view = { ...unknownView(), contractVersion: HLOA_QUOTE_V1 };
    if (raw.contractVersion && raw.contractVersion !== HLOA_QUOTE_V1) return view;
    if (!['COMPLETE_ESTIMATE', 'PARTIAL_ESTIMATE', 'UNAVAILABLE'].includes(raw.feeCompleteness?.status)) return view;
    view.feeStatus = raw.feeCompleteness.status;
    const metadata = raw.feeCompleteness.unpriced;
    const validMissingItem = (item) => item && !Array.isArray(item) && typeof item === 'object'
      && ['category', 'feeKey', 'reason'].every((key) => typeof item[key] === 'string' && item[key].trim().length > 0);
    const missingItems = Array.isArray(metadata) ? metadata.filter(validMissingItem) : [];
    view.unpriced = missingItems.map(({ category, feeKey, reason }) => ({ category, feeKey, reason }));
    if (!Array.isArray(metadata) || missingItems.length !== metadata.length) {
      view.feeStatus = 'UNAVAILABLE';
      view.unpriced.push({ category: 'other', feeKey: 'invalid_fee_metadata', reason: 'invalid_unpriced_metadata' });
      return view;
    }
    if (view.unpriced.length && view.feeStatus === 'COMPLETE_ESTIMATE') view.feeStatus = 'PARTIAL_ESTIMATE';
    if (view.feeStatus === 'UNAVAILABLE') return view;
    view.pricingOption = adjustments(raw.points?.percent, raw.points?.dollars, raw.lenderCreditFromPrice?.percent, raw.lenderCreditFromPrice?.dollars);
    view.knownClosingCosts = amount(raw.estimatedClosingCosts);
    view.cashToClose = amount(raw.estimatedCashToClose);
    if (!view.pricingOption) {
      view.feeStatus = 'PARTIAL_ESTIMATE';
      view.knownClosingCosts = null;
      view.cashToClose = null;
      view.unpriced.push({ category: 'loan_cost', feeKey: 'rate_adjustment', reason: 'invalid_rate_adjustment' });
    }
    const items = Array.isArray(raw.lineItems) ? raw.lineItems : [];
    const validItems = items.filter((item) => nonnegative(item?.amount) !== null && ['debit', 'credit'].includes(item?.direction)
      && ['estimated', 'confirmed', 'verified', 'final'].includes(item?.status));
    if (!Array.isArray(raw.lineItems) || validItems.length !== items.length) {
      view.feeStatus = 'PARTIAL_ESTIMATE';
      view.knownClosingCosts = null;
      view.cashToClose = null;
      view.unpriced.push({ category: 'other', feeKey: 'invalid_fee_items', reason: 'invalid_fee_items' });
    }
    view.lineItems = validItems.map((item) => ({
      category: String(item.category || 'other'), feeKey: String(item.feeKey || ''), label: String(item.label || 'Fee item'),
      amount: item.amount, direction: item.direction, status: String(item.status || 'unverified'),
    }));
    return view;
  }
  if (raw.contractVersion && raw.contractVersion !== LEGACY_QUOTE_V1) return unknownView();
  // Legacy v1 requires its own two named structures; arbitrary options are not
  // assumed to be the old contract. Estimates remain estimates.
  if (!raw.pricingOption || !raw.closingCostEstimate) return unknownView();
  const estimate = raw.closingCostEstimate;
  const status = { complete: 'COMPLETE_ESTIMATE', estimate_incomplete: 'PARTIAL_ESTIMATE', estimate_unavailable: 'UNAVAILABLE' }[estimate.status];
  if (!status) return unknownView();
  const pricing = raw.pricingOption;
  return {
    ...unknownView(), contractVersion: LEGACY_QUOTE_V1, feeStatus: status,
    pricingOption: adjustments(pricing.pointsPercent, pricing.pointsDollars, pricing.lenderCreditPercent, pricing.lenderCreditDollars),
    knownClosingCosts: status === 'UNAVAILABLE' ? null : amount(raw.estimatedClosingCharges),
    legacyEstimate: { status: estimate.status, estimatedBaseClosingCosts: amount(estimate.estimatedBaseClosingCosts),
      feeScheduleVersion: typeof estimate.feeScheduleVersion === 'string' ? estimate.feeScheduleVersion : null,
      asOf: estimate.asOf ?? null },
  };
}

export function normalizeBorrowerQuoteResponse(raw, now = Date.now()) {
  const reason = quoteUnavailableReason(raw, now);
  const base = {
    status: reason ? 'pricing_temporarily_unavailable' : raw.status,
    message: reason ? unavailableMessage : raw.message,
    banner: typeof raw?.banner === 'string' ? raw.banner : null,
    leadCaptureEnabled: Boolean(raw?.leadCaptureEnabled), callbackEnabled: Boolean(raw?.callbackEnabled),
    pricingAsOf: raw?.pricingAsOf ?? null, pricingVersionId: raw?.pricingVersionId ?? null,
    expiresAt: raw?.expiresAt ?? null, quoteExpiresAt: raw?.quoteExpiresAt ?? null,
    options: [],
  };
  if (reason) return base;
  for (const option of Array.isArray(raw.options) ? raw.options : []) {
    if (typeof option.optionId !== 'string' || !option.optionId || typeof option.program !== 'string'
      || nonnegative(option.rate) === null || option.rate === 0 || amount(option.price) === null
      || nonnegative(option.paymentPI) === null) return { ...base, status: 'pricing_temporarily_unavailable', message: unavailableMessage, options: [] };
    let detail = option.borrowerQuote;
    if (raw.contractVersion) {
      detail = detail?.contractVersion && detail.contractVersion !== raw.contractVersion ? null : { ...detail, contractVersion: raw.contractVersion };
      if (raw.contractVersion === LEGACY_QUOTE_V1 && own(detail, 'feeCompleteness')) detail = null;
    }
    base.options.push({ optionId: option.optionId, program: option.program, rate: option.rate, price: option.price,
      paymentPI: option.paymentPI, paymentPITI: nonnegative(option.paymentPITI),
      tags: Array.isArray(option.tags) ? option.tags.filter((tag) => typeof tag === 'string') : [],
      quoteView: borrowerQuoteView({ borrowerQuote: detail }),
    });
  }
  if (new Set(base.options.map((option) => option.optionId)).size !== base.options.length) return { ...base, options: [], status: 'pricing_temporarily_unavailable', message: unavailableMessage };
  return base;
}

export const FEE_CATEGORY_LABELS = {
  loan_cost: 'Loan costs', title_settlement: 'Title and settlement', government: 'Government fees',
  prepaid: 'Prepaid items', initial_escrow: 'Initial escrow', program_specific: 'Program fees', credit: 'Credits',
};

export const APPLICATION_HANDOFF_KEY = 'chooseMyRate.applicationHandoff.v1';
export function clearApplicationHandoff() {
  try { globalThis.sessionStorage?.removeItem(APPLICATION_HANDOFF_KEY); } catch { /* Storage may be disabled. */ }
}
