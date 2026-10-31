import { defineConfig } from '@playwright/test';
import { dirname } from 'node:path';
import base from './playwright.cross-origin-application.config.js';
import { readManifest } from './scripts/built-preview-core.mjs';
const env = globalThis.process.env;
if (env.BUILT_PREVIEW_MODE !== 'TEST_SYNTHETIC') throw new Error('Explicit TEST mode required.');
const m = readManifest(env.BUILT_PREVIEW_MANIFEST, env.CMR_EXPECTED_SHA, env.BUILT_PREVIEW_CASE);
if (base.use.baseURL !== m.uiOrigin) throw new Error('Preview UI origin mismatch.');
export default defineConfig({
  ...base,
  testMatch: m.caseId === 'unset' ? '**/built-preview.spec.js' : ['**/built-preview.spec.js', '**/cross-origin-application.spec.js'],
  reporter: [['line'], ['json', { outputFile: dirname(env.BUILT_PREVIEW_MANIFEST) + '/playwright-results.json' }]],
  metadata: { applicationUrl: m.expectedDestination, receiverUrl: m.receiverOrigin + '/__qa-external-application', previewManifest: env.BUILT_PREVIEW_MANIFEST },
  use: { ...base.use, serviceWorkers: 'block' },
  webServer: [
    { command: 'node scripts/qa-built-preview-server.mjs', url: m.uiOrigin, reuseExistingServer: false,
      env: { BUILT_PREVIEW_MODE: 'TEST_SYNTHETIC', BUILT_PREVIEW_MANIFEST: env.BUILT_PREVIEW_MANIFEST,
        CMR_EXPECTED_SHA: env.CMR_EXPECTED_SHA, BUILT_PREVIEW_CASE: m.caseId,
        VITE_APPLICATION_URL: m.receiverOrigin + '/__qa-external-application?route=runtime-only' } },
    base.webServer[1],
  ],
});
