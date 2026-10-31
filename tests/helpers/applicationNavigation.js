import { expect } from '@playwright/test';
import { hloaQuote } from '../fixtures/hloaBorrowerQuote.js';

export const HANDOFF = 'chooseMyRate.applicationHandoff.v1';
export async function prepare(page, info, mode = 'form') {
  const target = info.config.metadata.applicationUrl || info.config.metadata.receiverUrl;
  const receiver = new URL(info.config.metadata.receiverUrl || target);
  const ui = new URL(info.project.use.baseURL);
  expect(receiver.origin).not.toBe(ui.origin);
  expect(receiver.hostname).toBe('127.0.0.1');
  const captured = { navigation: [], emits: [], blocked: [] };
  await page.routeWebSocket('**', (socket) => {
    const url = new URL(socket.url());
    if (url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.port === ui.port) socket.connectToServer();
    else { captured.blocked.push(socket.url()); socket.close(); }
  });
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

