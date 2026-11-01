// Real pricing calculation with explicit synthetic dependencies; no persistent DB or provider.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://synthetic:unused@127.0.0.1:1/never-used';
process.env.ADMIN_API_KEY = 'synthetic-test-only';
process.env.ENABLE_SCHEDULER = 'false';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PricingVersion } from '../src/db/models/pricingVersion.js';
import type { PlatformControl } from '../src/db/models/platformControl.js';
import type { PricingRow } from '../src/db/models/pricingRow.js';
import { normalizePrmgData } from '../src/connectors/prmg/normalizePrmgData.js';
import { hasServablePrmgProvenance, PRMG_TRANSFORM_VERSION } from '../src/connectors/prmg/transformProvenance.js';
const { getPricingForScenarioWithDependencies } = await import('../src/engine/getPricingForScenario.js');
const now = new Date('2026-11-01T12:00:00Z');
const scenario = { purchasePrice: 500000, loanAmount: 400000, creditScore: 740, occupancy: 'primary' as const, loanPurpose: 'purchase' as const, loanTypePreference: 'conventional' as const, propertyType: 'single_family', zipCode: '92660' };
const control: PlatformControl = { id: 'synthetic', pricingStatus: 'live', bannerMessage: null, pauseMessage: null, callbackEnabled: true, leadCaptureEnabled: true, useLastPublishedPricing: true, activatedBy: null, activatedAt: now, updatedAt: now };
const version = (summary: unknown = { transformVersion: 'prmg-normalizer-v3' }): PricingVersion => ({ id: 'synthetic-version', lenderCode: 'PRMG', sourceUrl: 'test://synthetic', sourceHash: 'synthetic', sourceTimestamp: null, refreshStartedAt: now, refreshCompletedAt: now, effectiveDate: null, status: 'live', publishedAt: now, validationSummary: summary as Record<string, unknown>, createdAt: now });
const sourceRow = (metadata: Record<string, unknown>) => ({ sheetName: 'SYNTH', rowNumber: 2, values: [], object: { product: 'FNMA Conventional', rate: 6.5, price: 0, ...metadata } });
const stored = (metadata: Record<string, unknown>): PricingRow[] => normalizePrmgData([sourceRow(metadata)]).map((r, i) => ({ ...r, id: `synthetic-${i}`, pricingVersionId: 'synthetic-version', createdAt: now }));
describe('legacy quote metadata boundary (actual calculation, synthetic dependency reads)', () => {
  it('only the explicit legacy v3 marker is accepted; this is not lender/policy approval', () => {
    assert.equal(PRMG_TRANSFORM_VERSION, 'prmg-normalizer-v3');
    for (const summary of [null, [], {}, { transformVersion: 'prmg-normalizer-v2' }, { transformVersion: 'prmg-normalizer-v3-hloa' }, { transformVersion: 'prmg-normalizer-v3 ' }, Object.create({ transformVersion: 'prmg-normalizer-v3' })]) assert.equal(hasServablePrmgProvenance(summary), false);
    assert.equal(hasServablePrmgProvenance({ transformVersion: 'prmg-normalizer-v3' }), true);
  });
  it('missing or malformed source terms cannot become available options even if a dependency claims v3', async () => {
    for (const metadata of [{}, { lock: 30 }, { lock: 29.6, term_months: 360 }, { lock: 30, term: 'unknown' }, { lock: 30, product: 'FNMA 30.5 years 30 Yr Fixed' }, { lock: 30, product: 'FNMA -15 years 30 Yr Fixed' }, { lock: 30, product: 'FNMA 30.5 years Fixed', term_months: 360 }]) {
      const response = await getPricingForScenarioWithDependencies(scenario, { getPlatformControl: async () => control, getLatestLiveVersion: async () => version(), getRowsForVersion: async () => stored(metadata) });
      assert.equal(response.status, 'no_eligible_options', JSON.stringify(metadata));
      assert.deepEqual(response.options, []);
    }
  });
  it('explicit 30-day / 30-year source metadata continues through real selection, ranking and quote assembly', async () => {
    const response = await getPricingForScenarioWithDependencies(scenario, { getPlatformControl: async () => control, getLatestLiveVersion: async () => version(), getRowsForVersion: async () => stored({ lock_days: 30, product: 'FNMA Conventional 30 Yr Fixed' }) });
    assert.equal(response.status, 'live');
    assert.equal(response.options.length, 1);
    assert.equal(response.options[0]?.paymentPI, 2528.27, '400000 at 6.5% over the explicit 360 months');
    assert.equal(response.options[0]?.rate, 6.5);
    assert.ok(response.options[0]!.paymentPI > 0);
  });
  it('retained old or malformed publication metadata is refused BEFORE loading its rows', async () => {
    for (const summary of [{}, { transformVersion: 'prmg-normalizer-v2' }, null, [], { transformVersion: 3 }]) {
      const response = await getPricingForScenarioWithDependencies(scenario, { getPlatformControl: async () => control, getLatestLiveVersion: async () => version(summary), getRowsForVersion: async () => { throw new Error('unverified publication rows must not be loaded'); } });
      assert.equal(response.status, 'no_live_pricing'); assert.deepEqual(response.options, []);
    }
  });
  it('replacement, archive or provenance loss during row I/O cannot serve an earlier observation or silently substitute another version', async () => {
    for (const replacement of [null, { ...version(), id: 'another-version' }, version({}), { ...version(), status: 'archived' as const }]) {
      let reads = 0;
      const response = await getPricingForScenarioWithDependencies(scenario, { getPlatformControl: async () => control, getLatestLiveVersion: async () => ++reads === 1 ? version() : replacement, getRowsForVersion: async () => stored({ lock: 30, term_months: 360 }) });
      assert.equal(response.status, 'no_live_pricing'); assert.deepEqual(response.options, []);
    }
  });
});
