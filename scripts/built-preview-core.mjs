// TEST-only artifact consistency checks. Not a production deployment or authentication policy.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { assertLocalOrigin, TEST_MODE } from './offline-test/preflight.mjs';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function fingerprint(config) { return digest(JSON.stringify(Object.fromEntries(Object.keys(config).sort().map(k => [k, config[k]])))); }
export function inventory(root, excludedRootNames = []) {
  const result = [];
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      if (!prefix && excludedRootNames.includes(name)) continue;
      const file = join(dir, name), stat = lstatSync(file), key = prefix + name;
      if (stat.isSymbolicLink()) throw new Error('Symlink artifact refused.');
      if (stat.isDirectory()) walk(file, key + '/');
      else if (stat.isFile()) result.push({ file: key, bytes: stat.size, sha256: digest(readFileSync(file)) });
      else throw new Error('Unsupported artifact input.');
    }
  }
  walk(root); return result.sort((a, b) => a.file.localeCompare(b.file));
}
export function validateManifest(m, expectedSha, expectedCase) {
  if (m?.schemaVersion !== 1 || m.mode !== TEST_MODE || !/^[a-f0-9]{40}$/.test(expectedSha || '')
    || m.sourceSha !== expectedSha || m.caseId !== expectedCase) throw new Error('Source/case manifest mismatch.');
  const ui = assertLocalOrigin(m.uiOrigin), receiver = assertLocalOrigin(m.receiverOrigin);
  if (ui === receiver || !['primary_conflict', 'alias_only', 'unset'].includes(m.caseId)) throw new Error('Invalid TEST origins/case.');
  const keys = ['VITE_APPLICATION_URL', 'VITE_APPLY_URL', 'VITE_LOAN_APPLICATION_URL', 'VITE_PRICING_ENGINE_API_URL', 'VITE_SALLY_API_URL', 'VITE_SALLY_VOICE_API_URL', 'VITE_HLOA_LEAD_ENGINE_URL', 'VITE_APP_ENV'];
  if (!m.buildConfig || Object.keys(m.buildConfig).sort().join() !== keys.sort().join() || m.buildConfig.VITE_APP_ENV !== 'test'
    || m.configHash !== fingerprint(m.buildConfig)) throw new Error('Build configuration fingerprint mismatch.');
  for (const [key, value] of Object.entries(m.buildConfig)) {
    if (key === 'VITE_APP_ENV') continue;
    if (typeof value !== 'string') throw new Error('Invalid TEST value.');
    if (value) { const u = new URL(value); if (![ui, receiver].includes(u.origin) || u.username || u.password || u.hash) throw new Error('Nonlocal TEST destination refused.'); }
  }
  const selected = m.buildConfig.VITE_APPLICATION_URL || m.buildConfig.VITE_APPLY_URL || m.buildConfig.VITE_LOAN_APPLICATION_URL;
  if (selected !== m.expectedDestination || (m.caseId === 'unset') !== !selected) throw new Error('Expected destination mismatch.');
  if (!/^[a-f0-9]{64}$/.test(m.lockHash || '') || !m.envFilesExcluded || !m.viteEnvLoadingDisabled) throw new Error('Missing build input evidence.');
  if (!Array.isArray(m.artifacts) || !m.artifacts.some(a => a.file === 'index.html') || !m.artifacts.some(a => a.file.endsWith('.js'))) throw new Error('Missing artifact inventory.');
  if (!Array.isArray(m.sourceFiles)) throw new Error('Missing source inventory.');
  for (const a of [...m.artifacts, ...m.sourceFiles]) {
    if (typeof a.file !== 'string' || !a.file || a.file.includes('\\') || a.file.split('/').some(p => !p || p === '.' || p === '..') || isAbsolute(a.file)
      || !Number.isSafeInteger(a.bytes) || a.bytes < 0 || !/^[a-f0-9]{64}$/.test(a.sha256 || '')) throw new Error('Invalid artifact entry.');
  }
  return m;
}
export function verifyArtifacts(m, expectedSha, expectedCase) {
  validateManifest(m, expectedSha, expectedCase);
  const bundle = realpathSync(m.bundleDir), source = realpathSync(m.sourceDir), scratch = realpathSync(m.scratch);
  for (const child of [bundle, source]) { const r = relative(scratch, child); if (!r || r.startsWith('..') || isAbsolute(r)) throw new Error('Artifact root escapes isolated scratch.'); }
  if (readdirSync(source).some(name => name.startsWith('.env'))) throw new Error('Environment file in clean export.');
  if (digest(readFileSync(join(source, 'package-lock.json'))) !== m.lockHash) throw new Error('Export lockfile changed.');
  if (JSON.stringify(inventory(source, ['node_modules'])) !== JSON.stringify(m.sourceFiles)) throw new Error('Clean source export changed.');
  if (JSON.stringify(inventory(bundle)) !== JSON.stringify(m.artifacts)) throw new Error('Artifact inventory/hash mismatch.');
  return m;
}
export function readManifest(file, expectedSha, expectedCase) {
  const bytes = readFileSync(resolve(file));
  if (bytes.length > 65536) throw new Error('Oversized TEST manifest.');
  return verifyArtifacts(JSON.parse(bytes.toString('utf8')), expectedSha, expectedCase);
}
