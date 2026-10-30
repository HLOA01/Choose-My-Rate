import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { configuration } from './scripts/offline-test/preflight.mjs';

const config = configuration(globalThis.process.env, fileURLToPath(new URL('.', import.meta.url)));
const npm = globalThis.process.platform === 'win32' ? 'npm.cmd' : 'npm';
export default defineConfig({
  testDir: './tests/offline', workers: 1, timeout: 45000, expect: { timeout: 10000 },
  outputDir: 'test-results/offline-browser', use: { baseURL: config.uiOrigin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${npm} run dev -- --host 127.0.0.1 --port ${config.uiPort} --strictPort`, url: config.uiOrigin, reuseExistingServer: false,
    env: { VITE_PRICING_ENGINE_API_URL: config.boundaryOrigin, VITE_SALLY_API_URL: '', VITE_SALLY_VOICE_API_URL: '',
      VITE_HLOA_LEAD_ENGINE_URL: '', VITE_APPLICATION_URL: '', VITE_APPLY_URL: '', VITE_LOAN_APPLICATION_URL: '' },
  },
});
