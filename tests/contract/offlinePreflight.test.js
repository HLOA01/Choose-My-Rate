import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { assertRepository, assertLocalOrigin, childEnvironment, configuration } from '../../scripts/offline-test/preflight.mjs';

it('preflight rejects missing, wrong-package, wrong-commit and dirty tracked source without starting services', () => {
  const tempBase = realpathSync(tmpdir());
  const root = mkdtempSync(join(tempBase, 'cmr-offline-preflight-'));
  const sha = 'a'.repeat(40);
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'hloa-platform' }));
    const cleanGit = (_root, args) => args[0] === 'rev-parse' ? sha : '';
    assert.throws(() => assertRepository('', 'hloa-platform', sha, cleanGit));
    assert.throws(() => assertRepository(root, 'choose-my-rate', sha, cleanGit), /identity mismatch/);
    assert.throws(() => assertRepository(root, 'hloa-platform', 'b'.repeat(40), cleanGit), /commit mismatch/);
    assert.throws(() => assertRepository(root, 'hloa-platform', sha, (_root, args) => args[0] === 'rev-parse' ? sha : ' M file'), /Tracked/);
    assert.equal(assertRepository(root, 'hloa-platform', sha, cleanGit).trackedClean, true);
  } finally {
    const target = realpathSync(root);
    assert.equal(dirname(target), tempBase);
    assert.ok(basename(target).startsWith('cmr-offline-preflight-'));
    rmSync(target, { recursive: true, force: true });
  }
});

it('preflight permits explicit loopback origins and rejects nonlocal or credential-bearing destinations', () => {
  assert.equal(assertLocalOrigin('http://127.0.0.1:5481'), 'http://127.0.0.1:5481');
  for (const url of ['https://example.com', 'http://localhost:5481', 'http://0.0.0.0:5481', 'http://user:secret@127.0.0.1:5481', 'http://127.0.0.1:5481/path']) assert.throws(() => assertLocalOrigin(url));
  assert.throws(() => configuration({ OFFLINE_REHEARSAL_MODE: 'live' }, '.'), /TEST_SYNTHETIC/);
  assert.throws(() => configuration({ OFFLINE_REHEARSAL_MODE: 'TEST_SYNTHETIC', VITE_SALLY_API_URL: 'https://example.invalid' }, '.'), /disabled/);
  assert.throws(() => configuration({ OFFLINE_REHEARSAL_MODE: 'TEST_SYNTHETIC', VITE_PRICING_ENGINE_API_URL: 'https://example.invalid' }, '.'), /TEST boundary/);
});

it('child environment drops provider credentials, DB URLs, NODE_OPTIONS and unrelated inherited configuration', () => {
  const env = childEnvironment({ PATH: 'system-path', OPENAI_API_KEY: 'not-a-key', AWS_SECRET_ACCESS_KEY: 'not-a-key',
    DATABASE_URL: 'postgres://must-not-use', HLOA_TEST_DATABASE_URL: 'postgres://must-not-use', NODE_OPTIONS: '--inspect', GITHUB_TOKEN: 'not-a-token' });
  assert.equal(env.DATABASE_URL, 'memory://');
  assert.equal(env.HLOA_TEST_DATABASE_URL, 'memory://');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.PRICING_ENABLE_SCHEDULER, 'false');
});
