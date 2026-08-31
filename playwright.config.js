import { defineConfig, devices } from "@playwright/test";

const env = globalThis.process?.env || {};
const qaPort = env.CMR_QA_PORT || "5174";
const qaBaseUrl = env.CMR_QA_BASE_URL || `http://127.0.0.1:${qaPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  outputDir: "test-results/playwright",
  use: {
    baseURL: qaBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm.cmd run dev -- --host 127.0.0.1 --port ${qaPort} --strictPort`,
    env: {
      VITE_PRICING_ENGINE_API_URL: "",
      VITE_SALLY_API_URL: "",
      VITE_SALLY_VOICE_API_URL: "",
    },
    url: qaBaseUrl,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
