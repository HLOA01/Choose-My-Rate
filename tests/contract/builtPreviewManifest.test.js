import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, fingerprint, inventory, verifyArtifacts } from '../../scripts/built-preview-core.mjs';
function fixture() {
  const scratch = mkdtempSync(join(tmpdir(), 'cmr-preview-unit-')), sourceDir = join(scratch, 'source'), bundleDir = join(scratch, 'dist');
  mkdirSync(sourceDir); mkdirSync(bundleDir); writeFileSync(join(sourceDir, 'package-lock.json'), '{}');
  writeFileSync(join(bundleDir, 'index.html'), '<script src="app.js"></script>'); writeFileSync(join(bundleDir, 'app.js'), '/* synthetic */');
  const buildConfig = { VITE_APP_ENV: 'test', VITE_APPLICATION_URL: 'http://127.0.0.1:5197/app', VITE_APPLY_URL: '', VITE_LOAN_APPLICATION_URL: '',
    VITE_PRICING_ENGINE_API_URL: 'http://127.0.0.1:5196/__qa-pricing', VITE_SALLY_API_URL: '', VITE_SALLY_VOICE_API_URL: '', VITE_HLOA_LEAD_ENGINE_URL: '' };
  return { schemaVersion: 1, mode: 'TEST_SYNTHETIC', sourceSha: 'a'.repeat(40), caseId: 'primary_conflict', scratch, sourceDir, bundleDir,
    uiOrigin: 'http://127.0.0.1:5196', receiverOrigin: 'http://127.0.0.1:5197', buildConfig, configHash: fingerprint(buildConfig),
    expectedDestination: buildConfig.VITE_APPLICATION_URL, lockHash: digest('{}'), envFilesExcluded: true, viteEnvLoadingDisabled: true,
    artifacts: inventory(bundleDir), sourceFiles: inventory(sourceDir) };
}
const check = m => verifyArtifacts(m, 'a'.repeat(40), 'primary_conflict');
test('intact artifact/config/source manifest validates', () => { const m = fixture(); assert.equal(check(m), m); });
test('modified served JavaScript cannot retain a passed manifest', () => { const m = fixture(); writeFileSync(join(m.bundleDir, 'app.js'), 'changed'); assert.throws(() => check(m), /hash mismatch/); });
test('unlisted artifact and source shadow inputs are refused', () => {
  const m = fixture(); writeFileSync(join(m.bundleDir, 'shadow.mjs'), 'extra'); assert.throws(() => check(m), /hash mismatch/);
  const n = fixture(); writeFileSync(join(n.sourceDir, 'shadow.mjs'), 'extra'); assert.throws(() => check(n), /source export changed/);
});
test('stale source version/case, changed config and nonlocal target fail closed', () => {
  const m = fixture(); assert.throws(() => verifyArtifacts(m, 'b'.repeat(40), m.caseId), /manifest mismatch/);
  assert.throws(() => verifyArtifacts(m, m.sourceSha, 'unset'), /manifest mismatch/);
  m.buildConfig.VITE_APPLY_URL = 'http://127.0.0.1:5197/other'; assert.throws(() => check(m), /fingerprint/);
  m.buildConfig.VITE_APPLY_URL = 'https://example.invalid/'; m.configHash = fingerprint(m.buildConfig); assert.throws(() => check(m), /Nonlocal/);
});
test('manifest traversal, environment files, lock changes and identical origins are refused', () => {
  const m = fixture(); m.artifacts.push({ ...m.artifacts[0], file: '../escape' }); assert.throws(() => check(m), /Invalid artifact entry/);
  const n = fixture(); writeFileSync(join(n.sourceDir, '.env.production'), 'SYNTHETIC=only'); assert.throws(() => check(n), /Environment file/);
  const nested = fixture(); mkdirSync(join(nested.sourceDir, 'src')); writeFileSync(join(nested.sourceDir, 'src', '.env.test'), 'SYNTHETIC=only'); assert.throws(() => check(nested), /Environment file/);
  const p = fixture(); writeFileSync(join(p.sourceDir, 'package-lock.json'), 'changed'); assert.throws(() => check(p), /lockfile changed/);
  const q = fixture(); q.receiverOrigin = q.uiOrigin; assert.throws(() => check(q), /origins/);
});
