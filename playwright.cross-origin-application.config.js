import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Synthetic loopback origin only. No LendingPad URL, account or application is enabled.
const receiver = new URL(base.use.baseURL);
if (receiver.protocol !== 'http:' || receiver.hostname !== '127.0.0.1' || !receiver.port
  || receiver.username || receiver.password || receiver.search || receiver.hash || receiver.pathname !== '/'
  || Number(receiver.port) < 1024 || Number(receiver.port) > 65534) throw new Error('Synthetic receiver requires explicit loopback test configuration.');
receiver.port = String(Number(receiver.port) + 1);
receiver.pathname = '/__qa-external-application';
const applicationUrl = receiver.href;
export default defineConfig({
  ...base,
  testIgnore: [], testMatch: '**/cross-origin-application.spec.js',
  metadata: { applicationUrl },
  use: { ...base.use, serviceWorkers: 'block' },
  webServer: [
    { ...base.webServer, env: { ...base.webServer.env,
      VITE_APPLICATION_URL: applicationUrl, VITE_APPLY_URL: '', VITE_LOAN_APPLICATION_URL: '' } },
    { command: 'node scripts/qa-external-application-server.mjs', url: receiver.origin + '/__qa-health',
      env: { QA_RECEIVER_MODE: 'TEST_SYNTHETIC', QA_RECEIVER_PORT: receiver.port }, reuseExistingServer: false },
  ],
});
