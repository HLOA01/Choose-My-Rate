import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { configuration, TEST_MODE } from './offline-test/preflight.mjs';

if (process.argv.slice(2).join(' ') !== '--synthetic-only') throw new Error('Pass --synthetic-only explicitly.');
if (process.env.OFFLINE_REHEARSAL_MODE && process.env.OFFLINE_REHEARSAL_MODE !== TEST_MODE) throw new Error('A live mode cannot be promoted into TEST.');
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, OFFLINE_REHEARSAL_MODE: TEST_MODE };
const config = configuration(env, root); // Fails before any server/browser starts.
const result = spawnSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.ecosystem.config.js'], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const report = JSON.parse(readFileSync(join(root, 'test-results/offline-rehearsal/report.json'), 'utf8'));
  if (!report.passed || report.mode !== TEST_MODE || report.hloaCommit !== config.hloa.sha || report.cmrCommit !== config.cmr.sha
    || report.mockedPricingResponses !== 0 || report.lenderAccess !== 'UNVERIFIED' || report.productionReadiness !== 'UNVERIFIED') {
    throw new Error('The TEST report is missing, mismatched, or claims unsupported readiness.');
  }
  console.log('TEST synthetic rehearsal passed. Lender access and production readiness remain UNVERIFIED.');
}
