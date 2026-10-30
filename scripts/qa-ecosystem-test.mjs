import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { configuration, TEST_MODE, childEnvironment } from './offline-test/preflight.mjs';

if (process.argv.slice(2).join(' ') !== '--synthetic-only') throw new Error('Pass --synthetic-only explicitly.');
if (process.env.OFFLINE_REHEARSAL_MODE && process.env.OFFLINE_REHEARSAL_MODE !== TEST_MODE) throw new Error('A live mode cannot be promoted into TEST.');
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, OFFLINE_REHEARSAL_MODE: TEST_MODE };
const config = configuration(env, root); // Fails before any server/browser starts.
const executionEnv = { ...childEnvironment(env), HLOA_REPO_PATH: config.hloa.root, HLOA_EXPECTED_SHA: config.hloa.sha,
  CMR_EXPECTED_SHA: config.cmr.sha, OFFLINE_UI_PORT: String(config.uiPort), OFFLINE_BOUNDARY_PORT: String(config.boundaryPort) };
const result = spawnSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.ecosystem.config.js'], {
  cwd: root, env: executionEnv, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const report = JSON.parse(readFileSync(join(root, 'test-results/offline-rehearsal/report.json'), 'utf8'));
  if (!report.passed || report.mode !== TEST_MODE || report.hloaCommit !== config.hloa.sha || report.cmrCommit !== config.cmr.sha
    || report.mockedPricingResponses !== 0 || report.lenderAccess !== 'UNVERIFIED' || report.productionReadiness !== 'UNVERIFIED') {
    throw new Error('The TEST report is missing, mismatched, or claims unsupported readiness.');
  }
  let uiRefused = false;
  try { await fetch(config.uiOrigin, { signal: AbortSignal.timeout(1000), redirect: 'error' }); }
  catch (error) { uiRefused = error.cause?.code === 'ECONNREFUSED'; }
  report.uiServerClosed = uiRefused;
  if (!uiRefused) report.passed = false;
  writeFileSync(join(root, 'test-results/offline-rehearsal/report.json'), JSON.stringify(report, null, 2));
  if (!uiRefused) throw new Error('UI listener remains reachable or its teardown is uncertain.');
  console.log('TEST synthetic rehearsal passed. Lender access and production readiness remain UNVERIFIED.');
}
