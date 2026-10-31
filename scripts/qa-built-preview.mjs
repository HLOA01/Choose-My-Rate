// TEST-only built-preview coordinator. Never deploys, installs dependencies or loads deployment environment files.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { assertRepository, childEnvironment, TEST_MODE } from './offline-test/preflight.mjs';
import { digest, fingerprint, inventory, verifyArtifacts } from './built-preview-core.mjs';
if (process.argv.slice(2).join(' ') !== '--synthetic-only') throw new Error('Pass --synthetic-only explicitly.');
const root = fileURLToPath(new URL('..', import.meta.url));
const repository = assertRepository(root, 'choose-my-rate', process.env.CMR_EXPECTED_SHA);
const uiOrigin = 'http://127.0.0.1:5196', receiverOrigin = 'http://127.0.0.1:5197';
const scratch = mkdtempSync(join(tmpdir(), 'cmr-built-preview-'));
const sourceDir = join(scratch, 'source'); mkdirSync(sourceDir);
const archive = execFileSync('git', ['archive', '--format=tar', repository.sha, 'src', 'public', 'lambda/sally-scenario-parser.mjs', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json'], { cwd: root, maxBuffer: 50 * 1024 * 1024, windowsHide: true });
const archiveFile = join(scratch, 'source.tar'); writeFileSync(archiveFile, archive);
execFileSync('tar', ['-xf', archiveFile, '-C', sourceDir], { windowsHide: true });
symlinkSync(realpathSync(join(root, 'node_modules')), join(sourceDir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const buildScript = join(scratch, 'build.mjs');
writeFileSync(buildScript, `import { build } from ${JSON.stringify(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href)};
await build({root:process.argv[2], configFile:process.argv[2]+'/vite.config.js', envDir:false, logLevel:'silent', build:{outDir:process.argv[3],emptyOutDir:false}});`);
const sourceFiles = inventory(sourceDir, ['node_modules']);
const reportDir = join(root, 'test-results', 'built-preview'); mkdirSync(reportDir, { recursive: true });
const a = receiverOrigin + '/__qa-external-application?route=primary', b = receiverOrigin + '/__qa-external-application?route=alias';
const report = { mode: TEST_MODE, sourceSha: repository.sha, sourceArchiveHash: digest(archive), hloaUsed: false,
  backendResponses: 'MOCKED_SYNTHETIC', productionReadiness: 'UNVERIFIED', lenderAccess: 'UNVERIFIED', dependencyBytesAttested: false, scratch, cases: [], passed: false };
async function closed(origin) {
  try { await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(1000) }); return false; }
  catch (error) { return error.cause?.code === 'ECONNREFUSED'; }
}
try {
  for (const [caseId, primary, alias, expectedDestination, selectedKey] of [
    ['primary_conflict', a, b, a, 'VITE_APPLICATION_URL'], ['alias_only', '', b, b, 'VITE_APPLY_URL'], ['unset', '', '', '', null],
  ]) {
    assertRepository(root, 'choose-my-rate', repository.sha);
    if (!await closed(uiOrigin) || !await closed(receiverOrigin)) throw new Error('TEST port occupied before case; no existing listener will be reused or killed.');
    const caseDir = join(scratch, caseId), bundleDir = join(caseDir, 'dist'); mkdirSync(caseDir);
    const buildConfig = { VITE_APP_ENV: 'test', VITE_APPLICATION_URL: primary, VITE_APPLY_URL: alias, VITE_LOAN_APPLICATION_URL: '',
      VITE_PRICING_ENGINE_API_URL: uiOrigin + '/__qa-pricing', VITE_SALLY_API_URL: uiOrigin + '/__qa-sally',
      VITE_SALLY_VOICE_API_URL: '', VITE_HLOA_LEAD_ENGINE_URL: uiOrigin + '/__qa-hloa' };
    const buildResult = spawnSync(process.execPath, [buildScript, sourceDir, bundleDir], {
      env: { ...childEnvironment(process.env), NODE_ENV: 'production', ...buildConfig }, encoding: 'utf8', windowsHide: true,
    });
    if (buildResult.status !== 0) throw new Error('Synthetic build failed: ' + (buildResult.stderr || '').slice(-1500));
    const manifest = { schemaVersion: 1, mode: TEST_MODE, sourceSha: repository.sha, caseId, scratch, sourceDir, bundleDir,
      sourceFiles, sourceArchiveHash: digest(archive), lockHash: digest(readFileSync(join(sourceDir, 'package-lock.json'))),
      envFilesExcluded: true, viteEnvLoadingDisabled: true, uiOrigin, receiverOrigin, buildConfig,
      configHash: fingerprint(buildConfig), expectedDestination, selectedKey, artifacts: inventory(bundleDir) };
    verifyArtifacts(manifest, repository.sha, caseId);
    const manifestFile = join(caseDir, 'manifest.json'); writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    const executionEnv = { ...childEnvironment(process.env), BUILT_PREVIEW_MODE: TEST_MODE, BUILT_PREVIEW_MANIFEST: manifestFile,
      BUILT_PREVIEW_CASE: caseId, CMR_EXPECTED_SHA: repository.sha, CMR_QA_BASE_URL: uiOrigin, CMR_QA_PORT: '5196' };
    const result = spawnSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.built-preview.config.js'], {
      cwd: root, env: executionEnv, stdio: 'inherit', windowsHide: true, timeout: 300000,
    });
    const uiClosed = await closed(uiOrigin), receiverClosed = await closed(receiverOrigin);
    const item = { caseId, selectedKey, aliasesConflict: !!primary && !!alias && primary !== alias, manifest, uiClosed, receiverClosed,
      runtimeOverrideIgnored: false, passed: false };
    report.cases.push(item);
    if (result.error || result.status !== 0 || !uiClosed || !receiverClosed) throw new Error('Preview tests or teardown failed for ' + caseId);
    const tests = JSON.parse(readFileSync(join(caseDir, 'playwright-results.json'), 'utf8'));
    if (tests.stats.unexpected || tests.stats.skipped || tests.stats.flaky || !tests.stats.expected) throw new Error('Incomplete preview test results.');
    verifyArtifacts(manifest, repository.sha, caseId);
    item.testCounts = tests.stats; item.runtimeOverrideIgnored = true; item.passed = true;
    writeFileSync(join(reportDir, caseId + '.json'), JSON.stringify(item, null, 2));
  }
  assertRepository(root, 'choose-my-rate', repository.sha);
  report.passed = true;
} catch (error) {
  report.error = error.message; process.exitCode = 1;
} finally {
  report.finalUiClosed = await closed(uiOrigin); report.finalReceiverClosed = await closed(receiverOrigin);
  if (!report.finalUiClosed || !report.finalReceiverClosed) { report.passed = false; process.exitCode = 1; }
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));
}
if (report.passed) console.log('TEST built-preview passed: clean export, immutable artifact bytes, synthetic targets and teardown. Production readiness remains UNVERIFIED.');
else console.error(report.error || 'TEST teardown uncertain.');
