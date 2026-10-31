import { expect, test } from '@playwright/test';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';

const HANDOFF = 'chooseMyRate.applicationHandoff.v1';
async function prepare(page, info, mode = 'form') {
  const target = info.config.metadata.applicationUrl;
  const receiver = new URL(target);
  const ui = new URL(info.project.use.baseURL);
  expect(receiver.origin).not.toBe(ui.origin);
  expect(receiver.hostname).toBe('127.0.0.1');
  const captured = { navigation: [], emits: [], blocked: [] };
  await page.setExtraHTTPHeaders({ 'x-qa-receiver-mode': mode });
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === receiver.origin) {
      captured.navigation.push({ url: request.url(), method: request.method(), body: request.postData(), referer: request.headers().referer });
      await route.continue(); return;
    }
    if (url.origin !== ui.origin) { captured.blocked.push(request.url()); await route.abort('blockedbyclient'); return; }
    if (url.pathname === '/__qa-pricing/pricing/quote') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hloaQuote()) }); return;
    }
    if (url.pathname.startsWith('/__qa-hloa')) {
      if (url.pathname.endsWith('/emit')) captured.emits.push(request.postDataJSON());
      const body = url.pathname.endsWith('/leads') ? { lead: { leadId: 'SYNTHETIC-LEAD' } }
        : url.pathname.endsWith('/link-scenario') ? { borrowerId: 'SYNTHETIC-BOR', scenarioId: 'SYNTHETIC-SCN' } : { emitted: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); return;
    }
    if (url.pathname.startsWith('/__qa-sally')) { await route.fulfill({ status: 503, body: '' }); return; }
    await route.continue();
  });
  await page.goto('/?qa-private=synthetic-do-not-forward');
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
  await page.getByTestId('submit-scenario').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  await expect(page.getByTestId('closing-cost-status')).toContainText('Partial estimate');
  return { target, receiver, ui, captured };
}

for (const mode of ['form', 'login', 'unavailable']) test('cross-origin ' + mode + ' navigation is neither payload transfer nor receiver acknowledgement', async ({ page }, info) => {
  const { target, receiver, ui, captured } = await prepare(page, info, mode);
  await Promise.all([page.waitForURL(mode === 'login' ? receiver.origin + '/__qa-login' : target), page.getByTestId('application-cta').click()]);
  await expect(page.getByRole('heading')).toContainText(mode === 'login' ? 'Synthetic staff login' : mode === 'unavailable' ? 'Synthetic destination unavailable' : 'Synthetic application page');
  expect(captured.navigation[0]).toEqual({ url: target, method: 'GET', body: null, referer: ui.origin + '/' });
  expect(await page.evaluate((key) => sessionStorage.getItem(key), HANDOFF)).toBeNull();
  expect(captured.emits.some((event) => event.eventType === 'application.started')).toBe(false);
  expect(captured.blocked).toEqual([]);
  await page.goBack();
  if (new URL(page.url()).origin === receiver.origin) await page.goBack();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), HANDOFF)).toBeNull();
  await page.reload();
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
  expect(captured.emits.some((event) => event.eventType === 'application.started')).toBe(false);
});
