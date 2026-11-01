import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePrmgData, type PrmgMetadataRejection } from '../src/connectors/prmg/normalizePrmgData.js';
import { parsePrmgWorkbook } from '../src/connectors/prmg/parsePrmgWorkbook.js';
import * as XLSX from 'xlsx';
function workbook(sheets: Array<[string, unknown[][]]>): Buffer { const book = XLSX.utils.book_new(); for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }

const row = (object: Record<string, unknown>) => ({ sheetName: 'SYNTH', rowNumber: 2, values: [], object: { product: 'FNMA Conventional', rate: 6.5, price: 0, ...object } });
function normalize(object: Record<string, unknown>) {
  const rejected: PrmgMetadataRejection[] = [];
  return { rows: normalizePrmgData([row(object)], rejected), rejected };
}
describe('PRMG required metadata: no silent lock/term defaults', () => {
  for (const value of [undefined, null, '', '  ', 'unknown', 0, -30, 29.6, '30days', '3e1', true]) {
    it(`rejects missing/invalid lock ${JSON.stringify(value)}`, () => {
      const result = normalize({ lock_days: value, term_months: 360 });
      assert.equal(result.rows.length, 0);
      assert.deepEqual(result.rejected, [{ sheetName: 'SYNTH', rowNumber: 2, reason: 'LOCK_METADATA_MISSING_OR_INVALID' }]);
    });
  }
  for (const value of [undefined, null, '', 'unknown', 30, 360, '3e1 years', '30.5 years', '0 years', '-30 years']) {
    it(`rejects missing/ambiguous generic term ${JSON.stringify(value)}`, () => {
      const result = normalize({ lock_days: 30, term: value });
      assert.equal(result.rows.length, 0);
      assert.equal(result.rejected[0]?.reason, 'TERM_METADATA_MISSING_OR_INVALID');
    });
  }
  for (const [metadata, expected] of [
    [{ term_months: 360 }, 360], [{ term_months: 24 }, 24], [{ term_years: 15 }, 180],
    [{ term: '30 years' }, 360], [{ term: '180 months' }, 180],
    [{ product: 'FNMA Conventional 30 Yr Fixed' }, 360], [{ product: 'FHA 15 Year Fixed' }, 180],
    [{ product: 'FNMA 30-Year Fixed' }, 360], [{ product: 'FNMA (30 Yr Fixed)' }, 360],
  ] as const) {
    it(`preserves explicit units ${JSON.stringify(metadata)}`, () => {
      const result = normalize({ lock_days: '30', ...metadata });
      assert.deepEqual(result.rejected, []);
      assert.equal(result.rows[0]?.termMonths, expected);
      assert.equal(result.rows[0]?.lockDays, 30);
      assert.equal(result.rows[0]?.price, 0);
    });
  }
  it('rejects conflicting aliases, conflicting product term, and malformed explicit term even when the name has a term', () => {
    for (const input of [
      { lock: 15, lock_days: 30, term_months: 360 },
      { lock: 30, term_months: 180, product: 'FNMA 30 Yr Fixed' },
      { lock: 30, term: 'unknown', product: 'FNMA 30 Yr Fixed' },
      { lock: 30, product: 'FNMA 15 Yr and 30 Yr Fixed' },
      { lock: 30, product: 'FNMA 30 Fixed' },
      { lock: 30, product: 'FNMA 30.5 years Fixed' },
      { lock: 30, product: 'FNMA -30 years Fixed' },
    ]) assert.equal(normalize(input).rows.length, 0, JSON.stringify(input));
  });
  it('rejects every malformed product term even when a valid product term or explicit months is present', () => {
    for (const fragment of ['30.5 years', '-15 years', '+15 years', '.5 years', '3e1 years', 'unknown years', 'years']) {
      for (const metadata of [
        { product: `FNMA ${fragment} 30 Yr Fixed` },
        { product: `FNMA ${fragment} Fixed`, term_months: 360 },
      ]) {
        const result = normalize({ lock_days: 30, ...metadata });
        assert.equal(result.rows.length, 0, JSON.stringify(metadata));
        assert.equal(result.rejected[0]?.reason, 'TERM_METADATA_MISSING_OR_INVALID', JSON.stringify(metadata));
      }
    }
  });
  it('does not round fractional matrix lock headers into eligible 30-day locks', () => {
    for (const lock of [29.6, '0x1e', '3e1', '30 days']) {
      const parsed = parsePrmgWorkbook(workbook([['SYNTH', [['FNMA Conventional 30 Yr Fixed'], ['Rate', lock], [6.5, 0]]]]));
      assert.equal(normalizePrmgData(parsed.rows).length, 0, String(lock));
    }
  });
});


describe('legacy matrix missing-price control', () => {
  it('excludes missing prices while preserving explicit zero and negative credit with known term/lock', () => {
    const parsed = parsePrmgWorkbook(workbook([['SYNTH', [['FNMA Conventional 30 Yr Fixed'], ['Rate', 30], [6.5, null], [6.25, 0], [6.125, -0.25]]]]));
    const rows = normalizePrmgData(parsed.rows);
    assert.deepEqual(rows.map(({ rate, price, termMonths, lockDays }) => ({ rate, price, termMonths, lockDays })), [{ rate: 6.25, price: 0, termMonths: 360, lockDays: 30 }, { rate: 6.125, price: -0.25, termMonths: 360, lockDays: 30 }]);
  });
});
