import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const applicationUrl = `${base.use.baseURL}/__qa-application`;

export default defineConfig({
  ...base,
  grep: /configured application redirect/,
  metadata: { applicationUrl },
  webServer: {
    ...base.webServer,
    env: { ...base.webServer.env, VITE_APPLICATION_URL: applicationUrl },
  },
});
