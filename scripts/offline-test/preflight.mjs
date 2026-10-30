import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const TEST_MODE = 'TEST_SYNTHETIC';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();

export function assertRepository(root, name, expectedSha, readGit = git) {
  if (!root || !/^[a-f0-9]{40}$/i.test(expectedSha || '')) throw new Error('Explicit repository path and exact expected commit are required.');
  const resolved = realpathSync(root);
  const metadata = JSON.parse(readFileSync(join(resolved, 'package.json'), 'utf8'));
  if (metadata.name !== name) throw new Error('Repository package identity mismatch.');
  const sha = readGit(resolved, ['rev-parse', 'HEAD']);
  if (sha !== expectedSha.toLowerCase()) throw new Error('Repository commit mismatch.');
  if (readGit(resolved, ['status', '--porcelain', '--untracked-files=no'])) throw new Error('Tracked repository changes prevent a reproducible rehearsal.');
  return { root: resolved, sha, packageName: name, trackedClean: true };
}

export function assertLocalOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('Only explicit 127.0.0.1 HTTP test origins are allowed.');
  return url.origin;
}

export function configuration(env, cmrRoot) {
  if (env.OFFLINE_REHEARSAL_MODE !== TEST_MODE) throw new Error('Explicit TEST_SYNTHETIC mode is required.');
  const port = (value, fallback) => {
    const raw = value || fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) throw new Error('Invalid unprivileged test port.');
    return Number(raw);
  };
  const uiPort = port(env.OFFLINE_UI_PORT, '5176');
  const boundaryPort = port(env.OFFLINE_BOUNDARY_PORT, '5481');
  if (uiPort === boundaryPort) throw new Error('Test ports must differ.');
  const uiOrigin = assertLocalOrigin(`http://127.0.0.1:${uiPort}`);
  const boundaryOrigin = assertLocalOrigin(`http://127.0.0.1:${boundaryPort}`);
  for (const key of ['VITE_SALLY_API_URL', 'VITE_SALLY_VOICE_API_URL', 'VITE_HLOA_LEAD_ENGINE_URL', 'VITE_APPLICATION_URL', 'VITE_APPLY_URL', 'VITE_LOAN_APPLICATION_URL']) {
    if (env[key]) throw new Error('External AI, CRM and application destinations must be disabled for this rehearsal.');
  }
  if (env.VITE_PRICING_ENGINE_API_URL && env.VITE_PRICING_ENGINE_API_URL !== boundaryOrigin) throw new Error('Pricing destination is not the explicit local TEST boundary.');
  if (env.CMR_QA_BASE_URL && env.CMR_QA_BASE_URL !== uiOrigin) throw new Error('UI destination is not the explicit local TEST origin.');
  const cmr = assertRepository(cmrRoot, 'choose-my-rate', env.CMR_EXPECTED_SHA);
  const hloa = assertRepository(env.HLOA_REPO_PATH, 'hloa-platform', env.HLOA_EXPECTED_SHA);
  if (!existsSync(join(hloa.root, 'tools/offline-rehearsal/src/cli.ts')) || !existsSync(join(hloa.root, 'node_modules/tsx/package.json'))) {
    throw new Error('Reviewed HLOA TEST bootstrap and its locked dependencies are required.');
  }
  return { mode: TEST_MODE, uiPort, boundaryPort, uiOrigin, boundaryOrigin, cmr, hloa };
}

export function childEnvironment(env) {
  const safe = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']
    .filter((key) => env[key]).map((key) => [key, env[key]]));
  return { ...safe, NODE_ENV: 'test', OFFLINE_REHEARSAL_MODE: TEST_MODE,
    DATABASE_URL: 'memory://', HLOA_TEST_DATABASE_URL: 'memory://', RUN_LIVE_PRMG_VALIDATION: 'false',
    PRICING_ENABLE_SCHEDULER: 'false', PRICING_RUN_REFRESH_ON_START: 'false' };
}
