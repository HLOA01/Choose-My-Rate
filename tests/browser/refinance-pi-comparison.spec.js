// ACTIVE suite for the OPTIONAL current-monthly-principal-and-interest comparison, run against the ACTUAL Funnel.
// All backend traffic is mocked at the browser-context boundary with the provided fixture (tests/fixtures/hloaBorrowerQuote.js).
// The dev server wraps the app in React StrictMode (src/main.jsx), so every test also exercises double effects.
//
// Based on Claude's proposal; integrated and exercised against the actual Funnel.
import { expect, test } from '@playwright/test';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';
import { GUEST_INPUT_DB_NAME as DB, GUEST_INPUT_FIELDS } from '../../src/scenario/guestInputSnapshot.js';

const HANDOFF = 'chooseMyRate.applicationHandoff.v1';
const LABEL = 'Optional: your current monthly principal and interest';
const SETTLE_MS = 750;
// buildPricingPayload (Funnel L187-211): the complete set of keys that may leave the browser for pricing.
const PRICING_KEYS = ['creditScore', 'downPayment', 'language', 'loanAmount', 'loanPurpose', 'loanTypePreference', 'ltv', 'occupancy', 'propertyType', 'purchasePrice', 'zipCode'];

// Three options whose P&I and PITI DELIBERATELY differ, so a comparison that reads the wrong field is caught.
//   qa-low-rate  P&I 2633.10  PITI 3133.10      qa-par  P&I 2731.45  PITI 3300.00      qa-credit  P&I 2832.60  PITI 3400.40
function refiQuote({ feeStatus = 'PARTIAL_ESTIMATE', ...patch } = {}) {
  const specs = [['qa-low-rate', 6.25, 0.875, 2633.1, 3133.1], ['qa-par', 6.5, 0, 2731.45, 3300], ['qa-credit', 6.75, -0.625, 2832.6, 3400.4]];
  const base = hloaQuote({ feeStatus, ...patch });
  base.options = specs.map(([optionId, rate, price, paymentPI, paymentPITI]) => {
    const option = hloaQuote({ feeStatus, rate, price }).options[0];
    return { ...option, optionId, paymentPI, paymentPITI };
  });
  return base;
}

async function install(page, handler = () => ({ body: refiQuote() }), { sally } = {}) {
  const context = page.context();
  const captured = { pricing: [], sally: [], voice: [], hloa: [], emits: [], all: [] };
  context.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/__qa-')) captured.all.push(new URL(request.url()).pathname); });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__qa-pricing/pricing/quote') {
      const payload = route.request().postDataJSON(); captured.pricing.push(payload);
      const response = await handler(payload, captured.pricing.length);
      await route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body) }).catch(() => {});
      return;
    }
    if (url.pathname.startsWith('/__qa-hloa')) {
      captured.hloa.push(url.pathname); if (url.pathname.endsWith('/emit')) captured.emits.push(route.request().postDataJSON());
      const body = url.pathname.endsWith('/leads') ? { lead: { leadId: 'CMR-LEAD-SYNTHETIC' } } : url.pathname.endsWith('/link-scenario') ? { borrowerId: 'CMR-BOR-SYNTHETIC', scenarioId: 'CMR-SCN-SYNTHETIC' } : { emitted: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); return;
    }
    if (url.pathname === '/__qa-sally') {
      captured.sally.push(route.request().postDataJSON());
      const reply = sally ? await sally() : { replyText: 'ok', scenarioUpdates: {}, nextQuestion: '', needsPricingRefresh: false };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }).catch(() => {}); return;
    }
    if (url.pathname === '/__qa-sally-voice') { captured.voice.push(url.pathname); await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'qa-audio' }); return; }
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.continue(); return; }
    await route.abort('blockedbyclient');
  });
  return captured;
}
const counts = (c) => ({ pricing: c.pricing.length, sally: c.sally.length, voice: c.voice.length, hloa: c.hloa.length, all: c.all.length });

// ---- Funnel flows (selectors: funnel.spec.js fillCashOutRefinance L386-399; purchase flow from the d8cac68 guest spec) ----
async function fillRefinance(page, { goal } = {}) {
  await page.getByRole('button', { name: 'Refinance', exact: true }).click();
  await page.getByTestId('property-value').fill('650000');
  await page.getByTestId('current-balance').fill('400000');
  if (goal) await page.getByTestId('refinance-goal').selectOption(goal);
  await page.getByTestId('current-rate').fill('7.125');
  if (goal === 'cash_out') await page.getByTestId('cash-out-amount').fill('50000');
  await page.getByTestId('zip-code').fill('92660');
  await page.getByTestId('property-type').selectOption('single_family');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('credit-score').fill('780');
  await page.getByTestId('occupancy').selectOption('primary');
  await page.getByTestId('annual-income').fill('180000');
}
async function priceRefinance(page, options) { await fillRefinance(page, options); await page.getByTestId('submit-scenario').click(); await expect(page.getByTestId('results-screen')).toBeVisible(); }
async function pricePurchase(page) { // Verified against faf8a48: home-price, down-payment, first-time-homebuyer (seen in the d8cac68 packet)
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('450000'); await page.getByTestId('down-payment').fill('22500');
  await page.getByTestId('zip-code').fill('92660'); await page.getByTestId('property-type').selectOption('single_family');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('credit-score').fill('750'); await page.getByTestId('occupancy').selectOption('primary');
  await page.getByTestId('first-time-homebuyer').selectOption('no'); await page.getByTestId('annual-income').fill('145000');
  await page.getByTestId('submit-scenario').click(); await expect(page.getByTestId('results-screen')).toBeVisible();
}
const input = (page) => page.getByTestId('current-monthly-pi');
const section = (page) => page.getByTestId('monthly-pi-comparison');
const difference = (page) => page.getByTestId('monthly-pi-difference');
const handoff = (page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), HANDOFF);
const expectNoComparison = async (page) => { await expect(section(page)).toHaveCount(0); await expect(input(page)).toHaveCount(0); };

// ======================================================================================================================
// Placement and scope
// ======================================================================================================================
test('refinance only: shown below a valid selected REFINANCE quote and after the rate/payment block, with exactly one instance', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await expect(section(page)).toHaveCount(1); // StrictMode must not double-mount it
  await expect(input(page)).toHaveValue('');
  await expect(page.getByTestId('monthly-pi-result')).not.toContainText('$'); // nothing is shown until the borrower types
  const tradeoff = await page.getByTestId('rate-tradeoff').boundingBox(); const box = await section(page).boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(tradeoff.y + tradeoff.height - 1);
  await expect(page.getByLabel(LABEL)).toBeVisible();
});

test('a PURCHASE quote never shows the comparison', async ({ page }) => {
  await install(page); await page.goto('/');
  await pricePurchase(page);
  await expectNoComparison(page);
});

// DECISION D1: every refinance goal (including cash-out) shows it, because the Funnel's borrowerPath is "refinance". The disclosure
// says the loan amount may differ. Delete this test and tighten the predicate in E2 if the owner wants rate-and-term only.
test('a cash-out refinance also shows it, and the disclosure says the loan amount may differ', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page, { goal: 'cash_out' });
  await expect(section(page)).toBeVisible();
  await expect(page.getByTestId('monthly-pi-disclosure')).toContainText('loan amount, term, closing costs and other costs may differ');
});

// ======================================================================================================================
// The arithmetic uses ONLY the selected option's paymentPI
// ======================================================================================================================
test('uses the selected P&I, never PITI, fees, cash to close or any legacy figure', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await expect(page.getByTestId('selected-rate')).toContainText('6.500'); // par option is selected first
  await input(page).fill('2900.00');
  await expect(page.getByTestId('monthly-pi-current')).toHaveText('Your current principal and interest: $2,900.00 per month');
  await expect(page.getByTestId('monthly-pi-quoted')).toHaveText('Quoted principal and interest at the selected rate: $2,731.45 per month');
  await expect(difference(page)).toHaveText('The quoted principal and interest is $168.55 per month lower than your current principal and interest.');
  await expect(difference(page)).toHaveAttribute('data-direction', 'lower');
  const text = await section(page).innerText();
  for (const forbidden of ['3,300', '3300', 'PITI', '3,133', '3,400', 'cash to close', 'closing costs:', 'break-even', 'breakeven', 'net cash', 'approved', 'eligible', 'you save', 'you will save']) expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
});

test('higher, lower and the same are each stated with both amounts', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2500'); await expect(difference(page)).toHaveText('The quoted principal and interest is $231.45 per month higher than your current principal and interest.');
  await expect(difference(page)).toHaveAttribute('data-direction', 'higher');
  await input(page).fill('2731.45'); await expect(difference(page)).toHaveText('The quoted principal and interest is the same as your current principal and interest.');
  await expect(difference(page)).toHaveAttribute('data-direction', 'same'); await expect(difference(page)).not.toContainText('$0.00');
  await input(page).fill('0'); await expect(page.getByTestId('monthly-pi-current')).toContainText('$0.00'); await expect(difference(page)).toContainText('$2,731.45 per month higher');
});

test('choosing another valid rate recomputes, keeps what was typed, and does not reprice', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00');
  await page.getByRole('button', { name: 'Lowest rate' }).click();
  await expect(page.getByTestId('monthly-pi-quoted')).toContainText('$2,633.10'); await expect(difference(page)).toContainText('$266.90 per month lower');
  await page.getByRole('button', { name: 'Most credit' }).click();
  await expect(page.getByTestId('monthly-pi-quoted')).toContainText('$2,832.60'); await expect(difference(page)).toContainText('$67.40 per month lower');
  await page.getByRole('button', { name: 'Closest to par' }).click();
  await expect(difference(page)).toContainText('$168.55 per month lower');
  await expect(input(page)).toHaveValue('2900.00'); expect(captured.pricing).toHaveLength(1);
});

for (const feeStatus of ['PARTIAL_ESTIMATE', 'UNAVAILABLE', 'COMPLETE_ESTIMATE']) {
  test(`${feeStatus} fees do not remove an otherwise valid P&I comparison`, async ({ page }) => {
    await install(page, () => ({ body: refiQuote({ feeStatus }) })); await page.goto('/');
    await priceRefinance(page);
    await input(page).fill('2900'); await expect(difference(page)).toContainText('$168.55 per month lower');
  });
}

// ======================================================================================================================
// Strict input
// ======================================================================================================================
test('invalid text is kept exactly as typed, flagged, and never computed; blank is never zero; zero is a real value', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  for (const text of ['abc', '1e3', '1.234', '-5', '+5', '1,200', '$1200', '12%', '0x10', '1.', '.5', '01', ' 1200', '1200 ', 'Infinity', 'NaN', '１２００', '1.2.3']) {
    await input(page).fill(text);
    await expect(input(page)).toHaveValue(text);
    await expect(difference(page)).toHaveCount(0); await expect(page.getByTestId('monthly-pi-message')).toContainText('not a valid dollar amount');
    await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
  }
  for (const text of ['', '   ']) { await input(page).fill(text); await expect(difference(page)).toHaveCount(0); await expect(page.getByTestId('monthly-pi-message')).toHaveCount(0); }
  await input(page).fill('90071992547409.92'); await expect(page.getByTestId('monthly-pi-message')).toContainText('too large to compare');
  await input(page).fill('0'); await expect(page.getByTestId('monthly-pi-current')).toContainText('$0.00');
});

// ======================================================================================================================
// Local arithmetic only
// ======================================================================================================================
test('typing causes NO request, event or quote change, and the quote stays valid', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await priceRefinance(page);
  await page.waitForLoadState('networkidle');
  const before = counts(captured); const emits = captured.emits.length; const rate = await page.getByTestId('selected-rate').innerText();
  await input(page).click(); await input(page).pressSequentially('2900.45', { delay: 15 });
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Backspace');
  await input(page).fill('2731.45'); await input(page).fill('');
  await page.waitForTimeout(SETTLE_MS);
  expect(counts(captured)).toEqual(before); expect(captured.emits).toHaveLength(emits);
  await expect(page.getByTestId('results-screen')).toBeVisible(); await expect(page.getByTestId('selected-rate')).toHaveText(rate);
});

// ======================================================================================================================
// The text is discarded on every path that invalidates the quote, and is never restored
// ======================================================================================================================
test('Edit details and a new submission start with an EMPTY field', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00'); await expect(difference(page)).toBeVisible();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expectNoComparison(page);
  await page.getByTestId('submit-scenario').click(); await expect(page.getByTestId('results-screen')).toBeVisible();
  await expect(input(page)).toHaveValue(''); await expect(difference(page)).toHaveCount(0); expect(captured.pricing).toHaveLength(2);
});

test('a scenario edit clears it, and the new quote starts empty', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByTestId('credit-score').fill('781'); // updateScenario -> resetPricingView
  await expectNoComparison(page);
  await page.getByTestId('submit-scenario').click(); await expect(page.getByTestId('results-screen')).toBeVisible(); await expect(input(page)).toHaveValue('');
});

// Verified against faf8a48: the Sally panel label/button come from the d8cac68 packet. handleBorrowerMessage calls resetPricingView at L991.
test('a Sally message clears it', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00');
  await page.getByLabel('Ask Sally').fill('hello there'); await page.getByRole('button', { name: 'Send to Sally' }).click();
  await expect.poll(() => captured.sally.length).toBe(1);
  await expectNoComparison(page);
  expect(JSON.stringify(captured.sally)).not.toContain('2900'); // the typed P&I is never sent to Sally
});

test('navigation (popstate, pagehide) clears it', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00');
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await expectNoComparison(page);
  await page.getByTestId('submit-scenario').click(); await expect(page.getByTestId('results-screen')).toBeVisible(); await expect(input(page)).toHaveValue('');
  await input(page).fill('2900.00');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expectNoComparison(page);
});

test('a reload never brings it back, and nothing was stored', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2987.65'); await page.waitForTimeout(SETTLE_MS);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain('2987.65'); expect(stored.toLowerCase()).not.toContain('monthlypi');
  await page.reload(); await expect(page.getByTestId('app-shell')).toBeVisible();
  await priceRefinance(page); await expect(input(page)).toHaveValue('');
});

// ======================================================================================================================
// Expired, unavailable and superseded quotes cannot compare (existing quote contract and deadline handling only)
// ======================================================================================================================
for (const [name, patch] of Object.entries({
  expired: { status: 'expired' }, superseded: { status: 'superseded' }, unavailable: { status: 'pricing_temporarily_unavailable' },
  'flagged superseded': { superseded: true }, 'archived snapshot': { snapshotStatus: 'archived' }, 'unsupported contract': { contractVersion: 'unknown-v99' },
})) {
  test(`a ${name} response cannot compare`, async ({ page }) => {
    await install(page, () => ({ body: refiQuote(patch) })); await page.goto('/');
    await fillRefinance(page); await page.getByTestId('submit-scenario').click();
    await expect(page.getByTestId('empty-results')).toBeVisible(); // Verified against faf8a48 (d8cac68 L1383)
    await expect(page.getByTestId('results-screen')).toHaveCount(0); await expectNoComparison(page);
  });
}

test('a quote that expires WHILE the comparison is open removes it through the existing deadline handling', async ({ page }) => {
  await install(page, () => ({ body: refiQuote({ expiresAt: new Date(Date.now() + 9000).toISOString() }) })); await page.goto('/');
  await priceRefinance(page);
  await input(page).fill('2900.00'); await expect(difference(page)).toBeVisible();
  await expect(page.getByTestId('empty-results')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('empty-results')).toContainText('expired'); await expectNoComparison(page);
});

// ======================================================================================================================
// It stays out of every payload, and out of guest storage
// ======================================================================================================================
test('pricing, handoff, events and Sally payloads are unchanged by typing a P&I', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await priceRefinance(page);
  expect(Object.keys(captured.pricing[0]).sort()).toEqual(PRICING_KEYS);
  await input(page).fill('2987.65');
  await page.getByTestId('application-cta').click(); // Verified against faf8a48 (d8cac68 L1507, quote-contract.spec.js)
  const stored = await handoff(page); expect(stored).not.toBeNull();
  const everything = JSON.stringify({ stored, pricing: captured.pricing, emits: captured.emits, sally: captured.sally });
  expect(everything).not.toContain('2987.65'); expect(everything.toLowerCase()).not.toContain('monthlypi'); // the dot makes an accidental match impossible
  expect(Object.keys(stored.scenario)).not.toContain('currentMonthlyPI'); expect(captured.pricing).toHaveLength(1);
});

// Verified against faf8a48: guest-input-optin / guest-input-on are the ids of the earlier v2 panel; confirm them against the integrated panel.
test('guest opt-in still stores only its allowlisted inputs: the P&I is excluded', async ({ page }) => {
  await install(page); await page.goto('/');
  await page.getByTestId('guest-input-optin').click(); await expect(page.getByTestId('guest-input-on')).toBeVisible();
  await priceRefinance(page);
  await input(page).fill('2987.65'); await page.waitForTimeout(SETTLE_MS * 2);
  const raw = await page.evaluate((name) => new Promise((resolve) => {
    const request = indexedDB.open(name, 1); request.onupgradeneeded = () => request.transaction.abort(); request.onerror = (event) => { event.preventDefault(); resolve(null); };
    request.onsuccess = () => { const db = request.result; const get = db.transaction('state', 'readonly').objectStore('state').get('current'); get.onsuccess = () => { db.close(); resolve(get.result ?? null); }; };
  }), DB);
  expect(raw).not.toBeNull(); expect(raw).not.toContain('2987.65'); expect(raw.toLowerCase()).not.toContain('monthlypi');
  expect(Object.keys(JSON.parse(raw).inputs).sort()).toEqual([...GUEST_INPUT_FIELDS].sort());
});

// ======================================================================================================================
// Accessibility and layout
// ======================================================================================================================
test('accessible name, decimal keypad, keyboard reach and a polite live region', async ({ page }) => {
  await install(page); await page.goto('/');
  await priceRefinance(page);
  const field = page.getByLabel(LABEL);
  await expect(field).toHaveAttribute('inputmode', 'decimal'); await expect(field).toHaveAttribute('type', 'text'); await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(field).not.toHaveAttribute('maxlength', /.*/);
  await field.focus(); await expect(field).toBeFocused();
  await page.keyboard.type('2900.00');
  await expect(page.getByTestId('monthly-pi-result')).toHaveAttribute('role', 'status'); await expect(page.getByTestId('monthly-pi-result')).toHaveAttribute('aria-live', 'polite');
  const described = (await field.getAttribute('aria-describedby')).split(' ');
  for (const id of described) expect(await page.evaluate((i) => !!document.getElementById(i), id)).toBe(true);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`layout at ${viewport.width}px: inside the viewport, below the rate block, and not over the application button`, async ({ page }) => {
    await install(page); await page.setViewportSize(viewport); await page.goto('/');
    await priceRefinance(page);
    await input(page).fill('90071992547409.91');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    for (const id of ['monthly-pi-comparison', 'current-monthly-pi', 'monthly-pi-difference', 'monthly-pi-disclosure']) { const b = await page.getByTestId(id).boundingBox(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1); }
    const box = await section(page).boundingBox(); const tradeoff = await page.getByTestId('rate-tradeoff').boundingBox(); const cta = await page.getByTestId('application-cta').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(tradeoff.y + tradeoff.height - 1);
    const overlaps = !(box.y + box.height <= cta.y + 1 || cta.y + cta.height <= box.y + 1 || box.x + box.width <= cta.x + 1 || cta.x + cta.width <= box.x + 1);
    expect(overlaps).toBe(false);
  });
}


test('Start over discards current P&I and the next refinance quote starts empty', async ({ page }) => {
  await install(page); await page.goto('/'); await priceRefinance(page);
  await input(page).fill('2900');
  await page.getByTestId('guest-input-start-over').click();
  await expectNoComparison(page);
  await priceRefinance(page); await expect(input(page)).toHaveValue('');
});

test('explicit saved-input acceptance discards P&I without repricing or carrying it to the restored scenario', async ({ page }) => {
  const captured = await install(page); await page.goto('/');
  await page.getByTestId('guest-input-optin').click();
  await priceRefinance(page); await page.waitForTimeout(SETTLE_MS);
  await page.reload(); await expect(page.getByTestId('guest-input-offer')).toBeVisible();
  await priceRefinance(page); await input(page).fill('2987.65');
  const before = counts(captured);
  await page.getByTestId('guest-input-accept').click();
  await expectNoComparison(page); await expect(page.getByTestId('refinance-property-step')).toBeVisible();
  await page.waitForTimeout(SETTLE_MS); expect(counts(captured)).toEqual(before);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('submit-scenario').click();
  await expect(input(page)).toHaveValue('');
});

test('a genuine zero supplied quote P&I is compared as zero, never replaced with PITI', async ({ page }) => {
  await install(page, () => { const body = refiQuote(); body.options.forEach((o) => { o.paymentPI = 0; }); return { body }; });
  await page.goto('/'); await priceRefinance(page); await input(page).fill('100');
  await expect(page.getByTestId('monthly-pi-quoted')).toContainText('$0.00');
  await expect(difference(page)).toContainText('$100.00 per month lower');
});

test('an unsupported sub-cent option cannot compare and selecting it discards prior P&I', async ({ page }) => {
  await install(page, () => { const body = refiQuote(); body.options[0].paymentPI = 2633.105; return { body }; });
  await page.goto('/'); await priceRefinance(page); await input(page).fill('2900');
  await page.getByRole('button', { name: 'Lowest rate' }).click(); await expectNoComparison(page);
  await page.getByRole('button', { name: 'Closest to par' }).click(); await expect(input(page)).toHaveValue('');
});
