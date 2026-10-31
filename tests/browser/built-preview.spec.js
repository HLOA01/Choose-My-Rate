import { expect, test } from '@playwright/test';
import { digest, readManifest } from '../../scripts/built-preview-core.mjs';
import { prepare, HANDOFF } from '../helpers/applicationNavigation.js';

// Every request is loopback and every pricing/platform response is a synthetic fixture.
test('served built bytes match manifest and rendered disclosure is configuration-aware', async ({ page, request }, info) => {
  const m = readManifest(info.config.metadata.previewManifest, globalThis.process.env.CMR_EXPECTED_SHA, globalThis.process.env.BUILT_PREVIEW_CASE);
  const { captured } = await prepare(page, info);
  for (const artifact of m.artifacts) {
    const response = await request.get(m.uiOrigin + '/' + artifact.file, { maxRedirects: 0 });
    expect(response.status()).toBe(200); expect(digest(await response.body())).toBe(artifact.sha256);
  }
  await expect(page.getByTestId('application-cta')).toHaveText('Continue to Application');
  await expect(page.getByTestId('hosted-link-disclosure')).toContainText('temporary copy');
  await expect(page.getByTestId('hosted-link-disclosure')).not.toContainText('LendingPad');
  await expect(page.getByTestId('application-cta')).toHaveAttribute('aria-describedby', 'hosted-link-disclosure');
  expect(captured.blocked).toEqual([]); expect(captured.emits.some(e => e.eventType === 'application.started')).toBe(false);
});

if (globalThis.process.env.BUILT_PREVIEW_CASE === 'unset') test('unset baked destination remains unset despite preview-process runtime URL', async ({ page }, info) => {
  const { ui, captured } = await prepare(page, info);
  await page.getByTestId('application-cta').click();
  await expect(page.getByTestId('handoff-message')).toContainText('not configured');
  expect(new URL(page.url()).origin).toBe(ui.origin); expect(captured.navigation).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), HANDOFF)).toMatchObject({ feeCompleteness: 'PARTIAL_ESTIMATE', estimatedClosingCharges: null });
  expect(captured.emits.some(e => e.eventType === 'application.started')).toBe(false);
  await page.reload(); expect(await page.evaluate(key => sessionStorage.getItem(key), HANDOFF)).toBeNull();
});
