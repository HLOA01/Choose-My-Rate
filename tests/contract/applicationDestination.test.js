import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationDestination } from '../../src/application/applicationDestination.js';

const page = 'https://preview.example';
const lendingpad = 'https://prod.lendingpad.com';
const borrowerPath = '/tenant/00000000-0000-0000-0000-000000000001/pos';
test('permits HTTPS application links without mutating configured routing parameters', () => {
  const destination = 'https://apply.example/intake?branch=ABC%2F1#start';
  assert.equal(applicationDestination(destination, page), destination);
  assert.equal(applicationDestination(lendingpad + borrowerPath + '#/', page), lendingpad + borrowerPath + '#/');
});
test('does not navigate to missing, ambiguous, credential-bearing or insecure destinations', () => {
  for (const raw of [null, '', 'javascript:void(0)', 'data:text/html,hello', 'https:/apply.example', 'https:///apply.example',
    '//apply.example', '/application', 'https://user:password@apply.example', 'https://@apply.example',
    'https://apply.example/\\elsewhere', 'https://app\nly.example', 'http://apply.example',
    'http://127.0.0.1:6500', lendingpad + '/tenant/pos', lendingpad + '/login', 'https://prod.lendingpad.com./login',
    lendingpad + borrowerPath + '?ambiguous=1']) {
    assert.equal(applicationDestination(raw, page), null, String(raw));
  }
});
test('permits loopback HTTP only when the CMR page is also loopback', () => {
  const receiver = 'http://127.0.0.1:5175/__qa-application';
  assert.equal(applicationDestination(receiver, 'http://127.0.0.1:5174'), receiver);
  assert.equal(applicationDestination(receiver, 'https://public.example'), null);
  assert.equal(applicationDestination('http://localhost.example/application', 'http://localhost:5174'), null);
});
