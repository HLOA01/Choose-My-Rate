/** Actual legacy refresh/repositories/migrations + actual HTTP pricing router.
 * Opt-in only for an explicitly supplied loopback TEST Postgres. Creates/drops only its own random database.
 * Synthetic workbook download is stubbed; no lender call, scheduler, app startup or real borrower.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import pg from 'pg';
import * as XLSX from 'xlsx';
import type { Server } from 'node:http';
const connection = process.env.LEGACY_PRICING_TEST_DATABASE_URL;
describe('actual legacy refresh and HTTP (throwaway PostgreSQL)', { skip: !connection }, () => {
  let admin: pg.Pool; let pool: pg.Pool; let server: Server; let origin: string; let created = false;
  const database = `cmr_legacy_metadata_${randomBytes(8).toString('hex')}`;
  let refreshPrmgRates: typeof import('../src/jobs/refreshPrmgRates.js').refreshPrmgRates;
  const originalFetch = globalThis.fetch;
  before(async () => {
    const url = new URL(connection!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !/^postgres(ql)?:$/.test(url.protocol)) throw new Error('Only explicit loopback TEST Postgres is allowed');
    assert.match(database, /^cmr_legacy_metadata_[a-f0-9]{16}$/);
    admin = new pg.Pool({ connectionString: connection });
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.href; process.env.ADMIN_API_KEY = 'synthetic-test-only';
    process.env.ENABLE_SCHEDULER = 'false'; process.env.RUN_REFRESH_ON_START = 'false'; process.env.RUN_MIGRATIONS_ON_START = 'false';
    process.env.DATABASE_SSL = 'false'; process.env.PRMG_RATE_SHEET_URL = 'http://127.0.0.1:1/synthetic.xls';
    ({ pool } = await import('../src/db/repositories/db.js'));
    const { runMigrations } = await import('../src/db/migrate.js'); await runMigrations(pool);
    ({ refreshPrmgRates } = await import('../src/jobs/refreshPrmgRates.js'));
    const { pricingRouter } = await import('../src/api/routes/pricing.js');
    const app = express(); app.use(express.json()); app.use('/pricing', pricingRouter);
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  after(async () => {
    globalThis.fetch = originalFetch;
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (admin) await admin.end();
  });
  beforeEach(async () => {
    // This pool is created above only after the random database has been created successfully.
    await pool.query('TRUNCATE pricing_rows, refresh_logs, pricing_versions CASCADE');
    await pool.query("UPDATE platform_controls SET pricing_status = 'live'");
  });
  const buffer = (rows: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'SYNTH'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer; };
  const valid = () => buffer([['Product', 'Rate', 'Price', 'Lock', 'Term Months'], ...Array.from({ length: 6 }, (_, i) => ['FNMA Conventional 30 Yr Fixed', 6.5 + i * 0.125, i === 1 ? -0.25 : 0, 30, 360])]);
  const quote = async () => { const response = await originalFetch(`${origin}/pricing/quote`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purchasePrice: 500000, loanAmount: 400000, creditScore: 740, occupancy: 'primary', loanPurpose: 'purchase', loanTypePreference: 'conventional', propertyType: 'single_family', zipCode: '92660' }) }); assert.equal(response.status, 200); return response.json(); };
  async function refresh(bytes: Buffer) {
    globalThis.fetch = (async input => {
      assert.equal(String(input), 'http://127.0.0.1:1/synthetic.xls');
      return new Response(bytes, { status: 200 });
    }) as typeof fetch;
    try { return await refreshPrmgRates(); } finally { globalThis.fetch = originalFetch; }
  }
  it('publishes verified-format synthetic rows with v3 JSONB, preserves zero/credit, and serves actual HTTP quotes', async () => {
    assert.equal((await refresh(valid())).status, 'published');
    const versions = await pool.query('SELECT validation_summary FROM pricing_versions WHERE status = $1', ['live']);
    assert.equal(versions.rows[0].validation_summary.transformVersion, 'prmg-normalizer-v3');
    const rows = await pool.query('SELECT term_months, lock_days, price FROM pricing_rows');
    assert.equal(rows.rows.length, 6); assert.ok(rows.rows.every(row => row.term_months === 360 && row.lock_days === 30));
    assert.ok(rows.rows.some(row => Number(row.price) === 0)); assert.ok(rows.rows.some(row => Number(row.price) === -0.25));
    const result = await quote(); assert.equal(result.status, 'live'); assert.ok(result.options.length > 0);
  });
  it('fails the whole mixed publication with row-specific reasons and never exposes ambiguous quotes', async () => {
    const result = await refresh(buffer([['Product', 'Rate', 'Price', 'Lock', 'Term Months'],
      ['FNMA Conventional 30 Yr Fixed', 6.5, 0, null, 360], ['FNMA Conventional', 6.5, 0, 30, null],
      ['FNMA Conventional 30.5 years 30 Yr Fixed', 6.5, 0, 30, null], ['FNMA Conventional 30 Yr Fixed', 6.5, 0, 30, 360]]));
    assert.equal(result.status, 'failed');
    const failed = (await pool.query('SELECT status, validation_summary FROM pricing_versions')).rows[0];
    assert.equal(failed.status, 'failed'); assert.equal(failed.validation_summary.transformVersion, undefined);
    assert.ok(failed.validation_summary.errors.some((x: string) => x.includes('row 2: LOCK_METADATA_MISSING_OR_INVALID')));
    assert.ok(failed.validation_summary.errors.some((x: string) => x.includes('row 3: TERM_METADATA_MISSING_OR_INVALID')));
    assert.ok(failed.validation_summary.errors.some((x: string) => x.includes('row 4: TERM_METADATA_MISSING_OR_INVALID')));
    const response = await quote(); assert.equal(response.status, 'no_live_pricing'); assert.deepEqual(response.options, []);
  });
  it('retains a prior v3 publication after failure without treating failed staging rows as available', async () => {
    await refresh(valid()); const before = (await pool.query("SELECT id FROM pricing_versions WHERE status = 'live'")).rows[0].id;
    assert.equal((await refresh(buffer([['Product', 'Rate', 'Price'], ['FNMA Conventional', 6.5, 0]]))).status, 'failed');
    assert.equal((await pool.query("SELECT id FROM pricing_versions WHERE status = 'live'")).rows[0].id, before);
    assert.equal((await quote()).pricingVersionId, before);
  });
  it('retained v2/unmarked rows cannot serve, and identical bytes reprocess once under the new transform', async () => {
    const bytes = valid(); await refresh(bytes);
    const old = (await pool.query("SELECT id FROM pricing_versions WHERE status = 'live'")).rows[0].id;
    const raw = createHash('sha256').update(bytes).digest('hex'); const hash = createHash('sha256').update(raw).update('prmg-normalizer-v2').digest('hex');
    await pool.query("UPDATE pricing_versions SET source_hash = $1, validation_summary = validation_summary - 'transformVersion' WHERE id = $2", [hash, old]);
    assert.equal((await quote()).status, 'no_live_pricing'); assert.equal((await pool.query('SELECT id FROM pricing_rows')).rows.length, 6);
    assert.equal((await refresh(bytes)).status, 'published'); const current = await quote(); assert.equal(current.status, 'live'); assert.notEqual(current.pricingVersionId, old);
    assert.equal((await refresh(bytes)).status, 'skipped');
  });
  it('refuses provenance removed in the database during actual row loading before sending the HTTP result', async () => {
    await refresh(valid()); const query = pool.query.bind(pool);
    pool.query = (async (...args: unknown[]) => {
      const result = await (query as (...args: unknown[]) => Promise<pg.QueryResult>)(...args);
      if (typeof args[0] === 'string' && args[0].includes('FROM pricing_rows')) await query("UPDATE pricing_versions SET validation_summary = validation_summary - 'transformVersion' WHERE status = 'live'");
      return result;
    }) as typeof pool.query;
    try { const result = await quote(); assert.equal(result.status, 'no_live_pricing'); assert.deepEqual(result.options, []); } finally { pool.query = query; }
  });
});
