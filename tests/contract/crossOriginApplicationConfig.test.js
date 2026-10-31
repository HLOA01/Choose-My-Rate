import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const script = "import c from './playwright.cross-origin-application.config.js'; console.log(c.metadata.applicationUrl);";
const run = (url) => spawnSync(globalThis.process.execPath, ['--input-type=module', '-e', script], {
  cwd: new URL('../../', import.meta.url), env: { ...globalThis.process.env, CMR_QA_BASE_URL: url }, encoding: 'utf8', windowsHide: true,
});
test('cross-origin rehearsal refuses nonlocal or ambiguous configuration before starting any resource', () => {
  for (const url of ['https://example.invalid:5174/', 'http://example.invalid:5174/', 'http://localhost:5174/',
    'http://127.0.0.1/', 'http://127.0.0.1:65535/', 'http://127.0.0.1:5174/path',
    'http://127.0.0.1:5174/?query=test', 'http://127.0.0.1:5174/#fragment', 'http://user:pass@127.0.0.1:5174/']) {
    const result = run(url); assert.notEqual(result.status, 0); assert.match(result.stderr, /requires explicit loopback test configuration/);
  }
});
test('cross-origin rehearsal creates a distinct synthetic origin without any provider URL', () => {
  const result = run('http://127.0.0.1:5174/'); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'http://127.0.0.1:5175/__qa-external-application');
});
