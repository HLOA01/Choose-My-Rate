import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers';
import {
  GUEST_INPUT_EXCLUDED_FIELDS,
  GUEST_INPUT_FIELDS,
  GUEST_INPUT_MAX_AGE_MS as MAX_AGE,
  GUEST_INPUT_MAX_RAW_LENGTH as MAX_RAW,
  createGuestInputSession,
  hasMeaningfulInputs,
  parseGuestInputRecord,
  projectInputs,
} from '../../src/scenario/guestInputSnapshot.js';
import { GUEST_SCENARIO_MAX_AGE_MS } from '../../src/scenario/scenarioStorage.js';

// The store must never touch web storage: any access in this process fails the test that caused it.
for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`${name} must not be used by guest continuation`); } });
}

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

// A realistic funnel scenario. The distinctive values must never be stored.
const FORM = Object.freeze({
  borrowerPath: 'purchase', homePrice: '450000', downPayment: '22500', downPaymentAmount: '22500', downPaymentPercent: '5',
  downPaymentInputMode: 'dollars', propertyValue: '', currentMortgageBalance: '', refinanceGoal: 'lower_payment',
  currentInterestRate: '7.125', requestedCashOut: '', propertyType: 'single_family', firstTimeHomebuyer: 'no',
  occupancy: 'primary', creditScore: '781', creditRange: '780+', zipCode: '92660', annualIncome: '123456',
});
const EMPTY_FORM = Object.freeze({ ...FORM, homePrice: '', downPayment: '', downPaymentAmount: '', downPaymentPercent: '', propertyType: '', occupancy: '', zipCode: '' });
const STORED = projectInputs(FORM).inputs;

// ---- fakes -------------------------------------------------------------------------------------------------------
const makeDb = (initialRaw = null) => ({
  raw: initialRaw, exists: initialRaw !== null, gate: Promise.resolve(),
  log: { reads: 0, creates: 0, removes: 0, commits: [], labels: [] },
});
function commit(db, decision, label) {
  if (decision.write !== undefined) {
    db.raw = decision.write; db.log.commits.push({ label, write: decision.write });
  } else if (decision.remove) {
    db.raw = null; db.log.removes += 1; db.log.commits.push({ label, remove: true });
  }
}
/**
 * A transactional backend with the same contract as the IndexedDB one.
 *  isolated=true  : every read/transaction goes through one shared gate, so each is atomic with respect to the others
 *                   (what an IndexedDB readwrite transaction guarantees).
 *  isolated=false : NEGATIVE CONTROL. Reads a snapshot, yields, then commits with no isolation, which is exactly the
 *                   "A and B read the baseline, both write, both believe they succeeded" schedule.
 * hooks: before(label) awaited before the transaction is requested; gap(label) awaited between snapshot and commit
 *        (racy only); failCommit(decision, label) aborts the transaction; failRead; throwInDecide.
 */
function fakeBackend(db, { isolated = true, hooks = {}, available = true } = {}) {
  const gate = (fn) => { const run = db.gate.then(fn); db.gate = run.then(() => {}, () => {}); return run; };
  return {
    available: () => available,
    async read() {
      await hooks.before?.('read');
      const body = () => { db.log.reads += 1; return hooks.failRead ? { ok: false, reason: 'storage_unavailable' } : { ok: true, raw: db.raw }; };
      const result = await (isolated ? gate(body) : body());
      await hooks.afterRead?.('read', result); // the value was read; the caller has not seen it yet
      return result;
    },
    async transact(decide, { mayCreate = false, label = 'tx' } = {}) {
      await hooks.before?.(label);
      db.log.labels.push(label);
      if (!db.exists && mayCreate) { db.exists = true; db.log.creates += 1; } // like IndexedDB: the upgrade creates the (empty) database at open
      const body = (snapshot) => {
        const raw = snapshot === undefined ? db.raw : snapshot;
        if (!db.exists && !mayCreate) {
          const decision = decide(null);
          return decision.write !== undefined || decision.remove ? { ok: false, reason: 'needs_create' } : { ok: true, outcome: decision.outcome };
        }
        let decision;
        try { decision = decide(raw); } catch { return { ok: false, reason: 'decide_failed' }; }
        if (hooks.failCommit?.(decision, label)) return { ok: false, reason: 'storage_unavailable' };
        commit(db, decision, label);
        return { ok: true, outcome: decision.outcome };
      };
      let result;
      if (isolated) {
        result = await gate(() => body());
      } else {
        const snapshot = db.raw;
        await (hooks.gap ? hooks.gap(label) : Promise.resolve());
        result = body(snapshot);
      }
      await hooks.afterCommit?.(label, result); // committed in storage; the session has not applied it yet
      return result;
    },
  };
}
function fakeTimers() {
  const jobs = new Map(); let next = 1;
  return {
    schedule: (fn) => { const id = next++; jobs.set(id, fn); return id; },
    cancel: (id) => { jobs.delete(id); },
    get pending() { return jobs.size; },
  };
}
function tab(db, { tag = 'a', backendOptions, backend, clock = { t: NOW } } = {}) {
  const timers = fakeTimers(); let ids = 0; const changes = [];
  const be = backend ?? fakeBackend(db, backendOptions);
  const s = createGuestInputSession({
    backend: be, now: () => clock.t, schedule: timers.schedule, cancel: timers.cancel,
    randomId: () => `id-${tag}-${String(++ids).padStart(4, '0')}`, onChange: () => changes.push(1),
  });
  return { s, be, db, timers, clock, tag, changes };
}
const settle = async () => { for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
async function save(t, source) { t.s.scheduleSave(source); return t.s.flush(); }
const stored = (db) => (db.raw === null ? null : JSON.parse(db.raw));
const rec = (over = {}, inputs = STORED) => ({ schemaVersion: 2, state: 'on', epoch: 1, revision: 1, writeId: 'seed-write-0001', savedAt: NOW - 1000, inputs: inputs === null ? null : { ...inputs }, ...over });
const text = (value) => JSON.stringify(value);
const open = async (db, opts) => { const t = tab(db, opts); await t.s.load(); return t; };
const onTab = async (db, opts) => { const t = await open(db, opts); await t.s.enable(FORM); return t; };
const onTabConsentOnly = async (db, opts) => { const t = await open(db, opts); await t.s.enable(EMPTY_FORM); return t; };
const latch = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };

describe('default off: nothing is stored before an explicit opt-in', () => {
  it('a fresh visitor causes one read, no transaction, and creates NO database', async () => {
    const db = makeDb(); const t = await open(db);
    const view = t.s.getView();
    assert.equal(view.remember, 'off'); assert.equal(view.available, true); assert.equal(view.writable, false); assert.equal(view.offer, null);
    assert.equal(db.log.reads, 1); assert.deepEqual(db.log.labels, []); assert.deepEqual(db.log.commits, []);
    assert.equal(db.log.creates, 0); assert.equal(db.exists, false);
  });
  it('typing, scheduling, flushing and pagehide-style flushes before opt-in touch nothing', async () => {
    const db = makeDb(); const t = await open(db);
    for (let i = 0; i < 5; i += 1) t.s.scheduleSave({ ...FORM, homePrice: String(i + 1) });
    assert.equal(t.timers.pending, 0, 'no timer is even created');
    assert.deepEqual(await t.s.flush(), { ok: true, reason: 'nothing_pending' });
    assert.equal(db.log.reads, 1); assert.deepEqual(db.log.labels, []); assert.equal(db.exists, false);
  });
  it('a session that was never loaded cannot write either', async () => {
    const db = makeDb(); const t = tab(db);
    t.s.scheduleSave(FORM); assert.equal(t.timers.pending, 0);
    assert.deepEqual(await t.s.flush(), { ok: true, reason: 'nothing_pending' });
    assert.equal(db.log.reads, 0); assert.deepEqual(db.log.labels, []); assert.equal(t.s.getView().writable, false);
  });
  it('when IndexedDB is unavailable persistence is disabled: no read, no write, no fallback of any kind', async () => {
    const db = makeDb(text(rec())); const before = db.raw; const t = tab(db, { backendOptions: { available: false } });
    await t.s.load(); const view = t.s.getView();
    assert.equal(view.available, false); assert.equal(view.offer, null); assert.equal(view.remember, 'off');
    assert.equal(db.log.reads, 0);
    assert.deepEqual(await t.s.enable(FORM), { ok: false, reason: 'unavailable' });
    assert.equal((await t.s.forget()).reason, 'delete_failed');
    t.s.scheduleSave(FORM); assert.deepEqual(await t.s.flush(), { ok: true, reason: 'nothing_pending' });
    assert.deepEqual(db.log.labels, []); assert.equal(db.raw, before);
  });
  it('a backend that throws is treated as unavailable storage, never as permission to write somewhere else', async () => {
    const db = makeDb(); const t = tab(db, { backend: { available: () => true, read: async () => { throw new Error('boom'); }, transact: async () => { throw new Error('boom'); } } });
    await t.s.load(); assert.equal(t.s.getView().remember, 'off');
    assert.deepEqual(await t.s.enable(FORM), { ok: false, reason: 'storage_unavailable' });
    assert.equal(t.s.getView().remember, 'off'); assert.equal(t.s.getView().problem.code, 'storage_unavailable');
  });
  it('the first write happens only on enable, as a single consent record, and only enable may create the database', async () => {
    const db = makeDb(); const t = await open(db);
    assert.deepEqual(await t.s.enable(FORM), { ok: true, reason: 'enabled' });
    assert.equal(db.log.commits.length, 1); assert.equal(db.log.creates, 1);
    const r = stored(db); assert.equal(r.state, 'on'); assert.equal(r.epoch, 1); assert.equal(r.revision, 1);
    assert.equal(t.s.getView().remember, 'on'); assert.equal(t.s.getView().writable, true);
  });
  it("stop and reset on an empty store do not create a database", async () => {
    const db = makeDb(); const t = await open(db);
    assert.equal((await t.s.forget()).reason, 'nothing_stored');
    assert.equal((await t.s.resetInputs()).reason, 'nothing_stored');
    assert.equal(db.exists, false); assert.equal(db.log.creates, 0); assert.deepEqual(db.log.commits, []);
  });});

describe('minimized fields: income and credit are never stored', () => {
  it('persists exactly the 12 pricing-payload property/loan fields', () => {
    assert.deepEqual([...GUEST_INPUT_FIELDS].sort(), ['borrowerPath', 'currentMortgageBalance', 'downPaymentAmount', 'downPaymentInputMode', 'downPaymentPercent', 'homePrice', 'occupancy', 'propertyType', 'propertyValue', 'refinanceGoal', 'requestedCashOut', 'zipCode']);
    for (const excluded of GUEST_INPUT_EXCLUDED_FIELDS) assert.ok(!GUEST_INPUT_FIELDS.includes(excluded), excluded);
    assert.deepEqual([...GUEST_INPUT_EXCLUDED_FIELDS].sort(), ['annualIncome', 'creditRange', 'creditScore', 'currentInterestRate', 'downPayment', 'firstTimeHomebuyer']);
  });
  it('no field name is identity/contact/quote shaped', () => {
    const forbidden = /email|phone|name|address|latitude|longitude|gps|lead|borrowerId|scenarioId|session|correlation|utm_|gclid|fbclid|attribution|quote|option|selected|handoff|disclosure|pricing|expires|points|lender|credit|income/i;
    for (const field of GUEST_INPUT_FIELDS) assert.ok(!forbidden.test(field), field);
  });
  it('the stored text contains none of the excluded values or names, even when the form holds them', async () => {
    const db = makeDb(); const t = await onTab(db); await save(t, { ...FORM, homePrice: '451000' });
    for (const needle of ['781', '123456', '7.125', '780+', 'creditScore', 'creditRange', 'annualIncome', 'firstTimeHomebuyer', 'currentInterestRate', 'downPayment"']) assert.ok(!db.raw.includes(needle), `stored ${needle}`);
    assert.deepEqual(Object.keys(stored(db).inputs).sort(), [...GUEST_INPUT_FIELDS].sort());
  });
  it('identity, contact, attribution, quote and handoff state on the scenario is never copied', async () => {
    const db = makeDb(); const t = await onTab(db);
    await save(t, { ...FORM, email: 'a@b.co', phone: '5555550100', leadId: 'CMR-L-X', sessionKey: 'cmr-abc', gclid: 'g1', quote: { options: [1] }, selectedOptionId: 'o1', pricingVersionId: 'pv', disclosureVersionAccepted: 'd', homePrice: '452000' });
    for (const needle of ['a@b.co', '5555550100', 'CMR-', 'cmr-abc', 'g1', 'options', 'selectedOptionId', 'pricingVersionId', 'disclosure']) assert.ok(!db.raw.includes(needle), needle);
  });
  it('records that carry excluded or unknown keys are unrecognized, not partially accepted', () => {
    for (const extra of ['creditScore', 'annualIncome', 'email']) assert.equal(parseGuestInputRecord(text(rec({}, { ...STORED, [extra]: '1' })), NOW).kind, 'unrecognized', extra);
  });
});

describe('invalid or partial entries pause saving visibly instead of being replaced', () => {
  it('projectInputs reports unstorable fields and does not hide them', () => {
    const { inputs, invalidFields } = projectInputs({ ...FORM, homePrice: '1.2.3', zipCode: '9266x', occupancy: 'castle', downPaymentAmount: '1234567890123' });
    assert.deepEqual(invalidFields.sort(), ['downPaymentAmount', 'homePrice', 'occupancy', 'zipCode']); assert.equal(inputs.homePrice, '');
    assert.deepEqual(projectInputs({ ...FORM, zipCode: '926' }).invalidFields, [], 'a partial but canonical ZIP is kept exactly as typed');
  });
  it('saving is paused with a named-field problem, nothing is written, and it resumes once fixed', async () => {
    const db = makeDb(); const t = await onTab(db); const before = db.raw; const commits = db.log.commits.length;
    assert.deepEqual(await save(t, { ...FORM, homePrice: '1.2.3' }), { ok: false, reason: 'paused_invalid' });
    assert.deepEqual(t.s.getView().problem, { code: 'paused_invalid', reason: null, fields: ['homePrice'] });
    assert.equal(db.raw, before); assert.equal(db.log.commits.length, commits);
    assert.equal((await save(t, { ...FORM, homePrice: '460000' })).reason, 'saved');
    assert.equal(t.s.getView().problem, null); assert.equal(stored(db).inputs.homePrice, '460000');
  });
  it('enabling while a field is unstorable records consent with no inputs and says so', async () => {
    const db = makeDb(); const t = await open(db); await t.s.enable({ ...FORM, homePrice: '1.2.3' });
    assert.equal(stored(db).inputs, null); assert.equal(t.s.getView().problem.code, 'paused_invalid');
  });
});

describe('strict classification (nothing here deletes anything)', () => {
  const parse = (value, now = NOW) => parseGuestInputRecord(typeof value === 'string' ? value : text(value), now);
  it('accepts a complete on-record, a consent-only record and an off tombstone', () => {
    assert.equal(parse(rec()).kind, 'record'); assert.equal(parse(rec({}, null)).kind, 'record'); assert.equal(parse({ ...rec({}, null), state: 'off' }).kind, 'record');
  });
  const bad = {
    'tombstone with inputs': { ...rec(), state: 'off' }, 'unknown record key': { ...rec(), extra: 1 },
    'missing record key': (() => { const r = rec(); delete r.writeId; return r; })(), 'unknown input key': rec({}, { ...STORED, creditScore: '781' }),
    'missing input key': (() => { const i = { ...STORED }; delete i.zipCode; return rec({}, i); })(), 'non-string input': rec({}, { ...STORED, homePrice: 450000 }),
    'bad enum': rec({}, { ...STORED, occupancy: 'castle' }), 'bad numeric': rec({}, { ...STORED, homePrice: '45e4' }),
    'epoch 0': rec({ epoch: 0 }), 'revision float': rec({ revision: 1.5 }), 'bad writeId': rec({ writeId: 'x y' }),
    'savedAt string': rec({ savedAt: '1800000000000' }), 'bad state': rec({ state: 'maybe' }),
    'schemaVersion 1 (withdrawn proposal shape)': rec({ schemaVersion: 1 }), 'schemaVersion string': rec({ schemaVersion: '2' }),
    'defaults only': rec({}, projectInputs({}).inputs),
  };
  for (const [name, value] of Object.entries(bad)) it(`unrecognized: ${name}`, () => assert.equal(parse(value).kind, 'unrecognized', name));
  it('future-dated is rejected with NO tolerance (no policy was supplied)', () => {
    assert.equal(parse(rec({ savedAt: NOW })).kind, 'record'); assert.equal(parse(rec({ savedAt: NOW + 1 })).reason, 'future_dated');
  });
  it('retention boundary: exactly seven days is kept, one ms older is expired', () => {
    assert.equal(MAX_AGE, GUEST_SCENARIO_MAX_AGE_MS); assert.equal(MAX_AGE, 7 * DAY);
    assert.equal(parse(rec({ savedAt: NOW - MAX_AGE })).kind, 'record'); assert.equal(parse(rec({ savedAt: NOW - MAX_AGE - 1 })).kind, 'expired');
  });
  it('oversized text is unrecognized WITHOUT parsing; a newer-schema hint is reported, never acted on', () => {
    assert.equal(parse('x'.repeat(MAX_RAW + 1)).reason, 'oversized');
    assert.equal(parse(`{"schemaVersion":3,"data":"${'y'.repeat(MAX_RAW)}"}`).reason, 'newer_schema');
    assert.equal(parse('{"schemaVersion":3,"a":1}').reason, 'newer_schema');
  });
  it('corrupt and non-object values are unrecognized', () => {
    for (const t of ['', '{', 'null', '[]', '"x"', '123', '{"schemaVersion":2}']) assert.equal(parse(t).kind, 'unrecognized', t);
    assert.equal(parseGuestInputRecord({ not: 'a string' }, NOW).reason, 'not_string');
    assert.equal(parse('{"schemaVersion":2,"state":"on","epoch":1,"revision":1,"writeId":"seed-write-0001","savedAt":1799999999000,"inputs":{"__proto__":{"x":1}}}').kind, 'unrecognized');
  });
  it('the byte cap is an engineering bound with room to spare, not a business limit', () => {
    const worst = { borrowerPath: 'refinance', homePrice: `${'9'.repeat(12)}.99`, downPaymentAmount: `${'9'.repeat(12)}.99`, downPaymentPercent: '999.9999', downPaymentInputMode: 'percent', propertyValue: `${'9'.repeat(12)}.99`, currentMortgageBalance: `${'9'.repeat(12)}.99`, refinanceGoal: 'debt_consolidation', requestedCashOut: `${'9'.repeat(12)}.99`, propertyType: 'single_family', occupancy: 'second_home', zipCode: '99999' };
    const body = text({ schemaVersion: 2, state: 'on', epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER, writeId: 'x'.repeat(64), savedAt: NOW, inputs: worst });
    assert.equal(parse(body).kind, 'record'); assert.ok(MAX_RAW >= 3 * body.length, `cap ${MAX_RAW} vs worst case ${body.length}`);
  });
  it('meaningfulness ignores defaults and a derived percent in dollars mode', () => {
    assert.equal(hasMeaningfulInputs(projectInputs({}).inputs), false);
    assert.equal(hasMeaningfulInputs(projectInputs({ downPaymentPercent: '5' }).inputs), false);
    assert.equal(hasMeaningfulInputs(projectInputs({ downPaymentPercent: '5', downPaymentInputMode: 'percent' }).inputs), true);
  });
});

describe('coordination: deterministic two-session schedules against isolated and racy backends', () => {
  // The review's schedule: A and B hold the SAME baseline and both try to save. A transaction-isolated store must make
  // exactly one succeed; a non-isolated read-then-write makes BOTH report success and silently loses one update.
  async function bothSave(isolated) {
    const db = makeDb();
    await onTabConsentOnly(db, { tag: 'seed' });
    const a = await open(db, { tag: 'a', backendOptions: { isolated } }); const b = await open(db, { tag: 'b', backendOptions: { isolated } });
    await a.s.enable(EMPTY_FORM); await b.s.enable(EMPTY_FORM);
    assert.equal(a.s.getView().remember, 'on'); assert.equal(b.s.getView().remember, 'on');
    const [ra, rb] = await Promise.all([save(a, { ...FORM, homePrice: '111111' }), save(b, { ...FORM, homePrice: '222222' })]);
    return { db, ra, rb, a, b };
  }
  it('WITH isolation: exactly one writer succeeds, the other is told "conflict" and wrote nothing', async () => {
    const { db, ra, rb, b } = await bothSave(true);
    assert.equal(ra.ok, true); assert.equal(ra.reason, 'saved'); assert.deepEqual(rb, { ok: false, reason: 'conflict' });
    assert.equal(stored(db).inputs.homePrice, '111111'); assert.equal(b.s.getView().problem.code, 'conflict');
    assert.equal(db.log.commits.filter((c) => c.label === 'save').length, 1, 'only one save was ever committed');
  });
  it('NEGATIVE CONTROL (no isolation): the same schedule makes BOTH report success and silently loses an update', async () => {
    const { db, ra, rb } = await bothSave(false);
    assert.equal(ra.ok, true); assert.equal(rb.ok, true, 'both believe they saved');
    assert.equal(db.log.commits.filter((c) => c.label === 'save').length, 2); assert.equal(stored(db).inputs.homePrice, '222222', 'the first writer\'s data is gone');
  });

  // valid write vs repair-delete: an EXPIRED record, one tab enabling, another tab cleaning up what it saw.
  const expired = () => text(rec({ savedAt: NOW - MAX_AGE - 1000, epoch: 4 }));
  it("WITH isolation, expired inputs become a durable off marker and fresh opt-in advances its epoch", async () => {
    const db = makeDb(expired()); await open(db); await settle();
    assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null); assert.equal(stored(db).epoch, 5);
    const a = tab(db, { tag: 'a' }); assert.equal((await a.s.enable(FORM)).ok, true);
    assert.equal(stored(db).epoch, 6); assert.equal(stored(db).inputs.homePrice, '450000');
  });  it('WITH isolation, write first: B\'s cleanup runs AFTER A\'s fresh write, sees changed data, and deletes NOTHING', async () => {
    const hold = latch(); const db = makeDb(expired());
    const b = tab(db, { tag: 'b', backendOptions: { hooks: { before: (label) => (label === 'cleanup' ? hold.promise : undefined) } } });
    await b.s.load(); // B saw the expired record; its cleanup transaction is held back
    const a = tab(db, { tag: 'a' }); assert.equal((await a.s.enable(FORM)).ok, true);
    hold.release(); await settle();
    assert.equal(db.log.removes, 0, 'nothing was deleted'); assert.equal(stored(db).state, 'on'); assert.equal(stored(db).epoch, 5);
  });
  it('NEGATIVE CONTROL (no isolation): a repair-delete destroys the fresh record a valid writer just committed', async () => {
    const hold = latch(); const db = makeDb(expired());
    const b = tab(db, { tag: 'b', backendOptions: { isolated: false, hooks: { gap: (label) => (label === 'cleanup' ? hold.promise : undefined) } } });
    await b.s.load(); await settle(); // B's cleanup has taken its snapshot (the expired record) and is waiting to commit
    const a = tab(db, { tag: 'a', backendOptions: { isolated: false } }); assert.equal((await a.s.enable(FORM)).ok, true);
    assert.equal(stored(db).state, 'on');
    hold.release(); await settle();
    assert.equal(stored(db).state, 'off', 'racy cleanup overwrote the fresh input record'); assert.equal(stored(db).inputs, null);
  });
  it('LIMITS (stated, not hidden): a writer that does not use the transaction path is detected, not prevented', async () => {
    const db = makeDb(); const t = await onTab(db);
    db.raw = text(rec({ writeId: 'outsider-0001', revision: 9 })); // a non-cooperating writer
    assert.deepEqual(await save(t, { ...FORM, homePrice: '1' }), { ok: false, reason: 'conflict' });
  });
  it('every mutation is a single labelled transaction; reads never write', async () => {
    const db = makeDb(); const t = await onTab(db); await save(t, { ...FORM, homePrice: '460000' }); await t.s.resetInputs(); await t.s.forget();
    assert.deepEqual(db.log.labels, ['enable', 'save', 'forget', 'forget']);
  });
});

describe('durable reset history: unseen cycles cannot be revived (no change notification is ever delivered below)', () => {
  it('forget leaves a tombstone with an epoch and no inputs, and says "deleted" only after the transaction commits', async () => {
    const db = makeDb(); const t = await onTab(db); await save(t, { ...FORM, homePrice: '460000' });
    assert.deepEqual(await t.s.forget(), { ok: true, reason: 'deleted' });
    const r = stored(db); assert.equal(r.state, 'off'); assert.equal(r.inputs, null); assert.equal(r.epoch, 2); assert.ok(r.revision >= 3);
    for (const needle of ['460000', '450000', '92660']) assert.ok(!db.raw.includes(needle), needle);
    assert.equal(t.s.getView().remember, 'off'); assert.equal(t.s.getView().writable, false);
  });
  it('a tab that loaded when NOTHING was stored cannot write after another tab\'s save -> stop -> key removal cycle', async () => {
    const db = makeDb(); const fresh = await open(db, { tag: 'b' });
    const other = await onTab(db, { tag: 'a' }); await save(other, FORM); await other.s.forget();
    db.raw = null; // the cycle ends with the key absent again (e.g. the tombstone expired and was cleaned up)
    const commits = db.log.commits.length;
    fresh.s.scheduleSave(FORM); assert.deepEqual(await fresh.s.flush(), { ok: true, reason: 'nothing_pending' });
    assert.equal(db.log.commits.length, commits, 'absent == absent no longer grants permission'); assert.equal(db.raw, null);
    assert.equal((await fresh.s.enable(FORM)).reason, 'enabled', 'the borrower can still opt in deliberately here');
  });
  it('a tab that explicitly opted in cannot flush after an unseen stop -> re-opt-in cycle (the stored text changed)', async () => {
    const db = makeDb(); const first = await onTabConsentOnly(db, { tag: 'a' });
    const second = await open(db, { tag: 'b' }); await second.s.enable(EMPTY_FORM); assert.equal(second.s.getView().writable, true);
    await first.s.forget(); await first.s.enable({ ...FORM, homePrice: '300000' }); // epochs 1 -> 2 -> 3, NO observe() anywhere
    const commits = db.log.commits.length;
    assert.deepEqual(await save(second, { ...FORM, homePrice: '999999' }), { ok: false, reason: 'conflict' });
    assert.equal(db.log.commits.length, commits); assert.equal(stored(db).inputs.homePrice, '300000'); assert.equal(stored(db).epoch, 3);
  });
  it('epochs only move forward across enable, reset, stop and re-enable', async () => {
    const db = makeDb(); const t = await onTab(db); const epochs = [stored(db).epoch];
    await t.s.resetInputs(); epochs.push(stored(db).epoch); await t.s.forget(); epochs.push(stored(db).epoch); await t.s.enable(FORM); epochs.push(stored(db).epoch);
    assert.deepEqual(epochs, [1, 2, 3, 4]);
  });
});

describe('stop / reset versus pending saves, pagehide, reload and a second tab', () => {
  it('stop cancels the debounce timer; a pagehide flush afterwards writes nothing; saving stays off until re-opt-in', async () => {
    const db = makeDb(); const t = await onTab(db);
    t.s.scheduleSave({ ...FORM, homePrice: '777777' }); assert.equal(t.timers.pending, 1);
    await t.s.forget(); assert.equal(t.timers.pending, 0);
    assert.deepEqual(await t.s.flush(), { ok: true, reason: 'nothing_pending' });
    t.s.scheduleSave({ ...FORM, homePrice: '888888' }); assert.equal(t.timers.pending, 0, 'saving is disabled until renewed opt-in');
    assert.ok(!db.raw.includes('777777') && !db.raw.includes('888888'));
    await t.s.enable(FORM); assert.equal(t.s.getView().writable, true);
  });
  it('a save already QUEUED behind other work aborts when stop is requested after it', async () => {
    const db = makeDb(); const t = await onTab(db);
    t.s.scheduleSave({ ...FORM, homePrice: '555555' }); const queued = t.s.flush(); const stopped = t.s.forget();
    assert.deepEqual(await queued, { ok: false, reason: 'superseded' }); assert.equal((await stopped).reason, 'deleted');
    assert.equal(stored(db).state, 'off'); assert.ok(!db.raw.includes('555555'));
  });
  it('whether the save had just started or not, the final state after stop is a tombstone with no inputs', async () => {
    for (const ticks of [0, 1, 2, 3, 5]) {
      const db = makeDb(); const t = await onTab(db);
      t.s.scheduleSave({ ...FORM, homePrice: '555555' }); const saving = t.s.flush();
      for (let i = 0; i < ticks; i += 1) await Promise.resolve();
      await t.s.forget(); await saving;
      assert.equal(stored(db).state, 'off', `ticks=${ticks}`); assert.equal(stored(db).inputs, null); assert.ok(!db.raw.includes('555555'));
    }
  });
  it("Start over fences saves, clears stored inputs and withdraws permission until renewed opt-in", async () => {
    const db = makeDb(); const t = await onTab(db); t.s.scheduleSave({ ...FORM, homePrice: '470000' });
    assert.equal((await t.s.resetInputs()).reason, 'deleted'); assert.equal(t.timers.pending, 0);
    assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null);
    assert.equal(t.s.getView().remember, 'off'); assert.equal(t.s.getView().writable, false);
    assert.equal((await save(t, FORM)).reason, 'nothing_pending');
    await t.s.enable(FORM); assert.equal(t.s.getView().writable, true);
  });  it("Start over while not remembering remains off and never creates a database", async () => {
    const db = makeDb(); const t = await open(db);
    assert.equal((await t.s.resetInputs()).reason, 'nothing_stored');
    assert.equal(db.exists, false); assert.equal(t.s.getView().remember, 'off');
  });  it("second tab does not inherit consent and cannot write after unseen reset", async () => {
    const db = makeDb(); const a = await onTab(db); const b = await open(db);
    await b.s.accept(); const commits = db.log.commits.length;
    await a.s.forget(); assert.equal((await save(b, FORM)).reason, 'nothing_pending');
    assert.equal(db.log.commits.length, commits + 1); assert.equal(b.s.getView().remember, 'off');
  });  it("second tab with its own opt-in detects an observed external change and stops writing", async () => {
    const db = makeDb(); const a = await onTab(db); const b = await open(db);
    await b.s.accept(); await b.s.enable(FORM);
    await a.s.forget(); await b.s.observe();
    assert.equal(b.s.getView().problem.code, 'conflict'); assert.equal(b.s.getView().writable, false);
  });  it("explicit stop in a conflicting tab stays off and clears data without restoring consent", async () => {
    const db = makeDb(); const a = await onTab(db); const b = await open(db);
    await b.s.accept(); await b.s.enable(FORM); await save(a, { ...FORM, homePrice: '460000' }); await b.s.observe();
    assert.equal(b.s.getView().problem.code, 'conflict'); assert.equal((await b.s.forget()).ok, true);
    assert.equal(stored(db).state, 'off'); assert.equal(b.s.getView().remember, 'off');
  });  it("Start over never re-enables permission withdrawn in another tab", async () => {
    const db = makeDb(); const a = await onTab(db); const b = await open(db);
    await b.s.accept(); await b.s.enable(FORM); await a.s.forget();
    assert.equal((await b.s.resetInputs()).ok, true);
    assert.equal(stored(db).state, 'off'); assert.equal(b.s.getView().remember, 'off');
  });  it('enable never overwrites an existing consent record: it adopts it and offers the saved copy', async () => {
    const db = makeDb(); await onTab(db, { tag: 'a' }); const before = db.raw; const b = await open(db, { tag: 'b' }); const commits = db.log.commits.length;
    assert.deepEqual(await b.s.enable({ ...FORM, homePrice: '999999' }), { ok: true, reason: 'adopted' });
    assert.equal(db.raw, before); assert.equal(db.log.commits.length, commits); assert.ok(b.s.getView().offer);
  });
});

describe('failed deletion is visible, sticky and never reported as forgotten', () => {
  const denyLabel = (label, state) => ({ failCommit: (_decision, l) => state.deny && l === label });
  it('stop with a failing transaction: failure is visible, restore is suppressed, data remains and saving stays off', async () => {
    const db = makeDb(); const seed = await onTab(db); await save(seed, { ...FORM, homePrice: '460000' }); const before = db.raw;
    const state = { deny: true }; const t = await open(db, { tag: 'c', backendOptions: { hooks: denyLabel('forget', state) } });
    assert.ok(t.s.getView().offer);
    const result = await t.s.forget();
    assert.equal(result.ok, false); assert.equal(result.reason, 'delete_failed'); assert.equal(t.s.getView().problem.code, 'delete_failed');
    assert.equal(t.s.getView().offer, null, 'an in-memory deletion intent suppresses restoration while its failure stays visible'); assert.equal(db.raw, before);
    assert.equal(t.s.getView().writable, false); assert.equal(t.s.getView().remember, 'off');
    state.deny = false; assert.deepEqual(await t.s.retryDelete(), { ok: true, reason: 'deleted' });
    assert.equal(t.s.getView().problem, null); assert.equal(t.s.getView().offer, null); assert.equal(stored(db).inputs, null);
  });
  it('a transaction whose decide step throws aborts: nothing is written and the failure is reported', async () => {
    const db = makeDb(); await onTab(db); const before = db.raw;
    const t = await open(db, { tag: 'c', backend: (() => { const base = fakeBackend(db); return { ...base, transact: (decide, o) => base.transact(() => { throw new Error('boom'); }, o) }; })() });
    const result = await t.s.forget(); assert.equal(result.reason, 'delete_failed'); assert.equal(db.raw, before);
  });
  it('Start over with a failing transaction stays off and exposes retryable deletion failure', async () => {
    const db = makeDb(); const seed = await onTab(db); await save(seed, { ...FORM, homePrice: '460000' });
    const state = { deny: true }; const t = await open(db, { tag: 'c', backendOptions: { hooks: denyLabel('forget', state) } }); await t.s.accept();
    const result = await t.s.resetInputs();
    assert.equal(result.reason, 'delete_failed'); assert.equal(t.s.getView().problem.code, 'delete_failed'); assert.equal(t.s.getView().writable, false);
    state.deny = false; assert.equal((await t.s.retryDelete()).ok, true); assert.equal(stored(db).inputs, null);
  });
  it('an enable whose transaction fails leaves the borrower opted OUT and tells them; NO RECORD is stored (an empty database may remain)', async () => {
    const db = makeDb(); const state = { deny: true }; const t = await open(db, { backendOptions: { hooks: denyLabel('enable', state) } });
    assert.deepEqual(await t.s.enable(FORM), { ok: false, reason: 'storage_unavailable' });
    assert.equal(t.s.getView().remember, 'off'); assert.equal(t.s.getView().problem.code, 'storage_unavailable');
    assert.equal(db.raw, null, 'no record'); assert.deepEqual(db.log.commits, []);
  });
  it('transient save failures are reported and recover on the next successful write', async () => {
    const db = makeDb(); const state = { deny: false }; const t = await onTab(db, { backendOptions: { hooks: denyLabel('save', state) } });
    state.deny = true; assert.equal((await save(t, { ...FORM, homePrice: '470000' })).reason, 'storage_unavailable'); assert.equal(t.s.getView().problem.code, 'storage_unavailable');
    state.deny = false; assert.equal((await save(t, { ...FORM, homePrice: '470000' })).reason, 'saved'); assert.equal(t.s.getView().problem, null);
  });
});

describe('unrecognized data is preserved, never silently deleted, and only an explicit clear removes it', () => {
  const newerOversized = `{"schemaVersion":3,"payload":"${'z'.repeat(3000)}"}`;
  const cases = {
    'oversized newer-schema record': newerOversized, 'corrupt JSON': '{', 'future-dated record': text(rec({ savedAt: NOW + DAY })),
    'withdrawn-proposal-shaped record': text({ schemaVersion: 1, revision: 1, writeId: 'seed-write-0001', savedAt: NOW - 5, inputs: { ...STORED, creditScore: '781', annualIncome: '123456' } }),
    'record with an excluded field': text(rec({}, { ...STORED, annualIncome: '123456' })),
  };
  for (const [name, body] of Object.entries(cases)) {
    it(`${name}: preserved through load, observe, enable, save, stop, reset and unload; saving is blocked`, async () => {
      const db = makeDb(body); const t = await open(db);
      const view = t.s.getView();
      assert.equal(view.problem.code, 'unrecognized'); assert.equal(view.offer, null); assert.equal(view.writable, false); assert.equal(view.unreadableData, true);
      await t.s.observe(); t.s.scheduleSave(FORM); await t.s.flush();
      assert.equal((await t.s.enable(FORM)).reason, 'blocked'); assert.equal((await t.s.forget()).reason, 'blocked'); assert.equal((await t.s.resetInputs()).reason, 'blocked');
      t.s.suspend();
      assert.equal(db.raw, body, 'byte-identical'); assert.deepEqual(db.log.commits, []); assert.equal(db.log.removes, 0);
    });
  }
  it('an oversized newer-schema record reports newer_schema and is NOT removed by any oversize path', async () => {
    const db = makeDb(newerOversized); const t = await open(db);
    assert.equal(t.s.getView().problem.reason, 'newer_schema'); assert.equal(db.log.removes, 0); assert.equal(db.raw, newerOversized);
  });
  it('explicit clear removes exactly what was shown, and then opt-in becomes possible', async () => {
    const db = makeDb('{'); const t = await open(db);
    assert.deepEqual(await t.s.clearUnrecognized(), { ok: true, reason: 'cleared' });
    assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null); assert.equal(t.s.getView().problem, null); assert.equal((await t.s.enable(FORM)).reason, 'enabled');
  });
  it('explicit clear is a no-op when nothing unreadable is present', async () => {
    const db = makeDb(text(rec())); const before = db.raw; const t = await open(db);
    assert.deepEqual(await t.s.clearUnrecognized(), { ok: false, reason: 'nothing_to_clear' }); assert.equal(db.raw, before);
  });
  it('explicit clear refuses to delete data that changed after it was shown', async () => {
    const db = makeDb('{'); const t = await open(db); const replacement = text(rec({ writeId: 'someone-else-1' })); db.raw = replacement;
    assert.deepEqual(await t.s.clearUnrecognized(), { ok: false, reason: 'changed' }); assert.equal(db.raw, replacement); assert.equal(db.log.removes, 0);
  });
  it('a failing clear is visible and retryable', async () => {
    const db = makeDb('{'); const state = { deny: true }; const t = await open(db, { backendOptions: { hooks: { failCommit: (_d, l) => state.deny && l === 'clear' } } });
    const first = await t.s.clearUnrecognized();
    assert.equal(first.reason, 'delete_failed'); assert.equal(t.s.getView().problem.code, 'delete_failed'); assert.equal(t.s.getView().unreadableData, true); assert.equal(db.raw, '{');
    state.deny = false; assert.equal((await t.s.retryDelete()).ok, true); assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null);
  });
  it('web storage is never touched (the sentinels at the top of this file would have failed the test)', async () => {
    const db = makeDb(); const t = await onTab(db); await save(t, FORM); await t.s.forget();
    assert.equal(db.log.commits.length, 2, 'enable + stop; saving identical inputs is correctly a no-op');
  });
});

describe('retention: the existing seven days, enforced only on recognized, expired records, inside a transaction', () => {
  it('expired inputs are not offered, consent lapses and cleanup preserves a data-free reset marker', async () => {
    const db = makeDb(text(rec({ savedAt: NOW - MAX_AGE - 1 }))); const t = await open(db); await settle();
    assert.equal(t.s.getView().offer, null); assert.equal(t.s.getView().remember, 'off'); assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null);
    assert.deepEqual(db.log.labels, ['cleanup']); assert.equal(db.log.removes, 0);
  });
  it('cleanup re-checks expiry at deletion time: if the clock moved back and the record is valid again, nothing is deleted', async () => {
    const clock = { t: NOW }; const hold = latch(); const body = text(rec({ savedAt: NOW - MAX_AGE - 1000 })); const db = makeDb(body);
    const t = tab(db, { clock, backendOptions: { hooks: { before: (label) => (label === 'cleanup' ? hold.promise : undefined) } } });
    await t.s.load(); clock.t = NOW - 2 * DAY; hold.release(); await settle();
    assert.equal(db.raw, body); assert.equal(db.log.removes, 0);
  });
  it('each real change refreshes the window; viewing or accepting does not', async () => {
    const db = makeDb(); const clock = { t: NOW }; const t = await onTab(db, { clock });
    clock.t = NOW + 3 * DAY; await save(t, { ...FORM, homePrice: '470000' }); assert.equal(stored(db).savedAt, NOW + 3 * DAY);
    const before = db.raw; const commits = db.log.commits.length; const viewer = await open(db, { tag: 'v', clock }); await viewer.s.accept();
    assert.equal(db.raw, before); assert.equal(db.log.commits.length, commits);
  });
  it('a failing cleanup is visible (the promised retention could not be enforced)', async () => {
    const db = makeDb(text(rec({ savedAt: NOW - MAX_AGE - 1 }))); const t = await open(db, { backendOptions: { hooks: { failCommit: () => true } } }); await settle();
    assert.equal(t.s.getView().problem.code, 'delete_failed');
  });
});

describe('accept: one atomic, complete, validated replacement, only on request, writing nothing', () => {
  it('returns the complete stored set as a copy, is single-use, and commits nothing', async () => {
    const db = makeDb(text(rec())); const t = await open(db);
    const result = await t.s.accept();
    assert.equal(result.ok, true); assert.deepEqual(result.inputs, STORED);
    result.inputs.homePrice = 'tampered'; assert.equal(stored(db).inputs.homePrice, '450000');
    assert.deepEqual(await t.s.accept(), { ok: false, reason: 'no_offer' }); assert.deepEqual(db.log.commits, []); assert.deepEqual(db.log.labels, []);
  });
  it('two overlapping accepts (a double click) produce exactly one replacement', async () => {
    const db = makeDb(text(rec())); const t = await open(db);
    const results = await Promise.all([t.s.accept(), t.s.accept()]);
    assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  });
  it('nothing is applied or offered for a consent-only record', async () => {
    const db = makeDb(text(rec({}, null))); const t = await open(db); const view = t.s.getView();
    assert.equal(view.remember, 'off'); assert.equal(view.offer, null); assert.equal(view.writable, false);
  });
  it('while an offer is undecided nothing is written, so saved details cannot be overwritten unasked', async () => {
    const db = makeDb(text(rec())); const before = db.raw; const t = await open(db);
    t.s.scheduleSave({ ...FORM, homePrice: '1' }); assert.equal(t.timers.pending, 0);
    assert.deepEqual(await t.s.flush(), { ok: true, reason: 'nothing_pending' }); assert.equal(db.raw, before);
  });
  it('refuses and re-offers when the record changed after it was offered; the old offer cannot be applied', async () => {
    const db = makeDb(text(rec())); const t = await open(db);
    db.raw = text(rec({ revision: 2, writeId: 'other-write-0002' }, { ...STORED, homePrice: '300000' }));
    assert.deepEqual(await t.s.accept(), { ok: false, reason: 'stale' }); assert.equal((await t.s.accept()).inputs.homePrice, '300000');
  });
  it('re-validates retention at accept time', async () => {
    const clock = { t: NOW }; const db = makeDb(text(rec({ savedAt: NOW - MAX_AGE + 1000 }))); const t = await open(db, { clock });
    clock.t = NOW + 5000; assert.deepEqual(await t.s.accept(), { ok: false, reason: 'stale' }); assert.equal(t.s.getView().offer, null);
  });
  it('a delayed accept read that finishes after the session was reset or suspended cannot apply anything', async () => {
    const hold = latch(); const db = makeDb(text(rec()));
    const t = tab(db, { backendOptions: { hooks: { before: (label) => (label === 'read' && hold.armed ? hold.promise : undefined) } } });
    await t.s.load(); hold.armed = true; const pendingAccept = t.s.accept(); t.s.suspend(); hold.release();
    assert.deepEqual(await pendingAccept, { ok: false, reason: 'superseded' });
  });
  it('after accept the session writes only from its adopted baseline: unchanged inputs do not rewrite', async () => {
    const original = text(rec()); const db = makeDb(original); const t = await open(db); await t.s.accept();
    assert.equal((await save(t, FORM)).reason, 'nothing_pending');
    await t.s.enable(FORM);
    assert.equal((await save(t, FORM)).reason, 'unchanged'); assert.equal(db.raw, original);
  });
  it('a delayed LOAD whose read finished EARLIER but is applied LATER cannot overwrite what a newer load applied', async () => {
    const hold = latch(); const older = text(rec({ writeId: 'older-write-0001' }, { ...STORED, homePrice: '111111' }));
    const db = makeDb(older); let armed = true;
    const t = tab(db, { backendOptions: { hooks: { afterRead: (label) => { if (label === 'read' && armed) { armed = false; return hold.promise; } return undefined; } } } });
    const first = t.s.load(); await settle(); // first read already returned the OLDER record but its continuation is held
    db.raw = text(rec({ revision: 2, writeId: 'newer-write-0002' }, { ...STORED, homePrice: '222222' }));
    await t.s.load(); // newer load applies the NEWER record
    hold.release(); await first;
    assert.equal((await t.s.accept()).inputs.homePrice, '222222', 'the stale continuation did not win');
  });
});

describe('observe: following versus conflict, and a stable external-store view', () => {
  it('a pending offer follows the newest record; after adoption any external change is a conflict', async () => {
    const db = makeDb(); const a = await onTab(db, { tag: 'a' }); await save(a, FORM);
    const b = await open(db, { tag: 'b' }); assert.ok(b.s.getView().offer);
    await save(a, { ...FORM, homePrice: '480000' }); await b.s.observe();
    assert.equal((await b.s.accept()).inputs.homePrice, '480000'); await b.s.enable(FORM);
    await save(a, { ...FORM, homePrice: '490000' }); await b.s.observe();
    assert.equal(b.s.getView().problem.code, 'conflict');
  });
  it('a tab that stopped remembering ignores other tabs\' changes (it writes nothing)', async () => {
    const db = makeDb(); const a = await onTab(db, { tag: 'a' }); const b = await open(db, { tag: 'b' }); await b.s.forget();
    await a.s.resetInputs(); await b.s.observe(); assert.equal(b.s.getView().problem, null); assert.equal(b.s.getView().remember, 'off');
  });
  it('an observation made between this session\'s own commit and its local apply is ignored (our write never looks like another tab\'s)', async () => {
    const hold = latch(); const db = makeDb(); let armed = false;
    const t = tab(db, { backendOptions: { hooks: { afterCommit: (label) => (label === 'save' && armed ? hold.promise : undefined) } } });
    await t.s.load(); await t.s.enable(EMPTY_FORM);
    armed = true; t.s.scheduleSave(FORM); const saving = t.s.flush(); await settle(); // committed in storage; not yet applied here
    assert.equal(stored(db).inputs.homePrice, '450000'); await t.s.observe();
    assert.equal(t.s.getView().problem, null, 'no false conflict');
    hold.release(); assert.equal((await saving).reason, 'saved'); assert.equal(t.s.getView().problem, null);
  });
  it('subscribers fire only for visible changes and the snapshot identity is stable otherwise', async () => {
    const db = makeDb(text(rec())); const t = tab(db); let calls = 0; const off = t.s.subscribe(() => { calls += 1; });
    const empty = t.s.getView(); const loaded = await t.s.load();
    assert.notEqual(loaded, empty); assert.equal(calls, 1);
    await t.s.observe(); assert.equal(calls, 1); assert.equal(t.s.getView(), loaded);
    await t.s.accept(); assert.equal(calls, 2); off();
  });
  it('StrictMode-style load / suspend / load is idempotent and writes nothing', async () => {
    const original = text(rec()); const db = makeDb(original); const t = tab(db);
    const first = t.s.load(); t.s.suspend(); await t.s.load(); await first; t.s.scheduleSave(FORM);
    assert.ok(t.s.getView().offer); assert.equal(db.raw, original); assert.deepEqual(db.log.commits, []);
  });
});

describe('change notification and lifecycle audit', () => {
  it('committed changes notify other tabs; failures and no-ops do not', async () => {
    const db = makeDb(); const t = await open(db);
    assert.equal(t.changes.length, 0); await t.s.enable(FORM); assert.equal(t.changes.length, 1);
    await save(t, FORM); assert.equal(t.changes.length, 1, 'unchanged: no notification'); await save(t, { ...FORM, homePrice: '460000' }); assert.equal(t.changes.length, 2);
    await t.s.resetInputs(); assert.equal(t.changes.length, 3); await t.s.forget(); assert.equal(t.changes.length, 4);
    const failing = await open(db, { tag: 'f', backendOptions: { hooks: { failCommit: () => true } } }); await failing.s.enable(FORM); assert.equal(failing.changes.length, 0);
  });
  it('a throwing change notifier can never affect storage', async () => {
    const db = makeDb(); const s = createGuestInputSession({ backend: fakeBackend(db), now: () => NOW, onChange: () => { throw new Error('x'); }, randomId: () => 'id-throws-0001' });
    await s.load(); assert.equal((await s.enable(FORM)).ok, true); assert.equal(stored(db).state, 'on');
  });
  it('across a full lifecycle every mutation is one transaction and nothing but the one record is ever read or written', async () => {
    const db = makeDb(); const t = await onTab(db); await save(t, { ...FORM, homePrice: '460000' }); await t.s.resetInputs(); await t.s.enable(FORM); await save(t, FORM); await t.s.forget();
    assert.deepEqual(db.log.labels, ['enable', 'save', 'forget', 'enable', 'save', 'forget']); assert.equal(db.log.creates, 1);
  });
});

describe('integration corrections: local permission and durable reset history', () => {
  it('a new tab and an accepted restore never inherit permission to autosave', async () => {
    const db = makeDb(text(rec())); const original = db.raw; const t = await open(db);
    assert.equal(t.s.getView().remember, 'off');
    assert.equal((await save(t, FORM)).reason, 'nothing_pending');
    assert.equal((await t.s.accept()).ok, true);
    assert.equal((await save(t, { ...FORM, homePrice: '470000' })).reason, 'nothing_pending');
    assert.equal(db.raw, original);
    await t.s.enable(FORM); assert.equal(t.s.getView().offer, null);
    assert.equal((await save(t, { ...FORM, homePrice: '470000' })).reason, 'saved');
  });
  it('data-free reset markers survive input retention and cannot become an absent baseline', async () => {
    const raw = text(rec({ state: 'off', epoch: 5, savedAt: NOW - 100 * DAY }, null));
    assert.equal(parseGuestInputRecord(raw, NOW).kind, 'record');
    const db = makeDb(raw); const t = await open(db); await settle();
    assert.equal(db.raw, raw); assert.deepEqual(db.log.labels, []); assert.equal(t.s.getView().remember, 'off');
  });
  it('expiry in an already-open consenting tab blocks the write and leaves a durable off marker', async () => {
    const db = makeDb(); const clock = { t: NOW }; const t = await onTab(db, { clock });
    clock.t += MAX_AGE + 1;
    assert.equal((await save(t, { ...FORM, homePrice: '470000' })).reason, 'expired'); await settle();
    assert.equal(stored(db).state, 'off'); assert.equal(stored(db).inputs, null); assert.equal(t.s.getView().remember, 'off');
    assert.equal((await save(t, FORM)).reason, 'nothing_pending');
    await t.s.enable(FORM); assert.equal(stored(db).epoch, 3);
  });
  it('an observation cannot falsely conflict with a complete intervening save by this same session', async () => {
    const hold = latch(); let armed = false; const db = makeDb();
    const t = await onTab(db, { backendOptions: { hooks: { afterRead: (label) => label === 'read' && armed ? hold.promise : undefined } } });
    armed = true; const observing = t.s.observe(); await settle();
    assert.equal((await save(t, { ...FORM, homePrice: '480000' })).ok, true);
    hold.release(); await observing;
    assert.equal(t.s.getView().problem, null); assert.equal(t.s.getView().writable, true);
  });
  it('an enable committed before reset cannot re-enable local permission when its response arrives late', async () => {
    const hold = latch(); const db = makeDb();
    const t = await open(db, { backendOptions: { hooks: { afterCommit: (label) => label === 'enable' ? hold.promise : undefined } } });
    const enabling = t.s.enable(FORM); await settle(); assert.equal(stored(db).state, 'on');
    const resetting = t.s.resetInputs(); assert.equal(t.s.getView().remember, 'off');
    hold.release(); assert.equal((await enabling).reason, 'superseded'); await resetting;
    assert.equal(stored(db).state, 'off'); assert.equal(t.s.getView().writable, false);
    assert.equal((await save(t, FORM)).reason, 'nothing_pending');
  });
  it('counter overflow aborts the decision instead of committing a malformed record', async () => {
    const original = text(rec({ state: 'off', epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER }, null));
    const db = makeDb(original); const t = await open(db);
    assert.equal((await t.s.enable(FORM)).ok, false); assert.equal(db.raw, original); assert.deepEqual(db.log.commits, []);
  });
});
