import { expect, test } from '@playwright/test';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';

const HANDOFF = 'chooseMyRate.applicationHandoff.v1';
async function install(page, handler = () => ({ body: hloaQuote() }), { ignoreAbort = false } = {}) {
  if (ignoreAbort) await page.addInitScript(() => {
    const actualFetch = window.fetch.bind(window);
    // Model an upstream transport which does not honor cancellation. A stale
    // success/error must still be ignored by the monotonic request generation.
    window.fetch = (input, options = {}) => actualFetch(input, { ...options, signal: undefined });
  });
  const captured = { requests: [], emits: [] };
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__qa-pricing/pricing/quote') {
      const payload = route.request().postDataJSON();
      captured.requests.push(payload);
      const response = await handler(payload, captured.requests.length);
      await route.fulfill({ status: response.status || 200, contentType: 'application/json',
        headers: response.headers, body: JSON.stringify(response.body) }).catch(() => {});
      return;
    }
    if (url.pathname.startsWith('/__qa-hloa')) {
      if (url.pathname.endsWith('/emit')) captured.emits.push(route.request().postDataJSON());
      const body = url.pathname.endsWith('/leads') ? { lead: { leadId: 'CMR-LEAD-SYNTHETIC' } }
        : url.pathname.endsWith('/link-scenario') ? { borrowerId: 'CMR-BOR-SYNTHETIC', scenarioId: 'CMR-SCN-SYNTHETIC' } : { emitted: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.continue(); return; }
    await route.abort('blockedbyclient');
  });
  await page.goto('/');
  return captured;
}

async function fill(page) {
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
async function submit(page) {
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
}
async function handoff(page) { return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), HANDOFF); }

test('HLOA partial fees retain points units, unknown components and truthful continuation', async ({ page }) => {
  const fixture = hloaQuote();
  fixture.options.push({ ...hloaQuote({ rate: 6.75, price: -0.125 }).options[0], optionId: 'synthetic-credit' });
  const captured = await install(page, () => ({ body: fixture }));
  await fill(page); await submit(page);
  await expect(page.getByTestId('selected-rate')).toHaveText('6.500%');
  await expect(page.getByTestId('selected-payment')).toContainText('$2,700');
  await expect(page.getByTestId('selected-adjustment')).toContainText('Discount points (0.125%)');
  await expect(page.getByTestId('selected-adjustment')).toContainText('$534');
  await expect(page.getByTestId('rate-tradeoff')).toContainText('Known closing costs (partial)');
  await expect(page.getByTestId('closing-cost-status')).toContainText('Partial estimate');
  await page.getByText('View closing-cost breakdown').click();
  await expect(page.getByTestId('fee-line-item')).toContainText('estimated');
  await expect(page.getByTestId('unpriced-fee')).toContainText('Title and settlement: unavailable');
  await page.getByTestId('application-cta').click();
  const first = await handoff(page);
  expect(first).toMatchObject({ handoffSchemaVersion: 2, quoteContractVersion: 'hloa-borrower-quote-v1', feeCompleteness: 'PARTIAL_ESTIMATE',
    estimatedClosingCharges: null, knownClosingCosts: 1784.38, pricingVersionId: 'synthetic-snapshot-v1' });
  await page.getByTestId('application-cta').click();
  expect((await handoff(page)).intentId).toBe(first.intentId);
  await page.getByRole('button', { name: 'Next rate' }).click();
  expect(await handoff(page)).toBeNull();
  await expect(page.getByTestId('selected-adjustment')).toContainText('Lender credit (0.125%)');
  await page.getByTestId('application-cta').click();
  expect((await handoff(page)).intentId).not.toBe(first.intentId);
  await page.waitForLoadState('networkidle');
  expect(captured.emits.some((event) => event.eventType === 'application.started')).toBe(false);
});

test('HLOA unavailable and explicit null costs never fall back to legacy totals or neutral zero points', async ({ page }) => {
  const fixture = hloaQuote({ feeStatus: 'UNAVAILABLE' });
  Object.assign(fixture.options[0].borrowerQuote, { pricingOption: { pointsPercent: 2, pointsDollars: 8550 },
    closingCostEstimate: { status: 'complete' }, estimatedClosingCharges: 99999 });
  await install(page, () => ({ body: fixture }));
  await fill(page); await submit(page);
  await expect(page.getByTestId('selected-adjustment')).toHaveText('Unavailable');
  await expect(page.getByTestId('estimated-closing-costs')).toHaveText('Unavailable');
  await expect(page.getByTestId('results-screen')).not.toContainText('$99,999');
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).toMatchObject({ feeCompleteness: 'UNAVAILABLE', pointsDollars: null, estimatedClosingCharges: null });
});

test('complete HLOA zero costs remain zero estimates and preserve the returned warning', async ({ page }) => {
  const fixture = hloaQuote({ feeStatus: 'COMPLETE_ESTIMATE', price: 0, status: 'warning', banner: 'Pricing is subject to review.' });
  const detail = fixture.options[0].borrowerQuote;
  detail.estimatedClosingCosts = 0;
  detail.estimatedCashToClose = 22500;
  detail.lineItems[0].amount = 0;
  detail.feeTotals.loanCosts = 0;
  await install(page, () => ({ body: fixture }));
  await fill(page); await submit(page);
  await expect(page.getByTestId('estimated-closing-costs')).toHaveText('$0');
  await expect(page.getByTestId('selected-adjustment')).toHaveText('No discount points or lender credit');
  await expect(page.getByTestId('pricing-banner')).toHaveText('Pricing is subject to review.');
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).toMatchObject({ feeCompleteness: 'COMPLETE_ESTIMATE', estimatedClosingCharges: 0, pointsDollars: 0 });
});

for (const oldOutcome of ['success', 'error']) {
  test(`A-B-A rejects an obsolete ${oldOutcome} even when transport ignores abort`, async ({ page }) => {
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const captured = await install(page, async (_payload, index) => {
      if (index === 1) { await barrier; return { status: oldOutcome === 'error' ? 503 : 200,
        headers: { 'x-fixture-request': 'old' }, body: hloaQuote({ rate: 5 }) }; }
      return { body: hloaQuote({ rate: index === 2 ? 7 : 6.5 }) };
    }, { ignoreAbort: true });
    await fill(page);
    await page.getByTestId('submit-scenario').click();
    await expect.poll(() => captured.requests.length).toBe(1);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByTestId('home-price').fill('550000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await submit(page);
    await expect(page.getByTestId('selected-rate')).toHaveText('7.000%');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByTestId('home-price').fill('450000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await submit(page);
    await page.getByTestId('application-cta').click();
    const current = await handoff(page);
    const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'old');
    release(); await delivery; await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('selected-rate')).toHaveText('6.500%');
    await expect(page.getByTestId('pricing-error')).toHaveCount(0);
    expect((await handoff(page)).intentId).toBe(current.intentId);
    expect(captured.requests.map((request) => request.purchasePrice)).toEqual([450000, 550000, 450000]);
  });
}

test('reset during a pending request cannot restore rates or a persisted handoff; reload rejects old schemas', async ({ page }) => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const captured = await install(page, async (_payload, index) => {
    if (index === 2) { await barrier; return { headers: { 'x-fixture-request': 'reset' }, body: hloaQuote({ rate: 5 }) }; }
    return { body: hloaQuote() };
  }, { ignoreAbort: true });
  await fill(page); await submit(page);
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).not.toBeNull();
  await page.getByRole('button', { name: 'Edit details' }).click();
  expect(await handoff(page)).toBeNull();
  await page.getByTestId('submit-scenario').click();
  await expect.poll(() => captured.requests.length).toBe(2);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'reset');
  release(); await delivery; await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('results-screen')).toHaveCount(0);
  expect(await handoff(page)).toBeNull();
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({ handoffSchemaVersion: 999, selectedRate: 1 })), HANDOFF);
  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  expect(await handoff(page)).toBeNull();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
});

for (const rejection of ['expired', 'superseded', 'pricing_temporarily_unavailable']) {
  test(`a ${rejection} response cannot revive stale options or continuation`, async ({ page }) => {
    await install(page, (_payload, index) => ({ body: index === 1 ? hloaQuote() : hloaQuote({ status: rejection }) }));
    await fill(page); await submit(page);
    await page.getByTestId('application-cta').click();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByTestId('submit-scenario').click();
    await expect(page.getByTestId('empty-results')).toBeVisible();
    await expect(page.getByTestId('application-cta')).toHaveCount(0);
    expect(await handoff(page)).toBeNull();
  });
}

test('an explicit server expiry invalidates a displayed selection', async ({ page }) => {
  await install(page, () => ({ body: hloaQuote({ expiresAt: new Date(Date.now() + 5000).toISOString() }) }));
  await fill(page); await submit(page);
  await page.getByTestId('application-cta').click();
  await expect(page.getByTestId('empty-results')).toContainText('expired', { timeout: 8000 });
  expect(await handoff(page)).toBeNull();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
});

test('Apply validates an explicit deadline again even before its render timer fires', async ({ page }) => {
  const fixture = hloaQuote({ expiresAt: new Date(Date.now() + 60000).toISOString() });
  await install(page, () => ({ body: fixture }));
  await fill(page); await submit(page);
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).not.toBeNull();
  await page.evaluate((deadline) => { Date.now = () => Date.parse(deadline) + 1; }, fixture.expiresAt);
  await page.getByTestId('application-cta').click();
  await expect(page.getByTestId('empty-results')).toContainText('no longer available');
  expect(await handoff(page)).toBeNull();
});

test('a stale Sally finally handler cannot overwrite a newer scenario or restored quote', async ({ page }) => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let requested = false;
  await install(page);
  await page.route('**/__qa-sally', async (route) => {
    requested = true;
    await barrier;
    await route.fulfill({ contentType: 'application/json', headers: { 'x-fixture-request': 'old-sally' },
      body: JSON.stringify({ replyText: 'Obsolete response.', scenarioUpdates: { homePrice: '900000' } }) });
  });
  await page.getByLabel('Ask Sally').fill('I want to buy a house for $900,000');
  await page.getByRole('button', { name: 'Send to Sally' }).click();
  await expect.poll(() => requested).toBe(true);
  await fill(page); await submit(page);
  await page.getByTestId('application-cta').click();
  const current = await handoff(page);
  const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'old-sally');
  release(); await delivery; await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('results-screen')).toBeVisible();
  await expect(page.getByTestId('compact-scenario-summary')).not.toContainText('900,000');
  expect((await handoff(page)).intentId).toBe(current.intentId);
  await expect(page.locator('body')).not.toContainText('Obsolete response.');
});

test('configured application redirect carries partial HLOA status and is invalidated on return', async ({ page }, testInfo) => {
  const applicationUrl = testInfo.config.metadata.applicationUrl;
  test.skip(!applicationUrl, 'Run by the configured local receiver QA step.');
  const captured = await install(page);
  await page.route(applicationUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Local receiver</h1>' }));
  await fill(page); await submit(page);
  await Promise.all([page.waitForURL(applicationUrl), page.getByTestId('application-cta').click()]);
  expect(await handoff(page)).toMatchObject({ feeCompleteness: 'PARTIAL_ESTIMATE', estimatedClosingCharges: null, handoffSchemaVersion: 2 });
  expect(captured.emits.some((event) => event.eventType === 'application.started')).toBe(false);
  await page.goBack();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
  expect(await handoff(page)).toBeNull();
});

test('reload discards a previously valid local handoff and requires new pricing', async ({ page }) => {
  await install(page);
  await fill(page); await submit(page);
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).not.toBeNull();
  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  expect(await handoff(page)).toBeNull();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
});

test('failed handoff persistence does not claim acceptance or continue', async ({ page }) => {
  const captured = await install(page);
  await fill(page); await submit(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Test storage unavailable', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, HANDOFF);
  await page.getByTestId('application-cta').click();
  await expect(page.getByTestId('handoff-message')).toContainText('could not be saved');
  expect(await handoff(page)).toBeNull();
  expect(captured.emits.some((event) => event.eventType === 'application.started')).toBe(false);
});

for (const outcome of ['success', 'error']) {
  test(`obsolete comparison ${outcome} cannot restore its panel or disturb current pricing`, async ({ page }) => {
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const captured = await install(page, async (_payload, index) => {
      if (index === 2 || index === 3) {
        await barrier;
        return { status: outcome === 'error' ? 503 : 200, headers: { 'x-fixture-request': `comparison-${index}` }, body: hloaQuote({ rate: 4 }) };
      }
      return { body: hloaQuote({ rate: index === 1 ? 6.5 : 7 }) };
    });
    await fill(page); await submit(page);
    await page.getByTestId('comparison-trigger').click();
    await expect.poll(() => captured.requests.length).toBe(3);
    await page.getByRole('button', { name: 'Edit details' }).click();
    await submit(page);
    await page.getByTestId('application-cta').click();
    const current = await handoff(page);
    const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'comparison-3');
    release(); await delivery; await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('selected-rate')).toHaveText('7.000%');
    await expect(page.getByTestId('comparison-result')).toHaveCount(0);
    expect((await handoff(page)).intentId).toBe(current.intentId);
  });
}
