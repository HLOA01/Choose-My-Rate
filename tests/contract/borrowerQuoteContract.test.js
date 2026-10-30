import assert from 'node:assert/strict';
import { it } from 'node:test';
import { normalizeBorrowerQuoteResponse, HLOA_QUOTE_V1, LEGACY_QUOTE_V1, quoteUnavailableReason } from '../../src/pricing/borrowerQuoteContract.js';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';

it('maps HLOA partial fees and points with their supplied units; never invents APR or annualizes monthly payment', () => {
  const result = normalizeBorrowerQuoteResponse(hloaQuote());
  const option = result.options[0];
  assert.equal(option.rate, 6.5);
  assert.equal(option.paymentPI, 2700);
  assert.equal(option.apr, undefined);
  assert.equal(option.quoteView.contractVersion, HLOA_QUOTE_V1);
  assert.equal(option.quoteView.feeStatus, 'PARTIAL_ESTIMATE');
  assert.equal(option.quoteView.knownClosingCosts, 1784.38);
  assert.equal(option.quoteView.pricingOption.pointsPercent, 0.125);
  assert.equal(option.quoteView.pricingOption.pointsDollars, 534.38);
  assert.equal(option.quoteView.lineItems[0].status, 'estimated');
  assert.equal(option.quoteView.unpriced[0].category, 'title_settlement');
});

it('explicit HLOA unavailable/null wins conflicting legacy amounts and zero sentinels', () => {
  for (const status of ['UNAVAILABLE', null]) {
    const fixture = hloaQuote({ feeStatus: 'UNAVAILABLE' });
    const detail = fixture.options[0].borrowerQuote;
    detail.feeCompleteness = status === null ? null : { status, unpriced: [] };
    detail.pricingOption = { pointsPercent: 2, pointsDollars: 8000, lenderCreditPercent: 0, lenderCreditDollars: 0 };
    detail.closingCostEstimate = { status: 'complete', estimatedBaseClosingCosts: 9000 };
    detail.estimatedClosingCharges = 17000;
    const view = normalizeBorrowerQuoteResponse(fixture).options[0].quoteView;
    assert.equal(view.feeStatus, 'UNAVAILABLE');
    assert.equal(view.knownClosingCosts, null);
    assert.equal(view.pricingOption, null);
  }
  const fixture = hloaQuote();
  fixture.options[0].borrowerQuote.estimatedClosingCosts = null;
  fixture.options[0].borrowerQuote.estimatedClosingCharges = 9999;
  assert.equal(normalizeBorrowerQuoteResponse(fixture).options[0].quoteView.knownClosingCosts, null);
  fixture.contractVersion = HLOA_QUOTE_V1;
  delete fixture.options[0].borrowerQuote.feeCompleteness;
  fixture.options[0].borrowerQuote.closingCostEstimate = { status: 'complete' };
  const declaredNew = normalizeBorrowerQuoteResponse(fixture).options[0].quoteView;
  assert.equal(declaredNew.contractVersion, HLOA_QUOTE_V1);
  assert.equal(declaredNew.knownClosingCosts, null);
  assert.equal(declaredNew.feeStatus, 'UNAVAILABLE');
});

it('supports only the explicit legacy v1 schema without upgrading estimates to verified', () => {
  const fixture = hloaQuote();
  fixture.options[0].borrowerQuote = {
    pricingOption: { pointsPercent: 0, pointsDollars: 0, lenderCreditPercent: 0, lenderCreditDollars: 0 },
    closingCostEstimate: { status: 'complete', estimatedBaseClosingCosts: 1000, feeScheduleVersion: 'synthetic-old-v1' },
    estimatedClosingCharges: 1000,
  };
  const view = normalizeBorrowerQuoteResponse(fixture).options[0].quoteView;
  assert.equal(view.contractVersion, LEGACY_QUOTE_V1);
  assert.equal(view.feeStatus, 'COMPLETE_ESTIMATE');
  fixture.options[0].borrowerQuote.contractVersion = 'unknown-v99';
  assert.equal(normalizeBorrowerQuoteResponse(fixture).options[0].quoteView.contractVersion, null);
});

it('preserves genuine zero and positive lender credit magnitudes; rejects negative credit data', () => {
  const zero = normalizeBorrowerQuoteResponse(hloaQuote({ price: 0 }));
  assert.equal(zero.options[0].quoteView.pricingOption.pointsDollars, 0);
  const credit = hloaQuote({ price: -0.125 });
  assert.equal(normalizeBorrowerQuoteResponse(credit).options[0].quoteView.pricingOption.lenderCreditDollars, 534.38);
  credit.options[0].borrowerQuote.lenderCreditFromPrice.dollars = -500;
  assert.equal(normalizeBorrowerQuoteResponse(credit).options[0].quoteView.pricingOption, null);
  assert.equal(normalizeBorrowerQuoteResponse(hloaQuote({ rate: 0.065 })).options[0].rate, 0.065, 'rate is already a percent; no heuristic x100 conversion');
});

it('withholds options for unavailable/expired/superseded/unknown states even when options are attached', () => {
  const now = Date.parse('2026-10-30T12:00Z');
  for (const patch of [
    { status: 'pricing_temporarily_unavailable' }, { status: 'expired' }, { status: 'superseded' }, { status: 'test' },
    { expiresAt: '2026-10-30T11:59Z' }, { quoteExpiresAt: 'invalid' }, { superseded: true }, { snapshotStatus: 'archived' },
    { contractVersion: 'unknown-v99' }, { pricingAsOf: '2026-10-31T12:00Z' },
  ]) assert.deepEqual(normalizeBorrowerQuoteResponse(hloaQuote({ now, ...patch }), now).options, []);
  assert.equal(quoteUnavailableReason(hloaQuote({ now }), now), null, 'no client-created max-age policy');
});

it('strips unrecognized internal fields and rejects malformed rates rather than coercing null to zero', () => {
  const fixture = hloaQuote();
  fixture.options[0].lenderCode = 'PRIVATE_LENDER';
  fixture.options[0].rawPrice = 101;
  fixture.options[0].quoteView = { knownClosingCosts: 12345 };
  const result = normalizeBorrowerQuoteResponse(fixture);
  assert.equal(JSON.stringify(result).includes('PRIVATE_LENDER'), false);
  assert.equal(result.options[0].quoteView.knownClosingCosts, 1784.38);
  for (const rate of [null, NaN, Infinity, -1, '6.5']) {
    fixture.options[0].rate = rate;
    assert.deepEqual(normalizeBorrowerQuoteResponse(fixture).options, []);
  }
});

it('malformed fee line items cannot leave a complete total or silently disappear as zero', () => {
  const fixture = hloaQuote({ feeStatus: 'COMPLETE_ESTIMATE' });
  fixture.options[0].borrowerQuote.lineItems[0].amount = null;
  const view = normalizeBorrowerQuoteResponse(fixture).options[0].quoteView;
  assert.equal(view.feeStatus, 'PARTIAL_ESTIMATE');
  assert.equal(view.knownClosingCosts, null);
  assert.equal(view.unpriced[0].reason, 'invalid_fee_items');
});

it('malformed unpriced metadata never becomes an empty list with a complete estimate', () => {
  for (const metadata of [undefined, null, {}, 'none', [null], ['missing'],
    [{ category: 'title', feeKey: '', reason: 'missing' }], [{ category: 'title', feeKey: 'title', reason: null }]]) {
    const fixture = hloaQuote({ feeStatus: 'COMPLETE_ESTIMATE' });
    fixture.options[0].borrowerQuote.feeCompleteness.unpriced = metadata;
    const response = normalizeBorrowerQuoteResponse(fixture);
    assert.equal(response.options.length, 1, 'fee metadata does not invent a rate rejection');
    const view = response.options[0].quoteView;
    assert.equal(view.feeStatus, 'UNAVAILABLE');
    assert.equal(view.knownClosingCosts, null);
    assert.equal(view.cashToClose, null);
    assert.equal(view.unpriced.at(-1).reason, 'invalid_unpriced_metadata');
  }
});
