// Synthetic TEST data matching HLOA's BorrowerSafeQuoteResponse and
// BorrowerQuoteDetail at HLOA commit 197d5ea. Never imported by application code.
export function hloaQuote({ feeStatus = 'PARTIAL_ESTIMATE', rate = 6.5, price = 0.125, now = Date.now(), ...overrides } = {}) {
  const adjustment = Math.round(427500 * Math.abs(price)) / 100;
  const knownCosts = 1250 + (price < 0 ? -adjustment : adjustment);
  return {
    status: 'live', pricingVersionId: 'synthetic-snapshot-v1', pricingAsOf: new Date(now - 1000).toISOString(),
    leadCaptureEnabled: true, callbackEnabled: true,
    options: [{
      optionId: 'synthetic-rate-1', program: 'Conventional 30 Year Fixed', rate, price, paymentPI: 2700, paymentPITI: 3200,
      tags: [], displayLender: false,
      borrowerQuote: {
        points: { percent: price > 0 ? price : 0, dollars: price > 0 ? adjustment : 0 },
        lenderCreditFromPrice: { percent: price < 0 ? -price : 0, dollars: price < 0 ? adjustment : 0 },
        feeCompleteness: { status: feeStatus, unpriced: feeStatus === 'PARTIAL_ESTIMATE' ? [{ category: 'title_settlement', feeKey: 'title', reason: 'no_provider' }] : [] },
        feeTotals: feeStatus === 'UNAVAILABLE' ? null : { loanCosts: 1250, titleSettlement: 0, government: 0, prepaids: 0, initialEscrows: 0, programSpecific: 0, credits: 0 },
        estimatedClosingCosts: feeStatus === 'UNAVAILABLE' ? null : knownCosts,
        estimatedCashToClose: feeStatus === 'UNAVAILABLE' ? null : 22500 + knownCosts,
        lineItems: feeStatus === 'UNAVAILABLE' ? [] : [{ category: 'loan_cost', feeKey: 'origination', label: 'Origination fee', amount: 1250, direction: 'debit', status: 'estimated' }],
        monthlyPayment: { principalAndInterest: 2700, principalAndInterestStatus: 'calculated', estimatedTaxesAndInsuranceCombined: 500,
          estimatedTaxesAndInsuranceStatus: 'estimated', mortgageInsuranceStatus: 'unavailable', totalMonthlyPayment: 3200, totalMonthlyPaymentStatus: 'estimated' },
      },
    }],
    ...overrides,
  };
}
