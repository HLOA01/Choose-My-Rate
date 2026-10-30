import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  compareMonthlyPi,
  formatCents,
  parseCurrentMonthlyPi,
  quotedMonthlyPiToCents,
} from '../../src/pricing/monthlyPiDifference.js';

const cmp = (currentMonthlyPI, quotedMonthlyPI) => compareMonthlyPi({ currentMonthlyPI, quotedMonthlyPI });
const MAX = Number.MAX_SAFE_INTEGER; // 9007199254740991 cents

describe('direction and signed difference (quoted minus current)', () => {
  it('lower: quoted P&I below the current P&I gives a negative difference', () => {
    const r = cmp('2900.00', 2731.45);
    assert.equal(r.status, 'ready'); assert.equal(r.direction, 'lower');
    assert.equal(r.differenceCents, -16855); assert.equal(r.absoluteDifferenceCents, 16855);
    assert.equal(r.currentCents, 290000); assert.equal(r.quotedCents, 273145);
  });
  it('higher: quoted P&I above the current P&I gives a positive difference', () => {
    const r = cmp('2500', 2731.45);
    assert.equal(r.direction, 'higher'); assert.equal(r.differenceCents, 23145);
  });
  it('same: equal amounts give exactly zero, a positive zero, labelled "same"', () => {
    const r = cmp('2731.45', 2731.45);
    assert.equal(r.direction, 'same'); assert.ok(Object.is(r.differenceCents, 0), 'must be +0, not -0'); assert.ok(Object.is(r.absoluteDifferenceCents, 0));
    assert.equal(cmp('2731.4', 2731.4).direction, 'same');
    assert.equal(cmp('2731', 2731).direction, 'same');
  });
  it('the sign convention is quoted minus current, never the reverse', () => {
    assert.equal(cmp('100', 150).differenceCents, 5000); assert.equal(cmp('150', 100).differenceCents, -5000);
  });
});

describe('cents precision (no floating-point arithmetic on dollars)', () => {
  it('classic binary-float cases come out exact', () => {
    assert.equal(cmp('0.10', 0.30).differenceCents, 20); // 0.3 - 0.1 = 0.19999999999999998 in floats
    assert.equal(cmp('0.20', 0.10).differenceCents, -10);
    assert.equal(cmp('1.15', 1.1).differenceCents, -5);
    assert.equal(cmp('4.35', 4.35).differenceCents, 0); // 4.35 * 100 = 434.99999999999994 in floats
    assert.equal(cmp('1234567.89', 1234567.9).differenceCents, 1);
  });
  it('rejects sub-cent numeric quotes rather than silently changing their amount', () => {
    for (const value of [1.005, 2731.449999999, 2731.454, 2731.455, 1e-7, 0.1 + 0.2]) {
      assert.deepEqual(quotedMonthlyPiToCents(value), { ok: false, reason: 'unsupported_precision' });
    }
    assert.deepEqual(quotedMonthlyPiToCents(2731.45), { ok: true, cents: 273145 });
  });
  it('borrower input is NEVER rounded: a third decimal is rejected, not rounded', () => {
    assert.deepEqual(parseCurrentMonthlyPi('2731.455'), { ok: false, reason: 'malformed' });
    assert.deepEqual(parseCurrentMonthlyPi('2731.4'), { ok: true, cents: 273140 });
    assert.deepEqual(parseCurrentMonthlyPi('2731'), { ok: true, cents: 273100 });
  });
  it('randomized exactness: parsing and subtraction agree with exact BigInt arithmetic', () => {
    let seed = 0x9e3779b9; // deterministic mulberry32
    const next = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < 20000; i += 1) {
      const a = BigInt(Math.floor(next() * 5_000_000_00)); const b = BigInt(Math.floor(next() * 5_000_000_00));
      const text = (c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
      const parsed = parseCurrentMonthlyPi(text(a));
      assert.equal(BigInt(parsed.cents), a, text(a));
      const r = compareMonthlyPi({ currentMonthlyPI: text(a), quotedMonthlyPI: Number(text(b)) });
      assert.equal(BigInt(r.differenceCents), b - a, `${text(b)} - ${text(a)}`);
    }
  });
});

describe('explicit zero is distinct from absent', () => {
  it('"0", "0.0" and "0.00" are genuine zero', () => {
    for (const text of ['0', '0.0', '0.00']) assert.deepEqual(parseCurrentMonthlyPi(text), { ok: true, cents: 0 });
    const r = cmp('0', 2731.45);
    assert.equal(r.status, 'ready'); assert.equal(r.direction, 'higher'); assert.equal(r.currentCents, 0); assert.equal(r.differenceCents, 273145);
  });
  it('absent input is unavailable and NEVER becomes zero', () => {
    for (const v of ['', ' ', '   ', '\t', '\n', null, undefined]) {
      const r = cmp(v, 2731.45);
      assert.equal(r.status, 'unavailable', JSON.stringify(v)); assert.equal(r.reason, 'empty'); assert.equal(r.field, 'current'); assert.ok(!('differenceCents' in r));
    }
    assert.equal(compareMonthlyPi().status, 'unavailable');
    assert.equal(compareMonthlyPi({}).status, 'unavailable');
  });
  it('a quote P&I of genuine zero is valid and distinct from a missing one', () => {
    assert.deepEqual(quotedMonthlyPiToCents(0), { ok: true, cents: 0 });
    const r = cmp('100', 0); assert.equal(r.status, 'ready'); assert.equal(r.direction, 'lower'); assert.equal(r.differenceCents, -10000);
    assert.equal(cmp('100', 0).quotedCents, 0);
    for (const missing of [null, undefined]) assert.deepEqual(quotedMonthlyPiToCents(missing), { ok: false, reason: 'missing' });
    assert.equal(cmp('0', 0).direction, 'same');
  });
  it('a negative-zero quote is normalised to +0', () => {
    const r = quotedMonthlyPiToCents(-0); assert.ok(Object.is(r.cents, 0));
  });
});

describe('strict rejection of borrower input (no stripping, coercion, rounding or zero fallback)', () => {
  const malformed = [
    'abc', '1e3', '1E3', '1e-3', '1.234', '-1', '-0', '+1', '1,000', '1,000.00', '$100', '100$', '$', '100%', '%', '0x10', '0b1', '1.', '.5', '.', '..', '01', '00', '007', '1 0', ' 1', '1 ', '\t1', '1\n',
    'Infinity', '-Infinity', 'NaN', 'null', 'undefined', 'true', '１２３', '٣٤٥', '1_000', '1.2.3', '1..2', '2731.45.', '2731,45', '(100)', '100 USD', '1e999', '0.0.0', '１.５',
  ];
  for (const text of malformed) it(`rejects ${JSON.stringify(text)} as malformed`, () => assert.deepEqual(parseCurrentMonthlyPi(text), { ok: false, reason: 'malformed' }));
  it('never coerces non-text values', () => {
    for (const v of [12, 0, 1.5, NaN, Infinity, -1, true, false, [], ['1'], [1], {}, { toString: () => '5' }, () => '5', 10n, Symbol('x')]) {
      assert.deepEqual(parseCurrentMonthlyPi(v), { ok: false, reason: 'not_text' }, String(typeof v));
    }
  });
  it('a rejected input is unavailable in the comparison, never a zero difference', () => {
    for (const text of ['1,000', '1e3', '-5', '1.234', ' 12', 'abc']) {
      const r = cmp(text, 2731.45); assert.equal(r.status, 'unavailable'); assert.equal(r.field, 'current'); assert.ok(!('differenceCents' in r), text);
    }
  });
});

describe('safe magnitude boundary (a numeric-exactness limit, not a business cap)', () => {
  it('the largest exactly-representable amount is accepted', () => {
    assert.deepEqual(parseCurrentMonthlyPi('90071992547409.91'), { ok: true, cents: MAX });
  });
  it('one cent more, and anything larger, is rejected as unsafe_magnitude', () => {
    for (const text of ['90071992547409.92', '90071992547409.99', '90071992547410', '90071992547410.00', '99999999999999', '99999999999999.99', '100000000000000', '99999999999999999999', '1' + '0'.repeat(400)]) {
      assert.deepEqual(parseCurrentMonthlyPi(text), { ok: false, reason: 'unsafe_magnitude' }, text.slice(0, 30));
    }
  });
  it('the longest accepted text is 17 characters, which is why no unbounded string reaches BigInt', () => {
    assert.equal('90071992547409.91'.length, 17);
    assert.equal(parseCurrentMonthlyPi('9'.repeat(15)).reason, 'unsafe_magnitude');
  });
  it('a pasted multi-hundred-thousand-digit string is rejected, and quickly', () => {
    const huge = '9'.repeat(300_000);
    const started = performance.now();
    assert.deepEqual(parseCurrentMonthlyPi(huge), { ok: false, reason: 'unsafe_magnitude' });
    assert.deepEqual(parseCurrentMonthlyPi(`${huge}.99`), { ok: false, reason: 'unsafe_magnitude' });
    assert.ok(performance.now() - started < 1500, `took ${Math.round(performance.now() - started)} ms`);
  });
  it('an at-the-limit input compared with a small quote stays an exact safe integer', () => {
    const r = cmp('90071992547409.91', 1); assert.equal(r.differenceCents, 100 - MAX); assert.ok(Number.isSafeInteger(r.differenceCents));
  });
  it('quotes beyond exact cents are rejected, not clamped', () => {
    for (const v of [1e15, 90071992547410, 1e300, Number.MAX_VALUE]) assert.deepEqual(quotedMonthlyPiToCents(v), { ok: false, reason: 'unsafe_magnitude' }, String(v));
    assert.equal(quotedMonthlyPiToCents(90071992547409).ok, true, 'the largest whole-dollar quote that fits is accepted');
    assert.equal(quotedMonthlyPiToCents(9e13 + 1).ok, true, 'still inside the exact range');
  });
});

describe('the quote side is validated independently of the quote contract', () => {
  it('only a finite, non-negative number is accepted', () => {
    const bad = { '2700': 'not_number', '': 'not_number', true: 'not_number' };
    assert.deepEqual(quotedMonthlyPiToCents('2700'), { ok: false, reason: 'not_number' });
    assert.deepEqual(quotedMonthlyPiToCents(true), { ok: false, reason: 'not_number' });
    assert.deepEqual(quotedMonthlyPiToCents([2700]), { ok: false, reason: 'not_number' });
    assert.deepEqual(quotedMonthlyPiToCents({ valueOf: () => 2700 }), { ok: false, reason: 'not_number' });
    assert.deepEqual(quotedMonthlyPiToCents(10n), { ok: false, reason: 'not_number' });
    assert.deepEqual(quotedMonthlyPiToCents(NaN), { ok: false, reason: 'not_finite' });
    assert.deepEqual(quotedMonthlyPiToCents(Infinity), { ok: false, reason: 'not_finite' });
    assert.deepEqual(quotedMonthlyPiToCents(-Infinity), { ok: false, reason: 'not_finite' });
    assert.deepEqual(quotedMonthlyPiToCents(-0.01), { ok: false, reason: 'negative' });
    assert.ok(bad);
  });
  it('an invalid quote makes the comparison unavailable even when the borrower input is valid', () => {
    for (const v of [null, undefined, '2700', NaN, Infinity, -1, true]) {
      const r = cmp('2700', v); assert.equal(r.status, 'unavailable'); assert.equal(r.field, 'quoted'); assert.ok(!('differenceCents' in r));
    }
  });
  it('the comparison takes the P&I only: a PITI-shaped value is not a thing it can accept', () => {
    const r = compareMonthlyPi({ currentMonthlyPI: '2900', quotedMonthlyPI: 2731.45, paymentPITI: 3300, totalMonthlyPayment: 3300, estimatedCashToClose: 31000 });
    assert.equal(r.quotedCents, 273145); assert.ok(!JSON.stringify(r).includes('3300') && !JSON.stringify(r).includes('330000'));
  });
});

describe('formatting never invents a sign, a zero or a rounding', () => {
  it('formats exact cents with grouping', () => {
    assert.equal(formatCents(0), '$0.00'); assert.equal(formatCents(5), '$0.05'); assert.equal(formatCents(100), '$1.00');
    assert.equal(formatCents(273145), '$2,731.45'); assert.equal(formatCents(123456789), '$1,234,567.89'); assert.equal(formatCents(MAX), '$90,071,992,547,409.91');
  });
  it('refuses to format anything but a non-negative safe integer (so no "-$0.00" and no "$NaN")', () => {
    for (const v of [-1, -0.5, 0.5, 1.5, NaN, Infinity, null, undefined, '5', MAX + 1]) assert.equal(formatCents(v), null, String(v));
    assert.equal(formatCents(-0), '$0.00');
  });
});

describe('the module is self-contained', () => {
  const source = readFileSync(new URL('../../src/pricing/monthlyPiDifference.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('imports nothing, so no legacy helper, quote contract, storage or service can be reached', () => assert.ok(!/^\s*import\s/m.test(code)));
  it('has no clock, randomness, network, storage, DOM or global-state access', () => {
    for (const forbidden of [/Date\b/, /Math\.random/, /\bfetch\b/, /localStorage|sessionStorage|indexedDB/, /document\.|window\./, /XMLHttpRequest|sendBeacon/]) assert.ok(!forbidden.test(code), String(forbidden));
  });
  it('never reads PITI, fees, cash to close or total payment', () => {
    for (const word of ['paymentPITI', 'PITI', 'cashToClose', 'estimatedClosingCosts', 'totalMonthlyPayment', 'taxes']) assert.ok(!code.includes(word), word);
  });
  it('does not use the unsafe patterns of the retained legacy helper', () => {
    for (const pattern of [/replace\(\s*\/\[/, /parseFloat|parseInt/, /\bNumber\(\s*raw|\bNumber\(\s*value/, /Math\.max\(/, /\|\|\s*0\b/, /\.toFixed\(/]) assert.ok(!pattern.test(code), String(pattern));
  });
});
