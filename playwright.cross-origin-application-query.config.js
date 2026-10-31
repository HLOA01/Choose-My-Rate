import { defineConfig } from '@playwright/test';
import base from './playwright.cross-origin-application.config.js';
const destination = new URL(base.metadata.applicationUrl);
destination.searchParams.set('route', 'synthetic'); // test routing parameter, never borrower data
export default defineConfig({
  ...base, grep: /cross-origin form navigation/,
  metadata: { applicationUrl: destination.href },
  webServer: [{ ...base.webServer[0], env: { ...base.webServer[0].env, VITE_APPLICATION_URL: destination.href } }, base.webServer[1]],
});
