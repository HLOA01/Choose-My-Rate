import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const invalidApplicationUrl = 'https://prod.lendingpad.com/synthetic-tenant/pos';

export default defineConfig({
  ...base,
  grep: /invalid configured application path fails closed/,
  metadata: { invalidApplicationUrl },
  webServer: {
    ...base.webServer,
    env: { ...base.webServer.env, VITE_APPLICATION_URL: invalidApplicationUrl },
  },
});
