import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationLinkCopy } from '../../src/application/applicationLinkCopy.js';
// Synthetic route strings only. These tests perform no requests to a provider.
const path = '/synthetic-company/00000000-0000-4000-8000-000000000001/pos';
for (const suffix of ['', '/', '#/']) test('exact LendingPad consumer route receives provider wording: ' + (suffix || 'base'), () => {
  const copy = applicationLinkCopy('https://prod.lendingpad.com' + path + suffix, 'en-US');
  assert.equal(copy.provider, 'lendingpad'); assert.equal(copy.label, 'Open LendingPad');
  assert.match(copy.notice, /temporary copy/); assert.match(copy.notice, /does not confirm/);
});
for (const url of ['', '/relative', 'not a URL', 'javascript:alert(1)',
  'https://prod.lendingpad.com.evil.invalid' + path, 'https://evil.invalid/prod.lendingpad.com' + path,
  'https://prod.lendingpad.com@evil.invalid' + path, 'https://user:pass@prod.lendingpad.com' + path,
  'http://prod.lendingpad.com' + path, 'https://prod.lendingpad.com:8443' + path,
  'https://prod.lendingpad.com/web/#/profile/pos/general-info', 'https://prod.lendingpad.com/synthetic-company/pos',
  'https://prod.lendingpad.com' + path + '?route=synthetic', 'https://prod.lendingpad.com' + path + '#/unknown',
  'http://127.0.0.1:5174/__qa-application', 'https://other.invalid/apply']) test('generic fallback for ' + url, () => {
  const copy = applicationLinkCopy(url, 'en'); assert.equal(copy.label, 'Continue to Application');
  assert.equal(copy.provider, 'generic'); assert.doesNotMatch(copy.notice, /LendingPad/); assert.match(copy.notice, /temporary copy/);
});
for (const locale of ['es', 'es-US', 'ES-mx']) test('Spanish provider and generic copy is consistent: ' + locale, () => {
  const copy = applicationLinkCopy('https://prod.lendingpad.com' + path, locale);
  assert.equal(copy.language, 'es'); assert.equal(copy.label, 'Abrir LendingPad'); assert.match(copy.notice, /una copia de tus datos/); assert.match(copy.notice, /no confirma/);
  const generic = applicationLinkCopy('http://127.0.0.1:5174/app', locale); assert.equal(generic.label, 'Continuar a la solicitud'); assert.doesNotMatch(generic.notice, /LendingPad/);
});
test('unknown or malformed locale uses English and copy does not mutate its input URL', () => {
  const url = 'https://prod.lendingpad.com' + path + '?route=synthetic#part';
  for (const locale of [null, undefined, {}, 'en-US', 'not-es']) assert.equal(applicationLinkCopy(url, locale).language, 'en');
  assert.equal(url, 'https://prod.lendingpad.com' + path + '?route=synthetic#part');
});
