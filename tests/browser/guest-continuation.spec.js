// ACTIVE suite for opt-in, input-only guest continuation, run against the ACTUAL Funnel (not a stand-in).
// It is NOT part of the skipped legacy smoke.spec.js. All backend traffic is mocked at the browser-context boundary.
// The dev server wraps the app in React StrictMode (src/main.jsx), so every test also exercises double effects.
//
// Based on Claude V2, integrated and executed against the actual repository by Codex.
// Original unseen-code assumptions are checked below against the real generation guards.
//
// Seeding note: funnel.spec.js's openApp() calls localStorage.clear() in an init script that re-runs on EVERY navigation. This
// suite does not clear anything: each Playwright test already gets a fresh browser context (fresh IndexedDB). Snapshots are
// produced by the app itself (preferred) or seeded straight into IndexedDB AFTER the first load.
import { expect, test } from '@playwright/test';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';
import {
  GUEST_INPUT_DB_NAME as DB,
  GUEST_INPUT_FIELDS,
  GUEST_INPUT_MAX_AGE_MS,
  GUEST_INPUT_SAVE_DELAY_MS,
} from '../../src/scenario/guestInputSnapshot.js';

const HANDOFF = 'chooseMyRate.applicationHandoff.v1';
const LEGACY_KEY = 'chooseMyRate.guestScenario.v1';
const SETTLE_MS = GUEST_INPUT_SAVE_DELAY_MS * 3; // long enough for any unwanted coalesced write to show up
const DAY = 86_400_000;
const NOW = () => Date.now();

// ---- network boundary (pattern from quote-contract.spec.js install()) --------------------------------------------------
async function install(page, handler = () => ({ body: hloaQuote() }), { ignoreAbort = false, sally } = {}) {
  const context = page.context();
  if (ignoreAbort) await context.addInitScript(() => {
    const actualFetch = window.fetch.bind(window);
    // Model an upstream that ignores cancellation: a stale success must still be dropped by the generation guards.
    window.fetch = (input, options = {}) => actualFetch(input, { ...options, signal: undefined });
  });
  const captured = { pricing: [], sally: [], voice: [], hloa: [], emits: [] };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__qa-pricing/pricing/quote') {
      const payload = route.request().postDataJSON();
      captured.pricing.push(payload);
      const response = await handler(payload, captured.pricing.length);
      await route.fulfill({ status: response.status || 200, contentType: 'application/json', headers: response.headers, body: JSON.stringify(response.body) }).catch(() => {});
      return;
    }
    if (url.pathname.startsWith('/__qa-hloa')) {
      captured.hloa.push(url.pathname);
      if (url.pathname.endsWith('/emit')) captured.emits.push(route.request().postDataJSON());
      const body = url.pathname.endsWith('/leads') ? { lead: { leadId: 'CMR-LEAD-SYNTHETIC' } }
        : url.pathname.endsWith('/link-scenario') ? { borrowerId: 'CMR-BOR-SYNTHETIC', scenarioId: 'CMR-SCN-SYNTHETIC' } : { emitted: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    if (url.pathname === '/__qa-sally') {
      const payload = route.request().postDataJSON();
      captured.sally.push(payload);
      const reply = sally ? await sally(payload, captured.sally.length) : { replyText: 'ok', scenarioUpdates: {}, nextQuestion: '', needsPricingRefresh: false };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }).catch(() => {});
      return;
    }
    if (url.pathname === '/__qa-sally-voice') {
      captured.voice.push(url.pathname);
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'qa-audio' });
      return;
    }
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.continue(); return; }
    await route.abort('blockedbyclient');
  });
  return captured;
}
const counts = (c) => ({ pricing: c.pricing.length, sally: c.sally.length, voice: c.voice.length, hloa: c.hloa.length });
const latch = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };

// ---- IndexedDB helpers (read/seed bypass the page's own spies) ----------------------------------------------------------
const spy = (page, { noChannel = false, noIdb = false } = {}) => page.addInitScript(([deny, nochannel, noidb]) => {
  window.__w = [];
  const put = IDBObjectStore.prototype.put; const del = IDBObjectStore.prototype.delete;
  window.__idbPut = put;
  IDBObjectStore.prototype.put = function (...a) {
    if (this.name === 'state') { if (sessionStorage.getItem(deny) === '1') throw new DOMException('denied', 'SecurityError'); window.__w.push(['put', a[0]]); }
    return put.apply(this, a);
  };
  IDBObjectStore.prototype.delete = function (...a) {
    if (this.name === 'state') { window.__w.push(['delete']); }
    return del.apply(this, a);
  };
  if (nochannel) window.BroadcastChannel = undefined; // no change hints: tabs only learn when they try to write
  if (noidb) Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
}, ['__qa_deny_put', noChannel, noIdb]);
const writes = (page) => page.evaluate(() => window.__w.length);
const rawOf = (page) => page.evaluate((name) => new Promise((resolve) => {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => request.transaction.abort();
  request.onerror = (event) => { event.preventDefault(); resolve(null); };
  request.onsuccess = () => { const db = request.result; const get = db.transaction('state', 'readonly').objectStore('state').get('current'); get.onsuccess = () => { db.close(); resolve(get.result === undefined ? null : get.result); }; };
}), DB);
const recOf = async (page) => { const raw = await rawOf(page); return raw === null ? null : JSON.parse(raw); };
const dbExists = (page) => page.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), DB);
const seed = (page, text) => page.evaluate(([name, value]) => new Promise((resolve, reject) => {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('state');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => { const db = request.result; const tx = db.transaction('state', 'readwrite'); (window.__idbPut || IDBObjectStore.prototype.put).call(tx.objectStore('state'), value, 'current'); tx.oncomplete = () => { db.close(); resolve(true); }; };
}), [DB, text]);
// Poll from Node (Playwright's waitForFunction does not await an async predicate).
async function waitForRecord(page, predicate, label = 'record') {
  await expect.poll(async () => { const r = await recOf(page); return r && predicate(r) ? 'match' : 'no'; }, { message: label }).toBe('match');
  return recOf(page);
}
const handoff = (page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), HANDOFF);

const panel = (page) => page.getByTestId('guest-input-panel');
const offerBlock = (page) => page.getByTestId('guest-input-offer');
const problem = (page) => page.getByTestId('guest-input-problem');
async function optIn(page) { await page.getByTestId('guest-input-optin').click(); await expect(page.getByTestId('guest-input-on')).toBeVisible(); }

// ---- Funnel flows (selectors from funnel.spec.js / quote-contract.spec.js) ----------------------------------------------
async function fillScenario(page, { homePrice = '450000', credit = '781', income = '123456' } = {}) {
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill(homePrice);
  await page.getByTestId('down-payment').fill('22500');
  await page.getByTestId('zip-code').fill('92660');
  await page.getByTestId('property-type').selectOption('single_family');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('credit-score').fill(credit);
  await page.getByTestId('occupancy').selectOption('primary');
  await page.getByTestId('first-time-homebuyer').selectOption('no');
  await page.getByTestId('annual-income').fill(income);
}
// Deliberately no down payment: by the packet's normalizeScenarioDownPayment (L102-136) a cleared dollar down payment is re-filled
// from the `downPayment` mirror, so that field cannot be blanked in dollars mode. Tests that clear fields use ones that can be cleared.
async function fillPropertyOnly(page) {
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('300000');
  await page.getByTestId('zip-code').fill('30004');
  await page.getByTestId('property-type').selectOption('condo');
}
const record = (over = {}, inputs = {}) => JSON.stringify({
  schemaVersion: 2, state: 'on', epoch: 1, revision: 1, writeId: 'seed-write-0001', savedAt: NOW() - 1000,
  inputs: { borrowerPath: 'purchase', homePrice: '450000', downPaymentAmount: '22500', downPaymentPercent: '5', downPaymentInputMode: 'dollars', propertyValue: '', currentMortgageBalance: '', refinanceGoal: 'lower_payment', requestedCashOut: '', propertyType: 'single_family', occupancy: 'primary', zipCode: '92660', ...inputs },
  ...over,
});

// ======================================================================================================================
// 1. Consent and minimization
// ======================================================================================================================
test('default OFF: a full flow through a fresh quote creates NO database, performs ZERO writes, and shows the disclosure unchecked', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await expect(page.getByTestId('guest-input-optin')).not.toBeChecked();
  const disclosure = page.getByTestId('guest-input-disclosure');
  await expect(disclosure).toBeVisible();
  for (const phrase of ['7 days', 'browser profile', 'credit score', 'income', 'This tab saves nothing unless you check this box']) await expect(disclosure).toContainText(phrase);
  await fillScenario(page);
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  await page.waitForTimeout(SETTLE_MS);
  expect(await dbExists(page)).toBe(false);
  expect(await writes(page)).toBe(0);
});

test('opt-in writes ONE consent record; stored inputs are exactly the allowlist; credit score and income never appear', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await fillScenario(page, { credit: '781', income: '123456' });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForTimeout(SETTLE_MS); expect(await writes(page)).toBe(0);
  await optIn(page);
  expect(await writes(page)).toBe(1);
  await page.getByTestId('home-price').fill('451000');
  const r = await waitForRecord(page, (rec) => rec.inputs?.homePrice === '451000', 'saved after opt-in');
  expect(r.state).toBe('on'); expect(r.epoch).toBe(1);
  expect(Object.keys(r.inputs).sort()).toEqual([...GUEST_INPUT_FIELDS].sort());
  const body = await rawOf(page);
  for (const needle of ['781', '123456', 'creditScore', 'creditRange', 'annualIncome', 'firstTimeHomebuyer', 'currentInterestRate']) expect(body).not.toContain(needle);
});

test('identity, attribution, quote, selection and handoff never enter the stored record, even after submission and handoff', async ({ page }) => {
  const captured = await install(page); await spy(page);
  await page.goto('/?utm_source=qa-source-9f3&gclid=qa-gclid-7d2&fbclid=qa-fbclid-4c8');
  await optIn(page);
  await fillScenario(page);
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  await page.getByTestId('application-cta').click();
  expect(await handoff(page)).not.toBeNull();
  expect(captured.hloa.length).toBeGreaterThan(0); // lead/identity traffic really happened
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '450000', 'saved');
  const body = await rawOf(page); const r = JSON.parse(body);
  expect(Object.keys(r).sort()).toEqual(['epoch', 'inputs', 'revision', 'savedAt', 'schemaVersion', 'state', 'writeId']);
  for (const needle of ['CMR-', 'cmr-', 'qa-source-9f3', 'qa-gclid-7d2', 'qa-fbclid-4c8', 'selectedOption', 'pricingVersion', 'handoff', 'disclosure', 'closing-cost', '781', '123456']) expect(body).not.toContain(needle);
});

// ======================================================================================================================
// 2. Offer, atomic replacement on accept ONLY, nothing requested until an explicit submit
// ======================================================================================================================
test('returning visit: nothing changes until accept; accept replaces ONLY the persisted fields in one step; zero new requests; fresh quote on explicit submit', async ({ page }) => {
  const captured = await install(page); await spy(page);
  await page.goto('/');
  await optIn(page);
  await fillScenario(page, { credit: '781', income: '123456' });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '450000', 'saved');
  const original = await rawOf(page);

  await page.reload();
  await expect(offerBlock(page)).toHaveCount(1); // StrictMode double effects must not double the offer
  await page.waitForLoadState('networkidle');
  const before = counts(captured);
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('1'); await page.getByTestId('zip-code').fill('11111');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('credit-score').fill('700'); await page.getByTestId('annual-income').fill('99999');
  await page.waitForTimeout(SETTLE_MS);
  expect(await rawOf(page)).toBe(original); // typing while the offer is undecided never overwrote the saved copy
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({ handoffSchemaVersion: 2, selectedRate: 1 })), HANDOFF);

  await page.getByTestId('guest-input-accept').click();
  await expect(offerBlock(page)).toHaveCount(0);
  await expect(page.getByTestId('purchase-property-step')).toBeVisible(); // lands on the property step: credit/income are not saved
  await expect(page.getByTestId('home-price')).toHaveValue('450000');
  await expect(page.getByTestId('zip-code')).toHaveValue('92660');
  await expect(page.getByTestId('down-payment')).toHaveValue('22500');
  await expect(page.getByTestId('property-type')).toHaveValue('single_family');
  expect(await handoff(page)).toBeNull(); // restore invalidated any stored handoff
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('credit-score')).toHaveValue('700'); // never read from storage; left as typed
  await expect(page.getByTestId('annual-income')).toHaveValue('99999');
  await expect(page.getByTestId('occupancy')).toHaveValue('primary');

  await page.waitForTimeout(SETTLE_MS);
  expect(await rawOf(page)).toBe(original); // restoring writes nothing and does not refresh retention
  expect(counts(captured)).toEqual(before); // no pricing, Sally, voice, identity or event request came from restoration
  await expect(page.getByTestId('results-screen')).toHaveCount(0);
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  expect(captured.pricing).toHaveLength(before.pricing + 1);
  expect(captured.pricing.at(-1)).toMatchObject({ purchasePrice: 450000, zipCode: '92660', creditScore: 700 });
});

test('activating accept twice restores once and still requests nothing', async ({ page }) => {
  const captured = await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await page.reload(); await expect(offerBlock(page)).toHaveCount(1); await page.waitForLoadState('networkidle');
  const before = counts(captured);
  await page.getByTestId('guest-input-accept').evaluate((button) => { button.click(); button.click(); });
  await expect(offerBlock(page)).toHaveCount(0);
  await expect(page.getByTestId('zip-code')).toHaveValue('30004');
  expect(counts(captured)).toEqual(before);
});

// ======================================================================================================================
// 3. Pending asynchronous work versus restore: main quote, A -> B -> A, comparison, Sally
// ======================================================================================================================
test('A -> B -> A: a late MAIN quote for the earlier inputs cannot surface after restore and re-entry', async ({ page }) => {
  const gate = latch();
  const captured = await install(page, async (_payload, index) => {
    if (index === 1) { await gate.promise; return { headers: { 'x-fixture-request': 'late' }, body: hloaQuote({ rate: 5 }) }; }
    return { body: hloaQuote() };
  }, { ignoreAbort: true });
  await spy(page);
  await page.goto('/');
  await optIn(page);
  await fillScenario(page, { homePrice: '300000' }); // B, saved by the app itself
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '300000', 'B saved');
  await page.reload(); await expect(offerBlock(page)).toHaveCount(1);

  await fillScenario(page, { homePrice: '450000' }); // A, typed while the offer is undecided
  await page.getByTestId('submit-scenario').click(); // request 1, held open
  await expect.poll(() => captured.pricing.length).toBe(1);
  await page.getByTestId('guest-input-accept').click(); // restore B: must invalidate request 1
  await expect(page.getByTestId('purchase-property-step')).toBeVisible();
  await page.getByTestId('home-price').fill('450000'); // the persisted inputs are exactly A again

  const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'late');
  gate.release(); await delivery; await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('results-screen')).toHaveCount(0);
  expect(captured.pricing).toHaveLength(1);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  expect(captured.pricing).toHaveLength(2);
});

// INTEGRATION GUARD CHECK: compareFhaConventional (packet L813-852) and the "Edit details" handler were not in the packet. The
// reviewer reports comparison handlers guard the generations at L832/848. This test identifies the held request by the
// loanTypePreference value that buildPricingPayload (L185-209) puts in the payload.
test('a late COMPARISON response cannot surface after Edit details and restore', async ({ page }) => {
  const gate = latch(); let armed = false;
  const captured = await install(page, async (payload) => {
    if (armed && payload.loanTypePreference === 'fha') { await gate.promise; return { headers: { 'x-fixture-request': 'late-fha' }, body: hloaQuote({ rate: 5 }) }; }
    return { body: hloaQuote() };
  }, { ignoreAbort: true });
  await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await page.reload(); await expect(offerBlock(page)).toHaveCount(1);

  await fillScenario(page);
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  armed = true;
  await page.getByTestId('comparison-trigger').click(); // comparison started; its FHA leg is held
  await expect.poll(() => captured.pricing.filter((p) => p.loanTypePreference === 'fha').length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(offerBlock(page)).toHaveCount(1);
  await page.getByTestId('guest-input-accept').click();
  await expect(page.getByTestId('zip-code')).toHaveValue('30004');

  const delivery = page.waitForResponse((response) => response.headers()['x-fixture-request'] === 'late-fha');
  gate.release(); await delivery; await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('comparison-result')).toHaveCount(0);
  await expect(page.getByTestId('results-screen')).toHaveCount(0);
});

// DEPENDS ON UNSEEN CODE for the Sally panel markup beyond funnel.spec.js L718-721 (label "Ask Sally", button "Send to Sally", testid sally-thread).
test('a late SALLY reply cannot change the restored inputs or add a message', async ({ page }) => {
  const gate = latch();
  const captured = await install(page, undefined, { sally: async () => { await gate.promise; return { replyText: 'STALE-SALLY-REPLY', scenarioUpdates: { zipCode: '11111' }, nextQuestion: '', needsPricingRefresh: false }; } });
  await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await page.reload(); await expect(offerBlock(page)).toHaveCount(1);

  await page.getByLabel('Ask Sally').fill('hello there');
  await page.getByRole('button', { name: 'Send to Sally' }).click();
  await expect.poll(() => captured.sally.length).toBe(1);
  await page.getByTestId('guest-input-accept').click();
  await expect(page.getByTestId('zip-code')).toHaveValue('30004');
  gate.release(); await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId('zip-code')).toHaveValue('30004');
  await expect(page.getByTestId('sally-thread')).not.toContainText('STALE-SALLY-REPLY');
});

// ======================================================================================================================
// 4. Stop remembering, Start over, pending saves, pagehide, reload, second tab
// ======================================================================================================================
test('Start over resets the whole form and saved inputs, withdraws remembering, and fences a save queued a moment earlier', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '300000', 'saved');
  await page.getByTestId('home-price').fill('444444'); // starts the debounce
  await page.getByTestId('guest-input-start-over').click();
  await page.waitForTimeout(SETTLE_MS);
  const r = await recOf(page);
  expect(r.inputs).toBeNull(); expect(r.state).toBe('off'); expect(r.epoch).toBeGreaterThanOrEqual(2);
  expect(await rawOf(page)).not.toContain('444444');
  await expect(page.getByTestId('purpose-step')).toBeVisible();
  await expect(page.getByTestId('guest-input-optin')).toBeVisible();
});

test('Stop remembering writes a tombstone with no inputs, disables saving, and a pagehide/visibility flush writes nothing', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '300000', 'saved');
  await page.getByTestId('home-price').fill('666666');
  await page.getByTestId('guest-input-stop').click();
  await expect(page.getByTestId('guest-input-optin')).toBeVisible();
  const r = await recOf(page); expect(r.state).toBe('off'); expect(r.inputs).toBeNull();
  const w = await writes(page);
  await page.getByTestId('home-price').fill('777777');
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(SETTLE_MS);
  expect(await writes(page)).toBe(w);
  const body = await rawOf(page); for (const n of ['300000', '666666', '777777']) expect(body).not.toContain(n);
  await page.reload();
  await expect(page.getByTestId('guest-input-optin')).toBeVisible(); await expect(offerBlock(page)).toHaveCount(0);
});

test('second tab with NO change hints: after one tab stops remembering, the other cannot write and says why when it tries', async ({ page }) => {
  await install(page); await spy(page, { noChannel: true });
  await page.goto('/');
  await optIn(page);
  const second = await page.context().newPage(); await spy(second, { noChannel: true }); await second.goto('/');
  await expect(second.getByTestId('guest-input-optin')).toBeVisible(); await optIn(second); // deliberate per-tab permission
  await page.getByTestId('guest-input-stop').click(); await expect(page.getByTestId('guest-input-optin')).toBeVisible();
  const tomb = await rawOf(page); const w = await writes(second);
  await fillPropertyOnly(second);
  await expect(problem(second)).toContainText('another tab');
  expect(await writes(second)).toBe(w); expect(await rawOf(page)).toBe(tomb);
});

test('an initially-empty tab misses another tab\'s opt-in, save and stop (no hints) and still cannot write', async ({ page }) => {
  await install(page); await spy(page, { noChannel: true });
  await page.goto('/');
  const other = await page.context().newPage(); await spy(other, { noChannel: true }); await other.goto('/');
  await optIn(other); await fillPropertyOnly(other);
  await waitForRecord(other, (rec) => rec.inputs?.homePrice === '300000', 'saved in other tab');
  await other.getByTestId('guest-input-stop').click(); await expect(other.getByTestId('guest-input-optin')).toBeVisible();
  await other.evaluate((name) => new Promise((resolve) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => resolve(true); }), DB); // absent again
  await fillPropertyOnly(page); await page.waitForTimeout(SETTLE_MS);
  expect(await writes(page)).toBe(0); expect(await rawOf(page)).toBeNull(); expect(await dbExists(page)).toBe(false);
});

test('second tab with hints: an offer follows the newest save, and the other tab\'s Start over gives a visible conflict instead of reviving older input', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await page.reload();
  const second = await page.context().newPage(); await spy(second); await second.goto('/');
  await expect(offerBlock(page)).toHaveCount(1); await expect(offerBlock(second)).toHaveCount(1);
  await page.getByTestId('guest-input-accept').click(); await optIn(page);
  await page.getByTestId('home-price').fill('480000');
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '480000', 'newest save');
  await second.getByTestId('guest-input-accept').click(); // may be refused as stale if the hint has not arrived; never applies the older record
  if ((await second.getByTestId('home-price').inputValue()) !== '480000') { await expect(offerBlock(second)).toHaveCount(1); await second.getByTestId('guest-input-accept').click(); }
  await expect(second.getByTestId('home-price')).toHaveValue('480000'); await optIn(second);
  await second.getByTestId('home-price').fill('481000'); // unsaved edit pending in the second tab
  await page.getByTestId('guest-input-start-over').click();
  await expect(problem(second)).toContainText('another tab');
  await second.waitForTimeout(SETTLE_MS);
  expect((await recOf(second)).inputs).toBeNull();
});

// ======================================================================================================================
// 5. Failure, unreadable data, expiry, unavailable storage, invalid input
// ======================================================================================================================
test('a failed deletion is visible, suppresses restore, honestly retains data, and can be retried', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await seed(page, record()); await page.reload();
  await expect(offerBlock(page)).toHaveCount(1);
  const before = await rawOf(page);
  await page.evaluate(() => sessionStorage.setItem('__qa_deny_put', '1'));
  await page.getByTestId('guest-input-delete-saved').click();
  await expect(problem(page)).toBeVisible();
  await expect(problem(page)).toContainText('could not confirm'); await expect(problem(page)).toContainText('may still be stored');
  await expect(problem(page)).not.toContainText(/has been deleted|deleted successfully|forgotten/i);
  await expect(offerBlock(page)).toHaveCount(0); // a remembered deletion intent never offers the data
  expect(await rawOf(page)).toBe(before);
  await page.evaluate(() => sessionStorage.removeItem('__qa_deny_put'));
  await page.getByTestId('guest-input-retry-delete').click();
  await expect(problem(page)).toHaveCount(0);
  expect((await recOf(page)).inputs).toBeNull(); await expect(offerBlock(page)).toHaveCount(0);
});

const UNREADABLE = {
  'oversized newer-schema record': [() => `{"schemaVersion":3,"payload":"${'z'.repeat(3000)}"}`, 'different version'],
  'corrupt JSON': [() => '{', 'cannot read'],
  'future-dated record': [() => record({ savedAt: NOW() + DAY }), 'cannot read'],
  'record carrying credit/income keys': [() => record({}, { creditScore: '781', annualIncome: '123456' }), 'cannot read'],
  'withdrawn-proposal schema 1': [() => JSON.stringify({ schemaVersion: 1, revision: 1, writeId: 'seed-write-0001', savedAt: NOW() - 5, inputs: { homePrice: '1' } }), 'cannot read'],
};
for (const [name, [build, message]] of Object.entries(UNREADABLE)) {
  test(`unreadable saved data (${name}) is preserved byte-for-byte, shown visibly, blocks opt-in, and only an explicit clear removes it`, async ({ page }) => {
    await install(page); await spy(page);
    await page.goto('/');
    const body = build(); await seed(page, body); await page.reload();
    await expect(problem(page)).toBeVisible(); await expect(problem(page)).toContainText(message);
    await expect(page.getByTestId('guest-input-optin')).toHaveCount(0);
    await fillPropertyOnly(page); await page.waitForTimeout(SETTLE_MS);
    expect(await rawOf(page)).toBe(body); expect(await writes(page)).toBe(0);
    await page.getByTestId('guest-input-clear-unreadable').click();
    await expect(page.getByTestId('guest-input-optin')).toBeVisible(); expect((await recOf(page)).state).toBe('off'); expect((await recOf(page)).inputs).toBeNull();
  });
}

test('an expired record is not offered, consent lapses, and the record is removed', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await seed(page, record({ savedAt: NOW() - GUEST_INPUT_MAX_AGE_MS - 60_000 })); await page.reload();
  await expect(page.getByTestId('guest-input-optin')).toBeVisible(); await expect(offerBlock(page)).toHaveCount(0);
  await waitForRecord(page, (rec) => rec.state === 'off' && rec.inputs === null, 'expired data removed with reset marker');
});

test('without IndexedDB the opt-in is not offered, nothing is read or written, and the funnel still prices', async ({ page }) => {
  const captured = await install(page); await spy(page, { noIdb: true });
  await page.goto('/');
  await expect(page.getByTestId('guest-input-optin')).toHaveCount(0); await expect(offerBlock(page)).toHaveCount(0);
  await fillScenario(page); await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible(); expect(captured.pricing).toHaveLength(1); expect(await writes(page)).toBe(0);
});

test('an unstorable typed value PAUSES saving visibly by name, keeps the older saved copy, and resumes when fixed', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '300000', 'saved'); const before = await rawOf(page);
  await page.getByTestId('home-price').fill('1.2.3');
  await expect(problem(page)).toContainText('home price'); await expect(problem(page)).toContainText('older than what is on screen');
  await page.waitForTimeout(SETTLE_MS); expect(await rawOf(page)).toBe(before);
  await page.getByTestId('home-price').fill('310000');
  await expect(problem(page)).toHaveCount(0);
  await waitForRecord(page, (rec) => rec.inputs?.homePrice === '310000', 'resumed');
});

test('clearing every persisted field removes the saved inputs while remembering stays on; they do not revive after reload', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await page.getByTestId('home-price').fill(''); await page.getByTestId('zip-code').fill(''); await page.getByTestId('property-type').selectOption('');
  await waitForRecord(page, (rec) => rec.inputs === null, 'cleared');
  await page.reload();
  await expect(page.getByTestId('guest-input-optin')).toBeVisible(); await expect(offerBlock(page)).toHaveCount(0);
});

test('the legacy guest-scenario record is never offered and never touched', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  const legacy = JSON.stringify({ version: 1, savedAt: NOW(), scenario: { purchasePrice: '500000', zipCode: '30004', currentLoanBalance: '250000' } });
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [LEGACY_KEY, legacy]);
  await page.reload();
  await optIn(page); await fillPropertyOnly(page);
  await waitForRecord(page, (rec) => rec.inputs?.zipCode === '30004', 'saved');
  await expect(offerBlock(page)).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LEGACY_KEY)).toBe(legacy);
});

// ======================================================================================================================
// 6. Layout (the reviewer noted the actual layout still needs a test)
// ======================================================================================================================
for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`the panel does not overflow, overlap or push primary actions off screen at ${viewport.width}px`, async ({ page }) => {
    await install(page); await spy(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await seed(page, record()); await page.reload();
    await expect(offerBlock(page)).toBeVisible();
    const box = await panel(page).boundingBox(); const progress = await page.getByTestId('progress-indicator').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(progress.y + 1); // the panel sits above the progress indicator, not on top of it
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    for (const id of ['guest-input-accept', 'guest-input-delete-saved']) { const b = await page.getByTestId(id).boundingBox(); expect(b.width).toBeGreaterThan(20); expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1); }
    await page.getByTestId('guest-input-accept').click();
    await page.screenshot({ path: `test-results/guest-restored-${viewport.width}.png`, fullPage: true });
    const action = page.getByRole('button', { name: 'Continue', exact: true });
    const actionBox = await action.boundingBox(); const savedPanel = await panel(page).boundingBox();
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(savedPanel.y);
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 0.5 });
  });
}

test('a visible problem message is really visible (not clipped or screen-reader-only)', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await seed(page, '{'); await page.reload();
  const box = await problem(page).boundingBox();
  expect(box.width).toBeGreaterThan(100); expect(box.height).toBeGreaterThan(14);
  await expect(problem(page)).toBeInViewport();
});

test('an edit made just before leaving the page is saved or not saved, never half-saved', async ({ page }) => {
  await install(page); await spy(page);
  await page.goto('/');
  await optIn(page);
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('654321');
  await page.goto('/'); // navigates inside the coalescing delay; the flush is best effort (a transaction is asynchronous)
  const r = await recOf(page);
  expect(r === null || r.inputs === null || r.inputs.homePrice === '654321').toBe(true);
});

test('a new tab may restore inputs but cannot save edits without its own deliberate opt-in', async ({ page }) => {
  const captured = await install(page); await spy(page); await page.goto('/');
  await seed(page, record()); await page.reload();
  await expect(offerBlock(page)).toBeVisible(); const original = await rawOf(page); const before = counts(captured);
  await page.getByTestId('guest-input-accept').click();
  await page.getByTestId('home-price').fill('481111'); await page.waitForTimeout(SETTLE_MS);
  expect(await rawOf(page)).toBe(original); expect(await writes(page)).toBe(0);
  expect(counts(captured)).toEqual(before); await expect(page.getByTestId('guest-input-optin')).toBeVisible();
  await optIn(page); await waitForRecord(page, (r) => r.inputs?.homePrice === '481111');
});

test('reload after failed deletion offers no automatic restoration and explains the persistence limitation', async ({ page }) => {
  const captured = await install(page); await spy(page); await page.goto('/');
  await seed(page, record()); await page.reload(); await expect(offerBlock(page)).toBeVisible();
  const original = await rawOf(page);
  await page.evaluate(() => sessionStorage.setItem('__qa_deny_put', '1'));
  await page.getByTestId('guest-input-delete-saved').click();
  await expect(problem(page)).toContainText('cannot be remembered after reload'); await expect(offerBlock(page)).toHaveCount(0);
  const before = counts(captured); await page.reload();
  await expect(page.getByTestId('purpose-step')).toBeVisible(); await expect(offerBlock(page)).toBeVisible();
  await expect(page.getByTestId('guest-input-shared-warning')).toContainText('earlier failed deletion');
  await expect(page.getByTestId('guest-input-optin')).toBeVisible();
  expect(await rawOf(page)).toBe(original); expect(await writes(page)).toBe(0); expect(counts(captured)).toEqual(before);
  // Opt-in permits future edits; it does not accept an undeleted snapshot or
  // dismiss its warning, rewrite savedAt, or refresh its retention window.
  await optIn(page);
  await expect(offerBlock(page)).toBeVisible();
  await expect(page.getByTestId('guest-input-shared-warning')).toContainText('earlier failed deletion');
  expect(await rawOf(page)).toBe(original);
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.getByTestId('home-price').fill('489111');
  await page.waitForTimeout(SETTLE_MS);
  expect(await rawOf(page)).toBe(original); expect(await writes(page)).toBe(0);
  await expect(page.getByTestId('guest-input-shared-warning')).toBeVisible();
  expect(counts(captured)).toEqual(before);
  await page.evaluate(() => sessionStorage.removeItem('__qa_deny_put'));
  await page.getByTestId('guest-input-delete-saved').click();
  await waitForRecord(page, (r) => r.state === 'off' && r.inputs === null);
});

test('a delayed restoration read cannot replace a newer edit in the actual Funnel', async ({ page }) => {
  const captured = await install(page); await spy(page); await page.goto('/'); await seed(page, record()); await page.reload();
  await expect(offerBlock(page)).toBeVisible();
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await page.evaluate(() => {
    window.__heldGuestReads = [];
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { configurable: true, get: descriptor.get,
      set(handler) { const transaction = this;
        descriptor.set.call(this, (event) => {
          if (transaction.mode === 'readonly') window.__heldGuestReads.push(() => handler.call(transaction, event));
          else handler.call(transaction, event);
        });
      },
    });
  });
  await page.getByTestId('guest-input-accept').click();
  await expect.poll(() => page.evaluate(() => window.__heldGuestReads.length)).toBeGreaterThan(0);
  await page.getByTestId('home-price').fill('489999');
  await page.evaluate(() => window.__heldGuestReads.splice(0).forEach((run) => run()));
  await expect(offerBlock(page)).toHaveCount(0);
  await expect(page.getByTestId('home-price')).toHaveValue('489999');
  expect(captured.pricing).toEqual([]); expect(captured.sally).toEqual([]); expect(captured.hloa).toEqual([]);
});

test('real IndexedDB transactions reject the second same-baseline writer across two tabs', async ({ page }) => {
  await install(page); await page.goto('/'); const second = await page.context().newPage(); await install(second); await second.goto('/');
  for (const tab of [page, second]) await tab.evaluate(async () => {
    const module = await import('/src/scenario/guestInputSnapshot.js');
    window.__nativeEmpty = module.projectInputs({}).inputs;
    window.__nativeSession = module.createGuestInputSession(); await window.__nativeSession.load();
  });
  for (let round = 0; round < 10; round += 1) {
    await page.evaluate(async () => { await window.__nativeSession.forget(); await window.__nativeSession.enable(window.__nativeEmpty); });
    await second.evaluate(async () => { await window.__nativeSession.load(); await window.__nativeSession.enable(window.__nativeEmpty); });
    const results = await Promise.all([page, second].map((tab, index) => tab.evaluate(async (price) => {
      window.__nativeSession.scheduleSave({ ...window.__nativeEmpty, homePrice: price }); return window.__nativeSession.flush();
    }, String(330000 + round * 10 + index))));
    expect(results.filter((r) => r.reason === 'saved')).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'conflict')).toHaveLength(1);
  }
  await page.evaluate(() => window.__nativeSession.forget());
});

test('a malformed database schema fails closed without leaking a connection or breaking the form', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message)); await install(page); await page.goto('/');
  await expect(page.getByTestId('guest-input-optin')).toBeVisible();
  await page.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1); request.onupgradeneeded = () => request.result.createObjectStore('wrong_store');
    request.onerror = () => reject(request.error); request.onsuccess = () => { request.result.close(); resolve(true); };
  }), DB);
  await page.reload(); await page.getByTestId('guest-input-optin').click();
  await expect(problem(page)).toContainText('could not save');
  await page.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('connection was leaked'));
  }), DB);
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await expect(page.getByTestId('home-price')).toBeVisible(); expect(errors).toEqual([]);
});
