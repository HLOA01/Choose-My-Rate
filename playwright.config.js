import { defineConfig, devices } from "@playwright/test";

const env = globalThis.process?.env || {};
const qaPort = env.CMR_QA_PORT || "5174";
const qaBaseUrl = env.CMR_QA_BASE_URL || `http://127.0.0.1:${qaPort}`;
// npm's Windows shim is npm.cmd; everywhere else (including GitHub Actions'
// Linux runners) the executable is plain npm.
const npmCmd = globalThis.process?.platform === "win32" ? "npm.cmd" : "npm";

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
    command: `${npmCmd} run dev -- --host 127.0.0.1 --port ${qaPort} --strictPort`,
    env: {
      VITE_PRICING_ENGINE_API_URL: qaBaseUrl.replace(/\/$/, "") + "/__qa-pricing",
      VITE_SALLY_API_URL: qaBaseUrl.replace(/\/$/, "") + "/__qa-sally",
      VITE_SALLY_VOICE_API_URL: qaBaseUrl.replace(/\/$/, "") + "/__qa-sally-voice",
      VITE_HLOA_LEAD_ENGINE_URL: qaBaseUrl.replace(/\/$/, "") + "/__qa-hloa",
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
