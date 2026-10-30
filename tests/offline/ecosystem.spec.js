import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { configuration } from '../../scripts/offline-test/preflight.mjs';
import { startBackend } from '../../scripts/offline-test/client.mjs';

const config = configuration(globalThis.process.env, fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = join(config.cmr.root, 'test-results/offline-rehearsal');
const cases = [];
let backend;
let evidence;

test.beforeEach(async ({ page }, testInfo) => {
  backend = undefined;
  evidence = { name: testInfo.title, responses: [], browserBlockedEgress: [], handoff: null, transitions: [] };
  backend = await startBackend(config);
  evidence.runtime = backend.info;
  // This guard never fulfills pricing. It lets the browser call the real
  // loopback boundary and UI and blocks every other origin.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if ([config.uiOrigin, config.boundaryOrigin].includes(url.origin)) { await route.continue(); return; }
    evidence.browserBlockedEgress.push(url.origin);
    await route.abort('blockedbyclient');
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (!backend) { cases.push({ ...evidence, status: 'failed', teardown: { runtimeNotStarted: true } }); return; }
  let teardownError;
  try { evidence.audit = await backend.request('inspect'); }
  finally {
    try { evidence.teardown = await backend.stop(); } catch (error) { teardownError = error; evidence.teardown = { clean: false }; }
  }
  evidence.status = teardownError ? 'failed' : testInfo.status;
  if (!page.isClosed()) {
    evidence.finalStoredHandoff = await page.evaluate(() => JSON.parse(sessionStorage.getItem('chooseMyRate.applicationHandoff.v1')));
    await page.evaluate(() => {
      const label = document.createElement('div'); label.textContent = 'TEST — SYNTHETIC DATA — NO LENDER CONNECTION';
      Object.assign(label.style, { position: 'fixed', top: '0', left: '0', padding: '8px', background: '#fee', color: '#800', zIndex: '999999' });
      document.body.append(label);
    });
    mkdirSync(reportDir, { recursive: true });
    await page.screenshot({ path: join(reportDir, `${testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 90)}.png`) });
  }
  cases.push(evidence);
  if (teardownError) throw teardownError;
});

test.afterAll(() => {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify({
    mode: 'TEST_SYNTHETIC', hloaCommit: config.hloa.sha, cmrCommit: config.cmr.sha,
    trackedSourceClean: config.hloa.trackedClean && config.cmr.trackedClean,
    mockedPricingResponses: 0, databases: 'memory://', bindHost: '127.0.0.1',
    sallyEnabled: false, voiceEnabled: false, leadEngineEnabled: false,
    lenderAccess: 'UNVERIFIED', productionReadiness: 'UNVERIFIED',
    completedAt: new Date().toISOString(), cases,
    passed: cases.length === 8 && cases.every((entry) => entry.status === 'passed' && entry.teardown?.listenersRefusedConnections
      && entry.browserBlockedEgress.length === 0 && entry.audit?.blockedEgress.length === (entry.egressRejectionProof ? 1 : 0)),
  }, null, 2));
});

async function fill(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('450000');
  await page.getByTestId('down-payment').fill('22500');
  await page.getByTestId('zip-code').fill('92660');
  await page.getByTestId('property-type').selectOption('single_family');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('credit-score').fill('750');
  await page.getByTestId('occupancy').selectOption('primary');
  await page.getByTestId('first-time-homebuyer').selectOption('no');
  await page.getByTestId('annual-income').fill('145000');
}

async function quote(page) {
  const responsePromise = page.waitForResponse((response) => response.url() === `${config.boundaryOrigin}/pricing/quote` && response.request().method() === 'POST');
  await page.getByTestId('submit-scenario').click();
  const response = await responsePromise;
  const payload = response.request().postDataJSON();
  const body = await response.json();
  evidence.responses.push({ requestId: response.headers()['x-request-id'], corsOrigin: response.headers()['access-control-allow-origin'],
    scenarioFingerprint: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    responseHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'), response: body });
  return body;
}

async function prepare(page) {
  await page.getByTestId('application-cta').click();
  const handoff = await page.evaluate(() => JSON.parse(sessionStorage.getItem('chooseMyRate.applicationHandoff.v1')));
  evidence.handoff = handoff;
  return handoff;
}

async function setCase(name) {
  evidence.transitions.push(await backend.request('setCase', { case: name }));
}

test('TEST actual boundary to UI to partial prepared handoff has matching IDs and audits', async ({ page }) => {
  await fill(page);
  const body = await quote(page);
  await expect(page.getByTestId('selected-rate')).toHaveText('6.500%');
  await expect(page.getByTestId('closing-cost-status')).toContainText('Partial estimate');
  expect(body.options[0].borrowerQuote.feeCompleteness.status).toBe('PARTIAL_ESTIMATE');
  expect(JSON.stringify(body)).not.toMatch(/lenderCode|rawRate|rawPrice|appliedAdjustments|PRMG/);
  expect(evidence.responses[0].corsOrigin).toBe(config.uiOrigin);
  const handoff = await prepare(page);
  expect(handoff).toMatchObject({ pricingVersionId: body.pricingVersionId, selectedOptionId: body.options[0].optionId,
    selectedRate: body.options[0].rate, feeCompleteness: 'PARTIAL_ESTIMATE', estimatedClosingCharges: null,
    knownClosingCosts: body.options[0].borrowerQuote.estimatedClosingCosts, handoffSchemaVersion: 2 });
  expect(createHash('sha256').update(handoff.scenarioSignature).digest('hex')).toBe(evidence.responses[0].scenarioFingerprint);
  expect(handoff.pointsPercent).toBe(body.options[0].borrowerQuote.points.percent);
  expect(handoff.pointsDollars).toBe(body.options[0].borrowerQuote.points.dollars);
  await expect(page.getByTestId('handoff-message')).toContainText('not configured');
  const audit = await backend.request('inspect');
  expect(audit.versions[0].source_hash).toBe(backend.info.fixtureHash);
  expect(audit.audits[0].request_id).toBe(evidence.responses[0].requestId);
  expect(audit.gates.filter((entry) => entry.allowed)).toHaveLength(2);
  expect(audit.gates.every((entry) => entry.request_id === evidence.responses[0].requestId && entry.pricing_version_id === body.pricingVersionId)).toBe(true);
  expect(audit.feeQuotes[0].pricing_version_id).toBe(body.pricingVersionId);
  expect(await backend.request('proveEgressBlocked')).toEqual({ blocked: true });
  evidence.egressRejectionProof = true;
  expect(evidence.browserBlockedEgress).toEqual([]);
});

for (const name of ['no_authority', 'no_role']) {
  test(`TEST ${name} returns no rates through actual handlers`, async ({ page }) => {
    await setCase(name);
    await fill(page);
    const body = await quote(page);
    expect(body.options).toEqual([]);
    await expect(page.getByTestId('empty-results')).toBeVisible();
    await expect(page.getByTestId('application-cta')).toHaveCount(0);
    const audit = await backend.request('inspect');
    if (name === 'no_authority') {
      expect(audit.authorityConfigured).toBe(false);
      expect(audit.gates.every((entry) => entry.allowed === false)).toBe(true);
    } else {
      expect(audit.roleConfigured).toBe(false);
      expect(audit.gates).toEqual([]);
    }
  });
}

test('TEST Fee Engine outage preserves rate and unavailable costs without zero fabrication', async ({ page }) => {
  await setCase('fee_outage');
  await fill(page);
  const body = await quote(page);
  await expect(page.getByTestId('selected-rate')).toHaveText('6.500%');
  expect(body.options[0].borrowerQuote.feeCompleteness.status).toBe('UNAVAILABLE');
  await expect(page.getByTestId('estimated-closing-costs')).toHaveText('Unavailable');
  expect(await prepare(page)).toMatchObject({ feeCompleteness: 'UNAVAILABLE', knownClosingCosts: null, estimatedClosingCharges: null, pointsDollars: null });
  const audit = await backend.request('inspect');
  expect(audit.feeListenerListening).toBe(false);
  expect(audit.feeQuotes).toEqual([]);
});

for (const name of ['paused', 'archived', 'no_authority', 'revoked_approval']) {
  test(`TEST ${name} after a quote invalidates the old prepared handoff on repricing`, async ({ page }) => {
    await fill(page); await quote(page);
    await expect(page.getByTestId('results-screen')).toBeVisible();
    await prepare(page);
    await setCase(name);
    await page.getByRole('button', { name: 'Edit details' }).click();
    const body = await quote(page);
    if (name === 'revoked_approval') {
      const audit = await backend.request('inspect');
      expect(audit.authorityConfigured).toBe(true);
      expect(audit.approvalRevoked).toBe(true);
      expect(audit.gates.some((entry) => entry.allowed === false)).toBe(true);
    }
    expect(body.options).toEqual([]);
    await expect(page.getByTestId('empty-results')).toBeVisible();
    await expect(page.getByTestId('application-cta')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('chooseMyRate.applicationHandoff.v1'))).toBeNull();
  });
}
